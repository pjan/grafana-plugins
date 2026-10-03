import fs from 'node:fs';
import path from 'node:path';

import { type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { expect, test } from '@grafana/plugin-e2e';

// provisioning/dashboards/styling.json (from scripts/generate-styling-dashboard.mjs): one row per styling option, the
// core state timeline next to this plugin with the option set; rows a, b and c with the states running (green),
// degraded (yellow) and down (red). Range 2025-10-25 12:00 to 2025-10-27 12:00 UTC (summer time ends in Europe).
const UID = 'pjan-statetimeline-styling';
const CORE = 'state-timeline';
const PLUGIN = 'pjan-statetimeline-panel';
// The plugin panel of the "nothing set" case, by title, so adding cases doesn't shift it
const NOTHING_SET_ID = (
  JSON.parse(fs.readFileSync(path.join(__dirname, '../provisioning/dashboards/styling.json'), 'utf8')) as {
    panels: Array<{ id: number; title: string }>;
  }
).panels.find((p) => p.title === `nothing set [${PLUGIN}]`)!.id;
const LABELS = ['running', 'degraded', 'down'];
const HUES: Record<string, Hue> = { running: 'green', degraded: 'yellow', down: 'red' };
/** The hue of a value's state, from its text (core truncates it) */
const hueOf = (text: string): Hue => HUES[LABELS.find((label) => label.startsWith(text))!];

type Theme = 'light' | 'dark';
type Hue = 'green' | 'yellow' | 'red';
type Shade = 'softer' | 'base' | 'stronger';

// Grafana 13.2.3's stock colours (theme.visualization.getColorByName), as the canvas reports them. The relative
// shades are ranked by contrast with the panel background: the light shades are the softer ones in the light theme,
// the dark ones in the dark theme.
const STOCK: Record<
  Theme,
  { background: string; text: string; strongBorder: string; grid: string } & Record<Hue, Record<Shade, string>> & {
      named: Record<string, string>;
    }
> = {
  light: {
    background: '#ffffff',
    text: '#24292e',
    strongBorder: 'rgba(36, 41, 46, 0.4)',
    grid: 'rgba(0, 10, 23, 0.09)',
    green: { softer: '#96d98d', base: '#56a64b', stronger: '#19730e' },
    yellow: { softer: '#ffee52', base: '#f2cc0c', stronger: '#cc9d00' },
    red: { softer: '#ff7383', base: '#e02f44', stronger: '#ad0317' },
    named: { red: '#e02f44', purple: '#a352cc', orange: '#ff780a', 'semi-dark-green': '#37872d' },
  },
  dark: {
    background: '#181b1f',
    text: '#ccccdc',
    strongBorder: 'rgba(204, 204, 220, 0.3)',
    grid: 'rgba(240, 250, 255, 0.09)',
    green: { softer: '#37872d', base: '#73bf69', stronger: '#c8f2c2' },
    yellow: { softer: '#e0b400', base: '#fade2a', stronger: '#fff899' },
    red: { softer: '#c4162a', base: '#f2495c', stronger: '#ffa6b0' },
    named: {
      red: '#f2495c',
      purple: '#b877d9',
      orange: '#ff9830',
      'semi-dark-green': '#56a64b',
      'dark-yellow': '#e0b400',
    },
  },
};

// The Pill look's value text: Automatic on the softest fill, worked out by hand (see `automatic` below)
const PILL_TEXT: Record<Theme, Record<Hue, string>> = {
  light: { green: '#3f5b3b', yellow: '#736b25', red: '#59282e' },
  dark: { green: '#ffffff', yellow: '#57490f', red: '#f6dadd' },
};

// Both canvases of a comparison must be at least this much painted, so two charts without boxes can't pass.
const MIN_PAINTED = 0.05;

// ---- What the panels draw: every fillText and stroke since the canvas was last cleared (uPlot clears the whole
// canvas before each draw), recorded in the page.
interface Draw {
  op: 'text' | 'stroke';
  text?: string;
  /** Measured width (canvas pixels) */
  w?: number;
  x?: number;
  y?: number;
  style: string;
  font?: string;
  align?: string;
  baseline?: string;
}

const recordDraws = () => {
  const draws = new WeakMap<HTMLCanvasElement, Draw[]>();
  const proto = CanvasRenderingContext2D.prototype;
  const of = (ctx: CanvasRenderingContext2D) => {
    let list = draws.get(ctx.canvas);
    if (!list) {
      draws.set(ctx.canvas, (list = []));
    }
    return list;
  };
  const { clearRect, fillText, stroke } = proto;
  proto.clearRect = function (x: number, y: number, w: number, h: number) {
    if (x <= 0 && y <= 0 && w >= this.canvas.width && h >= this.canvas.height) {
      draws.set(this.canvas, []);
    }
    return clearRect.call(this, x, y, w, h);
  };
  proto.fillText = function (text: string, x: number, y: number, maxWidth?: number) {
    of(this).push({
      op: 'text',
      text,
      w: this.measureText(text).width,
      x,
      y,
      style: String(this.fillStyle),
      font: this.font,
      align: this.textAlign,
      baseline: this.textBaseline,
    });
    return maxWidth === undefined ? fillText.call(this, text, x, y) : fillText.call(this, text, x, y, maxWidth);
  };
  proto.stroke = function (...args: [Path2D?]) {
    of(this).push({ op: 'stroke', style: String(this.strokeStyle) });
    return (stroke as (...a: unknown[]) => void).apply(this, args);
  };
  (window as unknown as { __pjanDraws: (c: HTMLCanvasElement) => Draw[] }).__pjanDraws = (c) => draws.get(c) ?? [];
};

interface Pixels {
  width: number;
  height: number;
  data: Uint8Array;
}

interface Drawn {
  pixels: Pixels;
  draws: Draw[];
  fingerprint: string;
}

const canvasOf = async (page: Page, title: string) => {
  const panel = page.getByTestId(`data-testid Panel header ${title}`);
  const canvas = panel.locator('canvas').first();
  // Grafana renders a panel once it is in view; scrolled to again while waiting, and generous, because on a cold
  // server the panels wait for the plugin and their queries
  await expect
    .poll(
      async () => {
        await panel.scrollIntoViewIfNeeded();
        return canvas.isVisible();
      },
      { timeout: 30_000 }
    )
    .toBe(true);
  return canvas;
};

type Probe = { fingerprint: string; painted: number; texts: number; draws: number; pixels?: string };

// The canvas's size, painted share and a hash of its RGBA bytes; with `withPixels`, also the bytes (base64).
const probe = (canvas: Locator, withPixels: boolean): Promise<Probe> =>
  canvas.evaluate((c: HTMLCanvasElement, withPixels: boolean) => {
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let hash = 0x811c9dc5;
    let painted = 0;
    for (let i = 0; i < data.length; i++) {
      hash = Math.imul(hash ^ data[i], 0x01000193);
      if (i % 4 === 3 && data[i] !== 0) {
        painted++;
      }
    }
    const draws = (window as unknown as { __pjanDraws: (c: HTMLCanvasElement) => Draw[] }).__pjanDraws(c);
    let pixels: string | undefined;
    if (withPixels) {
      let binary = '';
      for (let i = 0; i < data.length; i += 0x8000) {
        binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
      }
      pixels = btoa(binary);
    }
    return {
      fingerprint: `${c.width}x${c.height} ${painted} ${hash >>> 0}`,
      painted: painted / (c.width * c.height),
      texts: draws.filter((d) => d.op === 'text').length,
      draws: draws.length,
      pixels,
    };
  }, withPixels);

/** The canvas once drawn: painted enough, with text drawn, and the same over two reads. */
const drawn = async (page: Page, title: string): Promise<Drawn> => {
  const canvas = await canvasOf(page, title);
  let last: Probe | undefined;
  await expect
    .poll(
      async () => {
        const now = await probe(canvas, false);
        const stable = last?.fingerprint === now.fingerprint && last.draws === now.draws;
        last = now;
        return now.painted >= MIN_PAINTED && now.texts > 0 && stable;
      },
      { timeout: 20_000, intervals: [250, 500, 1000] }
    )
    .toBe(true);
  const full = await probe(canvas, true);
  const [width, height] = full.fingerprint.split(' ')[0].split('x').map(Number);
  return {
    fingerprint: full.fingerprint,
    pixels: { width, height, data: new Uint8Array(Buffer.from(full.pixels!, 'base64')) },
    draws: await canvas.evaluate((c: HTMLCanvasElement) =>
      (window as unknown as { __pjanDraws: (c: HTMLCanvasElement) => Draw[] }).__pjanDraws(c)
    ),
  };
};

const at = (p: Pixels, x: number, y: number) => {
  const i = (Math.round(y) * p.width + Math.round(x)) * 4;
  return Array.from(p.data.subarray(i, i + 4));
};
const hex = (rgb: number[]) =>
  '#' +
  rgb
    .slice(0, 3)
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('');
const channels = (color: string) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
/** A canvas colour's channels and alpha (0-1): `#rrggbb` or `rgba(r, g, b, a)`. */
const rgbaOf = (color: string): [number, number, number, number] => {
  const m = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(color);
  return m
    ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
    : ([...channels(color), 1] as [number, number, number, number]);
};
const near = (a: string, b: string, tolerance = 1) =>
  channels(a).every((c, i) => Math.abs(c - channels(b)[i]) <= tolerance);

// WCAG contrast, as Grafana's colorManipulator.getContrastRatio computes it.
const luminance = (color: string) => {
  const [r, g, b] = channels(color).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
// Automatic text (getAutomaticText in the shared package), written out separately: Grafana's luminance rounded to 3
// digits, 1 % sRGB steps from the start colour towards the theme's page colour and maxContrast (Grafana 13.2.3's stock
// themes), the first step with 4.5:1, else 4.2:1, on whichever side gets there first.
const AUTOMATIC_ENDS: Record<Theme, [string, string]> = { light: ['#fbfbfb', '#000000'], dark: ['#111217', '#ffffff'] };
const contrast3 = (a: string, b: string) => {
  const [la, lb] = [a, b].map((c) => Number(luminance(c).toFixed(3)));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const automatic = (theme: Theme, drawnOn: string, from = drawnOn) => {
  for (const threshold of [4.5, 4.2]) {
    let found: { steps: number; color: string } | undefined;
    for (const end of AUTOMATIC_ENDS[theme]) {
      for (let steps = 0; steps <= 100 && (!found || steps < found.steps); steps++) {
        const color = hex(channels(from).map((c, i) => Math.round(c + (channels(end)[i] - c) * (steps / 100))));
        if (contrast3(color, drawnOn) >= threshold) {
          found = { steps, color };
          break;
        }
      }
    }
    if (found) {
      return found.color;
    }
  }
  throw new Error(`no automatic text on ${drawnOn}`);
};
/**
 * Automatic for a fill read back from 8-bit pixels, or undefined when a pixel one level off either way would give a
 * different colour (near the 4.5:1 / 4.2:1 boundary the two passes land on opposite sides): too close to call.
 */
const automaticFromPixels = (theme: Theme, fill: string) => {
  const expected = automatic(theme, fill);
  const shifted = (d: number) => hex(channels(fill).map((c) => Math.min(255, Math.max(0, c + d))));
  return [-1, 1].every((d) => near(automatic(theme, shifted(d)), expected, 3)) ? expected : undefined;
};
/** A canvas pixel composited over the panel background (getImageData isn't premultiplied). */
const composite = (rgba: number[], background: string) =>
  hex(rgba.slice(0, 3).map((c, i) => Math.round((c * rgba[3] + channels(background)[i] * (255 - rgba[3])) / 255)));

const isValue = (d: Draw) => d.op === 'text' && d.baseline === 'middle' && d.align === 'left';
const isRowName = (d: Draw) => d.op === 'text' && d.align === 'right';
// uPlot also draws the labels a styling blanks (the 00:00 ones of Day boundaries): as empty strings
const isTimeLabel = (d: Draw) => d.op === 'text' && d.baseline === 'top' && d.text !== '';
const strokes = (d: Drawn) => new Set(d.draws.filter((x) => x.op === 'stroke').map((x) => x.style));
const positions = (draws: Draw[]) => draws.map((d) => `${d.text}@${d.x},${d.y}`).sort();
/** The row (a, b, c) a value is drawn on: the row name nearest its y. */
const rowOf = (d: Drawn, value: Draw) =>
  d.draws
    .filter(isRowName)
    .reduce((best, name) => (Math.abs(name.y! - value.y!) < Math.abs(best.y! - value.y!) ? name : best)).text!;

for (const [theme, scale] of [
  ['light', 1],
  ['dark', 1],
  ['light', 2],
  ['dark', 2],
] as const) {
  test.describe(`styling (${theme} theme, pixel ratio ${scale})`, () => {
    test.use({ deviceScaleFactor: scale });
    const colors = STOCK[theme];

    test.beforeEach(async ({ gotoDashboardPage, page }) => {
      await page.addInitScript(recordDraws);
      await gotoDashboardPage({ uid: UID, queryParams: new URLSearchParams({ theme }) });
    });

    test('Fill color: the shades core draws with their names, per row; the legend shows them', async ({ page }) => {
      const reference = await drawn(page, `fill color [${CORE} ${theme}]`);
      const plugin = await drawn(page, `fill color [${PLUGIN}]`);
      expect(plugin.fingerprint).toBe(reference.fingerprint);
      const swatches = (title: string) =>
        page
          .getByTestId(`data-testid Panel header ${title}`)
          .getByTestId('series-icon')
          .evaluateAll((icons) => icons.map((icon) => getComputedStyle(icon).backgroundColor));
      expect(await swatches(`fill color [${PLUGIN}]`)).toEqual(await swatches(`fill color [${CORE} ${theme}]`));
    });

    test('Line color: a fixed colour, and a shade on row b only', async ({ page }) => {
      const reference = await drawn(page, `line color [${CORE} ${theme}]`);
      const plugin = await drawn(page, `line color [${PLUGIN}]`);
      expect(plugin.fingerprint).toBe(reference.fingerprint);
    });

    test('Value color: fixed and a shade as chosen, Automatic readable', async ({ page }) => {
      const plugin = await drawn(page, `value color [${PLUGIN}]`);
      const values = plugin.draws.filter(isValue);
      expect(values.length).toBeGreaterThan(10);
      let checked = 0;
      for (const value of values) {
        // just left of the text: the box's fill (no line), as drawn over the panel background
        const fill = composite(at(plugin.pixels, value.x! - 1, value.y!), colors.background);
        const row = rowOf(plugin, value);
        const label = `${row}: ${value.text} on ${fill}`;
        if (row === 'c') {
          const expected = automaticFromPixels(theme, fill);
          if (!expected) {
            continue;
          }
          // the fill is read back from 8-bit pixels: a step either way
          expect(near(value.style, expected, 3), `${label}: ${value.style}`).toBe(true);
          expect(contrast(value.style, fill), label).toBeGreaterThanOrEqual(4.1);
        } else {
          expect(value.style, label).toBe(row === 'a' ? '#1f60c4' : colors[hueOf(value.text!)].stronger);
        }
        checked++;
      }
      expect(checked).toBeGreaterThan(10);
    });

    test('Value overflow "Hide": no truncated values', async ({ page }) => {
      const core = (await drawn(page, `value overflow [${CORE}]`)).draws.filter(isValue);
      const plugin = (await drawn(page, `value overflow [${PLUGIN}]`)).draws.filter(isValue);
      expect(core.some((d) => !LABELS.includes(d.text!))).toBe(true);
      expect(plugin.length).toBeGreaterThan(0);
      expect(plugin.every((d) => LABELS.includes(d.text!))).toBe(true);
      expect(plugin.length).toBeLessThan(core.length);
    });

    for (const align of ['center', 'right'] as const) {
      test(`Value overflow "Hide", ${align} aligned: no value past the plot’s edges`, async ({ page }) => {
        const core = await drawn(page, `value overflow, ${align} [${CORE}]`);
        const plugin = await drawn(page, `value overflow, ${align} [${PLUGIN}]`);
        // the row names are right-aligned too: values are drawn right of them
        const nameRight = Math.max(
          ...core.draws
            .filter(isRowName)
            .filter((d) => d.x! < 100 * scale)
            .map((d) => d.x!)
        );
        const isAligned = (d: Draw) =>
          d.op === 'text' && d.baseline === 'middle' && d.align === align && d.x! > nameRight + 1;
        // the plot's edges: the first and last box on a value's row (the boxes reach past both edges)
        const y = Math.round(plugin.draws.filter(isAligned)[0].y!);
        let left = Math.ceil(nameRight) + 1;
        while (at(plugin.pixels, left, y)[3] === 0) {
          left++;
        }
        let right = plugin.pixels.width - 1;
        while (at(plugin.pixels, right, y)[3] === 0) {
          right--;
        }
        const extent = (d: Draw) => {
          const start = d.align === 'center' ? d.x! - d.w! / 2 : d.align === 'right' ? d.x! - d.w! : d.x!;
          return [start, start + d.w!];
        };
        const inside = (d: Draw) => {
          const [start, end] = extent(d);
          return start >= left - 0.5 && end <= right + 1.5;
        };
        const coreValues = core.draws.filter(isAligned);
        const pluginValues = plugin.draws.filter(isAligned);
        // core draws some values past an edge, clipped
        expect(coreValues.some((d) => !inside(d))).toBe(true);
        expect(pluginValues.length).toBeGreaterThan(0);
        expect(pluginValues.filter((d) => !inside(d)).map((d) => `${d.text}@${extent(d)} in ${left},${right}`)).toEqual(
          []
        );
        expect(pluginValues.every((d) => LABELS.includes(d.text!))).toBe(true);
      });
    }

    test('Value color "Automatic" on a continuous scheme: composited with the fill opacity', async ({ page }) => {
      const plugin = await drawn(page, `automatic, continuous [${PLUGIN}]`);
      const values = plugin.draws.filter(isValue);
      expect(values.length).toBeGreaterThan(10);
      let checked = 0;
      for (const value of values) {
        const fill = composite(at(plugin.pixels, value.x! - 1, value.y!), colors.background);
        const expected = automaticFromPixels(theme, fill);
        if (!expected) {
          continue;
        }
        // the fill is read back from 8-bit pixels: a step either way
        expect(near(value.style, expected, 3), `${value.text} on ${fill}: ${value.style}`).toBe(true);
        expect(contrast(value.style, fill)).toBeGreaterThanOrEqual(4.1);
        checked++;
      }
      expect(checked).toBeGreaterThan(10);
    });

    test('Grid line color and Axis text color, at uPlot’s label positions', async ({ page }) => {
      const core = await drawn(page, `grid and axis text [${CORE}]`);
      const plugin = await drawn(page, `grid and axis text [${PLUGIN}]`);
      expect(strokes(core).has(colors.grid)).toBe(true);
      expect(strokes(plugin).has(colors.grid)).toBe(false);
      expect(strokes(plugin).has(colors.named.red)).toBe(true);
      const axisText = (d: Drawn) => d.draws.filter((x) => isTimeLabel(x) || isRowName(x));
      expect(positions(axisText(plugin))).toEqual(positions(axisText(core)));
      expect(new Set(axisText(plugin).map((x) => x.style))).toEqual(new Set(['#ff7f00']));
    });

    test('Row name color: fixed, and the current state colour; other rows keep core’s pixels', async ({ page }) => {
      const core = await drawn(page, `row names [${CORE}]`);
      const plugin = await drawn(page, `row names [${PLUGIN}]`);
      // the last colour each name was drawn in
      const nameColors = (d: Drawn) =>
        Object.fromEntries(d.draws.filter(isRowName).map((x) => [x.text, x.style] as const));
      expect(nameColors(core)).toEqual({ a: colors.text, b: colors.text, c: colors.text });
      expect(nameColors(plugin)).toEqual({
        // Automatic from the state colour on the panel background, worked out by hand: a ends running (green), c ends
        // degraded (yellow); in the dark theme both already reach 4.5:1 and stay as they are
        a: theme === 'light' ? '#44833b' : '#73bf69',
        b: colors.named.purple,
        c: theme === 'light' ? '#8a7407' : '#fade2a',
      });
      // Everything else, the time labels below the names included, is core's: the whole canvas but the boxes of the
      // names drawn again (a name's width, its height from its font, 2 px around it)
      const coreColor = Object.fromEntries(core.draws.filter(isRowName).map((x) => [x.text, x.style]));
      const redrawn = plugin.draws.filter((d) => isRowName(d) && d.style !== coreColor[d.text!]);
      const boxes = redrawn.map((d) => {
        const size = Number(/(\d+(?:\.\d+)?)px/.exec(d.font!)![1]);
        return { left: d.x! - d.w! - 2, right: d.x! + 2, top: d.y! - size, bottom: d.y! + size };
      });
      const excluded = (x: number, y: number) =>
        boxes.some((b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom);
      const differing: string[] = [];
      for (let y = 0; y < plugin.pixels.height && differing.length < 5; y++) {
        for (let x = 0; x < plugin.pixels.width && differing.length < 5; x++) {
          const i = (y * plugin.pixels.width + x) * 4;
          const same = [0, 1, 2, 3].every((c) => plugin.pixels.data[i + c] === core.pixels.data[i + c]);
          if (!same && !excluded(x, y)) {
            differing.push(`${x},${y}`);
          }
        }
      }
      // a, b and c: Automatic gives c (yellow) a shade of its own in the light theme too
      expect(redrawn.length).toBe(3);
      expect(differing).toEqual([]);
    });

    for (const [title, midnights, color] of [
      ['day boundaries', ['10/26 00:00', '10/27 00:00'], colors.strongBorder],
      ['day boundaries, New York, orange', ['10/26 00:00', '10/27 00:00'], colors.named.orange],
      // summer time ends at 03:00 on 26 October, so the day is 25 hours long
      ['day boundaries, Europe/Brussels', ['10/26 00:00', '10/27 00:00'], colors.strongBorder],
      // UTC+05:30
      ['day boundaries, Asia/Kolkata', ['10/26 00:00', '10/27 00:00'], colors.strongBorder],
    ] as const) {
      test(`Day boundaries: a bold label and a stronger line at 00:00 (${title})`, async ({ page }) => {
        const core = await drawn(page, `${title} [${CORE}]`);
        const plugin = await drawn(page, `${title} [${PLUGIN}]`);
        expect(positions(plugin.draws.filter(isTimeLabel))).toEqual(positions(core.draws.filter(isTimeLabel)));
        // the canvas reports weight 700 as "bold"
        const isBold = (d: Draw) => /^(700|bold) /.test(d.font ?? '');
        const bold = plugin.draws.filter((d) => isTimeLabel(d) && isBold(d));
        expect(bold.map((d) => d.text).sort()).toEqual([...midnights]);
        expect(core.draws.some(isBold)).toBe(false);
        expect(strokes(plugin).has(color)).toBe(true);
        expect(strokes(core).has(color)).toBe(false);
        // The line is over the boxes: on each row, at the 00:00 label's x, the line's colour composited over the box
        // (the box's colour a few pixels to the right). uPlot's grid line, under the boxes, wouldn't show there.
        const [lr, lg, lb, la] = rgbaOf(color);
        for (const name of plugin.draws.filter(isRowName)) {
          for (const label of bold) {
            // near the row's top edge, away from its values
            let y = Math.round(name.y!);
            while (at(plugin.pixels, label.x! + 4 * scale, y - 1)[3] > 0) {
              y--;
            }
            y += 2 * scale;
            const box = at(plugin.pixels, label.x! + 4 * scale, y);
            const drawn = at(plugin.pixels, label.x!, y);
            const a = la + (box[3] / 255) * (1 - la);
            const expected = [lr, lg, lb].map((c, i) => Math.round((c * la + box[i] * (box[3] / 255) * (1 - la)) / a));
            const message = `${name.text} at ${label.text}: ${drawn} over box ${box}`;
            expect(Math.abs(drawn[3] - Math.round(a * 255)), message).toBeLessThanOrEqual(2);
            expect(
              drawn.slice(0, 3).every((c, i) => Math.abs(c - expected[i]) <= 2),
              message
            ).toBe(true);
          }
        }
      });
    }

    test('Corner radius: the boxes’ corners rounded, the rest as core', async ({ page }) => {
      const core = await drawn(page, `corner radius 4 [${CORE}]`);
      const plugin = await drawn(page, `corner radius 4 [${PLUGIN}]`);
      const r = 4 * scale;
      // The rows (painted runs at a column inside the plot) and, along each row's middle, where boxes meet
      const names = core.draws.filter(isRowName);
      const column = Math.round(core.pixels.width * 0.6);
      const rows = names.map((name) => {
        let top = Math.round(name.y!);
        while (at(core.pixels, column, top - 1)[3] > 0) {
          top--;
        }
        let bottom = Math.round(name.y!);
        while (at(core.pixels, column, bottom + 1)[3] > 0) {
          bottom++;
        }
        const edges: number[] = [];
        let previous = '';
        for (let x = Math.ceil(name.x!) + 1; x < core.pixels.width; x++) {
          const px = at(core.pixels, x, name.y!);
          // the line (1 px) at a box edge differs from the fill: an edge is where the colour changes
          const key = px.join();
          if (px[3] > 0 && key !== previous) {
            edges.push(x);
          }
          previous = px[3] > 0 ? key : '';
        }
        return { top, bottom, edges };
      });
      expect(rows.every((row) => row.edges.length > 2)).toBe(true);
      // the first box of each row: core's corner painted, the plugin's corner not
      for (const row of rows) {
        expect(at(core.pixels, row.edges[0], row.top)[3]).toBeGreaterThan(0);
        // (antialiased: the corner pixel itself is barely covered)
        expect(at(plugin.pixels, row.edges[0], row.top)[3]).toBeLessThan(at(core.pixels, row.edges[0], row.top)[3] / 4);
      }
      // every differing pixel is near a box corner
      const nearCorner = (x: number, y: number) =>
        rows.some(
          (row) =>
            y >= row.top - 1 &&
            y <= row.bottom + 1 &&
            (y <= row.top + r || y >= row.bottom - r) &&
            row.edges.some((edge) => Math.abs(x - edge) <= r + 1)
        );
      const far: string[] = [];
      let differing = 0;
      for (let y = 0; y < core.pixels.height; y++) {
        for (let x = 0; x < core.pixels.width; x++) {
          const i = (y * core.pixels.width + x) * 4;
          if ([0, 1, 2, 3].some((c) => core.pixels.data[i + c] !== plugin.pixels.data[i + c])) {
            differing++;
            if (!nearCorner(x, y) && far.length < 5) {
              far.push(`${x},${y}`);
            }
          }
        }
      }
      expect(differing).toBeGreaterThan(0);
      expect(far).toEqual([]);
    });

    test('Pill with Line width 3: a 3 px line in the base shade', async ({ page }) => {
      const plugin = await drawn(page, `pill, line width 3 [${PLUGIN}]`);
      const values = plugin.draws.filter(isValue);
      expect(values.length).toBeGreaterThan(0);
      const width = 3 * scale;
      let checked = 0;
      for (const value of values) {
        const shades = colors[hueOf(value.text!)];
        // left of the text: 2 px padding (the fill), then the line, `width` pixels wide, at the box's edge
        const padding = hex(at(plugin.pixels, value.x! - 1, value.y!));
        const line = Array.from({ length: width }, (_, i) => hex(at(plugin.pixels, value.x! - 3 - i, value.y!)));
        if (value.x! - 2 - width < 0 || !near(padding, shades.softer)) {
          continue; // a box that starts before the plot: its line is off the plot
        }
        expect(
          line.every((c) => near(c, shades.base)),
          `${value.text}: ${line}`
        ).toBe(true);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });

    test('Row name color on a transparent panel: measured against the dashboard canvas behind it', async ({ page }) => {
      const plugin = await drawn(page, `row names, transparent panel [${PLUGIN}]`);
      const nameColors = Object.fromEntries(plugin.draws.filter(isRowName).map((x) => [x.text, x.style] as const));
      // Worked out by hand against the light canvas (#fbfbfb), one step off the panel background's #44833b and
      // #8a7407; in the dark theme both state colours already reach 4.5:1 on the dark canvas
      expect(nameColors).toEqual({
        a: theme === 'light' ? '#43813b' : '#73bf69',
        b: colors.named.purple,
        c: theme === 'light' ? '#887207' : '#fade2a',
      });
    });

    test('Pill: softest fill, 1 px line in the base shade, Automatic value text, no truncation', async ({ page }) => {
      const plugin = await drawn(page, `pill [${PLUGIN}]`);
      const values = plugin.draws.filter(isValue);
      expect(values.length).toBeGreaterThan(0);
      let lines = 0;
      for (const value of values) {
        expect(LABELS).toContain(value.text);
        expect(value.font).toMatch(/^500 /);
        const shades = colors[hueOf(value.text!)];
        const fill = hex(at(plugin.pixels, value.x! - 1, value.y!));
        expect(near(fill, shades.softer), `fill ${fill}`).toBe(true);
        // The line: the box's first column, a line width (1 px) and the text padding (2 canvas px) left of the text.
        // Not for a box that starts before the plot (its value is drawn at the plot's edge).
        lines += near(hex(at(plugin.pixels, value.x! - scale - 2, value.y!)), shades.base) ? 1 : 0;
        expect(value.style).toBe(PILL_TEXT[theme][hueOf(value.text!)]);
      }
      expect(lines).toBeGreaterThanOrEqual(values.length - 1);
      expect(strokes(plugin).has(colors.green.base)).toBe(true);
    });

    test('nothing set: the same pixels as core', async ({ page }) => {
      const core = await drawn(page, `nothing set [${CORE}]`);
      const plugin = await drawn(page, `nothing set [${PLUGIN}]`);
      expect(plugin.fingerprint).toBe(core.fingerprint);
    });
  });
}

// ---- Saved JSON: the dashboard's save model, as Grafana writes it (classic or v2).
interface SavedPanel {
  type: string;
  options: Record<string, unknown>;
  fieldConfig: { defaults: { custom?: Record<string, unknown> }; overrides: Array<{ properties: unknown[] }> };
}

const savedPanel = (page: Page, title: RegExp | string) =>
  page.evaluate(
    ([source, flags]) => {
      const matches = (t?: string) => (flags === null ? t === source : new RegExp(source, flags).test(t ?? ''));
      type Scene = { getSaveModel?: () => Record<string, unknown> };
      const scene = (window as unknown as { __grafanaSceneContext?: Scene }).__grafanaSceneContext;
      if (!scene?.getSaveModel) {
        return undefined;
      }
      const model = scene.getSaveModel() as {
        panels?: Array<{ title?: string; type: string; options: object; fieldConfig: object }>;
        elements?: Record<
          string,
          { spec: { title?: string; vizConfig: { group: string; spec: { options: object; fieldConfig: object } } } }
        >;
      };
      const v1 = model.panels?.find((p) => matches(p.title));
      if (v1) {
        return JSON.parse(JSON.stringify({ type: v1.type, options: v1.options, fieldConfig: v1.fieldConfig }));
      }
      const v2 = Object.values(model.elements ?? {}).find((e) => matches(e.spec.title));
      return v2 ? JSON.parse(JSON.stringify({ type: v2.spec.vizConfig.group, ...v2.spec.vizConfig.spec })) : undefined;
    },
    typeof title === 'string' ? ([title, null] as const) : ([title.source, title.flags] as const)
  ) as Promise<SavedPanel | undefined>;

// In the open colour picker (the last one opened: Grafana keeps closed popovers in the page for a while)
const pickColor = (page: Page, name: string) =>
  page
    .getByRole('button', { name: `${name} color`, exact: true })
    .last()
    .click();

const STYLING_FIELD_OPTIONS = ['fillColor', 'lineColor', 'valueColor', 'rowNameColor'];

test.describe('saved JSON', () => {
  test.describe.configure({ mode: 'default' });

  test('a new panel saves no styling options', async ({ panelEditPage, page }) => {
    await panelEditPage.setVisualization('State timeline plus');
    await expect.poll(async () => (await savedPanel(page, /.*/))?.type).toBe(PLUGIN);
    const saved = (await savedPanel(page, /.*/))!;
    expect(saved.options).not.toHaveProperty('styling');
    for (const key of STYLING_FIELD_OPTIONS) {
      expect(saved.fieldConfig.defaults.custom ?? {}).not.toHaveProperty(key);
    }
  });

  test('opening the editor writes nothing; a set value is saved, a cleared one removes its key', async ({
    gotoDashboardPage,
    page,
  }) => {
    const title = `nothing set [${PLUGIN}]`;
    await gotoDashboardPage({ uid: UID });
    // once the panel has loaded its plugin (Grafana then adds the plugin's defaults, as for any panel)
    await canvasOf(page, title);
    await expect.poll(async () => (await savedPanel(page, title))?.options).toHaveProperty('showValue');
    const before = await savedPanel(page, title);
    await gotoDashboardPage({ uid: UID, queryParams: new URLSearchParams({ editPanel: String(NOTHING_SET_ID) }) });
    const editor = (name: string) => page.getByTestId(`data-testid State timeline ${name} field property editor`);
    await expect(editor('Fill color')).toBeVisible();
    // for a few seconds: the editor may write late
    for (let t = 0; t < 3000; t += 250) {
      expect(await savedPanel(page, title)).toEqual(before);
      await page.waitForTimeout(250);
    }

    // A clearable panel select: Value overflow
    const overflow = page
      .getByTestId('data-testid State timeline Value overflow field property editor')
      .getByRole('combobox');
    await overflow.scrollIntoViewIfNeeded();
    await overflow.click();
    await page.getByRole('option', { name: 'Hide' }).click();
    await expect
      .poll(async () => ((await savedPanel(page, title))?.options.styling as Record<string, unknown>)?.valueOverflow)
      .toBe('hide');
    await page
      .getByTestId('data-testid State timeline Value overflow field property editor')
      .getByRole('button', { name: 'Clear value' })
      .click();
    await expect
      .poll(async () => (await savedPanel(page, title))?.options.styling ?? {})
      .not.toHaveProperty('valueOverflow');

    // A field option: a shade, then cleared
    const fill = editor('Fill color').getByRole('combobox');
    await fill.scrollIntoViewIfNeeded();
    await fill.click();
    await page.getByRole('option', { name: /^Softer/ }).click();
    await expect
      .poll(async () => (await savedPanel(page, title))?.fieldConfig.defaults.custom?.fillColor)
      .toEqual({ mode: 'shade', shade: 'softer' });
    await editor('Fill color').getByRole('button', { name: 'Clear value' }).click();
    await expect
      .poll(async () => (await savedPanel(page, title))?.fieldConfig.defaults.custom ?? {})
      .not.toHaveProperty('fillColor');

    // A fixed colour, picked with Grafana's colour picker
    const line = editor('Line color').getByRole('combobox');
    await line.scrollIntoViewIfNeeded();
    await line.click();
    await page.getByRole('option', { name: 'Fixed color' }).click();
    await editor('Line color').getByRole('button', { name: 'Choose color' }).click();
    await pickColor(page, 'dark-blue');
    await expect
      .poll(async () => (await savedPanel(page, title))?.fieldConfig.defaults.custom?.lineColor)
      .toEqual({ mode: 'fixed', fixedColor: 'dark-blue' });
    await page.mouse.move(0, 0); // the colour picker closes when the pointer leaves it (Escape would leave the editor)

    // A panel option: a colour, then cleared
    const grid = editor('Grid line color');
    await grid.scrollIntoViewIfNeeded();
    await grid.getByRole('button', { name: 'Pick a color' }).click();
    await pickColor(page, 'dark-blue');
    await expect
      .poll(async () => ((await savedPanel(page, title))?.options.styling as Record<string, unknown>)?.gridColor)
      .toBe('dark-blue');
    await page.mouse.move(0, 0); // the colour picker closes when the pointer leaves it (Escape would leave the editor)
    await grid.getByRole('button', { name: 'Clear settings' }).click();
    await expect
      .poll(async () => (await savedPanel(page, title))?.options.styling ?? {})
      .not.toHaveProperty('gridColor');

    // Corner radius: a clearable slider
    const radius = page.getByTestId('data-testid State timeline Corner radius field property editor');
    await radius.scrollIntoViewIfNeeded();
    const radiusInput = radius.getByRole('textbox').or(radius.getByRole('spinbutton')).first();
    await radiusInput.fill('4');
    await radiusInput.blur();
    await expect
      .poll(async () => ((await savedPanel(page, title))?.options.styling as Record<string, unknown>)?.cornerRadius)
      .toBe(4);
    await radius.getByRole('button', { name: 'Clear value' }).click();
    await expect
      .poll(async () => (await savedPanel(page, title))?.options.styling ?? {})
      .not.toHaveProperty('cornerRadius');

    // A radio: saved once used
    await page.mouse.move(0, 0); // the colour picker closes when the pointer leaves it (Escape would leave the editor)
    await editor('Look').scrollIntoViewIfNeeded();
    await editor('Look').getByRole('radio', { name: 'Pill' }).click();
    await expect
      .poll(async () => ((await savedPanel(page, title))?.options.styling as Record<string, unknown>)?.look)
      .toBe('pill');
  });
});

// "Current state color" must follow the data: a refresh with the same structure gives the plot new data without a
// new config. A random walk with thresholds, refreshed until its last state has changed at least once.
test.describe('row name in the current state colour, across refreshes', () => {
  test.describe.configure({ mode: 'default' });
  let api: APIRequestContext;
  const REFRESH_UID = 'pjan-statetimeline-styling-refresh';
  const THRESHOLDS = ['green', 'blue', 'purple', 'red'];
  // Grafana's stock colours: the threshold colour (the box, fill opacity 100) -> Automatic from it on the panel
  // background (the row name), worked out by hand; colours that already reach 4.5:1 stay as they are
  const NAME_OF_BOX: Record<Theme, Record<string, string>> = {
    light: { '#56a64b': '#44833b', '#3274d9': '#3274d9', '#a352cc': '#a352cc', '#e02f44': '#e02f44' },
    dark: { '#73bf69': '#73bf69', '#5794f2': '#5794f2', '#b877d9': '#b877d9', '#f2495c': '#f2495c' },
  };

  test.beforeAll(async ({ playwright, grafanaAPICredentials }) => {
    const { user, password } = grafanaAPICredentials;
    api = await playwright.request.newContext({
      baseURL: process.env.GRAFANA_URL || 'http://localhost:3000',
      extraHTTPHeaders: { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` },
    });
    const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };
    const response = await api.post('/api/dashboards/db', {
      data: {
        overwrite: true,
        dashboard: {
          uid: REFRESH_UID,
          title: 'Styling: current state across refreshes',
          time: { from: 'now-1h', to: 'now' },
          timezone: 'utc',
          schemaVersion: 42,
          panels: [
            {
              id: 1,
              type: PLUGIN,
              title: 'random walk',
              datasource: DS,
              interval: '5m',
              gridPos: { x: 0, y: 0, w: 24, h: 6 },
              targets: [
                {
                  refId: 'A',
                  datasource: DS,
                  scenarioId: 'random_walk',
                  seriesCount: 1,
                  min: 0,
                  max: 100,
                  spread: 60,
                  startValue: 50,
                  alias: 'row',
                },
              ],
              fieldConfig: {
                defaults: {
                  color: { mode: 'thresholds' },
                  thresholds: {
                    mode: 'absolute',
                    steps: THRESHOLDS.map((color, i) => ({ color, value: i === 0 ? null : i * 25 })),
                  },
                  custom: { fillOpacity: 100, lineWidth: 0, rowNameColor: { mode: 'state' } },
                },
                overrides: [],
              },
              options: { showValue: 'never', mergeValues: false, legend: { showLegend: false } },
            },
          ],
        },
      },
    });
    expect(response.ok()).toBe(true);
  });

  test.afterAll(async () => {
    await api.delete(`/api/dashboards/uid/${REFRESH_UID}`);
    await api.dispose();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`the name has the colour of the last box after each refresh (${theme})`, async ({
      gotoDashboardPage,
      page,
    }) => {
      await page.addInitScript(recordDraws);
      await gotoDashboardPage({ uid: REFRESH_UID, queryParams: new URLSearchParams({ theme }) });
      const canvas = await canvasOf(page, 'random walk');
      const boxes = new Set<string>();
      let checks = 0;
      let last = '';
      for (let refresh = 0; refresh < 20 && (checks < 6 || boxes.size < 2); refresh++) {
        // the plot has drawn the new data
        await expect.poll(async () => (await probe(canvas, false)).fingerprint, { timeout: 15_000 }).not.toBe(last);
        const now = await drawn(page, 'random walk');
        last = now.fingerprint;
        const name = now.draws.filter((d) => isRowName(d) && d.text === 'row').pop()!;
        let x = now.pixels.width - 1;
        while (at(now.pixels, x, name.y!)[3] === 0) {
          x--;
        }
        const box = hex(at(now.pixels, x - 2, name.y!));
        expect(NAME_OF_BOX[theme], `last box ${box}`).toHaveProperty([box]);
        expect(name.style, `refresh ${refresh}: last box ${box}`).toBe(NAME_OF_BOX[theme][box]);
        boxes.add(box);
        checks++;
        await page.getByTestId('data-testid RefreshPicker run button').click();
      }
      expect(checks).toBeGreaterThanOrEqual(6);
      // the last state changed at least once, so a name from stale data would have failed
      expect(boxes.size).toBeGreaterThanOrEqual(2);
    });
  }
});
