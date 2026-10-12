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

// Text color and Background color (build 1), the pill options and the Pill look (build 2), Text weight (build 3) and
// Gauge color (build 4) on provisioning/dashboards/styling.json (scripts/generate-styling-dashboard.mjs): one row per case, core's table, Table
// plus with nothing set and Table plus with the case's styling (and look), with the same data.
// Per case:
// - nothing set equals core: the same elements (all attributes, inline styles included, and text) and the same pixels
//   at every cell;
// - set: each cell's inline colours (and each pill's fill, text, line, border and corner radius) are what the rules give
//   for core's colour of the same cell,
//   worked out here with @pjan/grafana-styling from the column's cell type and styling as saved in the panel, at the
//   font size and weight the cell is drawn in; a basic fill also in the screenshot's pixels; a few cases also against
//   colours worked out by hand (HAND); and set differs from core where the option applies (Fixed on gradient cells:
//   equal, it doesn't apply);
// - Text weight: each cell's (and pill's) computed weight is the column's where it applies (Colored text, Colored
//   background, Pill; on a row colored by Apply to entire row, the row field's own cells only), core's elsewhere; the
//   header keeps core's; wrapped text fits its cell at every weight (rows grow where a heavier weight takes another
//   line: hand-computed heights); content-aware widths (flag) measure at the weight;
// - Gauge color: each gauge (its value's colour, its basic or gradient bar, its LCD cells) is core's gauge of the same
//   cell with each colour stop in the shade (by its name, else its nearest hue; a continuous scheme's stops shaded and
//   interpolated at the value's or the LCD cell's position), or the Fixed colour on a basic gauge; Fixed on gradient and
//   LCD gauges draws as core; a basic bar's line also in the screenshot's pixels.
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
  fillColor?: StylingColor;
  lineColor?: StylingColor;
  lineWidth?: number;
  cornerRadius?: number;
  textWeight?: number;
  gaugeColor?: StylingColor;
}
interface CellOptions {
  type: string;
  mode?: string;
  applyToRow?: boolean;
  valueDisplayMode?: string;
}
interface Override {
  matcher: { id: string; options: string; scope?: string };
  properties: Array<{ id: string; value?: unknown }>;
}
interface SavedPanel {
  id: number;
  title: string;
  transparent?: boolean;
  targets: Array<{ rawFrameContent?: string }>;
  fieldConfig: { defaults: { custom?: { styling?: Styling } }; overrides: Override[] };
  options: { styling?: { look?: string } };
}

// The colour names behind the data (scripts/generate-styling-dashboard.mjs): the states' mappings, the level's
// thresholds (green, orange from 40, dark-red from 75); hex colours and the string-hash pills have no name; the cpu
// column is coloured by Green-Yellow-Red (by value) between 0 and 100
const STATE_COLORS: Record<string, string> = { Up: 'green', Degraded: 'yellow', Down: 'red', Info: 'blue' };
const levelColor = (level: number) => (level >= 75 ? 'dark-red' : level >= 40 ? 'orange' : 'green');
const SCHEME_STOPS = ['green', 'yellow', 'red'];
// The pills frame (build 2): `state` and `flags` mapped as the states, `power` to blue and `transparent`, `tier` a fixed
// purple; `host` (string hash) has no name
const POWER: Record<string, string> = { On: 'blue', Off: 'transparent' };
const pillNameOf = (column: string, text: string): string | undefined =>
  column === 'state' || column === 'flags'
    ? STATE_COLORS[text]
    : column === 'power'
      ? POWER[text]
      : column === 'tier'
        ? 'purple'
        : undefined;

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

// The Pill look on the pills frame, worked out by hand (job tmp table-plan/build2/oracle_e2e_b2.py, from oracle_b2.py:
// the shades ranked by contrast with the panel background, the nearest hue in OKLCH for the string-hash colours,
// Automatic at 12 px): [fill, line, text] by colour name and by host (string hash), and the transparent pill's text on
// the table, the canvas (transparent panel) and an orange row
const HAND_PILLS = {
  light: {
    green: ['rgb(150, 217, 141)', 'rgb(86, 166, 75)', 'rgb(63, 91, 59)'],
    yellow: ['rgb(255, 238, 82)', 'rgb(242, 204, 12)', 'rgb(115, 107, 37)'],
    red: ['rgb(255, 115, 131)', 'rgb(224, 47, 68)', 'rgb(89, 40, 46)'],
    blue: ['rgb(138, 184, 255)', 'rgb(50, 116, 217)', 'rgb(54, 72, 99)'],
    purple: ['rgb(202, 149, 229)', 'rgb(163, 82, 204)', 'rgb(75, 55, 85)'],
    hosts: {
      api: ['rgb(138, 184, 255)', 'rgb(50, 116, 217)', 'rgb(54, 72, 99)'],
      web: ['rgb(138, 184, 255)', 'rgb(50, 116, 217)', 'rgb(54, 72, 99)'],
      db: ['rgb(255, 179, 87)', 'rgb(255, 120, 10)', 'rgb(105, 73, 36)'],
      queue: ['rgb(255, 115, 131)', 'rgb(224, 47, 68)', 'rgb(89, 40, 46)'],
    },
    offOnTable: 'rgb(117, 117, 117)',
    offOnCanvas: 'rgb(115, 115, 115)',
    offOnOrangeRow: 'rgb(89, 42, 4)',
  },
  dark: {
    green: ['rgb(55, 135, 45)', 'rgb(115, 191, 105)', 'rgb(255, 255, 255)'],
    yellow: ['rgb(224, 180, 0)', 'rgb(250, 222, 42)', 'rgb(87, 73, 15)'],
    red: ['rgb(196, 22, 42)', 'rgb(242, 73, 92)', 'rgb(246, 218, 221)'],
    blue: ['rgb(31, 96, 196)', 'rgb(87, 148, 242)', 'rgb(212, 225, 244)'],
    purple: ['rgb(143, 59, 184)', 'rgb(184, 119, 217)', 'rgb(234, 218, 242)'],
    hosts: {
      api: ['rgb(31, 96, 196)', 'rgb(87, 148, 242)', 'rgb(212, 225, 244)'],
      web: ['rgb(31, 96, 196)', 'rgb(87, 148, 242)', 'rgb(212, 225, 244)'],
      db: ['rgb(250, 100, 0)', 'rgb(255, 152, 48)', 'rgb(68, 36, 18)'],
      queue: ['rgb(196, 22, 42)', 'rgb(242, 73, 92)', 'rgb(246, 218, 221)'],
    },
    offOnTable: 'rgb(130, 132, 134)',
    offOnCanvas: 'rgb(124, 125, 127)',
    offOnOrangeRow: 'rgb(93, 61, 31)',
  },
} as const;

// --- Reading the table ------------------------------------------------------------------------------------------

interface DrawnPill {
  text: string;
  background: string;
  color: string;
  fontSize: number;
  fontWeight: number;
  /** The computed box shadow (the plugin's line: `<colour> 0px 0px 0px <width>px inset`), or `none` */
  boxShadow: string;
  /** The top border's width (0 without one) and colour, as computed */
  border: { width: number; color: string };
  /** The top left corner's radius, CSS pixels */
  radius: number;
  /** CSS pixels, relative to the panel content */
  box: { x: number; y: number; width: number; height: number };
}
interface DrawnGauge {
  /** The value's colour (inline), undefined when hidden */
  value?: string;
  /** Basic and gradient gauges: the bar's background and right border, and its box (CSS pixels, as the cell's) */
  bar?: { background: string; borderRight: string; box: { x: number; y: number; width: number; height: number } };
  /** LCD gauges: each cell's background image (lit) or colour (unlit) */
  lcd?: string[];
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
  /** The top and bottom of what the cell draws (its text and pills, overflowing or not), CSS pixels as `box` */
  content?: { top: number; bottom: number };
  /** A gauge cell's gauge */
  gauge?: DrawnGauge;
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
          const range = document.createRange();
          range.selectNodeContents(cell);
          const content = range.getBoundingClientRect();
          // a gauge (BarGauge): its value, its bar (the element with the width transition), its LCD cells (2 px corners)
          const gaugeValue = cell.querySelector<HTMLElement>('[data-testid="data-testid Bar gauge value"]');
          const divs = Array.from(cell.querySelectorAll<HTMLElement>('div'));
          const bar = divs.find((d) => d.style.transition.includes('width'));
          const lcd = divs.filter((d) => d.childElementCount === 0 && d.style.borderRadius === '2px');
          const barBox = bar?.getBoundingClientRect();
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
              .map((s) => {
                const computed = getComputedStyle(s);
                const pillBox = s.getBoundingClientRect();
                return {
                  text: s.innerText.trim(),
                  background: s.style.backgroundColor,
                  color: s.style.color,
                  fontSize: parseFloat(computed.fontSize),
                  fontWeight: Number(computed.fontWeight),
                  boxShadow: computed.boxShadow,
                  border: {
                    width: computed.borderTopStyle === 'none' ? 0 : parseFloat(computed.borderTopWidth),
                    color: computed.borderTopColor,
                  },
                  radius: parseFloat(computed.borderTopLeftRadius),
                  box: {
                    x: pillBox.x - rootBox.x,
                    y: pillBox.y - rootBox.y,
                    width: pillBox.width,
                    height: pillBox.height,
                  },
                };
              }),
            box: { x: box.x - rootBox.x, y: box.y - rootBox.y, width: box.width, height: box.height },
            content:
              content.height > 0 ? { top: content.top - rootBox.y, bottom: content.bottom - rootBox.y } : undefined,
            gauge:
              gaugeValue || bar || lcd.length > 0
                ? {
                    value: gaugeValue ? gaugeValue.style.color : undefined,
                    bar:
                      bar && barBox
                        ? {
                            background: bar.style.background,
                            borderRight: bar.style.borderRight,
                            box: {
                              x: barBox.x - rootBox.x,
                              y: barBox.y - rootBox.y,
                              width: barBox.width,
                              height: barBox.height,
                            },
                          }
                        : undefined,
                    lcd:
                      lcd.length > 0 ? lcd.map((d) => d.style.backgroundImage || d.style.backgroundColor) : undefined,
                  }
                : undefined,
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
      } else if (p.id.startsWith('custom.styling.')) {
        styling = { ...styling, [p.id.slice('custom.styling.'.length)]: p.value };
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

// --- Text weight (build 3) -----------------------------------------------------------------------------------------

const WEIGHTED_CELL_TYPES = ['color-text', 'color-background', 'pill'];
/** A column's Text weight where it applies (its cell type, one of the three weights), else undefined. */
const weightOf = (config: { cellOptions: CellOptions; styling: Styling }) =>
  WEIGHTED_CELL_TYPES.includes(config.cellOptions.type) && [400, 500, 600].includes(config.styling.textWeight!)
    ? config.styling.textWeight
    : undefined;

// The wrapped cases' first row (r1) and fourth (r4), worked out by hand from the generator's widths (which come from
// Inter's measured widths): one line at 400 (the row keeps cellHeight sm's 36 px); from 500 r1's NOTE takes two lines
// (44 px) and its TAGS pills two (2 × 22 + 4 px), so the row is 48 + 12 px of padding (TABLE.CELL_PADDING × 2) = 60 px;
// r4 has only the TAGS pills (its note and msg are "ok"), so its 60 px come from the pill measurer alone. Core measures
// at 400: 36 px.
const WRAPPED_ROW = { regular: 36, heavier: 60 };

// --- Gauge color (build 4) -----------------------------------------------------------------------------------------

// The colour names of the continuous schemes the cases use, as Grafana resolves its stops
const SCHEME_NAMES: Record<string, string[]> = { 'continuous-GrYlRd': ['green', 'yellow', 'red'] };

interface FrameFieldConfig {
  thresholds?: { steps: Array<{ color: string }> };
  color?: { mode?: string };
  min?: number;
  max?: number;
}
/** A column's field config as the case's raw frames carry it (thresholds, colour mode, min and max). */
function frameConfig(panel: SavedPanel, column: string): FrameFieldConfig {
  const frames = JSON.parse(panel.targets[0].rawFrameContent ?? '[]') as Array<{
    fields: Array<{ name: string; config: FrameFieldConfig }>;
  }>;
  return frames.flatMap((f) => f.fields).find((f) => f.name === column)?.config ?? {};
}

/** Every rgb()/rgba() colour of a CSS value replaced by `f` of its opaque colour (its `k`th), keeping its alpha. */
function mapColors(css: string, f: (color: string, k: number) => string) {
  let k = 0;
  return css.replace(/rgba?\([^)]*\)/g, (m) => {
    const color = tinycolor(m);
    const alpha = color.getAlpha();
    const out = f(rgb(color.clone().setAlpha(1).toRgbString()), k++);
    return alpha < 1 ? tinycolor(out).setAlpha(alpha).toRgbString() : rgb(out);
  });
}

/**
 * A gauge as the rules draw it, from core's gauge of the same cell (`value`: the row's value, 0 to 100): unset, or Fixed
 * on a gradient or LCD gauge, core's. Fixed on a basic gauge: its bar and Value color in the colour. A shade, per colour
 * stop: a colour by its name (one of the column's thresholds whose colour it is in this theme), else its nearest hue,
 * without a hue itself; from a continuous scheme, the scheme's stops shaded and interpolated at the value's position (a
 * LCD cell's own position, as BarGauge asks Grafana's display processor for it), and a gradient bar's stops in order.
 */
function gaugeOf(
  ctx: Context,
  config: { cellOptions: CellOptions; styling: Styling },
  frame: FrameFieldConfig,
  core: DrawnGauge,
  value: number
): DrawnGauge {
  const setting = config.styling.gaugeColor;
  const mode = config.cellOptions.mode ?? 'gradient';
  const valueColored = (config.cellOptions.valueDisplayMode ?? 'text') === 'color';
  if (!setting || (setting.mode === 'fixed' && mode !== 'basic')) {
    return core;
  }
  const { theme } = ctx;
  // The value's colour as core draws it (a basic bar's line, or the value in Value color): without one or with alpha 0
  // (a value mapped to `transparent`, Atlas's "unlimited"), the value, the basic bar and its line stay core's, with a
  // shade and with Fixed
  const coreValueColor =
    mode === 'basic' && core.bar
      ? /rgba?\([^)]*\)/.exec(core.bar.borderRight)?.[0]
      : valueColored
        ? core.value
        : undefined;
  const valueUncoloured = coreValueColor !== undefined && tinycolor(coreValueColor).getAlpha() === 0;
  if (valueUncoloured && mode === 'basic') {
    return core;
  }
  if (setting.mode === 'fixed') {
    const fixed = theme.visualization.getColorByName(setting.fixedColor!);
    return {
      value: core.value !== undefined && valueColored ? rgb(fixed) : core.value,
      bar: core.bar && {
        ...core.bar,
        background: mapColors(core.bar.background, () => fixed),
        borderRight: mapColors(core.bar.borderRight, () => fixed),
      },
      lcd: core.lcd,
    };
  }
  const shade = setting.shade!;
  const schemeNames = SCHEME_NAMES[frame.color?.mode ?? ''];
  const stops = schemeNames?.map((name) => theme.visualization.getColorByName(name));
  const names = frame.thresholds?.steps.map((step) => step.color) ?? [];
  const byName = (color: string) => {
    const name = names.find((n) => rgb(theme.visualization.getColorByName(n)) === rgb(color));
    return getShadeColor(theme, color, name, shade) ?? color;
  };
  const at = (position: number) =>
    getValueShadeColor(theme, '', undefined, shade, { scheme: { stops: stops! }, position })!;
  // positions as Grafana's display processor scales a value: (value - min) / (max - min)
  const min = frame.min ?? 0;
  const max = frame.max ?? 100;
  const ofValue = (color: string) => (stops ? at((value - min) / (max - min)) : byName(color));
  const n = core.lcd?.length ?? 0;
  return {
    value: core.value !== undefined && valueColored && !valueUncoloured ? rgb(ofValue(core.value)) : core.value,
    bar: core.bar && {
      ...core.bar,
      background:
        mode === 'basic'
          ? mapColors(core.bar.background, ofValue)
          : stops
            ? mapColors(core.bar.background, (_c, k) => getRelativeShadeColor(theme, schemeNames[k], shade)!)
            : mapColors(core.bar.background, byName),
      borderRight: mapColors(core.bar.borderRight, ofValue),
    },
    // an LCD cell's position: BarGauge's value for cell i of n, as the display processor scales it
    lcd: core.lcd?.map((css, i) =>
      mapColors(css, (c) => (stops ? at((min + ((max - min) / n) * i - min) / (max - min)) : byName(c)))
    ),
  };
}

// Worked out by hand (job tmp table-plan/build4/oracle.py, Grafana 13.2.3's stock themes): green, yellow and red in the
// shades the cases use, purple, and Green-Yellow-Red Strong at 0.1, 0.25, 0.5, 0.75 and 0.9 (the rows v10 … v90)
const HAND_GAUGE = {
  light: {
    soft: { green: 'rgb(115, 191, 105)', yellow: 'rgb(250, 222, 42)', red: 'rgb(242, 73, 92)' },
    strong: { green: 'rgb(55, 135, 45)', yellow: 'rgb(224, 180, 0)', red: 'rgb(196, 22, 42)' },
    stronger: { green: 'rgb(25, 115, 14)', yellow: 'rgb(204, 157, 0)', red: 'rgb(173, 3, 23)' },
    purple: 'rgb(163, 82, 204)',
    blue: 'rgb(50, 116, 217)',
    schemeStrong: [
      'rgb(89, 144, 36)',
      'rgb(135, 153, 24)',
      'rgb(191, 146, 15)',
      'rgb(206, 97, 23)',
      'rgb(201, 53, 34)',
    ],
  },
  dark: {
    soft: { green: 'rgb(86, 166, 75)', yellow: 'rgb(242, 204, 12)', red: 'rgb(224, 47, 68)' },
    strong: { green: 'rgb(150, 217, 141)', yellow: 'rgb(255, 238, 82)', red: 'rgb(255, 115, 131)' },
    stronger: { green: 'rgb(200, 242, 194)', yellow: 'rgb(255, 248, 153)', red: 'rgb(255, 166, 176)' },
    purple: 'rgb(184, 119, 217)',
    blue: 'rgb(87, 148, 242)',
    schemeStrong: [
      'rgb(171, 221, 129)',
      'rgb(200, 225, 114)',
      'rgb(238, 214, 100)',
      'rgb(253, 174, 109)',
      'rgb(255, 139, 121)',
    ],
  },
} as const;
const GAUGE_ROWS = [10, 25, 50, 75, 90];
// Atlas's "of limit" case: each container's Memory and CPU of limit (the generator's ATLAS_LIMIT; -1 and null are
// "unlimited" and no value, mapped to transparent)
const ATLAS_LIMIT: Record<string, Record<string, number | null>> = {
  plex: { 'Memory of limit': 0.42, 'CPU of limit': 0.18 },
  grafana: { 'Memory of limit': 0.83, 'CPU of limit': null },
  caddy: { 'Memory of limit': -1, 'CPU of limit': 0.91 },
  restic: { 'Memory of limit': 0.95, 'CPU of limit': -1 },
  authentik: { 'Memory of limit': null, 'CPU of limit': 0.86 },
};
const atlasStep = (value: number) => (value >= 0.9 ? 'red' : value >= 0.8 ? 'yellow' : 'green');
const gaugeStep = (value: number) => (value >= 80 ? 'red' : value >= 50 ? 'yellow' : 'green');
const colorsIn = (css: string) =>
  css.match(/rgba?\([^)]*\)/g)?.map((c) => rgb(tinycolor(c).setAlpha(1).toRgbString())) ?? [];

/** Checks a case's gauges against colours worked out by hand (no live switch), returning how many were checked. */
function handGauge(
  title: string,
  mode: 'light' | 'dark',
  label: string,
  column: string,
  value: number,
  g: DrawnGauge,
  row: string
) {
  const hand = HAND_GAUGE[mode];
  const step = gaugeStep(value);
  let checked = 0;
  const check = (actual: string | undefined, want: string, what: string) => {
    expect(actual, `${label}: ${what} (hand-computed)`).toBe(want);
    checked++;
  };
  switch (title) {
    case 'gauge basic, thresholds: gauge color stronger':
      check(colorsIn(g.bar!.borderRight)[0], hand.stronger[step], 'the bar’s line');
      if (column === 'color') {
        check(g.value, hand.stronger[step], 'the value');
      }
      break;
    case 'gauge gradient, thresholds: gauge color soft':
      // the gradient's stops up to the value: Soft green, then yellow from 50, red from 80
      check(
        [...new Set(colorsIn(g.bar!.background))].join(' '),
        [hand.soft.green, ...(value >= 50 ? [hand.soft.yellow] : []), ...(value >= 80 ? [hand.soft.red] : [])].join(
          ' '
        ),
        'the gradient’s colours'
      );
      break;
    case 'gauge lcd, thresholds: gauge color strong':
      for (const css of g.lcd!) {
        expect([hand.strong.green, hand.strong.yellow, hand.strong.red], `${label}: an LCD cell`).toContain(
          colorsIn(css)[0]
        );
      }
      check(colorsIn(g.lcd![0])[0], hand.strong.green, 'the first LCD cell');
      if (column === 'color') {
        check(g.value, hand.strong[step], 'the value');
      }
      break;
    case 'gauge basic, scheme: gauge color strong':
      check(colorsIn(g.bar!.borderRight)[0], hand.schemeStrong[GAUGE_ROWS.indexOf(value)], 'the bar’s line');
      break;
    case 'gauge gradient, scheme: gauge color stronger':
      check(
        colorsIn(g.bar!.background).join(' '),
        [hand.stronger.green, hand.stronger.yellow, hand.stronger.red].join(' '),
        'the gradient’s stops'
      );
      break;
    case 'gauge basic, thresholds: gauge color fixed':
      check(colorsIn(g.bar!.borderRight)[0], hand.purple, 'the bar’s line');
      break;
    case 'gauge, atlas of limit: gauge color stronger': {
      const limit = ATLAS_LIMIT[row][column];
      if (limit !== null && limit >= 0) {
        check(colorsIn(g.bar!.borderRight)[0], hand.stronger[atlasStep(limit)], 'the bar’s line');
      }
      break;
    }
    case 'gauge, atlas of limit: gauge color fixed': {
      const limit = ATLAS_LIMIT[row][column];
      if (limit !== null && limit >= 0) {
        check(colorsIn(g.bar!.borderRight)[0], hand.blue, 'the bar’s line');
      }
      break;
    }
    case 'gauge basic, negative values: gauge color stronger': {
      // green below 0, yellow from 0, red from 30
      const negative = value >= 30 ? 'red' : value >= 0 ? 'yellow' : 'green';
      check(colorsIn(g.bar!.borderRight)[0], hand.stronger[negative], 'the bar’s line');
      break;
    }
  }
  return checked;
}

// --- Pills (build 2) ----------------------------------------------------------------------------------------------

// State timeline plus's Pill look: for the pill options left unset
const PILL_LOOK: Styling = {
  fillColor: { mode: 'shade', shade: 'softer' },
  lineColor: { mode: 'shade', shade: 'base' },
  textColor: { mode: 'automatic' },
};
const pillSettings = (styling: Styling, look: string | undefined): Styling => {
  const pill = look === 'pill' ? PILL_LOOK : {};
  return {
    fillColor: styling.fillColor ?? pill.fillColor,
    lineColor: styling.lineColor ?? pill.lineColor,
    lineWidth: styling.lineWidth,
    cornerRadius: styling.cornerRadius,
    textColor: styling.textColor ?? pill.textColor,
  };
};
const pillOptionSet = (s: Styling) =>
  Boolean(s.fillColor || s.lineColor || s.textColor) || s.lineWidth !== undefined || s.cornerRadius !== undefined;

/** `top` drawn over the opaque `bottom`, as an `rgb()` colour (each channel rounded). */
function composite(top: string, bottom: string) {
  const t = tinycolor(top).toRgb();
  const b = tinycolor(bottom).toRgb();
  const mix = (c: number, d: number) => Math.round(c * t.a + d * (1 - t.a));
  return `rgb(${mix(t.r, b.r)}, ${mix(t.g, b.g)}, ${mix(t.b, b.b)})`;
}

/** A box shadow as Chrome computes it: the line's colour and width, or none. */
const ringOf = (boxShadow: string) => {
  const m = /^(rgba?\([^)]*\)) 0px 0px 0px (\d+(?:\.\d+)?)px inset$/.exec(boxShadow);
  return m ? { color: m[1], width: Number(m[2]) } : undefined;
};

interface WantPill {
  background: string;
  color: string;
  ring?: { color: string; width: number };
  border: { width: number; color?: string };
  radius: number;
}

/**
 * A pill as the rules draw it, from core's pill of the same cell: its colour (`name`: its Grafana colour name, if any)
 * and text, and `behind`, what the pill is drawn on (the row's fill, the table's or the tooltip's background).
 */
function pillOf(
  ctx: Context,
  s: Styling,
  core: DrawnPill,
  name: string | undefined,
  behind: string[],
  weight = 400
): WantPill {
  const value = core.background;
  const part = (setting: StylingColor, noHue: string) =>
    setting.mode === 'fixed'
      ? ctx.theme.visualization.getColorByName(setting.fixedColor!)
      : (shadeOf(ctx, value, name, setting.shade!) ?? noHue);
  const fill = s.fillColor ? part(s.fillColor, value) : value;
  const stops = tinycolor(fill).getAlpha() < 1 ? behind.map((b) => composite(fill, b)) : [fill];
  const text =
    textOf(ctx, s.textColor, value, name, stops, { size: 12, weight }) ??
    (s.fillColor ? automatic(ctx, stops, 12, weight) : core.color);
  const width = s.lineWidth ?? (s.lineColor ? 1 : undefined);
  // core's border (on its transparent pill in dark) is the pill's edge: it stays unless a line replaces it
  const coreBorder = core.border.width > 0;
  let ring: WantPill['ring'];
  let border: WantPill['border'] = coreBorder ? { width: core.border.width, color: core.border.color } : { width: 0 };
  if (width !== undefined) {
    const base = tinycolor(value).getAlpha() === 0 ? ctx.theme.colors.border.strong : value;
    const line = rgb(s.lineColor ? part(s.lineColor, base) : base);
    if (coreBorder) {
      border = { width: 1, color: line };
      ring = width > 1 ? { color: line, width: width - 1 } : undefined;
    } else {
      ring = { color: line, width };
    }
  }
  return { background: rgb(fill), color: rgb(text), ring, border, radius: s.cornerRadius ?? core.radius };
}

const drawnPill = (pill: DrawnPill): WantPill => ({
  background: rgb(pill.background),
  color: rgb(pill.color),
  ring: ringOf(pill.boxShadow),
  border: pill.border.width > 0 ? { width: pill.border.width, color: rgb(pill.border.color) } : { width: 0 },
  radius: pill.radius,
});

/** The Pill look's colours worked out by hand, for a pill of the pills frame (undefined: no hand value). */
function handPill(mode: 'light' | 'dark', column: string, pill: DrawnPill, behind: string) {
  const hand = HAND_PILLS[mode];
  if (column === 'host') {
    return hand.hosts[pill.text as keyof typeof hand.hosts];
  }
  const name = pillNameOf(column, pill.text);
  if (name === 'transparent') {
    const on = behind === 'canvas' ? hand.offOnCanvas : behind === 'orange' ? hand.offOnOrangeRow : hand.offOnTable;
    return [undefined, undefined, on] as const;
  }
  return name && name in hand ? hand[name as 'green' | 'yellow' | 'red' | 'blue' | 'purple'] : undefined;
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
      // at 600 too: 14 px is never large text, so Automatic is the colour worked out for 400
      case 'text weight 600, text automatic, background basic':
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
/** The size of a panel's content (what its screenshot shows), CSS pixels. */
const contentSize = (page: Page, id: number) =>
  panelContent(page, id).evaluate((root) => ({ width: root.clientWidth, height: root.clientHeight }));

const THEME_STATES = [
  { name: 'light', load: 'light', live: undefined },
  { name: 'dark', load: 'dark', live: undefined },
  { name: 'dark, switched live from light', load: 'light', live: 'dark' },
] as const;

for (const scale of [1, 2]) {
  for (const state of THEME_STATES) {
    const mode = state.live ?? state.load;
    test.describe(`Text color, Background color, pill options and Look (${state.name}, pixel ratio ${scale})`, () => {
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
          // one panel after the other: each is scrolled into view to be read (a panel out of view has no innerText)
          const [core, unset, set] = [
            await drawnCells(page, c.core.id, c.nested),
            await drawnCells(page, c.unset.id, c.nested),
            await drawnCells(page, c.set.id, c.nested),
          ];

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
          const setSize = await contentSize(page, c.set.id);
          for (const [k, cell] of core.entries()) {
            expect(unset[k].text).toBe(cell.text);
            // Gradients only by their CSS (in the elements): Chrome rasterises a gradient differently at different
            // places on the page (the parity suite's finding), and the panels are side by side
            const gradientGauge = Boolean(cell.gauge?.lcd) || Boolean(cell.gauge?.bar?.background.includes('gradient'));
            if (!cell.background.startsWith('linear-gradient') && !gradientGauge) {
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
          let handChecked = 0;
          let gauges = 0;
          let transparentStubs = 0;
          for (const [k, cell] of set.entries()) {
            const coreCell = core[k];
            const label = `${c.title}: ${cell.grid}/${cell.row}/${cell.column} (${cell.text})`;
            const config = columnConfig(c.set, cell.column, cell.grid > 0);
            const { name, position } = sourceOf(cell.column, cell.text);
            const font = { size: cell.fontSize, weight: cell.fontWeight };
            // Text weight: the column's where it applies (on a coloured row, the row field's own cells only), core's
            // elsewhere
            const weight = weightOf(config);
            expect(cell.fontWeight, `${label}: the weight`).toBe(weight ?? coreCell.fontWeight);
            if (weight !== undefined) {
              applies++;
              differs += cell.fontWeight !== coreCell.fontWeight ? 1 : 0;
            }
            // Gauge color (build 4): the gauge against the rules from core's gauge of the same cell
            if (config.cellOptions.type === 'gauge') {
              expect(cell.gauge, `${label}: a gauge`).toBeDefined();
              expect(coreCell.gauge, `${label}: core's gauge`).toBeDefined();
              gauges++;
              const value = Number(cell.row.slice(1));
              // Atlas's "unlimited" and no-value stubs: core's is transparent (its line's alpha 0), and so is the
              // plugin's, with Fixed and with a shade
              const coreLine = coreCell.gauge?.bar && /rgba?\([^)]*\)/.exec(coreCell.gauge.bar.borderRight)?.[0];
              if (coreLine && tinycolor(coreLine).getAlpha() === 0) {
                transparentStubs++;
                expect(cell.gauge, `${label}: a transparent stub stays core's`).toEqual(coreCell.gauge);
              }
              const want = gaugeOf(ctx, config, frameConfig(c.set, cell.column), coreCell.gauge!, value);
              expect(cell.gauge, label).toEqual(want);
              const setting = config.styling.gaugeColor;
              if (setting && !(setting.mode === 'fixed' && config.cellOptions.mode !== 'basic')) {
                applies++;
                differs += JSON.stringify(cell.gauge) !== JSON.stringify(coreCell.gauge) ? 1 : 0;
              }
              // a basic bar's line (2 px, opaque) in the screenshot's pixels, the bar in view
              const bar = cell.gauge!.bar;
              if (bar && config.cellOptions.mode === 'basic' && bar.box.width >= 4) {
                const y = bar.box.y + bar.box.height / 2;
                if (bar.box.x + bar.box.width <= setSize.width && y >= 0 && y <= setSize.height) {
                  expect(setPixel(bar.box.x + bar.box.width - 1, y), `${label}: the bar’s line as drawn`).toBe(
                    colorsIn(bar.borderRight)[0]
                  );
                }
              }
              if (!state.live) {
                handChecked += handGauge(c.title, mode, label, cell.column, value, cell.gauge!, cell.row);
              }
              continue;
            }
            if (c.title.startsWith('wrapped') && cell.content) {
              // drawn inside the cell, not cut off by it
              expect(cell.content.top, `${label}: the text fits the cell (top)`).toBeGreaterThanOrEqual(
                cell.box.y - 0.5
              );
              expect(cell.content.bottom, `${label}: the text fits the cell (bottom)`).toBeLessThanOrEqual(
                cell.box.y + cell.box.height + 0.5
              );
            }
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
              // Colored text on the row: its Text color, or without one core's value colour
              const text =
                config.cellOptions.type === 'color-text'
                  ? (textOf(
                      ctx,
                      config.styling.textColor,
                      coreCell.color,
                      name,
                      row.fill.stops,
                      font,
                      coreCell.color
                    ) ?? coreCell.color)
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
              const settings = pillSettings(config.styling, c.set.options.styling?.look);
              // what the pills are drawn on: the row's fill (a translucent one as drawn on the table), or the table
              const behind = cell.background
                ? stopsOf(cell.background).map((x) => (tinycolor(x).getAlpha() < 1 ? composite(x, ctx.grid) : x))
                : [ctx.grid];
              for (const [p, pill] of cell.pills.entries()) {
                const corePill = coreCell.pills[p];
                const pillLabel = `${label}: pill ${pill.text}`;
                expect(pill.text, pillLabel).toBe(corePill.text);
                expect(pill.fontSize, `${pillLabel}: pills are drawn at 12 px`).toBe(12);
                expect(pill.fontWeight, `${pillLabel}: the cell's weight`).toBe(weight ?? corePill.fontWeight);
                if (weight === undefined || weight === 400) {
                  expect(pill.box.width, `${pillLabel}: the pill keeps core's size`).toBeCloseTo(corePill.box.width, 1);
                } else {
                  // heavier text is drawn from Inter's 500 face, a little wider
                  expect(pill.box.width, `${pillLabel}: wider text`).toBeGreaterThan(corePill.box.width);
                }
                expect(pill.box.height, `${pillLabel}: the pill keeps core's size`).toBeCloseTo(corePill.box.height, 1);
                const name = pillNameOf(cell.column, pill.text);
                const drawn = drawnPill(pill);
                if (!pillOptionSet(settings)) {
                  expect(drawn, `${pillLabel}: as core`).toEqual(drawnPill(corePill));
                  continue;
                }
                const want = pillOf(ctx, settings, corePill, name, behind, pill.fontWeight);
                expect(drawn, pillLabel).toEqual(want);
                applies++;
                differs += JSON.stringify(drawn) !== JSON.stringify(drawnPill(corePill)) ? 1 : 0;
                if (c.title === 'pill options: line color fixed, width 3' && pill.text === 'Off' && !state.live) {
                  // worked out by hand: Grafana's transparent with a Fixed blue line 3 px wide. Dark: core's 1 px
                  // border (rgba(0,0,0,0) only) becomes the line's, the other 2 px inside it; light: no border, 3 px
                  // inside. Blue is #5794F2 in dark, #3274D9 in light; fill and text stay core's.
                  expect(drawn, `${pillLabel} (hand-computed)`).toEqual(
                    mode === 'dark'
                      ? {
                          background: 'rgba(0, 0, 0, 0)',
                          color: drawnPill(corePill).color,
                          ring: { color: 'rgb(87, 148, 242)', width: 2 },
                          border: { width: 1, color: 'rgb(87, 148, 242)' },
                          radius: 6,
                        }
                      : {
                          background: 'rgba(255, 255, 255, 0)',
                          color: drawnPill(corePill).color,
                          ring: { color: 'rgb(50, 116, 217)', width: 3 },
                          border: { width: 0 },
                          radius: 6,
                        }
                  );
                }
                if (c.title === 'pill: text automatic' && !state.live) {
                  // hand-computed: Automatic at 12 px needs 4.5:1, as at 14 px
                  expect(drawn.color, `${pillLabel} (hand-computed)`).toBe(
                    HAND[mode].basic[STATE_COLORS[cell.text] as keyof (typeof HAND)['light']['basic']]
                  );
                }

                // the fill and a line of 2 px or more in the screenshot's pixels (opaque colours only; a pill in view)
                const mid = pill.box.y + pill.box.height / 2;
                const inView =
                  pill.box.x >= 0 &&
                  pill.box.y >= 0 &&
                  pill.box.x + pill.box.width <= setSize.width &&
                  pill.box.y + pill.box.height <= setSize.height;
                if (inView && tinycolor(want.background).getAlpha() === 1 && (want.ring?.width ?? 0) <= 3) {
                  // (a heavier weight's bold reaches a little further into the 6 px padding)
                  const fillX = pill.box.x + (weight !== undefined && weight > 400 ? 4 : 5);
                  expect(setPixel(fillX, mid), `${pillLabel}: the fill as drawn`).toBe(want.background);
                }
                if (
                  inView &&
                  want.ring &&
                  want.ring.width >= 2 &&
                  want.border.width === 0 &&
                  !want.ring.color.startsWith('rgba')
                ) {
                  expect(setPixel(pill.box.x + want.ring.width / 2, mid), `${pillLabel}: the line as drawn`).toBe(
                    want.ring.color
                  );
                }

                // the look's colours worked out by hand, where only the look sets them (not after a live switch)
                const own = config.styling;
                if (
                  !state.live &&
                  c.set.options.styling?.look === 'pill' &&
                  !own.fillColor &&
                  !own.lineColor &&
                  own.lineWidth === undefined &&
                  !own.textColor
                ) {
                  const on = !cell.background
                    ? c.set.transparent
                      ? 'canvas'
                      : 'table'
                    : rgb(cell.background) === rgb(theme.visualization.getColorByName('orange'))
                      ? 'orange'
                      : 'row';
                  const hand = handPill(mode, cell.column, pill, on);
                  if (hand && (name !== 'transparent' || on !== 'row')) {
                    const [fill, line, text] = hand;
                    if (fill) {
                      expect(drawn.background, `${pillLabel} fill (hand-computed)`).toBe(fill);
                      expect(drawn.ring?.color, `${pillLabel} line (hand-computed)`).toBe(line);
                    }
                    expect(drawn.color, `${pillLabel} text (hand-computed)`).toBe(text);
                    handChecked++;
                  }
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
          if (!state.live && ['pill look', 'pill look, transparent panel'].includes(c.title)) {
            expect(handChecked, 'pills checked against hand-computed colours').toBeGreaterThan(10);
          }
          if (c.title.startsWith('gauge') || c.title.includes('gauge color')) {
            expect(gauges, 'gauge cells checked').toBeGreaterThan(0);
          }
          if (c.title.startsWith('gauge, atlas of limit')) {
            // plex … authentik: two "unlimited" (-1) and two without a value, one of each per column
            expect(transparentStubs, 'transparent stubs checked').toBe(4);
          }
          if (
            !state.live &&
            (/^gauge (basic|gradient|lcd), (thresholds|scheme): gauge color (stronger|soft|strong|fixed)$/.test(
              c.title
            ) ||
              c.title.startsWith('gauge, atlas of limit') ||
              c.title === 'gauge basic, negative values: gauge color stronger') &&
            c.title !== 'gauge lcd, scheme: gauge color softer'
          ) {
            expect(handChecked, 'gauges checked against hand-computed colours').toBeGreaterThan(4);
          }
          if (c.title === 'background fixed, gradient (ignored)') {
            expect(differs, 'Fixed doesn’t apply to gradient cells: as core').toBe(0);
          } else if (c.title === 'gauge gradient and lcd: gauge color fixed (ignored)') {
            expect(gauges, 'gauge cells checked').toBeGreaterThan(0);
            expect(applies, 'Fixed doesn’t apply to gradient and LCD gauges').toBe(0);
          } else if (c.title === 'wrapped text, text weight 400') {
            expect(applies, 'cells the case’s options apply to').toBeGreaterThan(0);
            expect(differs, 'Text weight 400 draws as core').toBe(0);
          } else if (c.title === 'text weight 700 saved (not offered): as core') {
            expect(applies, 'a weight that isn’t one of the three applies nowhere').toBe(0);
            expect(differs, 'a weight that isn’t one of the three draws as core').toBe(0);
          } else {
            expect(applies, 'cells the case’s options apply to').toBeGreaterThan(0);
            expect(differs, 'set differs from core').toBeGreaterThan(0);
          }

          // Text weight: the header keeps core's weight; wrapped rows grow where the weight takes another line
          if (c.title.includes('text weight')) {
            const headerWeights = (id: number) =>
              panelContent(page, id).evaluate((root) =>
                Array.from(root.querySelectorAll('[role="columnheader"]')).map((h) => getComputedStyle(h).fontWeight)
              );
            expect(await headerWeights(c.set.id), 'the header’s weight').toEqual(await headerWeights(c.core.id));
          }
          if (c.title.startsWith('wrapped')) {
            const height = (cells: DrawnCell[], row: string) =>
              cells.find((x) => x.row === row && x.column === 'note')!.box.height;
            const weight = c.set.fieldConfig.defaults.custom!.styling!.textWeight!;
            for (const row of ['r1', 'r4']) {
              expect(height(core, row), `core’s ${row}: one line`).toBe(WRAPPED_ROW.regular);
              expect(height(set, row), `${row} at the weight (hand-computed)`).toBe(
                weight >= 500 ? WRAPPED_ROW.heavier : WRAPPED_ROW.regular
              );
            }
          }

          // A transparent panel: the table is drawn on the dashboard's canvas, and Automatic is measured against it
          if (c.set.transparent) {
            const host = set.find((cell) => cell.column === 'host')!;
            expect(setPixel(...inside(host)), 'the grid background').toBe(rgb(theme.colors.background.canvas));
          }
        });
      }

      test('pill look, tooltip from field: the tooltip’s pills take the look', async ({ page }) => {
        const c = CASES.find((x) => x.title === 'pill look, tooltip from field')!;
        await page.goto(`/d/${UID}?orgId=1&theme=${state.load}`);
        for (const id of [c.core.id, c.set.id]) {
          await drawnCells(page, id, false);
        }
        if (state.live) {
          await switchThemeLive(page, state.live);
        }
        const tooltipPill = async (id: number) => {
          await page.mouse.move(0, 0);
          const caret = panelContent(page, id).getByRole('button', { name: 'Toggle tooltip' }).first();
          await caret.scrollIntoViewIfNeeded();
          await caret.hover();
          const wrapper = page.getByTestId(selectors.components.Panels.Visualization.TableNG.Tooltip.Wrapper);
          await expect(wrapper).toBeVisible();
          return wrapper.evaluate((el): DrawnPill => {
            const s = el.querySelector<HTMLElement>('span[style]')!;
            const computed = getComputedStyle(s);
            return {
              text: s.innerText.trim(),
              background: s.style.backgroundColor,
              color: s.style.color,
              fontSize: parseFloat(computed.fontSize),
              fontWeight: Number(computed.fontWeight),
              boxShadow: computed.boxShadow,
              border: {
                width: computed.borderTopStyle === 'none' ? 0 : parseFloat(computed.borderTopWidth),
                color: computed.borderTopColor,
              },
              radius: parseFloat(computed.borderTopLeftRadius),
              box: { x: 0, y: 0, width: s.offsetWidth, height: s.offsetHeight },
            };
          });
        };
        const core = await tooltipPill(c.core.id);
        const set = await tooltipPill(c.set.id);
        expect(set.text).toBe('Up'); // api's state: green
        expect(drawnPill(core).ring).toBeUndefined();
        // on the tooltip's background (no row fill here)
        const ctx: Context = { theme, grid: theme.colors.background.primary };
        const want = pillOf(ctx, PILL_LOOK, core, 'green', [theme.colors.background.primary]);
        expect(drawnPill(set)).toEqual(want);
        expect(drawnPill(set)).not.toEqual(drawnPill(core));
        if (!state.live) {
          const [fill, line, text] = HAND_PILLS[mode].green;
          expect(want).toMatchObject({ background: fill, color: text, ring: { color: line, width: 1 } });
        }
      });

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

      test('tooltip from field: the tooltip’s gauge takes Gauge color', async ({ page }) => {
        const c = CASES.find((x) => x.title === 'tooltip from field: gauge color stronger')!;
        await page.goto(`/d/${UID}?orgId=1&theme=${state.load}`);
        for (const id of [c.core.id, c.set.id]) {
          await drawnCells(page, id, false);
        }
        if (state.live) {
          await switchThemeLive(page, state.live);
        }
        const tooltipGauge = async (id: number) => {
          await page.mouse.move(0, 0);
          const caret = panelContent(page, id).getByRole('button', { name: 'Toggle tooltip' }).first();
          await caret.scrollIntoViewIfNeeded();
          await caret.hover();
          const wrapper = page.getByTestId(selectors.components.Panels.Visualization.TableNG.Tooltip.Wrapper);
          await expect(wrapper).toBeVisible();
          await expect(wrapper.getByTestId('data-testid Bar gauge value')).toBeVisible();
          return wrapper.evaluate((el): DrawnGauge => {
            const value = el.querySelector<HTMLElement>('[data-testid="data-testid Bar gauge value"]');
            const bar = Array.from(el.querySelectorAll<HTMLElement>('div')).find((d) =>
              d.style.transition.includes('width')
            );
            return {
              value: value ? value.style.color : undefined,
              bar: bar
                ? {
                    background: bar.style.background,
                    borderRight: bar.style.borderRight,
                    box: { x: 0, y: 0, width: 0, height: 0 },
                  }
                : undefined,
            };
          });
        };
        const core = await tooltipGauge(c.core.id);
        const set = await tooltipGauge(c.set.id);
        // api's tooltip: its `color` value, 10 (green), a basic gauge in Value color
        const ctx: Context = { theme, grid: theme.colors.background.primary };
        const config = columnConfig(c.set, 'color', false);
        expect(config.cellOptions).toMatchObject({ type: 'gauge', mode: 'basic', valueDisplayMode: 'color' });
        const want = gaugeOf(ctx, config, frameConfig(c.set, 'color'), core, 10);
        expect(set).toEqual(want);
        expect(set).not.toEqual(core);
        if (!state.live) {
          // Stronger green, hand-computed
          expect(set.value).toBe(HAND_GAUGE[mode].stronger.green);
          expect(colorsIn(set.bar!.borderRight)[0]).toBe(HAND_GAUGE[mode].stronger.green);
        }
      });

      test('tooltip from field: the tooltip field’s Text weight on the tooltip’s content', async ({ page }) => {
        const c = CASES.find((x) => x.title === 'tooltip from field: text weight 600')!;
        await page.goto(`/d/${UID}?orgId=1&theme=${state.load}`);
        for (const id of [c.core.id, c.set.id]) {
          await drawnCells(page, id, false);
        }
        if (state.live) {
          await switchThemeLive(page, state.live);
        }
        const tooltipText = async (id: number) => {
          await page.mouse.move(0, 0);
          const caret = panelContent(page, id).getByRole('button', { name: 'Toggle tooltip' }).first();
          await caret.scrollIntoViewIfNeeded();
          await caret.hover();
          const wrapper = page.getByTestId(selectors.components.Panels.Visualization.TableNG.Tooltip.Wrapper);
          await expect(wrapper).toBeVisible();
          return wrapper.evaluate((el) => {
            // the innermost element holding the tooltip field's value
            const value = [el, ...Array.from(el.querySelectorAll<HTMLElement>('*'))]
              .filter((x) => x.textContent?.trim() === '10')
              .pop()!;
            return { text: value.textContent!.trim(), weight: getComputedStyle(value).fontWeight };
          });
        };
        expect(await tooltipText(c.core.id)).toEqual({ text: '10', weight: '400' });
        expect(await tooltipText(c.set.id)).toEqual({ text: '10', weight: '600' });
      });
    });
  }
}

// Content-aware column widths (the table.autoColumnWidths flag, read from a localStorage override as Grafana's
// feature-toggle tooling sets it): a weighted column's content is measured at its weight. The bound is worked out from
// Inter's average character width in core's sample as measured in Chrome (not by hand, and not by the code under test:
// 7.113 px at 400, 7.183 px from 500, plus 0.15 px of letter spacing; job tmp table-plan/build3/probe): NOTE's 48
// characters are 348.6 px at 400 and 352.0 px at 600, so the plugin's column is 3 or 4 px wider than core's (rounding),
// and nothing set is core's.
test.describe('Text weight with content-aware column widths (the table.autoColumnWidths flag)', () => {
  const FLAG = 'grafana.openfeature.table.autoColumnWidths';
  test.afterEach(async ({ page }) => {
    await page.evaluate((key) => localStorage.removeItem(key), FLAG);
  });

  test('a weighted column is measured at its weight; nothing set is core', async ({ page }) => {
    const c = CASES.find((x) => x.title === 'content widths, text weight 600')!;
    await page.goto(`/d/${UID}?orgId=1`);
    await page.evaluate((key) => localStorage.setItem(key, 'true'), FLAG);
    await page.goto(`/d/${UID}?orgId=1`);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const widths = async (id: number) => {
      await drawnCells(page, id, false);
      return panelContent(page, id).evaluate((root) =>
        getComputedStyle(root.querySelector('[role="grid"]')!).gridTemplateColumns.split(' ').map(parseFloat)
      );
    };
    const [core, unset, set] = [await widths(c.core.id), await widths(c.unset.id), await widths(c.set.id)];
    expect(unset, 'nothing set: core’s widths').toEqual(core);
    // host, note and msg (Colored text): content widths, wider than the panel (no growth), as core's
    expect(core).toHaveLength(3);
    expect(core.reduce((a, b) => a + b, 0)).toBeGreaterThan(await contentSize(page, c.core.id).then((x) => x.width));
    expect(set[0], 'host (Auto): core’s').toBe(core[0]);
    for (const k of [1, 2]) {
      expect(set[k] - core[k], `column ${k}: 3 or 4 px wider (from Inter's measured widths)`).toBeGreaterThanOrEqual(3);
      expect(set[k] - core[k], `column ${k}: 3 or 4 px wider (from Inter's measured widths)`).toBeLessThanOrEqual(4);
    }
    // the weighted text isn't cut off (no ellipsis): it fits its cell
    const cut = await panelContent(page, c.set.id).evaluate((root) =>
      Array.from(root.querySelectorAll<HTMLElement>('[role="gridcell"]'))
        .filter((cell) => getComputedStyle(cell).fontWeight === '600')
        .map((cell) => cell.scrollWidth > cell.clientWidth)
    );
    expect(cut).toEqual([false, false, false, false]);
  });
});
