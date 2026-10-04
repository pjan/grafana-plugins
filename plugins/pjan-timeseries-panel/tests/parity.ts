import fs from 'node:fs';
import path from 'node:path';

import { expect, type Page } from '@grafana/plugin-e2e';
import { PNG } from 'pngjs';

// The comparison behind tests/parity.spec.ts and tests/parityAnnotations.spec.ts (Stat plus's parity test, adapted to
// a canvas panel with a legend). The parity dashboards (scripts/generate-parity-dashboard.mjs) have one pair of panels
// per case: the core panel with this plugin right below it, with the same title, query, field config and options. The
// swapped twin has them the other way round.
//
// Each panel is compared with the panel at the same position in the twin (so core with plugin, twice per case): Chrome
// rasterises the same CSS differently at different places on the page. Grafana's panel frame (PanelChrome, not drawn by
// the panel) is squared off: the anti-aliasing of its rounded corners differed between two loads of the same panel.
//
// Per case, theme and pixel ratio, the two panels must have:
// - the same canvas bytes (size and an FNV hash of the RGBA data, which don't depend on the page position);
// - the same elements with the same attributes (all of them: the legend, uPlot's overlay, banners, markers, icons);
// - the same pixels: element screenshots of the panel content, decoded and compared byte by byte (RGBA).
// Each screenshot and canvas must be at least 5 % painted, so two empty renders can't pass as identical. The share is
// counted in CSS pixels, so that it means the same at pixel ratio 1 and 2: at ratio 2 a CSS pixel is a block of 2 × 2
// device pixels, painted when any of them is (a pixel that differs from the panel background, or a canvas pixel that
// isn't transparent). Counted in device pixels, a 1 px line covers about half the share at ratio 2 that it covers at
// ratio 1. Captures wait for the fonts and the icons, and are repeated until two in a row are the same for all four
// panels; that stable capture is then compared, once.
//
// The exemplars case must show its exemplar markers (as many as its TestData query asks for) in both panels.

export const CORE = 'timeseries';
export const PLUGIN = 'pjan-timeseries-panel';

export interface DashboardPanel {
  id: number;
  type: string;
  title: string;
  gridPos: { x: number; y: number; w: number; h: number };
  [key: string]: unknown;
}
export interface Dashboard {
  uid: string;
  time: { from: string; to: string };
  panels: DashboardPanel[];
}

export const readDashboard = (file: string): Dashboard =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '../provisioning/dashboards', file), 'utf8'));

/** The panel of a case (by its title) and type, in a generated dashboard. */
export const panelOf = (dashboard: Dashboard, title: string, type: string) => {
  const panel = dashboard.panels.find((p) => p.title === title && p.type === type);
  if (!panel) {
    throw new Error(`${dashboard.uid}: no ${type} panel titled "${title}"`);
  }
  return panel;
};

export interface Case {
  title: string;
  // per dashboard: the ids of the top and the bottom panel
  ids: Array<[number, number]>;
  // the number of exemplar markers each panel must show: the exemplarCount of the case's TestData Exemplars query
  exemplars?: number;
}

const exemplarCount = (panel: DashboardPanel) =>
  (panel.targets as Array<{ scenarioId?: string; exemplarCount?: number }> | undefined)?.find(
    (target) => target.scenarioId === 'exemplars'
  )?.exemplarCount;

// PARITY_CASES=<regular expression>: only the cases whose title matches (for reruns and negative controls)
const caseFilter = process.env.PARITY_CASES ? new RegExp(process.env.PARITY_CASES) : undefined;

/** The cases of a pair of twin dashboards, checked: core on top in the first, plugin on top in the second. */
export const casesOf = (dashboards: readonly [Dashboard, Dashboard]): Case[] =>
  dashboards[0].panels
    .filter((panel) => panel.type === CORE && (!caseFilter || caseFilter.test(panel.title)))
    .map((panel) => {
      const { title } = panel;
      const ids = dashboards.map((d, n) => {
        const [top, bottom] = [panelOf(d, title, CORE), panelOf(d, title, PLUGIN)].sort(
          (a, b) => a.gridPos.y - b.gridPos.y
        );
        const expected = n === 0 ? [CORE, PLUGIN] : [PLUGIN, CORE];
        if (top.type !== expected[0] || bottom.type !== expected[1] || top.gridPos.x !== bottom.gridPos.x) {
          throw new Error(`parity dashboards: case "${title}" is not laid out as ${expected.join(' above ')}`);
        }
        return [top.id, bottom.id] as [number, number];
      });
      const exemplars = exemplarCount(panel);
      return exemplars === undefined ? { title, ids } : { title, ids, exemplars };
    });

// Squares off Grafana's panel frame (see above). Applied to both dashboards alike.
const SQUARE_FRAMES = '[data-viz-panel-key] > div > section { border-radius: 0 !important; }';

const MIN_PAINTED = 0.05;

// The theme as loaded (`?theme=`), and whether it is then switched live with Grafana's "c r" shortcut (toggle the
// theme without saving the preference: `toggleTheme(true)` in public/app/core/services/keybindingSrv.ts).
export const THEMES = [
  { name: 'light', load: 'light', toggle: false },
  { name: 'dark', load: 'dark', toggle: false },
  { name: 'dark, switched live from light', load: 'light', toggle: true },
  { name: 'light, switched live from dark', load: 'dark', toggle: true },
] as const;
export type Theme = (typeof THEMES)[number];

interface CanvasPrint {
  width: number;
  height: number;
  // painted CSS pixels (blocks of ratio × ratio canvas pixels) and all of them
  painted: number;
  blocks: number;
  hash: number;
}

interface Capture {
  png: Buffer;
  elements: string[];
  canvases: CanvasPrint[];
  background: number[];
  // the page's device pixel ratio (1 or 2)
  ratio: number;
  // how many empty exemplars canvases were left out of `elements` (see capture), and the exemplar markers shown
  emptyExemplarCanvases: number;
  exemplarMarkers: number;
}

const EXEMPLAR_MARKER = 'data-testid Exemplar marker';

export const panelContent = (page: Page, id: number) =>
  page.locator(`[data-viz-panel-key="panel-${id}"] [data-testid="data-testid panel content"]`);

const capture = async (page: Page, id: number): Promise<Capture> => {
  const element = panelContent(page, id);
  const dom = await element.evaluate((root, marker) => {
    // Without exemplars, the exemplars' events canvas (EventsCanvas, "xy-canvas") is an empty element that only exists
    // when the panel has `data.annotations`. Grafana 13.2.3 hands the dashboard's annotation and alert state answers
    // (even empty ones) only to some panels of a long dashboard, depending on when each was scrolled into view, so the
    // same panel has it in one load and not in the next. It draws nothing; it is left out of the comparison when empty,
    // and counted: in the exemplars case it must never be empty (see compare).
    const emptyExemplarCanvas = (el: Element) =>
      el.getAttribute('data-testid') === 'data-testid xy-canvas' && el.childElementCount === 0;
    const all = [root, ...Array.from(root.querySelectorAll('*'))];
    const elements = all.filter((el) => !emptyExemplarCanvas(el));
    const ratio = Math.round(window.devicePixelRatio);
    const canvases = Array.from(root.querySelectorAll('canvas')).map((canvas) => {
      // Width, height, and a hash of the RGBA bytes, as in State timeline plus's parity test; painted CSS pixels
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      const columns = Math.ceil(canvas.width / ratio);
      const blocks = new Uint8Array(columns * Math.ceil(canvas.height / ratio));
      let hash = 0x811c9dc5;
      for (let i = 0; i < data.length; i++) {
        hash = Math.imul(hash ^ data[i], 0x01000193);
        if (i % 4 === 3 && data[i] !== 0) {
          const pixel = (i - 3) / 4;
          const x = pixel % canvas.width;
          const y = Math.floor(pixel / canvas.width);
          blocks[Math.floor(y / ratio) * columns + Math.floor(x / ratio)] = 1;
        }
      }
      const painted = blocks.reduce((sum, b) => sum + b, 0);
      return { width: canvas.width, height: canvas.height, painted, blocks: blocks.length, hash: hash >>> 0 };
    });
    const section = root.closest('section')!;
    const background = getComputedStyle(section)
      .backgroundColor.match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number);
    return {
      // Every attribute of every element, sorted by name: style, class, role, aria-*, tabindex, href, title, data-*,
      // and the SVG icons' viewBox, width and height
      elements: elements.map((el) =>
        [
          el.tagName.toLowerCase(),
          ...Array.from(el.attributes)
            .map((attribute) => `${attribute.name}=${JSON.stringify(attribute.value)}`)
            .sort(),
        ].join(' ')
      ),
      canvases,
      background,
      ratio,
      emptyExemplarCanvases: all.length - elements.length,
      exemplarMarkers: root.querySelectorAll(`[data-testid="${marker}"]`).length,
    };
  }, EXEMPLAR_MARKER);
  const png = await element.screenshot({ animations: 'disabled', caret: 'hide' });
  return { png, ...dom };
};

const decode = (png: Buffer) => PNG.sync.read(png);

// The share of CSS pixels (blocks of ratio × ratio screenshot pixels) with a pixel that differs from the background
const paintedShare = (png: Buffer, background: number[], ratio: number) => {
  const { data, width, height } = decode(png);
  const columns = Math.ceil(width / ratio);
  const blocks = new Uint8Array(columns * Math.ceil(height / ratio));
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== background[0] || data[i + 1] !== background[1] || data[i + 2] !== background[2]) {
      const pixel = i / 4;
      blocks[Math.floor(Math.floor(pixel / width) / ratio) * columns + Math.floor((pixel % width) / ratio)] = 1;
    }
  }
  return blocks.reduce((sum, b) => sum + b, 0) / blocks.length;
};

const sameCapture = (a: Capture, b: Capture) =>
  a.png.equals(b.png) && JSON.stringify([a.elements, a.canvases]) === JSON.stringify([b.elements, b.canvases]);

// What differs between two panels at the same position ('identical' when nothing does): one core, one plugin, in either
// order. `exemplars`: the number of exemplar markers each must show (the exemplars case).
const compare = (first: Capture, second: Capture, exemplars: number | undefined) => {
  const problems: string[] = [];
  if (exemplars !== undefined) {
    for (const [name, c] of [
      ['first', first],
      ['second', second],
    ] as const) {
      if (c.exemplarMarkers !== exemplars) {
        problems.push(`${name}: ${c.exemplarMarkers} exemplar markers, expected ${exemplars}`);
      }
      if (c.emptyExemplarCanvases !== 0) {
        problems.push(`${name}: an empty exemplars canvas was left out, in the exemplars case`);
      }
    }
  }
  const a = decode(first.png);
  const b = decode(second.png);
  if (a.width !== b.width || a.height !== b.height) {
    problems.push(`screenshot size ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  } else if (!a.data.equals(b.data)) {
    let differing = 0;
    const where: string[] = [];
    for (let i = 0; i < a.data.length; i += 4) {
      if (a.data.readUInt32BE(i) !== b.data.readUInt32BE(i)) {
        differing++;
        if (where.length < 12) {
          where.push(
            `(${(i / 4) % a.width},${Math.floor(i / 4 / a.width)}) ${a.data.readUInt32BE(i).toString(16)}/${b.data.readUInt32BE(i).toString(16)}`
          );
        }
      }
    }
    problems.push(`${differing} of ${a.width * a.height} pixels differ: ${where.join(' ')}`);
  }
  const painted = paintedShare(first.png, first.background, first.ratio);
  if (painted < MIN_PAINTED) {
    problems.push(`screenshot only ${(painted * 100).toFixed(1)} % painted`);
  }
  if (JSON.stringify(first.elements) !== JSON.stringify(second.elements)) {
    const differing = first.elements
      .map((el, i) => [el, second.elements[i]])
      .filter(([x, y]) => x !== y)
      .slice(0, 5);
    problems.push(`elements (${first.elements.length} vs ${second.elements.length}): ${JSON.stringify(differing)}`);
  }
  if (JSON.stringify(first.canvases) !== JSON.stringify(second.canvases)) {
    problems.push(`canvases: ${JSON.stringify(first.canvases)} vs ${JSON.stringify(second.canvases)}`);
  }
  for (const canvas of first.canvases) {
    if (canvas.painted < MIN_PAINTED * canvas.blocks) {
      problems.push(`canvas only ${((100 * canvas.painted) / canvas.blocks).toFixed(1)} % painted`);
    }
  }
  return problems.length === 0 ? 'identical' : problems.join('; ');
};

// Toggles the theme live and waits until the page is drawn on the new background.
const switchThemeLive = async (page: Page, to: 'light' | 'dark') => {
  // Keyboard shortcuts are ignored while an input has focus
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('c');
  await page.keyboard.press('r');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const [r, g, b] = getComputedStyle(document.body)
          .backgroundColor.match(/[\d.]+/g)!
          .map(Number);
        return (r + g + b) / 3 < 128 ? 'dark' : 'light';
      })
    )
    .toBe(to);
};

// What a panel shows that depends on the theme: a hash of its plot canvas (axis labels and grid are drawn in theme
// colours), or the colour of Grafana's error view message (the long-data case has no canvas)
const themedPrint = (page: Page, id: number) =>
  panelContent(page, id).evaluate((root) => {
    const canvas = root.querySelector('canvas');
    if (canvas) {
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 0x811c9dc5;
      for (let i = 0; i < data.length; i++) {
        hash = Math.imul(hash ^ data[i], 0x01000193);
      }
      return `canvas ${canvas.width}x${canvas.height} ${hash >>> 0}`;
    }
    const message = root.querySelector('[data-testid="data-testid Panel data error message"]');
    return message ? `message ${getComputedStyle(message).color}` : 'nothing';
  });

const isDark = (rgb: string) => {
  const [r, g, b] = rgb.match(/[\d.]+/g)!.map(Number);
  return (r + g + b) / 3 < 128;
};

// A panel has drawn: its plot canvas has pixels (or it shows Grafana's error view instead of a plot), and every icon
// has its path (icons load asynchronously).
export const drawn = async (page: Page, id: number) => {
  await panelContent(page, id).scrollIntoViewIfNeeded();
  await expect
    .poll(
      () =>
        panelContent(page, id).evaluate((root) => {
          const canvas = root.querySelector('canvas');
          const plotted =
            canvas !== null &&
            canvas.width > 0 &&
            canvas
              .getContext('2d')!
              .getImageData(0, 0, canvas.width, canvas.height)
              .data.some((value, i) => i % 4 === 3 && value !== 0);
          const errorView = root.querySelector('[data-testid="data-testid Panel data error message"]') !== null;
          return (
            (plotted || errorView) && Array.from(root.querySelectorAll('svg')).every((svg) => svg.childElementCount > 0)
          );
        }),
      { timeout: 30_000 }
    )
    .toBe(true);
};

// Loads a parity dashboard and every panel on it (Grafana only loads panels once they are scrolled into view), then
// switches the theme live if asked: every panel has been drawn in the first theme when the theme changes.
export const openDashboard = async (page: Page, uid: string, cases: Case[], index: number, theme: Theme) => {
  await page.goto(`/d/${uid}?${new URLSearchParams({ orgId: '1', theme: theme.load })}`);
  for (const { ids } of cases) {
    await drawn(page, ids[index][0]);
    await drawn(page, ids[index][1]);
  }
  if (theme.toggle) {
    const to = theme.load === 'light' ? 'dark' : 'light';
    const ids = cases.flatMap((c) => c.ids[index]);
    const before = new Map<number, string>();
    for (const id of ids) {
      before.set(id, await themedPrint(page, id));
    }
    await switchThemeLive(page, to);
    // every panel redrew in the new theme: on the new background, with a different canvas (or message colour)
    for (const id of ids) {
      await panelContent(page, id).scrollIntoViewIfNeeded();
      await expect
        .poll(
          async () => {
            const background = await panelContent(page, id).evaluate(
              (root) => getComputedStyle(root.closest('section')!).backgroundColor
            );
            const print = await themedPrint(page, id);
            return isDark(background) === (to === 'dark') && print !== 'nothing' && print !== before.get(id);
          },
          { message: `panel ${id} redrew in the ${to} theme`, timeout: 30_000 }
        )
        .toBe(true);
    }
  }
  await page.addStyleTag({ content: SQUARE_FRAMES });
  const radius = await panelContent(page, cases[0].ids[index][0]).evaluate(
    (root) => getComputedStyle(root.closest('section')!).borderRadius
  );
  expect(radius, 'the panel frames are squared off').toBe('0px');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.mouse.move(0, 0);
};

// Captures the case's two panels on both dashboards until two captures in a row are the same for all four panels,
// then compares that capture once: each panel with the one at its position on the other dashboard. Returns
// 'identical', what differs, or 'not stable' when the panels never held still for two captures in a row.
export const compareCase = async (pages: Page[], { ids, exemplars }: Case, timeout = 90_000) => {
  let previous: Capture[][] | undefined;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const current: Capture[][] = [];
    for (let d = 0; d < pages.length; d++) {
      const page = pages[d];
      await page.bringToFront();
      const row: Capture[] = [];
      for (const id of ids[d]) {
        await drawn(page, id);
        row.push(await capture(page, id));
      }
      current.push(row);
    }
    if (previous && current.every((row, d) => row.every((c, k) => sameCapture(previous![d][k], c)))) {
      const [top, bottom] = [0, 1].map((k) => compare(current[0][k], current[1][k], exemplars));
      return top === 'identical' && bottom === 'identical' ? 'identical' : `top: ${top}; bottom: ${bottom}`;
    }
    previous = current;
    await pages[0].waitForTimeout(500);
  }
  return 'not stable';
};
