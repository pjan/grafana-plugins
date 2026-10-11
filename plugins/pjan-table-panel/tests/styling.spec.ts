import { createTheme, type GrafanaTheme2 } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { expect, test, type Page } from '@grafana/plugin-e2e';
import { PNG } from 'pngjs';
import tinycolor from 'tinycolor2';

// The colour helpers of the shared package, from their files: its entry point also exports the editors (@grafana/ui),
// which don't load in Node.
import { getAutomaticText, getMinTextContrast } from '../../../packages/grafana-styling/src/canvasColors';
import { getValueShadeColor } from '../../../packages/grafana-styling/src/schemes';
import { getRelativeShadeColor, getShadeColor, type RelativeShade } from '../../../packages/grafana-styling/src/shades';

import { type Dashboard, panelContent, readDashboard, serialise, SQUARE_FRAMES, switchThemeLive } from './parity';

// Text color and Background color on provisioning/dashboards/styling.json (scripts/generate-styling-dashboard.mjs): one
// row per case, core's table, Table plus with nothing set and Table plus with the case's styling, with the same data.
// Per case:
// - nothing set equals core: the same elements (all attributes, inline styles included, and text) and the same pixels
//   at every cell;
// - set: each cell's inline colours (and each pill's) are what the rules give for core's colour of the same cell,
//   worked out here with @pjan/grafana-styling from the column's cell type and styling as saved in the panel, at the
//   font size and weight the cell is drawn in; a basic fill also in the screenshot's pixels; a few cases also against
//   colours worked out by hand (HAND); and set differs from core where the option applies (Fixed on gradient cells:
//   equal, it doesn't apply).
// In the light and the dark theme, dark after a live switch from light, at pixel ratio 1 and 2. After a live switch
// Grafana keeps drawing the value colours of the first theme (core's, the same in all three panels) until the data is
// refreshed: the rules then apply to those colours in the new theme, and the hand-computed colours (which assume the
// theme's own value colours) are checked only without a live switch.
const DASHBOARD: Dashboard = readDashboard('styling.json');
const UID = DASHBOARD.uid;

interface StylingColor {
  mode: string;
  shade?: RelativeShade;
  fixedColor?: string;
}
interface Styling {
  textColor?: StylingColor;
  backgroundColor?: StylingColor;
}
interface CellOptions {
  type: string;
  mode?: string;
  applyToRow?: boolean;
}
interface Override {
  matcher: { id: string; options: string; scope?: string };
  properties: Array<{ id: string; value?: unknown }>;
}
interface SavedPanel {
  id: number;
  title: string;
  transparent?: boolean;
  fieldConfig: { defaults: { custom?: { styling?: Styling } }; overrides: Override[] };
}

// The colour names behind the data (scripts/generate-styling-dashboard.mjs): the states' mappings, the level's
// thresholds (green, orange from 40, dark-red from 75); hex colours and the string-hash pills have no name; the cpu
// column is coloured by Green-Yellow-Red (by value) between 0 and 100
const STATE_COLORS: Record<string, string> = { Up: 'green', Degraded: 'yellow', Down: 'red', Info: 'blue' };
const levelColor = (level: number) => (level >= 75 ? 'dark-red' : level >= 40 ? 'orange' : 'green');
const SCHEME_STOPS = ['green', 'yellow', 'red'];

// Worked out by hand, independently of the code under test and of the shared package (job tmp
// table-plan/build1/oracle_e2e.py: Grafana 13.2.3's stock theme colours, Grafana's 3-digit luminance, 1 % sRGB steps,
// the shades ranked by contrast with the panel background, tinycolor's darken and spin for core's gradient start)
const HAND = {
  light: {
    basic: { green: 'rgb(27, 51, 23)', yellow: 'rgb(104, 88, 5)', red: 'rgb(11, 2, 3)', blue: 'rgb(2, 5, 9)' },
    gradient: { green: 'rgb(27, 51, 23)', yellow: 'rgb(104, 88, 5)', red: 'rgb(11, 2, 3)', blue: 'rgb(2, 5, 9)' },
    softBasic: {
      green: ['rgb(115, 191, 105)', 'rgb(43, 71, 39)'],
      yellow: ['rgb(250, 222, 42)', 'rgb(110, 98, 18)'],
      red: ['rgb(242, 73, 92)', 'rgb(61, 18, 23)'],
      blue: ['rgb(87, 148, 242)', 'rgb(26, 44, 73)'],
    },
    softGradient: {
      green: ['linear-gradient(120deg, rgb(132, 202, 130), rgb(115, 191, 105))', 'rgb(43, 71, 39)'],
      yellow: ['linear-gradient(120deg, rgb(251, 242, 77), rgb(250, 222, 42))', 'rgb(110, 98, 18)'],
      red: ['linear-gradient(120deg, rgb(244, 106, 110), rgb(242, 73, 92))', 'rgb(61, 18, 23)'],
      blue: ['linear-gradient(120deg, rgb(120, 159, 245), rgb(87, 148, 242))', 'rgb(26, 44, 73)'],
    },
    textOnPrimary: { green: 'rgb(68, 131, 59)', orange: 'rgb(189, 89, 7)', 'dark-red': 'rgb(173, 3, 23)' },
    textOnCanvas: { green: 'rgb(67, 129, 59)', orange: 'rgb(186, 88, 7)', 'dark-red': 'rgb(173, 3, 23)' },
    // hex colours: a nearest green, b nearest red (Softer fill, Stronger text); c (teal) near no hue: its own colour,
    // Automatic text
    hex: {
      a: ['rgb(150, 217, 141)', 'rgb(25, 115, 14)'],
      b: ['rgb(255, 115, 131)', 'rgb(173, 3, 23)'],
      c: ['rgb(0, 128, 128)', 'rgb(246, 249, 249)'],
    },
    // Green-Yellow-Red at 0, 0.25, 0.5, 0.75 and 1: Soft fills (and Automatic text on them), Stronger text
    schemeSoft: [
      ['rgb(115, 191, 105)', 'rgb(43, 71, 39)'],
      ['rgb(180, 203, 76)', 'rgb(74, 83, 31)'],
      ['rgb(226, 192, 61)', 'rgb(93, 79, 25)'],
      ['rgb(243, 144, 69)', 'rgb(90, 53, 26)'],
      ['rgb(242, 73, 92)', 'rgb(61, 18, 23)'],
    ],
    schemeStronger: ['rgb(25, 115, 14)', 'rgb(110, 132, 8)', 'rgb(169, 124, 6)', 'rgb(184, 76, 12)', 'rgb(173, 3, 23)'],
    // "row: background soft, gradient": level's Automatic on its row's shaded gradient (oracle_m5.py), by host
    rowLevel: { api: 'rgb(38, 73, 33)', web: 'rgb(158, 74, 6)', db: 'rgb(74, 1, 10)', queue: 'rgb(71, 34, 3)' },
    // "background fixed, basic": purple, Automatic text on it
    fixedPurple: ['rgb(163, 82, 204)', 'rgb(7, 3, 8)'],
  },
  dark: {
    basic: { green: 'rgb(46, 70, 48)', yellow: 'rgb(108, 98, 30)', red: 'rgb(49, 26, 33)', blue: 'rgb(32, 45, 69)' },
    gradient: { green: 'rgb(37, 53, 39)', yellow: 'rgb(106, 96, 30)', red: 'rgb(22, 19, 24)', blue: 'rgb(17, 18, 23)' },
    softBasic: {
      green: ['rgb(86, 166, 75)', 'rgb(31, 49, 34)'],
      yellow: ['rgb(242, 204, 12)', 'rgb(100, 87, 19)'],
      red: ['rgb(224, 47, 68)', 'rgb(255, 255, 255)'],
      blue: ['rgb(50, 116, 217)', 'rgb(255, 255, 255)'],
    },
    softGradient: {
      green: ['linear-gradient(120deg, rgb(62, 131, 59), rgb(86, 166, 75))', 'rgb(17, 18, 23)'],
      yellow: ['linear-gradient(120deg, rgb(193, 178, 10), rgb(242, 204, 12))', 'rgb(76, 66, 20)'],
      red: ['linear-gradient(120deg, rgb(191, 29, 34), rgb(224, 47, 68))', 'rgb(255, 255, 255)'],
      blue: ['linear-gradient(120deg, rgb(34, 80, 182), rgb(50, 116, 217))', 'rgb(255, 255, 255)'],
    },
    textOnPrimary: { green: 'rgb(115, 191, 105)', orange: 'rgb(255, 152, 48)', 'dark-red': 'rgb(213, 90, 104)' },
    textOnCanvas: { green: 'rgb(115, 191, 105)', orange: 'rgb(255, 152, 48)', 'dark-red': 'rgb(211, 80, 95)' },
    hex: {
      a: ['rgb(55, 135, 45)', 'rgb(200, 242, 194)'],
      b: ['rgb(196, 22, 42)', 'rgb(255, 166, 176)'],
      c: ['rgb(0, 128, 128)', 'rgb(245, 250, 250)'],
    },
    schemeSoft: [
      ['rgb(86, 166, 75)', 'rgb(31, 49, 34)'],
      ['rgb(160, 181, 46)', 'rgb(60, 67, 30)'],
      ['rgb(213, 172, 32)', 'rgb(80, 67, 26)'],
      ['rgb(229, 121, 42)', 'rgb(64, 41, 27)'],
      ['rgb(224, 47, 68)', 'rgb(255, 255, 255)'],
    ],
    schemeStronger: [
      'rgb(200, 242, 194)',
      'rgb(226, 243, 175)',
      'rgb(246, 233, 164)',
      'rgb(254, 205, 166)',
      'rgb(255, 166, 176)',
    ],
    rowLevel: { api: 'rgb(17, 18, 23)', web: 'rgb(91, 60, 31)', db: 'rgb(255, 255, 255)', queue: 'rgb(255, 255, 255)' },
    fixedPurple: ['rgb(184, 119, 217)', 'rgb(50, 38, 62)'],
  },
} as const;

// --- Reading the table ------------------------------------------------------------------------------------------

interface DrawnPill {
  background: string;
  color: string;
  fontSize: number;
  fontWeight: number;
}
interface DrawnCell {
  /** Which grid of the panel (0: the table; nested sub-tables after it) */
  grid: number;
  column: string;
  /** The text of the row's first cell (its host) */
  row: string;
  text: string;
  color: string;
  background: string;
  fontSize: number;
  fontWeight: number;
  pills: DrawnPill[];
  /** CSS pixels, relative to the panel content */
  box: { x: number; y: number; width: number; height: number };
}

const readCells = (page: Page, id: number): Promise<DrawnCell[]> =>
  panelContent(page, id).evaluate((root) => {
    const rootBox = root.getBoundingClientRect();
    const grids = Array.from(root.querySelectorAll<HTMLElement>('[role="grid"], [role="treegrid"]'));
    const cells: DrawnCell[] = [];
    grids.forEach((grid, g) => {
      const own = (el: Element) => el.closest('[role="grid"], [role="treegrid"]') === grid;
      const headers = new Map(
        Array.from(grid.querySelectorAll('[role="columnheader"]'))
          .filter(own)
          .map((h) => [h.getAttribute('aria-colindex'), (h as HTMLElement).innerText.trim()])
      );
      for (const row of Array.from(grid.querySelectorAll('[role="row"]')).filter(own)) {
        const rowCells = Array.from(row.querySelectorAll<HTMLElement>('[role="gridcell"]')).filter(
          (c) => own(c) && !c.querySelector('[role="grid"], [role="treegrid"]')
        );
        const first = rowCells.find((c) => c.innerText.trim() !== '');
        for (const cell of rowCells) {
          const style = getComputedStyle(cell);
          const box = cell.getBoundingClientRect();
          cells.push({
            grid: g,
            column: headers.get(cell.getAttribute('aria-colindex')) ?? '',
            row: first?.innerText.trim() ?? '',
            text: cell.innerText.trim(),
            color: cell.style.color,
            background: cell.style.background,
            fontSize: parseFloat(style.fontSize),
            fontWeight: Number(style.fontWeight),
            pills: Array.from(cell.querySelectorAll<HTMLElement>('span[style]'))
              .filter((s) => s.style.backgroundColor !== '')
              .map((s) => ({
                background: s.style.backgroundColor,
                color: s.style.color,
                fontSize: parseFloat(getComputedStyle(s).fontSize),
                fontWeight: Number(getComputedStyle(s).fontWeight),
              })),
            box: { x: box.x - rootBox.x, y: box.y - rootBox.y, width: box.width, height: box.height },
          });
        }
      }
    });
    return cells;
  });

/** The table background a panel's grid is drawn on (getGridStyles' --rdg-background-color). */
const gridBackgroundOf = (page: Page, id: number) =>
  panelContent(page, id).evaluate((root) =>
    getComputedStyle(root.querySelector('[role="grid"], [role="treegrid"]')!)
      .getPropertyValue('--rdg-background-color')
      .trim()
  );

/** A panel has drawn its rows (and, for a nested table, its sub-tables). */
const drawnCells = async (page: Page, id: number, nested: boolean) => {
  let cells: DrawnCell[] = [];
  await panelContent(page, id).scrollIntoViewIfNeeded();
  await expect
    .poll(
      async () => {
        await panelContent(page, id).scrollIntoViewIfNeeded();
        cells = await readCells(page, id);
        const grids = new Set(cells.map((c) => c.grid)).size;
        return cells.length > 0 && (!nested || grids > 1);
      },
      { timeout: 30_000 }
    )
    .toBe(true);
  return cells;
};

const rgb = (color: string) => tinycolor(color).toRgbString();
/** A CSS background as drawn: one colour, or `linear-gradient(120deg, <colour>, <colour>)`, colours as rgb(). */
const background = (css: string) => {
  const gradient = /^linear-gradient\(120deg, (.+), (rgba?\([^)]*\)|#\w+)\)$/.exec(css);
  return gradient ? `linear-gradient(120deg, ${rgb(gradient[1])}, ${rgb(gradient[2])})` : css ? rgb(css) : '';
};
const stopsOf = (css: string) => {
  const gradient = /^linear-gradient\(120deg, (.+), (rgba?\([^)]*\)|#\w+)\)$/.exec(css);
  return gradient ? [gradient[1], gradient[2]] : [css];
};

// --- What the rules give -----------------------------------------------------------------------------------------

/** A column's cell type and styling, as Grafana applies the saved field config (defaults, then overrides by name). */
function columnConfig(panel: SavedPanel, column: string, nested: boolean) {
  let cellOptions: CellOptions = { type: 'auto' };
  let styling: Styling = { ...(panel.fieldConfig.defaults.custom?.styling ?? {}) };
  let tooltipField: string | undefined;
  for (const o of panel.fieldConfig.overrides) {
    if (o.matcher.id !== 'byName' || o.matcher.options !== column || (o.matcher.scope === 'nested') !== nested) {
      continue;
    }
    for (const p of o.properties) {
      if (p.id === 'custom.cellOptions') {
        cellOptions = p.value as CellOptions;
      } else if (p.id === 'custom.styling.textColor') {
        styling = { ...styling, textColor: p.value as StylingColor | undefined };
      } else if (p.id === 'custom.styling.backgroundColor') {
        styling = { ...styling, backgroundColor: p.value as StylingColor | undefined };
      } else if (p.id === 'custom.tooltip.field') {
        tooltipField = p.value as string;
      }
    }
  }
  return { cellOptions, styling, tooltipField };
}

interface Context {
  theme: GrafanaTheme2;
  /** The table's background (getGridStyles): the canvas on a transparent panel */
  grid: string;
}

/** What a value colour looks like in a shade: by its name's hue, the nearest hue, or the scheme's shaded stops. */
function shadeOf(ctx: Context, color: string, name: string | undefined, shade: RelativeShade, position?: number) {
  const { theme } = ctx;
  if (position !== undefined) {
    const stops = SCHEME_STOPS.map((s) => theme.visualization.getColorByName(s));
    return getValueShadeColor(theme, color, undefined, shade, { scheme: { stops }, position });
  }
  return name ? getRelativeShadeColor(theme, name, shade) : getShadeColor(theme, color, undefined, shade);
}

/** Core's gradient start (getCellColorInlineStylesFactory): darkened by 10 in dark, lightened by 7 in light, 5° spin. */
const gradientStart = (ctx: Context, color: string) =>
  tinycolor(color)
    .darken(10 * (ctx.theme.isDark ? 1 : -0.7))
    .spin(5)
    .toRgbString();

const automatic = (ctx: Context, stops: string[], size: number, weight: number, from?: string) =>
  getAutomaticText(ctx.theme, stops[0], getMinTextContrast(size, weight), {
    background: ctx.grid,
    from,
    alsoOn: stops.length > 1 ? stops.slice(1) : undefined,
  });

/** A text colour of the option, drawn on `stops`; `undefined` when unset. */
function textOf(
  ctx: Context,
  setting: StylingColor | undefined,
  value: string,
  name: string | undefined,
  stops: string[],
  font: { size: number; weight: number },
  from?: string,
  position?: number
): string | undefined {
  switch (setting?.mode) {
    case undefined:
      return undefined;
    case 'value':
      return value;
    case 'fixed':
      return ctx.theme.visualization.getColorByName(setting.fixedColor!);
    case 'shade':
      return shadeOf(ctx, value, name, setting.shade!, position) ?? automatic(ctx, stops, font.size, font.weight, from);
    default:
      return automatic(ctx, stops, font.size, font.weight, from);
  }
}

/** A Colored background cell (or a row): core's fill and text in, the plugin's out. */
function fillOf(
  ctx: Context,
  config: { cellOptions: CellOptions; styling: Styling },
  core: { color: string; background: string },
  name: string | undefined,
  font: { size: number; weight: number },
  position?: number
) {
  const gradient = (config.cellOptions.mode ?? 'gradient') === 'gradient';
  const value = stopsOf(core.background).at(-1)!;
  const { textColor, backgroundColor } = config.styling;
  let fill = { stops: gradient ? [value, gradientStart(ctx, value)] : [value], css: core.background, plugin: false };
  if (backgroundColor?.mode === 'shade') {
    const shaded = shadeOf(ctx, value, name, backgroundColor.shade!, position) ?? value;
    fill = gradient
      ? {
          stops: [shaded, gradientStart(ctx, shaded)],
          css: `linear-gradient(120deg, ${gradientStart(ctx, shaded)}, ${shaded})`,
          plugin: true,
        }
      : { stops: [shaded], css: shaded, plugin: true };
  } else if (backgroundColor?.mode === 'fixed' && !gradient) {
    const fixed = ctx.theme.visualization.getColorByName(backgroundColor.fixedColor!);
    fill = { stops: [fixed], css: fixed, plugin: true };
  }
  const text =
    textOf(ctx, textColor, value, name, fill.stops, font, undefined, position) ??
    (fill.plugin ? automatic(ctx, fill.stops, font.size, font.weight) : core.color);
  return { color: rgb(text), background: background(fill.css), fill };
}

/** The colour name and scheme position behind a cell, from its column and text (see the generator). */
function sourceOf(column: string, text: string): { name?: string; position?: number } {
  switch (column) {
    case 'state':
      return { name: STATE_COLORS[text] };
    case 'level':
      return { name: levelColor(Number(text)) };
    case 'cpu':
      return { position: Number(text) / 100 };
    default:
      return {};
  }
}

// --- The cases ---------------------------------------------------------------------------------------------------

interface Case {
  title: string;
  core: SavedPanel;
  unset: SavedPanel;
  set: SavedPanel;
  nested: boolean;
}
const panels = DASHBOARD.panels as unknown as SavedPanel[];
const CASES: Case[] = panels
  .filter((p) => p.title.endsWith(': core'))
  .map((core) => {
    const title = core.title.slice(0, -': core'.length);
    const find = (which: string) => panels.find((p) => p.title === `${title}: ${which}`)!;
    return { title, core, unset: find('nothing set'), set: find('set'), nested: title.startsWith('nested') };
  });

/** The hand-computed colours a case is checked against too, by the cell's state or level colour. */
function handOf(title: string, mode: 'light' | 'dark', cell: DrawnCell) {
  const hand = HAND[mode];
  const state = STATE_COLORS[cell.text] as keyof typeof hand.basic | undefined;
  const level = levelColor(Number(cell.text)) as keyof typeof hand.textOnPrimary;
  if (cell.column === 'state' && state) {
    switch (title) {
      case 'text automatic, background basic':
      case 'row: text automatic, basic':
        return { color: hand.basic[state] };
      case 'text automatic, background gradient':
        return { color: hand.gradient[state] };
      case 'background soft, basic':
        return { background: hand.softBasic[state][0], color: hand.softBasic[state][1] };
      case 'background soft, gradient':
      case 'row: background soft, gradient':
        return { background: hand.softGradient[state][0], color: hand.softGradient[state][1] };
    }
  }
  if (cell.column === 'state' && title === 'background fixed, basic') {
    return { background: hand.fixedPurple[0], color: hand.fixedPurple[1] };
  }
  if (cell.column === 'level' && title === 'row: background soft, gradient') {
    return { color: hand.rowLevel[cell.row as keyof typeof hand.rowLevel] };
  }
  if (cell.column === 'hex' && title.startsWith('hex colours')) {
    const [fill, text] = hand.hex[cell.text as keyof typeof hand.hex];
    return { background: fill, color: text };
  }
  if (cell.column === 'cpu') {
    const at = Number(cell.text) / 25;
    switch (title) {
      case 'scheme: background soft, basic':
        return { background: hand.schemeSoft[at][0], color: hand.schemeSoft[at][1] };
      case 'scheme: text stronger, colored text':
        return { color: hand.schemeStronger[at] };
    }
  }
  if (cell.column === 'level') {
    switch (title) {
      case 'colored text: text automatic':
        return { color: hand.textOnPrimary[level] };
      case 'colored text, transparent panel: text automatic':
        return { color: hand.textOnCanvas[level] };
    }
  }
  return undefined;
}

/** A point inside a cell away from its text, its tooltip caret (top left) and its borders: right end, mid-height. */
const inside = (cell: DrawnCell) => [cell.box.x + cell.box.width - 4, cell.box.y + cell.box.height / 2] as const;

/** The pixel at a point of a cell (CSS pixels inside it), from one screenshot of the panel content. */
const pixelsOf = async (page: Page, id: number, scale: number) => {
  const png = PNG.sync.read(await panelContent(page, id).screenshot({ animations: 'disabled', caret: 'hide' }));
  return (x: number, y: number) => {
    const i = (Math.round(y * scale) * png.width + Math.round(x * scale)) * 4;
    return `rgb(${png.data[i]}, ${png.data[i + 1]}, ${png.data[i + 2]})`;
  };
};

const THEME_STATES = [
  { name: 'light', load: 'light', live: undefined },
  { name: 'dark', load: 'dark', live: undefined },
  { name: 'dark, switched live from light', load: 'light', live: 'dark' },
] as const;

for (const scale of [1, 2]) {
  for (const state of THEME_STATES) {
    const mode = state.live ?? state.load;
    test.describe(`Text color and Background color (${state.name}, pixel ratio ${scale})`, () => {
      test.use({ deviceScaleFactor: scale });
      const theme = createTheme({ colors: { mode } });

      for (const c of CASES) {
        test(c.title, async ({ page }) => {
          await page.goto(`/d/${UID}?orgId=1&theme=${state.load}`);
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          const ids = [c.core.id, c.unset.id, c.set.id];
          for (const id of ids) {
            await drawnCells(page, id, c.nested);
          }
          const ctx: Context = {
            theme,
            grid: c.set.transparent ? theme.colors.background.canvas : theme.colors.background.primary,
          };
          if (state.live) {
            await switchThemeLive(page, state.live);
          }
          // Every panel drawn in the theme: its grid on the theme's table background
          for (const id of ids) {
            await expect.poll(() => gridBackgroundOf(page, id)).toBe(ctx.grid);
          }
          await page.addStyleTag({ content: SQUARE_FRAMES });
          await page.mouse.move(0, 0);
          const [core, unset, set] = await Promise.all(ids.map((id) => drawnCells(page, id, c.nested)));

          // Nothing set: core's elements and pixels
          const elements = (id: number) =>
            panelContent(page, id).evaluate(
              (root, source) => (new Function(`return (${source})`)() as typeof serialise)(root, true),
              serialise.toString()
            );
          expect(await elements(c.unset.id), 'nothing set: the same elements as core').toEqual(
            await elements(c.core.id)
          );
          const [corePixel, unsetPixel, setPixel] = await Promise.all(ids.map((id) => pixelsOf(page, id, scale)));
          for (const [k, cell] of core.entries()) {
            expect(unset[k].text).toBe(cell.text);
            // Gradients only by their CSS (in the elements): Chrome rasterises a gradient differently at different
            // places on the page (the parity suite's finding), and the panels are side by side
            if (!cell.background.startsWith('linear-gradient')) {
              const at = inside(cell);
              expect(unsetPixel(...at), `nothing set: ${cell.row}/${cell.column} pixel`).toBe(corePixel(...at));
            }
          }

          // Set: each cell against the rules, and against core
          expect(set.map((cell) => [cell.grid, cell.row, cell.column, cell.text])).toEqual(
            core.map((cell) => [cell.grid, cell.row, cell.column, cell.text])
          );
          let differs = 0;
          let applies = 0;
          for (const [k, cell] of set.entries()) {
            const coreCell = core[k];
            const label = `${c.title}: ${cell.grid}/${cell.row}/${cell.column} (${cell.text})`;
            const config = columnConfig(c.set, cell.column, cell.grid > 0);
            const { name, position } = sourceOf(cell.column, cell.text);
            const font = { size: cell.fontSize, weight: cell.fontWeight };
            // The row's fill and text (Apply to entire row): from the field that colours the row (state)
            const rowConfig = columnConfig(c.set, 'state', cell.grid > 0);
            const rowCell = set.find((x) => x.grid === cell.grid && x.row === cell.row && x.column === 'state');
            const coreRowCell = core.find((x) => x.grid === cell.grid && x.row === cell.row && x.column === 'state');
            let want: { color: string; background: string } | undefined;

            if (rowConfig.cellOptions.applyToRow && rowCell && coreRowCell) {
              const row = fillOf(
                ctx,
                rowConfig,
                coreRowCell,
                STATE_COLORS[rowCell.text],
                { size: rowCell.fontSize, weight: rowCell.fontWeight },
                undefined
              );
              const text =
                config.cellOptions.type === 'color-text'
                  ? textOf(ctx, config.styling.textColor, coreCell.color, name, row.fill.stops, font, coreCell.color)
                  : undefined;
              want = { color: text ? rgb(text) : row.color, background: row.background };
            } else if (config.cellOptions.type === 'color-background' && coreCell.background) {
              const drawn = fillOf(ctx, config, coreCell, name, font, position);
              want = { color: drawn.color, background: drawn.background };
            } else if (config.cellOptions.type === 'color-text' && coreCell.color) {
              const text = textOf(
                ctx,
                config.styling.textColor,
                coreCell.color,
                name,
                [ctx.grid],
                font,
                coreCell.color,
                position
              );
              want = { color: text ? rgb(text) : rgb(coreCell.color), background: '' };
            } else if (config.cellOptions.type === 'pill') {
              expect(cell.pills.length, label).toBe(coreCell.pills.length);
              for (const [p, pill] of cell.pills.entries()) {
                const corePill = coreCell.pills[p];
                const pillName = cell.column === 'state' ? STATE_COLORS[cell.text] : undefined;
                const text = textOf(
                  ctx,
                  config.styling.textColor,
                  rgb(corePill.background),
                  pillName,
                  [corePill.background],
                  { size: pill.fontSize, weight: pill.fontWeight }
                );
                expect(pill.fontSize, `${label}: pills are drawn at 12 px`).toBe(12);
                expect(rgb(pill.background), `${label}: core's pill fill`).toBe(rgb(corePill.background));
                expect(rgb(pill.color), `${label}: pill text`).toBe(rgb(text ?? corePill.color));
                if (config.styling.textColor) {
                  applies++;
                  differs += rgb(pill.color) !== rgb(corePill.color) ? 1 : 0;
                }
                if (c.title === 'pill: text automatic' && !state.live) {
                  // hand-computed: Automatic at 12 px needs 4.5:1, as at 14 px
                  expect(rgb(pill.color), `${label} (hand-computed)`).toBe(
                    HAND[mode].basic[STATE_COLORS[cell.text] as keyof (typeof HAND)['light']['basic']]
                  );
                }
              }
              continue;
            }

            const drawn = { color: cell.color ? rgb(cell.color) : '', background: background(cell.background) };
            if (!want) {
              // a column the options don't apply to: core's
              expect(drawn, `${label}: as core`).toEqual({
                color: coreCell.color ? rgb(coreCell.color) : '',
                background: background(coreCell.background),
              });
              continue;
            }
            expect(drawn, label).toEqual(want);
            expect(cell.fontSize, `${label}: cells are drawn at 14 px`).toBe(14);
            const hand = state.live ? undefined : handOf(c.title, mode, cell);
            if (hand) {
              expect(drawn.color, `${label} text (hand-computed)`).toBe(hand.color);
              if ('background' in hand) {
                expect(drawn.background, `${label} fill (hand-computed)`).toBe(hand.background);
              }
            }
            if (!drawn.background.startsWith('linear-gradient') && drawn.background !== '') {
              expect(setPixel(...inside(cell)), `${label}: the fill as drawn`).toBe(drawn.background);
            }
            const coreDrawn = {
              color: rgb(coreCell.color || 'transparent'),
              background: background(coreCell.background),
            };
            if (config.styling.textColor || config.styling.backgroundColor) {
              applies++;
              differs += JSON.stringify(drawn) !== JSON.stringify(coreDrawn) ? 1 : 0;
            }
          }
          if (c.title === 'background fixed, gradient (ignored)') {
            expect(differs, 'Fixed doesn’t apply to gradient cells: as core').toBe(0);
          } else {
            expect(applies, 'cells the case’s options apply to').toBeGreaterThan(0);
            expect(differs, 'set differs from core').toBeGreaterThan(0);
          }

          // A transparent panel: the table is drawn on the dashboard's canvas, and Automatic is measured against it
          if (c.set.transparent) {
            const host = set.find((cell) => cell.column === 'host')!;
            expect(setPixel(...inside(host)), 'the grid background').toBe(rgb(theme.colors.background.canvas));
          }
        });
      }

      test('tooltip from field: Colored text in the tooltip is measured against the tooltip’s background', async ({
        page,
      }) => {
        const c = CASES.find((x) => x.title.startsWith('tooltip from field'))!;
        await page.goto(`/d/${UID}?orgId=1&theme=${state.load}`);
        for (const id of [c.core.id, c.set.id]) {
          await drawnCells(page, id, false);
        }
        if (state.live) {
          await switchThemeLive(page, state.live);
        }
        const tooltipColor = async (id: number) => {
          await page.mouse.move(0, 0);
          const caret = panelContent(page, id).getByRole('button', { name: 'Toggle tooltip' }).first();
          await caret.scrollIntoViewIfNeeded();
          await caret.hover();
          const wrapper = page.getByTestId(selectors.components.Panels.Visualization.TableNG.Tooltip.Wrapper);
          await expect(wrapper).toBeVisible();
          return wrapper.evaluate((el) => {
            const content = [el, ...Array.from(el.querySelectorAll<HTMLElement>('*'))].find(
              (x) => (x as HTMLElement).style.color !== ''
            ) as HTMLElement | undefined;
            return { color: content?.style.color ?? '', text: content?.innerText.trim() ?? '' };
          });
        };
        const core = await tooltipColor(c.core.id);
        const set = await tooltipColor(c.set.id);
        expect(set.text).toBe('10'); // api's level: green
        if (!state.live) {
          expect(rgb(core.color)).toBe(rgb(theme.visualization.getColorByName('green')));
        }
        // From the green core draws, against the tooltip's background (primary), not the table's (the canvas: the panel
        // is transparent)
        const want = getAutomaticText(theme, theme.colors.background.primary, 4.5, {
          background: theme.colors.background.primary,
          from: core.color,
        });
        expect(rgb(set.color)).toBe(rgb(want));
        if (!state.live) {
          // (in light, against the canvas it would be rgb(67, 129, 59))
          expect(rgb(set.color)).toBe(HAND[mode].textOnPrimary.green);
        }
      });
    });
  }
}
