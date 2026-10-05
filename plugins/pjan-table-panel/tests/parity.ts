import fs from 'node:fs';
import path from 'node:path';

import { expect, type Page } from '@grafana/plugin-e2e';
import { PNG } from 'pngjs';

// The comparison behind tests/parity.spec.ts (Stat plus's HTML comparison, adapted to the table). The parity dashboards
// (scripts/generate-parity-dashboard.mjs) have one pair of panels per case: the core table with this plugin right below
// it, with the same title, query, transformations, field config and options. The swapped twin has them the other way
// round.
//
// Each panel is compared with the panel at the same position in the twin (so core with plugin, twice per case): Chrome
// rasterises the same CSS differently at different places on the page. Grafana's panel frame (PanelChrome, not drawn by
// the panel) is squared off: the anti-aliasing of its rounded corners differed between two loads of the same panel.
//
// Per case, theme and pixel ratio, the two panels must have:
// - the same elements with the same attributes and text (all of them, sorted by name: inline styles, Emotion and grid
//   class names, roles, aria-*, links, icons). Ids React's useId generates (the nested table's rows, Grafana's
//   Combobox, the panel content) come from one page-wide mount counter, so they differ between core and plugin on the
//   same dashboard (they were equal at the same position on the twin, which mounts in the same order): in ids and in
//   the attributes that refer to ids (`for`, aria-controls, aria-labelledby, ...) each generated id is replaced by a
//   placeholder numbered by first occurrence, so which element refers to which is still compared; other ids are
//   compared as they are. Core and plugin are compared at the same position on the twin and on the same dashboard;
// - the same pixels: element screenshots of the panel content, decoded and compared byte by byte (RGBA);
// - the same canvases (the sparklines): size and an FNV hash of the RGBA data.
// Each screenshot and canvas must be at least 5 % painted, so two empty renders can't pass as identical. The share is
// counted in CSS pixels, so it means the same at pixel ratio 1 and 2: a CSS pixel is painted when any of its device
// pixels differs from the panel background (or, on a canvas, isn't transparent). Every case must have a row drawn
// (except the no-rows and no-data cases, which must show their message).
//
// Before every capture the pointer leaves the panels and nothing has focus (the grid's row hover background and the
// selected cell's outline). Captures wait for the fonts, the icons and the images, and are repeated until two in a row
// are the same for all four panels; that stable capture is then compared.

export const CORE = 'table';
export const PLUGIN = 'pjan-table-panel';

export interface DashboardPanel {
  id: number;
  type: string;
  title: string;
  description?: string;
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
  // something to do before capturing (scripts/generate-parity-dashboard.mjs, `prepare`)
  prepare?: string;
}

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
        const expected = n === 0 ? CORE : PLUGIN;
        if (top.type !== expected || top.gridPos.x !== bottom.gridPos.x || top.gridPos.w !== bottom.gridPos.w) {
          throw new Error(`${d.uid}: case "${title}" is not ${expected} above the other panel, in one column`);
        }
        return [top.id, bottom.id] as [number, number];
      });
      const prepare = panel.description?.startsWith('parity: ') ? panel.description.slice(8) : undefined;
      return { title, ids, prepare };
    });

export const panelContent = (page: Page, id: number) =>
  page.locator(`[data-viz-panel-key="panel-${id}"] [data-testid="data-testid panel content"]`);

// Squares off Grafana's panel frame (see above). Applied to both dashboards alike.
export const SQUARE_FRAMES = '[data-viz-panel-key] > div > section { border-radius: 0 !important; }';

export const MIN_PAINTED = 0.05;

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
  painted: number;
  hash: number;
}

export interface Capture {
  png: Buffer;
  scale: number;
  elements: string[];
  canvases: CanvasPrint[];
  background: number[];
  rows: number;
  text: string;
  // the box (CSS pixels, relative to the content) of the no-rows or no-data message, if there is one
  message?: { x: number; y: number; width: number; height: number };
}

/**
 * Every element under `root` (itself included), each as its tag, its attributes sorted by name, and its own text, with
 * generated ids replaced by placeholders (see the top). Runs in the page. `normaliseIds: false` keeps the ids as they
 * are (the negative control of the id mapping), except the root's own id: the panel content element is Grafana's panel
 * frame, outside the panel plugin, and its id differs between any two panels.
 */
export const serialise = (root: Element, normaliseIds: boolean): string[] => {
  // The ids React's useId generates (`_r_<n>_`, from one page-wide mount counter), wherever they are: in ids, in the
  // attributes that refer to them (`for`, aria-controls, ...), inside longer ids such as TableNested's
  // `_r_1m_-nested-table-0`, and in other attributes (a drag-and-drop context id in the option editors). Only these are
  // mapped; any other value, other ids included, is compared as it is.
  const GENERATED = /_r_[0-9a-z]+_/g;
  // (Declared inside: the function's source is sent to the page.)
  const placeholders = new Map<string, string>();
  const placeholder = (token: string) => {
    if (!placeholders.has(token)) {
      placeholders.set(token, `#id${placeholders.size + 1}`);
    }
    return placeholders.get(token)!;
  };
  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  return elements.map((el) => {
    const attributes = Array.from(el.attributes)
      .map((attribute) => {
        const value =
          normaliseIds || (el === root && attribute.name === 'id')
            ? attribute.value.replace(GENERATED, placeholder)
            : attribute.value;
        return `${attribute.name}=${JSON.stringify(value)}`;
      })
      .sort();
    // The element's own text (its text nodes), so text is compared once, where it is
    const text = Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join('');
    return [el.tagName.toLowerCase(), ...attributes, ...(text ? [`text=${JSON.stringify(text)}`] : [])].join(' ');
  });
};

/** Moves the pointer off the panels and clears the focus, so neither hover nor focus styles are drawn. */
export const restingState = async (page: Page) => {
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
};

export const capture = async (page: Page, id: number, normaliseIds = true): Promise<Capture> => {
  const element = panelContent(page, id);
  const dom = await element.evaluate(
    (root, { normalise, serialiseSource }) => {
      // eslint-disable-next-line no-new-func
      const serialiseFn = new Function(`return (${serialiseSource})`)() as (r: Element, n: boolean) => string[];
      const canvases = Array.from(root.querySelectorAll('canvas')).map((canvas) => {
        // Width, height, and a hash of the RGBA bytes, as in State timeline plus's parity test
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        let hash = 0x811c9dc5;
        let painted = 0;
        for (let i = 0; i < data.length; i++) {
          hash = Math.imul(hash ^ data[i], 0x01000193);
          if (i % 4 === 3 && data[i] !== 0) {
            painted++;
          }
        }
        return { width: canvas.width, height: canvas.height, painted, hash: hash >>> 0 };
      });
      // The background the panel content is drawn on: the first ancestor with a colour (the dashboard's, for a
      // transparent panel)
      let background = [255, 255, 255];
      for (let el: Element | null = root; el; el = el.parentElement) {
        const parts = getComputedStyle(el)
          .backgroundColor.match(/[\d.]+/g)!
          .map(Number);
        if (parts.length === 3 || (parts.length === 4 && parts[3] === 1)) {
          background = parts.slice(0, 3);
          break;
        }
      }
      return {
        elements: serialiseFn(root, normalise),
        canvases,
        background,
        rows: root.querySelectorAll('[role="row"]').length,
        message: (() => {
          const box = root.getBoundingClientRect();
          const texts = Array.from(root.querySelectorAll('*')).filter(
            (el) => el.childElementCount === 0 && /^(No rows|No data)$/.test(el.textContent?.trim() ?? '')
          );
          if (texts.length !== 1) {
            return undefined;
          }
          const r = texts[0].getBoundingClientRect();
          return { x: r.left - box.left, y: r.top - box.top, width: r.width, height: r.height };
        })(),
        text: (root as HTMLElement).innerText,
        scale: window.devicePixelRatio,
      };
    },
    { normalise: normaliseIds, serialiseSource: serialise.toString() }
  );
  const png = await element.screenshot({ animations: 'disabled', caret: 'hide' });
  return { png, ...dom };
};

const decode = (png: Buffer) => PNG.sync.read(png);

/** The share of CSS pixels that differ from the background (any of the device pixels of a CSS pixel). */
export const paintedShare = (
  png: Buffer,
  background: number[],
  scale: number,
  region?: { x: number; y: number; width: number; height: number }
) => {
  const { data, width, height } = decode(png);
  const x0 = Math.max(0, Math.floor(region?.x ?? 0));
  const y0 = Math.max(0, Math.floor(region?.y ?? 0));
  const cssWidth = Math.min(Math.floor(width / scale), region ? x0 + Math.ceil(region.width) : Infinity);
  const cssHeight = Math.min(Math.floor(height / scale), region ? y0 + Math.ceil(region.height) : Infinity);
  let painted = 0;
  for (let y = y0; y < cssHeight; y++) {
    for (let x = x0; x < cssWidth; x++) {
      let differs = false;
      for (let dy = 0; dy < scale && !differs; dy++) {
        for (let dx = 0; dx < scale && !differs; dx++) {
          const i = ((y * scale + dy) * width + (x * scale + dx)) * 4;
          differs = data[i] !== background[0] || data[i + 1] !== background[1] || data[i + 2] !== background[2];
        }
      }
      if (differs) {
        painted++;
      }
    }
  }
  return painted / ((cssWidth - x0) * (cssHeight - y0));
};

export const sameCapture = (a: Capture, b: Capture) =>
  a.png.equals(b.png) && JSON.stringify([a.elements, a.canvases]) === JSON.stringify([b.elements, b.canvases]);

// Cases that draw no rows: they must show their message instead
const NO_ROWS: Record<string, RegExp> = {
  'no rows: a frame without rows': /No rows/,
  'no data: no frames': /No data/,
};

/** Whether two captures have the same elements (attributes and text), wherever they are on the page. */
export const sameElements = (first: Capture, second: Capture) => {
  if (JSON.stringify(first.elements) === JSON.stringify(second.elements)) {
    return 'identical';
  }
  const differing = first.elements
    .map((el, i) => [i, el, second.elements[i]])
    .filter(([, x, y]) => x !== y)
    .slice(0, 4);
  return `elements (${first.elements.length} vs ${second.elements.length}): ${JSON.stringify(differing)}`;
};

/** What differs between two panels at the same position ('identical' when nothing does). */
export const compare = (title: string, first: Capture, second: Capture) => {
  const problems: string[] = [];
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
        if (where.length < 8) {
          where.push(
            `(${(i / 4) % a.width},${Math.floor(i / 4 / a.width)}) ${a.data.readUInt32BE(i).toString(16)}/${b.data.readUInt32BE(i).toString(16)}`
          );
        }
      }
    }
    problems.push(`${differing} of ${a.width * a.height} pixels differ: ${where.join(' ')}`);
  }
  // A case without rows is measured on its message: the message must be visible and painted, not the empty panel
  const region = NO_ROWS[title] ? first.message : undefined;
  const painted = paintedShare(first.png, first.background, first.scale, region);
  if (painted < MIN_PAINTED) {
    problems.push(`${region ? 'message' : 'screenshot'} only ${(painted * 100).toFixed(1)} % painted`);
  }
  if (NO_ROWS[title]) {
    if (!NO_ROWS[title].test(first.text) || !first.message) {
      problems.push(`no "${NO_ROWS[title].source}" message`);
    }
  } else if (first.rows < 2) {
    problems.push('no row drawn');
  }
  const elements = sameElements(first, second);
  if (elements !== 'identical') {
    problems.push(elements);
  }
  if (JSON.stringify(first.canvases) !== JSON.stringify(second.canvases)) {
    problems.push(`canvases: ${JSON.stringify(first.canvases)} vs ${JSON.stringify(second.canvases)}`);
  }
  for (const canvas of first.canvases) {
    // Canvases are drawn at the device pixel ratio: compare the share, which doesn't depend on it
    if (canvas.painted < MIN_PAINTED * canvas.width * canvas.height) {
      problems.push(`canvas only ${((100 * canvas.painted) / (canvas.width * canvas.height)).toFixed(1)} % painted`);
    }
  }
  return problems.length === 0 ? 'identical' : problems.join('; ');
};

/** Toggles the theme live and waits until the page is drawn on the new background. */
export const switchThemeLive = async (page: Page, to: 'light' | 'dark') => {
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

/**
 * A panel has drawn: its grid (or its no-rows or no-data message) is there, every icon has its path, every image has
 * loaded, and a geo cell has its text (OpenLayers is loaded lazily).
 */
export const drawn = async (page: Page, id: number) => {
  await panelContent(page, id).scrollIntoViewIfNeeded();
  await expect
    .poll(
      () =>
        panelContent(page, id).evaluate((root) => {
          const content = root.querySelector('[role="row"]') !== null || /No rows|No data/.test(root.textContent ?? '');
          const icons = Array.from(root.querySelectorAll('svg')).every((svg) => svg.childElementCount > 0);
          // loaded, not broken (a broken image is `complete` too); an image the sanitiser left without a source (the
          // markdown case's `<img src="">`) has nothing to load
          const images = Array.from(root.querySelectorAll('img')).every(
            (img) => img.complete && (img.naturalWidth > 0 || !img.getAttribute('src'))
          );
          const geo = !/\[object Object\]/.test(root.textContent ?? '');
          return content && icons && images && geo;
        }),
      { timeout: 30_000 }
    )
    .toBe(true);
};

/** Does what a case asks before it is captured (`prepare`), in one of its panels. */
export const prepare = async (page: Page, id: number, what?: string) => {
  if (what === 'scroll-bottom') {
    await panelContent(page, id).evaluate((root) => {
      const grid = root.querySelector<HTMLElement>('[role="grid"]')!;
      grid.scrollTop = grid.scrollHeight;
    });
  } else if (what) {
    throw new Error(`unknown prepare step "${what}"`);
  }
};

/**
 * Loads a parity dashboard and every panel on it (Grafana only loads panels once they are scrolled into view), then
 * switches the theme live if asked: every panel has been drawn in the first theme when the theme changes.
 */
export const open = async (page: Page, uid: string, cases: Case[], dashboardIndex: number, theme: Theme) => {
  await page.goto(`/d/${uid}?${new URLSearchParams({ orgId: '1', theme: theme.load })}`);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  for (const c of cases) {
    for (const id of c.ids[dashboardIndex]) {
      await drawn(page, id);
    }
  }
  if (theme.toggle) {
    await switchThemeLive(page, theme.load === 'light' ? 'dark' : 'light');
  }
  await page.addStyleTag({ content: SQUARE_FRAMES });
  const radius = await panelContent(page, cases[0].ids[dashboardIndex][0]).evaluate(
    (root) => getComputedStyle(root.closest('section')!).borderRadius
  );
  expect(radius, 'the panel frames are squared off').toBe('0px');
  await restingState(page);
};

/**
 * Captures the case's two panels on both dashboards until two captures in a row are the same, and compares each panel
 * with the one at its position on the other dashboard. Returns 'identical', or what differs.
 */
export const compareCase = async (pages: Page[], c: Case, normaliseIds = true, timeout = 60_000) => {
  let previous: Capture[][] | undefined;
  let result = 'not stable';
  const start = Date.now();
  for (let d = 0; d < pages.length; d++) {
    for (const id of c.ids[d]) {
      await drawn(pages[d], id);
      await prepare(pages[d], id, c.prepare);
    }
  }
  while (Date.now() - start < timeout) {
    const current: Capture[][] = [];
    for (let d = 0; d < pages.length; d++) {
      const page = pages[d];
      await page.bringToFront();
      for (const id of c.ids[d]) {
        await drawn(page, id);
      }
      await restingState(page);
      current.push([await capture(page, c.ids[d][0], normaliseIds), await capture(page, c.ids[d][1], normaliseIds)]);
    }
    const stable = current.every((row, d) => row.every((x, k) => previous && sameCapture(previous[d][k], x)));
    previous = current;
    if (stable) {
      const [top, bottom] = [0, 1].map((k) => compare(c.title, current[0][k], current[1][k]));
      // And the HTML of core and plugin on the same dashboard: the ids React generates there differ for certain (the
      // two panels mount at different places of the page), so this is where the id mapping is needed.
      const [first, second] = [0, 1].map((d) => sameElements(current[d][0], current[d][1]));
      result =
        top === 'identical' && bottom === 'identical' && first === 'identical' && second === 'identical'
          ? 'identical'
          : `top: ${top}; bottom: ${bottom}; same dashboard: ${first}, ${second}`;
      break;
    }
    await pages[0].waitForTimeout(300);
  }
  return result;
};
