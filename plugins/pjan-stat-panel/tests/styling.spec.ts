import fs from 'node:fs';
import path from 'node:path';

import { createTheme, type GrafanaTheme2 } from '@grafana/data';
import { expect, test, type Page } from '@grafana/plugin-e2e';
import { PNG } from 'pngjs';
import tinycolor from 'tinycolor2';

// The colour helpers of the shared package, from their files: its entry point also exports the editors (@grafana/ui),
// which don't load in Node.
import { getAutomaticText, getMinTextContrast } from '../../../packages/grafana-styling/src/canvasColors';
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

// Expected colours worked out by hand for a few cases, independently of the code under test and of the oracle below:
// the theme's colours from Grafana 13.2.3's stock themes, contrast by the WCAG 2 formula (relative luminance with
// the sRGB transfer function, (L1 + 0.05) / (L2 + 0.05)) written out separately, and core's brighten(40) for the
// sparkline line on a background. Contrasts below are those hand computations. Automatic text was worked out the same
// way: Grafana's luminance (rounded to 3 digits), 1 % sRGB steps towards the theme's page colour (#fbfbfb / #111217)
// and maxContrast (#000000 / #ffffff).
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
    // 34: on black, the state colour as chosen, dark blue included (no contrast fallback any more)
    34: {
      api: { value: 'rgb(86, 166, 75)' },
      web: { value: 'rgb(242, 204, 12)' },
      db: { value: 'rgb(224, 47, 68)' },
      queue: { value: 'rgb(18, 80, 176)' },
    },
  },
  dark: {
    20: {
      api: { background: 'rgb(115, 191, 105)', stroke: 'rgb(217, 255, 207)', fill: WHITE_40 },
      web: { background: 'rgb(250, 222, 42)', stroke: 'rgb(255, 255, 144)', fill: WHITE_40 },
      db: { background: 'rgb(242, 73, 92)', stroke: 'rgb(255, 175, 194)', fill: WHITE_40 },
      queue: { background: 'rgb(31, 96, 196)', stroke: 'rgb(133, 198, 255)', fill: WHITE_40 },
    },
    34: {
      api: { value: 'rgb(115, 191, 105)' },
      web: { value: 'rgb(250, 222, 42)' },
      db: { value: 'rgb(242, 73, 92)' },
      queue: { value: 'rgb(31, 96, 196)' },
    },
  },
};

// 30: Automatic on the value colour, for a large value (3:1, from 24 px) and a small one (4.5:1)
const AUTOMATIC_ON_VALUE: Record<'light' | 'dark', Record<string, { large: string; small: string }>> = {
  light: {
    api: { large: 'rgb(42, 81, 37)', small: 'rgb(27, 51, 23)' },
    web: { large: 'rgb(136, 114, 7)', small: 'rgb(104, 88, 5)' },
    db: { large: 'rgb(90, 19, 27)', small: 'rgb(11, 2, 3)' },
    queue: { large: 'rgb(135, 166, 214)', small: 'rgb(186, 203, 230)' },
  },
  dark: {
    api: { large: 'rgb(63, 99, 62)', small: 'rgb(46, 70, 48)' },
    web: { large: 'rgb(140, 126, 33)', small: 'rgb(108, 98, 30)' },
    db: { large: 'rgb(105, 39, 50)', small: 'rgb(49, 26, 33)' },
    queue: { large: 'rgb(159, 187, 230)', small: 'rgb(212, 225, 244)' },
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
  // without a background, Automatic starts from the value's own colour
  const automatic = (fontSize: number, weight: number) =>
    getAutomaticText(theme, drawnOn, getMinTextContrast(fontSize, weight), {
      background: theme.colors.background.primary,
      from: background ? undefined : valueColor,
    });
  // A value, shade or fixed colour as chosen; Automatic (and a shade without a name, and unset on a background) is the
  // first readable shade of what the text is drawn on
  const text = (fontSize: number, weight: number, element: 'value' | 'name'): string | undefined => {
    const setting = styling.textColor;
    if (!setting) {
      return background ? automatic(fontSize, weight) : element === 'value' ? valueColor : undefined;
    }
    return (setting.mode === 'automatic' ? undefined : resolve(setting)) ?? automatic(fontSize, weight);
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
            const automaticOnValue = panel.id === 30 ? AUTOMATIC_ON_VALUE[themeName][tile.name] : undefined;
            if (automaticOnValue) {
              // worked out independently (see AUTOMATIC_ON_VALUE), not by the oracle above
              const size = tile.value.smallestFontSize >= 24 ? 'large' : 'small';
              expect(rgb(tile.value.color), `${label} value (hard-coded, ${size})`).toBe(automaticOnValue[size]);
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

      test('pjan’s example: black tiles with the state colour as text, drawn as chosen (dark blue too)', async ({
        page,
      }) => {
        const tiles = await tilesOf(page, 34, false);
        for (const tile of tiles) {
          expect(tile.value.fontSize).toBeLessThan(24); // small text: no fallback even below 4.5:1
          const state = theme.visualization.getColorByName(STATE_COLORS[tile.name]);
          expect(rgb(tile.value.color), tile.name).toBe(rgb(state));
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

      // Automatic text worked out by hand (as AUTOMATIC_ON_VALUE): on white, and on the panel background or the canvas
      const HAND: Record<'light' | 'dark', Record<'white3' | 'white45' | 'panel45' | 'canvas45', string>> = {
        light: {
          white3: 'rgb(148, 148, 148)',
          white45: 'rgb(117, 117, 117)',
          // without a background: from the value's green (#56A64B)
          panel45: 'rgb(68, 131, 59)',
          canvas45: 'rgb(67, 129, 59)',
        },
        dark: {
          white3: 'rgb(148, 148, 151)',
          white45: 'rgb(117, 118, 120)',
          // the value's green (#73BF69) already reaches 4.5:1 on both
          panel45: 'rgb(115, 191, 105)',
          canvas45: 'rgb(115, 191, 105)',
        },
      };

      test('Automatic per element: 3:1 for the large value, 4.5:1 for percent change and the name', async ({
        page,
      }) => {
        const tiles = await tilesOf(page, 80, false);
        for (const tile of tiles) {
          expect(tile.value.fontSize).toBeGreaterThanOrEqual(24);
          expect(tile.percent!.fontSize).toBeLessThan(24);
          expect(rgb(tile.value.color)).toBe(HAND[themeName].white3);
          expect(rgb(tile.percent!.color)).toBe(HAND[themeName].white45);
          expect(rgb(tile.title!.color)).toBe(HAND[themeName].white45);
        }
      });

      test('Automatic on a 30 px value with a unit uses the unit’s size (18 px)', async ({ page }) => {
        for (const tile of await tilesOf(page, 81, false)) {
          expect(tile.value.fontSize).toBe(30);
          expect(tile.value.smallestFontSize).toBeCloseTo(18, 1);
          expect(rgb(tile.value.color)).toBe(HAND[themeName].white45);
        }
        // the same without a unit needs 3:1
        for (const tile of await tilesOf(page, 82, false)) {
          expect(tile.value.smallestFontSize).toBe(30);
          expect(rgb(tile.value.color)).toBe(HAND[themeName].white3);
        }
      });

      test('a transparent panel: Automatic is measured against the dashboard canvas behind it', async ({ page }) => {
        // What Grafana 13.2.3 draws behind a transparent panel: the dashboard's canvas colour
        const behind = await tilesOf(page, 84, false);
        expect((await backgroundPixels(page, 84, behind))[0]).toBe(rgb(theme.colors.background.canvas));
        const name = async (id: number) => rgb((await tilesOf(page, id, false))[0].title!.color);
        expect(await name(83)).toBe(HAND[themeName].panel45);
        expect(await name(84)).toBe(HAND[themeName].canvas45);
      });

      test('percent change follows the text colour on a background, and keeps its own mode without one', async ({
        page,
      }) => {
        const green = theme.visualization.getColorByName('green');
        // On a green tile with the text not set: Automatic for each element at its own size (hand-computed, see
        // AUTOMATIC_ON_VALUE), so the small percent change needs 4.5:1 where a large value needs 3:1
        const onGreen = AUTOMATIC_ON_VALUE[themeName].api;
        for (const tile of await tilesOf(page, 60)) {
          expect(tile.percent!.fontSize).toBeLessThan(24);
          expect(rgb(tile.percent!.color)).toBe(onGreen.small);
          expect(rgb(tile.value.color)).toBe(tile.value.smallestFontSize >= 24 ? onGreen.large : onGreen.small);
        }
        for (const tile of await tilesOf(page, 61)) {
          expect(rgb(tile.value.color)).not.toBe(rgb(green));
          expect(rgb(tile.percent!.color)).toBe(rgb(green)); // Standard, rising
        }
      });

      test('colours without a name: a background shade is the value colour, a text shade Automatic', async ({
        page,
      }) => {
        const values = await tilesOf(page, 70);
        const shades = await tilesOf(page, 71);
        expect(shades.map((t) => rgb(t.background))).toEqual(values.map((t) => rgb(t.background)));
        for (const tile of shades) {
          const minContrast = getMinTextContrast(tile.value.smallestFontSize, 500);
          expect(rgb(tile.value.color)).toBe(
            rgb(getAutomaticText(theme, tile.background, minContrast, { background: theme.colors.background.primary }))
          );
        }
        expect(panelById(71).options.styling?.textColor?.mode).toBe('shade');
      });
    });
  }
}
