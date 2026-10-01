import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@grafana/plugin-e2e';
import { PNG } from 'pngjs';

// provisioning/dashboards/parity.json (from scripts/generate-parity-dashboard.mjs) has one pair of panels per case:
// the core stat panel (id n * 10) with this plugin right below it (id n * 10 + 1), in the same column, with the same
// query, field config and options. parity-swapped.json is the same dashboard with core and plugin swapped. Cases are
// keyed by panel id: one case has no title.
//
// Each panel is compared with the panel at the same position in the other dashboard (so core with plugin, twice per
// case): Chrome rasterises the same CSS differently at different places on the page (the dithering of the Background
// Gradient changes with the position). Grafana's panel frame (PanelChrome, not drawn by the panel) is squared off for
// the screenshots: the anti-aliasing of its rounded bottom corners, where they clip the tiles, differed in 3 or 4 corner
// pixels between two loads of the same core panel at the same position. See UPSTREAM.md, "Tests".
//
// Per case, theme and pixel ratio, the two panels must have:
// - the same pixels: element screenshots of the panel content, decoded and compared byte by byte (RGBA);
// - the same elements with the same attributes (all of them: inline styles, which theme CSS selects on, classes,
//   roles, aria-*, links, icon sizes);
// - the same sparkline canvas bytes (size and an FNV hash of the RGBA data);
// - the same native tooltips (`title` attributes).
// Each screenshot and canvas must be at least 5 % painted (pixels that differ from the panel background, or canvas
// pixels that aren't transparent), so two empty renders can't pass as identical. Captures are repeated until two in a
// row are the same for both panels (fonts load, font sizes come from a shared measureText cache, and the percent change
// arrow icon loads asynchronously).
interface Dashboard {
  uid: string;
  panels: Array<{ id: number; type: string; title: string }>;
}
const read = (file: string): Dashboard =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '../provisioning/dashboards', file), 'utf8'));
const DASHBOARDS = [read('parity.json'), read('parity-swapped.json')] as const;

const CORE = 'stat';
const PLUGIN = 'pjan-stat-panel';
// The top panel of each case
const cases = DASHBOARDS[0].panels.filter((panel) => panel.type === CORE);
for (const { id } of cases) {
  const types = DASHBOARDS.map((d) => [id, id + 1].map((i) => d.panels.find((p) => p.id === i)?.type).join(','));
  if (types[0] !== `${CORE},${PLUGIN}` || types[1] !== `${PLUGIN},${CORE}`) {
    throw new Error(`parity dashboards: case ${id} has ${types.join(' and ')}`);
  }
}

// Squares off Grafana's panel frame (see above). Applied to both dashboards alike.
const SQUARE_FRAMES = '[data-viz-panel-key] > div > section { border-radius: 0 !important; }';

const MIN_PAINTED = 0.05;

// The theme as loaded (`?theme=`), and whether it is then switched live with Grafana's "c r" shortcut (toggle the
// theme without saving the preference: `toggleTheme(true)` in public/app/core/services/keybindingSrv.ts).
const THEMES = [
  { name: 'light', load: 'light', toggle: false },
  { name: 'dark', load: 'dark', toggle: false },
  { name: 'dark, switched live from light', load: 'light', toggle: true },
  { name: 'light, switched live from dark', load: 'dark', toggle: true },
] as const;

interface CanvasPrint {
  width: number;
  height: number;
  painted: number;
  hash: number;
}

interface Capture {
  png: Buffer;
  elements: string[];
  titles: string[];
  canvases: CanvasPrint[];
  background: number[];
}

const content = (page: Page, id: number) =>
  page.locator(`[data-viz-panel-key="panel-${id}"] [data-testid="data-testid panel content"]`);

const capture = async (page: Page, id: number): Promise<Capture> => {
  const element = content(page, id);
  const dom = await element.evaluate((root) => {
    const elements = [root, ...Array.from(root.querySelectorAll('*'))];
    const canvases = Array.from(root.querySelectorAll('canvas')).map((canvas) => {
      // Width, height, and a hash of the RGBA bytes, as in State timeline ++'s parity test
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
    const section = root.closest('section')!;
    const background = getComputedStyle(section)
      .backgroundColor.match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number);
    return {
      // Every attribute of every element, sorted by name: style, class, role, aria-*, tabindex, href, title, and the
      // SVG icons' viewBox, width and height
      elements: elements.map((el) =>
        [
          el.tagName.toLowerCase(),
          ...Array.from(el.attributes)
            .map((attribute) => `${attribute.name}=${JSON.stringify(attribute.value)}`)
            .sort(),
        ].join(' ')
      ),
      titles: elements.filter((el) => el.hasAttribute('title')).map((el) => el.getAttribute('title')!),
      canvases,
      background,
    };
  });
  const png = await element.screenshot({ animations: 'disabled', caret: 'hide' });
  return { png, ...dom };
};

const decode = (png: Buffer) => PNG.sync.read(png);

const paintedShare = (png: Buffer, background: number[]) => {
  const { data, width, height } = decode(png);
  let painted = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== background[0] || data[i + 1] !== background[1] || data[i + 2] !== background[2]) {
      painted++;
    }
  }
  return painted / (width * height);
};

const sameCapture = (a: Capture, b: Capture) =>
  a.png.equals(b.png) &&
  JSON.stringify([a.elements, a.titles, a.canvases]) === JSON.stringify([b.elements, b.titles, b.canvases]);

// What differs between two panels at the same position ('identical' when nothing does): one core, one plugin, in either
// order (the top panel is core in the first dashboard, the bottom one in the second).
const compare = (first: Capture, second: Capture) => {
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
        if (where.length < 12) {
          where.push(
            `(${(i / 4) % a.width},${Math.floor(i / 4 / a.width)}) ${a.data.readUInt32BE(i).toString(16)}/${b.data.readUInt32BE(i).toString(16)}`
          );
        }
      }
    }
    problems.push(`${differing} of ${a.width * a.height} pixels differ: ${where.join(' ')}`);
  }
  const painted = paintedShare(first.png, first.background);
  if (painted < MIN_PAINTED) {
    problems.push(`screenshot only ${(painted * 100).toFixed(1)} % painted`);
  }
  if (JSON.stringify(first.elements) !== JSON.stringify(second.elements)) {
    const differing = first.elements
      .map((el, i) => [el, second.elements[i]])
      .filter(([a, b]) => a !== b)
      .slice(0, 5);
    problems.push(`elements (${first.elements.length} vs ${second.elements.length}): ${JSON.stringify(differing)}`);
  }
  if (JSON.stringify(first.titles) !== JSON.stringify(second.titles)) {
    problems.push(`titles: ${JSON.stringify(first.titles)} vs ${JSON.stringify(second.titles)}`);
  }
  if (JSON.stringify(first.canvases) !== JSON.stringify(second.canvases)) {
    problems.push(`canvases: ${JSON.stringify(first.canvases)} vs ${JSON.stringify(second.canvases)}`);
  }
  for (const canvas of first.canvases) {
    if (canvas.painted < MIN_PAINTED * canvas.width * canvas.height) {
      problems.push(`canvas only ${((100 * canvas.painted) / (canvas.width * canvas.height)).toFixed(1)} % painted`);
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

// A panel has drawn: its tiles are there and every icon (the percent change arrow, loaded asynchronously) has its path.
const drawn = async (page: Page, id: number) => {
  await content(page, id).scrollIntoViewIfNeeded();
  await expect
    .poll(
      () =>
        content(page, id).evaluate(
          (root) =>
            root.querySelector('div > div') !== null &&
            Array.from(root.querySelectorAll('svg')).every((svg) => svg.childElementCount > 0)
        ),
      { timeout: 30_000 }
    )
    .toBe(true);
};

// Loads a parity dashboard and every panel on it (Grafana only loads panels once they are scrolled into view), then
// switches the theme live if asked: every panel has been drawn in the first theme when the theme changes.
const open = async (page: Page, uid: string, theme: (typeof THEMES)[number]) => {
  await page.goto(`/d/${uid}?${new URLSearchParams({ orgId: '1', theme: theme.load })}`);
  for (const { id } of cases) {
    await drawn(page, id);
    await drawn(page, id + 1);
  }
  if (theme.toggle) {
    await switchThemeLive(page, theme.load === 'light' ? 'dark' : 'light');
  }
  await page.addStyleTag({ content: SQUARE_FRAMES });
  const radius = await content(page, cases[0].id).evaluate(
    (root) => getComputedStyle(root.closest('section')!).borderRadius
  );
  expect(radius, 'the panel frames are squared off').toBe('0px');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.mouse.move(0, 0);
};

// Captures the case's two panels on both dashboards until two captures in a row are the same, and compares each
// panel with the one at its position on the other dashboard. Returns 'identical', or what differs.
const compareCase = async (pages: Page[], id: number, timeout = 20_000) => {
  let previous: Capture[][] | undefined;
  let result = 'not stable';
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const current: Capture[][] = [];
    for (const page of pages) {
      await page.bringToFront();
      await drawn(page, id);
      await drawn(page, id + 1);
      current.push([await capture(page, id), await capture(page, id + 1)]);
    }
    const stable = current.every((row, d) => row.every((c, k) => previous && sameCapture(previous[d][k], c)));
    previous = current;
    if (stable) {
      const [top, bottom] = [0, 1].map((k) => compare(current[0][k], current[1][k]));
      result = top === 'identical' && bottom === 'identical' ? 'identical' : `top: ${top}; bottom: ${bottom}`;
      if (result === 'identical') {
        break;
      }
    }
    await pages[0].waitForTimeout(500);
  }
  return result;
};

// One test per theme and pixel ratio (each loads the two dashboards once), one step per case.
for (const scale of [1, 2]) {
  for (const theme of THEMES) {
    test.describe(`parity with core stat (${theme.name}, pixel ratio ${scale})`, () => {
      test.use({ deviceScaleFactor: scale });

      test(`${cases.length} cases, each panel compared with the other dashboard's at its position`, async ({
        page,
        context,
      }) => {
        test.setTimeout(20 * 60_000);
        const pages = [page, await context.newPage()];
        for (let d = 0; d < pages.length; d++) {
          await open(pages[d], DASHBOARDS[d].uid, theme);
        }

        for (const { id, title } of cases) {
          await test.step(`${id}: ${title || '(no title)'}`, async () => {
            expect.soft(await compareCase(pages, id), `case ${id}: ${title || '(no title)'}`).toBe('identical');
          });
        }
      });
    });
  }
}

// The two sides of the 2.5 width/height ratio: BigValueLayout's buildLayout picks WideWithChartLayout above it (tile and
// value/name container in a row) and StackedWithChartLayout below (both in a column). Checked in the DOM, in core and
// in the plugin, so the cases really are on the two sides.
test('the width/height cases use the wide and the stacked layout', async ({ page }) => {
  const layouts = [
    { title: 'wide: width/height above 2.5', tile: 'row', container: 'row' },
    { title: 'stacked: width/height below 2.5', tile: 'column', container: 'column' },
  ];
  await page.goto(`/d/${DASHBOARDS[0].uid}?orgId=1`);
  for (const { title, tile, container } of layouts) {
    const { id } = cases.find((c) => c.title === title)!;
    for (const panelId of [id, id + 1]) {
      await drawn(page, panelId);
      const directions = await content(page, panelId).evaluate((root) => {
        // VizRepeater's item > BigValue's tile > the value and name container
        const tileElement = root.querySelector<HTMLElement>(':scope > div > div > div')!;
        const containerElement = tileElement.firstElementChild as HTMLElement;
        const box = tileElement.getBoundingClientRect();
        return {
          ratio: box.width / box.height,
          tile: tileElement.style.flexDirection,
          container: containerElement.style.flexDirection,
          sparkline: tileElement.querySelector('canvas') !== null,
        };
      });
      expect(directions).toMatchObject({ tile, container, sparkline: true });
      expect(directions.ratio > 2.5).toBe(tile === 'row');
    }
  }
});
