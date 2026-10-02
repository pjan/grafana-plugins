import fs from 'node:fs';
import path from 'node:path';

import { createTheme, type GrafanaTheme2 } from '@grafana/data';
import { expect, test, type Page } from '@grafana/plugin-e2e';
import { PNG } from 'pngjs';
import tinycolor from 'tinycolor2';

// The colour helpers of the shared package, from their files: its entry point also exports the editors (@grafana/ui),
// which don't load in Node.
import {
  getBestContrastText,
  getMinTextContrast,
  getReadableText,
} from '../../../packages/grafana-styling/src/canvasColors';
import { getRelativeShadeColor } from '../../../packages/grafana-styling/src/shades';

import { panelContent } from './helpers';

// Color mode Custom on provisioning/dashboards/styling.json (scripts/generate-styling-dashboard.mjs): one panel per
// case. Each tile's background, value, name and percent change colours (inline styles) and sparkline (the stroke,
// fill and line width set on its canvas, recorded) are checked against what the rules give for the tile's state
// colour, at the font sizes the layout computed; the background also in the screenshot's pixels. "Nothing set" is
// compared pixel by pixel with core's Value mode. In the light and the dark theme, at pixel ratio 1 and 2.
const DASHBOARD = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../provisioning/dashboards/styling.json'), 'utf8')
) as { uid: string; panels: Array<{ id: number; title: string; options: { styling?: Styling } }> };
const UID = DASHBOARD.uid;

interface StylingColor {
  mode: string;
  shade?: 'softer' | 'soft' | 'base' | 'strong' | 'stronger';
  fixedColor?: string;
}
interface Styling {
  backgroundColor?: StylingColor;
  textColor?: StylingColor;
  sparklineColor?: StylingColor;
  sparklineLineOpacity?: number;
  sparklineFillOpacity?: number;
  sparklineLineWidth?: number;
}

// The series of the dashboard and their state colours (value mappings), as generated
const STATE_COLORS: Record<string, string> = { api: 'green', web: 'yellow', db: 'red', queue: 'dark-blue' };
const CORE_TEXT = ['rgb(247, 248, 250)', 'rgb(32, 34, 38)'];

// Expected colours worked out by hand for a few cases, independently of the code under test and of the oracle below:
// the theme's colours from Grafana 13.2.3's stock themes, contrast by the WCAG 2 formula (relative luminance with
// the sRGB transfer function, (L1 + 0.05) / (L2 + 0.05)) written out separately, and core's brighten(40) for the
// sparkline line on a background. Contrasts below are those hand computations.
const [CORE_LIGHT_TEXT, CORE_DARK_TEXT] = ['rgb(247, 248, 250)', 'rgb(32, 34, 38)'];
const WHITE_40 = 'rgba(255, 255, 255, 0.4)';
type Known = Record<string, Partial<Record<'background' | 'value' | 'stroke' | 'fill', string>>>;
const HARD_CODED: Record<'light' | 'dark', Record<number, Known>> = {
  light: {
    // 20: Background Value; unset sparkline = tile colour brightened by 40, fill white 40 %
    20: {
      api: { background: 'rgb(86, 166, 75)', stroke: 'rgb(188, 255, 177)', fill: WHITE_40 },
      web: { background: 'rgb(242, 204, 12)', stroke: 'rgb(255, 255, 114)', fill: WHITE_40 },
      db: { background: 'rgb(224, 47, 68)', stroke: 'rgb(255, 149, 170)', fill: WHITE_40 },
      queue: { background: 'rgb(18, 80, 176)', stroke: 'rgb(120, 182, 255)', fill: WHITE_40 },
    },
    // 30: best contrast on the value colour. Green: light 2.84 / dark 5.27; yellow 1.47 / 10.18; red 4.24 / 3.53;
    // dark blue 7.06 / 2.12
    30: {
      api: { value: CORE_DARK_TEXT },
      web: { value: CORE_DARK_TEXT },
      db: { value: CORE_LIGHT_TEXT },
      queue: { value: CORE_LIGHT_TEXT },
    },
    // 34: on black, below 24 px (4.5:1): green 6.95, yellow 13.42, red 4.66 keep; dark blue 2.80 falls back
    34: {
      api: { value: 'rgb(86, 166, 75)' },
      web: { value: 'rgb(242, 204, 12)' },
      db: { value: 'rgb(224, 47, 68)' },
      queue: { value: CORE_LIGHT_TEXT },
    },
  },
  dark: {
    20: {
      api: { background: 'rgb(115, 191, 105)', stroke: 'rgb(217, 255, 207)', fill: WHITE_40 },
      web: { background: 'rgb(250, 222, 42)', stroke: 'rgb(255, 255, 144)', fill: WHITE_40 },
      db: { background: 'rgb(242, 73, 92)', stroke: 'rgb(255, 175, 194)', fill: WHITE_40 },
      queue: { background: 'rgb(31, 96, 196)', stroke: 'rgb(133, 198, 255)', fill: WHITE_40 },
    },
    // green 2.11 / 7.12; yellow 1.27 / 11.79; red 3.36 / 4.46; dark blue 5.60 / 2.68
    30: {
      api: { value: CORE_DARK_TEXT },
      web: { value: CORE_DARK_TEXT },
      db: { value: CORE_DARK_TEXT },
      queue: { value: CORE_LIGHT_TEXT },
    },
    // on black: green 9.39, yellow 15.55, red 5.88 keep; dark blue 3.53 falls back
    34: {
      api: { value: 'rgb(115, 191, 105)' },
      web: { value: 'rgb(250, 222, 42)' },
      db: { value: 'rgb(242, 73, 92)' },
      queue: { value: CORE_LIGHT_TEXT },
    },
  },
};

const rgb = (color: string | undefined) => (color ? tinycolor(color).toRgbString() : undefined);

interface DrawnTile {
  name: string;
  background: string;
  value: { color: string; fontSize: number; smallestFontSize: number };
  title?: { color: string; fontSize: number };
  percent?: { color: string; fontSize: number };
  sparkline?: { stroke: string[]; fill: string[]; width: number[]; painted: number };
  box: { x: number; y: number; width: number; height: number };
}

// Records what is set on each canvas context (Grafana's Sparkline is a uPlot canvas)
const recordCanvases = () => {
  const proto = CanvasRenderingContext2D.prototype;
  for (const prop of ['strokeStyle', 'fillStyle', 'lineWidth'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, prop)!;
    Object.defineProperty(proto, prop, {
      configurable: true,
      get: descriptor.get,
      set(value) {
        const canvas = this.canvas as HTMLCanvasElement & { __sets?: Array<[string, unknown]> };
        (canvas.__sets ??= []).push([prop, value]);
        descriptor.set!.call(this, value);
      },
    });
  }
};

const readTiles = (page: Page, id: number): Promise<DrawnTile[]> =>
  panelContent(page, id).evaluate((root) => {
    const tiles = Array.from(root.querySelectorAll<HTMLElement>('div')).filter(
      (el) => el.style.padding !== '' && el.style.position === 'relative' && el.style.display === 'flex'
    );
    const text = (el: HTMLElement | undefined) =>
      el ? { color: getComputedStyle(el).color, fontSize: parseFloat(getComputedStyle(el).fontSize) } : undefined;
    return tiles.map((tile) => {
      const children = Array.from(tile.firstElementChild!.children) as HTMLElement[];
      const value = children.find((el) => el.style.fontWeight === '500' && el.style.display !== 'flex')!;
      const title = children.find((el) => el !== value && el.style.fontWeight === '');
      const percent = children.find((el) => el.style.display === 'flex');
      const canvas = tile.querySelector('canvas') as (HTMLCanvasElement & { __sets?: Array<[string, unknown]> }) | null;
      let sparkline;
      if (canvas) {
        const sets = canvas.__sets ?? [];
        const of = (prop: string) => [...new Set(sets.filter(([p]) => p === prop).map(([, v]) => v))];
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        let painted = 0;
        for (let i = 3; i < data.length; i += 4) {
          painted += data[i] > 0 ? 1 : 0;
        }
        sparkline = {
          stroke: of('strokeStyle') as string[],
          fill: of('fillStyle') as string[],
          width: of('lineWidth') as number[],
          painted: painted / (canvas.width * canvas.height),
        };
      }
      const box = tile.getBoundingClientRect();
      // FormattedValueDisplay draws a unit suffix smaller: the smallest size the value is drawn at
      const spans = Array.from(value.querySelectorAll('span'));
      const smallestFontSize = Math.min(...spans.map((span) => parseFloat(getComputedStyle(span).fontSize)));
      return {
        name: title?.textContent ?? '',
        background: tile.style.background,
        value: { ...text(value)!, smallestFontSize },
        title: text(title),
        percent: text(percent),
        sparkline,
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
      };
    });
  });

// What a tile should draw, by the rules of Color mode Custom (README, UPSTREAM.md), for its state colour name
function expected(
  theme: GrafanaTheme2,
  styling: Styling,
  colorName: string | undefined,
  valueColor: string,
  tile: DrawnTile
) {
  const named = (name: string) => theme.visualization.getColorByName(name);
  const shade = (s: StylingColor) =>
    colorName && s.shade ? getRelativeShadeColor(theme, colorName, s.shade) : undefined;
  const resolve = (s: StylingColor | undefined): string | undefined => {
    switch (s?.mode) {
      case 'value':
        return valueColor;
      case 'shade':
        return shade(s);
      case 'fixed':
        return named(s.fixedColor!);
    }
    return undefined;
  };
  const bg = styling.backgroundColor?.mode === 'none' ? undefined : styling.backgroundColor;
  const background = bg ? (resolve(bg) ?? valueColor) : undefined;
  const drawnOn = background ?? theme.colors.background.primary;
  const coreOnBackground = (c: string) => {
    const t = tinycolor(c);
    return t.getAlpha() < 0.3 ? CORE_TEXT[theme.isDark ? 0 : 1] : t.getBrightness() > 180 ? CORE_TEXT[1] : CORE_TEXT[0];
  };
  const text = (fontSize: number, weight: number, element: 'value' | 'name'): string | undefined => {
    const setting = styling.textColor;
    if (!setting) {
      return background ? coreOnBackground(background) : element === 'value' ? valueColor : undefined;
    }
    const wanted = resolve(setting);
    return wanted
      ? getReadableText(theme, wanted, drawnOn, getMinTextContrast(fontSize, weight), CORE_TEXT)
      : getBestContrastText(theme, drawnOn, CORE_TEXT);
  };
  const value = text(tile.value.smallestFontSize, 500, 'value')!;
  // Unset parts follow core: Value mode without a background, Background Solid on one (the tile colour brightened by
  // 40 for the line, white at 40 % for the fill)
  const unsetLine = background ? tinycolor(background).brighten(40).toRgbString() : valueColor;
  const sparklineColor =
    styling.sparklineColor?.mode === 'text'
      ? value
      : styling.sparklineColor?.mode === 'value'
        ? valueColor
        : !styling.sparklineColor
          ? unsetLine
          : (resolve(styling.sparklineColor) ?? valueColor);
  const lineOpacity = styling.sparklineLineOpacity;
  const fillOpacity = styling.sparklineFillOpacity;
  return {
    background: background ? rgb(background) : 'transparent',
    value: rgb(value),
    title: tile.title ? rgb(text(tile.title.fontSize, 400, 'name')) : undefined,
    percent: background && tile.percent ? rgb(text(tile.percent.fontSize, 500, 'value')) : undefined,
    sparkline: {
      stroke:
        lineOpacity === undefined || lineOpacity === 100
          ? rgb(sparklineColor)
          : tinycolor(sparklineColor)
              .setAlpha(lineOpacity / 100)
              .toRgbString(),
      fill:
        fillOpacity === undefined && background
          ? 'rgba(255, 255, 255, 0.4)'
          : tinycolor(sparklineColor)
              .setAlpha((fillOpacity ?? 20) / 100)
              .toRgbString(),
      width: styling.sparklineLineWidth ?? 1,
    },
  };
}

const panelById = (id: number) => DASHBOARD.panels.find((p) => p.id === id)!;

for (const scale of [1, 2]) {
  for (const themeName of ['light', 'dark'] as const) {
    test.describe(`Color mode Custom (${themeName} theme, pixel ratio ${scale})`, () => {
      test.use({ deviceScaleFactor: scale });
      test.describe.configure({ timeout: 90_000 });
      const theme = createTheme({ colors: { mode: themeName } });

      test.beforeEach(async ({ page }) => {
        await page.addInitScript(recordCanvases);
        await page.goto(`/d/${UID}?orgId=1&theme=${themeName}`);
        await page.addStyleTag({ content: '[data-viz-panel-key] > div > section { border-radius: 0 !important; }' });
      });

      // Draws the panel and returns its tiles once they and their sparklines are there
      const tilesOf = async (page: Page, id: number, withSparkline = true) => {
        await panelContent(page, id).scrollIntoViewIfNeeded();
        let tiles: DrawnTile[] = [];
        await expect
          .poll(
            async () => {
              // Grafana loads a panel once it is scrolled into view
              await panelContent(page, id).scrollIntoViewIfNeeded();
              tiles = await readTiles(page, id);
              const ready =
                tiles.length > 0 &&
                tiles.every((t) => (withSparkline ? (t.sparkline?.painted ?? 0) > 0.05 : !t.sparkline));
              return ready ? 'drawn' : tiles.map((t) => ({ name: t.name, sparkline: t.sparkline?.painted }));
            },
            { timeout: 20_000 }
          )
          .toBe('drawn');
        return tiles;
      };

      // The background as drawn: a pixel of each tile's padding (top left), in one screenshot of the panel
      const backgroundPixels = async (page: Page, id: number, tiles: DrawnTile[]) => {
        const content = panelContent(page, id);
        const box = (await content.boundingBox())!;
        const png = PNG.sync.read(await content.screenshot({ animations: 'disabled', caret: 'hide' }));
        return tiles.map((tile) => {
          const x = Math.round((tile.box.x - box.x + 3) * scale);
          const y = Math.round((tile.box.y - box.y + 3) * scale);
          const i = (y * png.width + x) * 4;
          return `rgb(${png.data[i]}, ${png.data[i + 1]}, ${png.data[i + 2]})`;
        });
      };

      test('nothing set draws exactly as core’s Value mode', async ({ page }) => {
        await page.mouse.move(0, 0);
        const core = await tilesOf(page, 10);
        const custom = await tilesOf(page, 11);
        const strip = (t: DrawnTile) => ({ ...t, box: { width: t.box.width, height: t.box.height } });
        expect(custom.map(strip)).toEqual(core.map(strip));
        await expect
          .poll(async () =>
            (await panelContent(page, 11).screenshot()).equals(await panelContent(page, 10).screenshot())
          )
          .toBe(true);
      });

      // One test per case of the dashboard (but the two above): each tile against the rules
      for (const panel of DASHBOARD.panels.filter((p) => p.id >= 20 && p.id < 60)) {
        test(`${panel.id}: ${panel.title}`, async ({ page }) => {
          const tiles = await tilesOf(page, panel.id, panel.id !== 34);
          expect(tiles.map((t) => t.name)).toEqual(Object.keys(STATE_COLORS));
          const pixels = await backgroundPixels(page, panel.id, tiles);
          for (const [index, tile] of tiles.entries()) {
            const colorName = STATE_COLORS[tile.name];
            // An override on one series (case 50)
            const styling: Styling =
              panel.id === 50 && tile.name === 'web'
                ? {
                    ...panel.options.styling,
                    backgroundColor: { mode: 'fixed', fixedColor: 'purple' },
                    textColor: { mode: 'fixed', fixedColor: 'white' },
                    sparklineLineWidth: 4,
                  }
                : panel.options.styling!;
            const want = expected(theme, styling, colorName, theme.visualization.getColorByName(colorName), tile);
            const label = `${tile.name} (${colorName})`;
            expect(tile.background === 'transparent' ? 'transparent' : rgb(tile.background), label).toBe(
              want.background
            );
            expect(rgb(tile.value.color), label).toBe(want.value);
            if (want.title) {
              expect(rgb(tile.title!.color), label).toBe(want.title);
            }
            if (want.percent) {
              expect(rgb(tile.percent!.color), label).toBe(want.percent);
            }
            if (tile.sparkline) {
              // what is set on the canvas: exactly one stroke, one fill and one width
              expect(tile.sparkline.stroke.map(rgb), label).toEqual([want.sparkline.stroke]);
              expect(tile.sparkline.fill.map(rgb), label).toEqual([rgb(want.sparkline.fill)]);
              expect(tile.sparkline.width, label).toEqual([want.sparkline.width * scale]);
            }
            const known = HARD_CODED[themeName][panel.id]?.[tile.name];
            if (known) {
              // colours worked out independently (see HARD_CODED), not by the oracle above
              for (const [part, color] of Object.entries(known)) {
                const drawnPart =
                  part === 'background'
                    ? rgb(tile.background)
                    : part === 'value'
                      ? rgb(tile.value.color)
                      : part === 'stroke'
                        ? tile.sparkline?.stroke.map(rgb)[0]
                        : tile.sparkline?.fill.map(rgb)[0];
                expect(drawnPart, `${label} ${part} (hard-coded)`).toBe(color);
              }
            }
            if (want.background !== 'transparent') {
              expect(pixels[index], label).toBe(want.background);
            }
          }
        });
      }

      test('pjan’s example: black tiles with the state colour as text; dark blue falls back to best contrast', async ({
        page,
      }) => {
        const tiles = await tilesOf(page, 34, false);
        const black = theme.visualization.getColorByName('black');
        for (const tile of tiles) {
          expect(tile.value.fontSize).toBeLessThan(24); // 4.5:1 applies
          const state = theme.visualization.getColorByName(STATE_COLORS[tile.name]);
          const best = getBestContrastText(theme, black, CORE_TEXT);
          expect(rgb(tile.value.color), tile.name).toBe(rgb(tile.name === 'queue' ? best : state));
        }
      });

      test('on a Background Value tile, the unset sparkline is visible: its line differs from the tile', async ({
        page,
      }) => {
        const tiles = await tilesOf(page, 20);
        const strokes = await panelContent(page, 20).evaluate((root) =>
          Array.from(root.querySelectorAll('canvas')).map((canvas) => {
            const tile = canvas.closest<HTMLElement>('div[style*="padding"]')!;
            const bg = getComputedStyle(tile)
              .backgroundColor.match(/[\d.]+/g)!
              .map(Number);
            const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
            // Line pixels: more opaque than the fill (white at 40 %). Drawn over the tile, a line in the tile's own colour
            // only ever gives blends of the tile and the fill-over-tile colour; count the pixels away from that blend
            // (a visible line), by their distance in RGB from the segment tile -> fill over tile.
            const fillOver = bg.map((c) => c + 0.4 * (255 - c));
            const seg = [0, 1, 2].map((c) => fillOver[c] - bg[c]);
            const segLength2 = seg.reduce((sum, v) => sum + v * v, 0);
            let line = 0;
            for (let i = 0; i < data.length; i += 4) {
              const a = data[i + 3] / 255;
              if (a <= 0.45) {
                continue;
              }
              const drawn = [0, 1, 2].map((c) => data[i + c] * a + bg[c] * (1 - a));
              const t = Math.min(
                1,
                Math.max(0, [0, 1, 2].reduce((sum, c) => sum + (drawn[c] - bg[c]) * seg[c], 0) / segLength2)
              );
              const distance = Math.hypot(...[0, 1, 2].map((c) => drawn[c] - (bg[c] + t * seg[c])));
              if (distance > 10) {
                line++;
              }
            }
            return line / (canvas.width * canvas.height);
          })
        );
        expect(strokes.length).toBe(tiles.length);
        for (const share of strokes) {
          expect(share).toBeGreaterThanOrEqual(0.05);
        }
      });

      test('the value keeps its colour (3:1 from 24 px), percent change falls back (4.5:1 below)', async ({ page }) => {
        // #949494 on white: 3.03:1 (hand computed, WCAG 2)
        const tiles = await tilesOf(page, 80, false);
        for (const tile of tiles) {
          expect(tile.value.fontSize).toBeGreaterThanOrEqual(24);
          expect(tile.percent!.fontSize).toBeLessThan(24);
          expect(rgb(tile.value.color)).toBe('rgb(148, 148, 148)');
          expect(rgb(tile.percent!.color)).toBe(CORE_DARK_TEXT);
          expect(rgb(tile.title!.color)).toBe(CORE_DARK_TEXT);
        }
      });

      test('a 30 px value with a unit is guarded at the unit’s size (18 px)', async ({ page }) => {
        for (const tile of await tilesOf(page, 81, false)) {
          expect(tile.value.fontSize).toBe(30);
          expect(tile.value.smallestFontSize).toBeCloseTo(18, 1);
          expect(rgb(tile.value.color)).toBe(CORE_DARK_TEXT);
        }
        // the same without a unit keeps its colour
        for (const tile of await tilesOf(page, 82, false)) {
          expect(tile.value.smallestFontSize).toBe(30);
          expect(rgb(tile.value.color)).toBe('rgb(148, 148, 148)');
        }
      });

      test('a transparent panel: text is measured against the dashboard canvas behind it', async ({ page }) => {
        // What Grafana 13.2.3 draws behind a transparent panel: the dashboard's canvas colour
        const [plain, transparent] = themeName === 'light' ? [83, 84] : [85, 86];
        const fixed = themeName === 'light' ? 'rgb(118, 118, 118)' : 'rgb(128, 128, 128)';
        const behind = await tilesOf(page, transparent, false);
        expect((await backgroundPixels(page, transparent, behind))[0]).toBe(rgb(theme.colors.background.canvas));
        // Hand computed (WCAG 2): light #767676 is 4.55:1 on the panel (#ffffff), 4.39:1 on the canvas (#fbfbfb);
        // dark #808080 4.36:1 on the panel (#181b1f), 4.75:1 on the canvas (#111217). Names need 4.5:1.
        const name = async (id: number) => rgb((await tilesOf(page, id, false))[0].title!.color);
        if (themeName === 'light') {
          expect(await name(plain)).toBe(fixed);
          expect(await name(transparent)).toBe(CORE_DARK_TEXT);
        } else {
          expect(await name(plain)).toBe(CORE_LIGHT_TEXT);
          expect(await name(transparent)).toBe(fixed);
        }
      });

      test('percent change follows the text colour on a background, and keeps its own mode without one', async ({
        page,
      }) => {
        const green = theme.visualization.getColorByName('green');
        for (const tile of await tilesOf(page, 60)) {
          expect(rgb(tile.percent!.color)).toBe(rgb(tile.value.color));
        }
        for (const tile of await tilesOf(page, 61)) {
          expect(rgb(tile.value.color)).not.toBe(rgb(green));
          expect(rgb(tile.percent!.color)).toBe(rgb(green)); // Standard, rising
        }
      });

      test('colours without a name: a background shade is the value colour, a text shade best contrast', async ({
        page,
      }) => {
        const values = await tilesOf(page, 70);
        const shades = await tilesOf(page, 71);
        expect(shades.map((t) => rgb(t.background))).toEqual(values.map((t) => rgb(t.background)));
        for (const tile of shades) {
          expect(rgb(tile.value.color)).toBe(rgb(getBestContrastText(theme, tile.background, CORE_TEXT)));
        }
        expect(panelById(71).options.styling?.textColor?.mode).toBe('shade');
      });
    });
  }
}
