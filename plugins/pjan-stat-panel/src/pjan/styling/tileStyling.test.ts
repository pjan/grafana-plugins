import tinycolor from 'tinycolor2';

import {
  createDataFrame,
  FieldColorModeId,
  type FieldDisplay,
  FieldType,
  getFieldDisplayValues,
  type GrafanaTheme2,
  ReducerID,
  ThresholdsMode,
} from '@grafana/data';
import { getAutomaticText, getRelativeShadeColor, getTextContrast } from '@pjan/grafana-styling';
import { LIGHT, THEMES } from '@pjan/grafana-styling/src/testdata/themes';

import { type StatStyling } from './options';
import { getSmallestValueFontSize, getStatTileStyling, getTileStyling, GRAY, resolveStyling } from './tileStyling';

const DARK = THEMES['Grafana dark'];
const color = (theme: GrafanaTheme2, name: string) => theme.visualization.getColorByName(name);

describe('resolveStyling', () => {
  it('a series override wins over the panel option, setting by setting', () => {
    const panel: StatStyling = {
      backgroundColor: { mode: 'value' },
      textColor: { mode: 'automatic' },
      sparklineLineWidth: 2,
    };
    const custom = { styling: { backgroundColor: { mode: 'fixed', fixedColor: 'black' }, sparklineFillOpacity: 40 } };
    expect(resolveStyling(custom, panel)).toEqual({
      backgroundColor: { mode: 'fixed', fixedColor: 'black' },
      textColor: { mode: 'automatic' },
      sparklineFillOpacity: 40,
      sparklineLineWidth: 2,
    });
  });

  it('an incomplete or out-of-range setting counts as unset, so the next level applies', () => {
    const panel: StatStyling = { backgroundColor: { mode: 'value' }, sparklineLineWidth: 3 };
    expect(resolveStyling({ styling: { backgroundColor: { mode: 'fixed' }, sparklineLineWidth: 9 } }, panel)).toEqual(
      panel
    );
    // a mode the setting doesn't offer
    expect(resolveStyling({ styling: { textColor: { mode: 'none' } } }, {})).toEqual({});
    expect(resolveStyling(undefined, undefined)).toEqual({});
  });

  it('reads the series’ settings from `custom.styling` only', () => {
    const flat = { backgroundColor: { mode: 'fixed', fixedColor: 'black' } };
    expect(resolveStyling(flat, { backgroundColor: { mode: 'value' } })).toEqual({
      backgroundColor: { mode: 'value' },
    });
  });
});

describe('getTileStyling', () => {
  const green = color(LIGHT, 'green');

  it('with nothing set draws like core’s Value mode', () => {
    const tile = getTileStyling(LIGHT, green, 'green', {});
    expect(tile.background).toBe('transparent');
    expect(tile.hasBackground).toBe(false);
    expect(tile.getTextColor('value', 40, 500)).toBe(green);
    expect(tile.getTextColor('name', 14, 400)).toBeUndefined();
    expect(tile.getSparkline(green)).toEqual({
      lineColor: green,
      fillColor: tinycolor(green).setAlpha(0.2).toRgbString(),
      lineWidth: 1,
    });
  });

  describe('Background color', () => {
    it.each([
      [{ mode: 'none' as const }, 'transparent'],
      [{ mode: 'value' as const }, green],
      [{ mode: 'shade' as const, shade: 'softer' as const }, getRelativeShadeColor(LIGHT, 'green', 'softer')],
      [{ mode: 'fixed' as const, fixedColor: 'purple' }, color(LIGHT, 'purple')],
    ])('%o', (backgroundColor, expected) => {
      expect(getTileStyling(LIGHT, green, 'green', { backgroundColor }).background).toBe(expected);
    });

    it('a shade of a colour without a name: of its nearest hue, or the value colour without one', () => {
      const soft = { backgroundColor: { mode: 'shade' as const, shade: 'soft' as const } };
      // a gray hex colour: Grafana's stock themes have no gray hue, Atlas has (a separate implementation of the rule)
      expect(getTileStyling(LIGHT, '#8e8e8e', undefined, soft).background).toBe('#8e8e8e');
      const atlas = THEMES['Atlas light'];
      expect(getTileStyling(atlas, '#8e8e8e', undefined, soft).background).toBe(color(atlas, 'light-gray'));
      // magenta is nearest Grafana light's purple
      expect(getTileStyling(LIGHT, '#ff00ff', undefined, soft).background).toBe(
        getRelativeShadeColor(LIGHT, 'purple', 'soft')
      );
    });
  });

  describe('Text color', () => {
    it('not set, on a background: Automatic, at each element’s size', () => {
      const soft = getRelativeShadeColor(DARK, 'green', 'soft')!;
      const tile = getTileStyling(DARK, color(DARK, 'green'), 'green', {
        backgroundColor: { mode: 'shade', shade: 'soft' },
      });
      const background = DARK.colors.background.primary;
      for (const element of ['value', 'name', 'percent'] as const) {
        expect(tile.getTextColor(element, 14, 400)).toBe(getAutomaticText(DARK, soft, 4.5, { background }));
      }
      expect(tile.getTextColor('value', 40, 500)).toBe(getAutomaticText(DARK, soft, 3, { background }));
    });

    it('Automatic: the first readable shade of the background’s hue, 4.5:1 for small and 3:1 for large text', () => {
      for (const [theme, name] of [
        [LIGHT, 'yellow'],
        [LIGHT, 'dark-blue'],
        [DARK, 'light-green'],
      ] as const) {
        const tile = getTileStyling(theme, color(theme, name), name, {
          backgroundColor: { mode: 'value' },
          textColor: { mode: 'automatic' },
        });
        const fill = color(theme, name);
        const background = theme.colors.background.primary;
        expect(tile.getTextColor('name', 12, 400)).toBe(getAutomaticText(theme, fill, 4.5, { background }));
        expect(tile.getTextColor('value', 40, 500)).toBe(getAutomaticText(theme, fill, 3, { background }));
        expect(getTextContrast(theme, tile.getTextColor('name', 12, 400)!, fill)).toBeGreaterThanOrEqual(4.2);
        expect(getTextContrast(theme, tile.getTextColor('value', 40, 500)!, fill)).toBeGreaterThanOrEqual(3);
      }
    });

    it('Automatic on Grafana light’s green tile, worked out by hand', () => {
      // #56A64B: towards black, 51 % gives 3.03:1 (large text) and 69 % 4.52:1 (small text)
      const tile = getTileStyling(LIGHT, color(LIGHT, 'green'), 'green', { backgroundColor: { mode: 'value' } });
      expect(tile.getTextColor('value', 40, 500)).toBe('rgb(42,81,37)');
      expect(tile.getTextColor('name', 12, 400)).toBe('rgb(27,51,23)');
    });

    it('a translucent background is composited over what is behind the panel (the canvas when transparent)', () => {
      const styling: StatStyling = { backgroundColor: { mode: 'fixed', fixedColor: 'rgba(255, 255, 255, 0.1)' } };
      const { primary, canvas } = DARK.colors.background;
      const onPanel = getTileStyling(DARK, color(DARK, 'green'), 'green', styling, primary);
      const onCanvas = getTileStyling(DARK, color(DARK, 'green'), 'green', styling, canvas);
      expect(onPanel.getTextColor('name', 12, 400)).toBe(
        getAutomaticText(DARK, 'rgba(255, 255, 255, 0.1)', 4.5, { background: primary })
      );
      expect(onCanvas.getTextColor('name', 12, 400)).toBe(
        getAutomaticText(DARK, 'rgba(255, 255, 255, 0.1)', 4.5, { background: canvas })
      );
      expect(onCanvas.getTextColor('name', 12, 400)).not.toBe(onPanel.getTextColor('name', 12, 400));
    });

    it('Automatic without a background keeps the value’s hue (hand-computed on Grafana light’s green)', () => {
      const tile = getTileStyling(LIGHT, color(LIGHT, 'green'), 'green', { textColor: { mode: 'automatic' } });
      // #56A64B on white: 3:1 as it is; 4.5:1 21 % towards black
      expect(tile.getTextColor('value', 40, 500)).toBe('rgb(86,166,75)');
      expect(tile.getTextColor('name', 12, 400)).toBe('rgb(68,131,59)');
    });

    it('a value colour is drawn as chosen at every size, whatever its contrast', () => {
      // Green on the light panel background: about 3.0:1, below 4.5:1 for small text
      const g = color(LIGHT, 'green');
      expect(getTextContrast(LIGHT, g, LIGHT.colors.background.primary)).toBeLessThan(4.5);
      const tile = getTileStyling(LIGHT, g, 'green', { textColor: { mode: 'value' } });
      for (const [size, weight] of [
        [40, 500],
        [23, 500],
        [14, 400],
        [20, 700],
      ]) {
        expect(tile.getTextColor('value', size, weight)).toBe(g);
        expect(tile.getTextColor('name', size, weight)).toBe(g);
      }
    });

    it('pjan’s example: on a fixed black background, the value colour, dark blue included', () => {
      const styling: StatStyling = {
        backgroundColor: { mode: 'fixed', fixedColor: 'black' },
        textColor: { mode: 'value' },
      };
      for (const theme of [LIGHT, DARK]) {
        for (const name of ['green', 'dark-blue']) {
          const tile = getTileStyling(theme, color(theme, name), name, styling);
          expect(tile.getTextColor('value', 20, 500)).toBe(color(theme, name));
          expect(tile.getTextColor('name', 12, 400)).toBe(color(theme, name));
        }
      }
    });

    it('a shade, a fixed colour, and a shade of a colour without a name (its nearest hue’s, else Automatic)', () => {
      const strong = getRelativeShadeColor(LIGHT, 'green', 'stronger')!;
      const shaded = getTileStyling(LIGHT, color(LIGHT, 'green'), 'green', {
        textColor: { mode: 'shade', shade: 'stronger' },
      });
      expect(shaded.getTextColor('name', 14, 400)).toBe(strong);
      const fixed = getTileStyling(LIGHT, color(LIGHT, 'green'), 'green', {
        textColor: { mode: 'fixed', fixedColor: 'black' },
      });
      expect(fixed.getTextColor('value', 30, 500)).toBe(color(LIGHT, 'black'));
      // magenta is nearest Grafana light's purple (a separate implementation of the rule)
      const magenta = getTileStyling(LIGHT, '#ff00ff', undefined, { textColor: { mode: 'shade', shade: 'stronger' } });
      expect(magenta.getTextColor('value', 60, 500)).toBe(getRelativeShadeColor(LIGHT, 'purple', 'stronger'));
      // CSS teal is near no hue, so its shade is Automatic: without a background, from the value's own colour; teal
      // already reaches 3:1 on white (hand-computed: luminance 0.170, (1 + 0.05) / (0.170 + 0.05) = 4.77), so it stays
      const unnamed = getTileStyling(LIGHT, '#008080', undefined, { textColor: { mode: 'shade', shade: 'stronger' } });
      expect(unnamed.getTextColor('value', 60, 500)).toBe('rgb(0,128,128)');
    });
  });

  describe('Sparkline', () => {
    const tile = (styling: StatStyling, colorName: string | null = 'green') =>
      getTileStyling(
        LIGHT,
        colorName ? color(LIGHT, colorName) : '#8e8e8e',
        colorName ?? undefined,
        styling
      ).getSparkline('rgb(1, 2, 3)');

    it('colour: value, a shade (value colour without a name), the text colour, a fixed colour', () => {
      expect(tile({ sparklineColor: { mode: 'value' } }).lineColor).toBe(green);
      expect(tile({ sparklineColor: { mode: 'shade', shade: 'stronger' } }).lineColor).toBe(
        getRelativeShadeColor(LIGHT, 'green', 'stronger')
      );
      expect(tile({ sparklineColor: { mode: 'shade', shade: 'stronger' } }, null).lineColor).toBe('#8e8e8e');
      expect(tile({ sparklineColor: { mode: 'text' } }).lineColor).toBe('rgb(1, 2, 3)');
      expect(tile({ sparklineColor: { mode: 'fixed', fixedColor: 'purple' } }).lineColor).toBe(color(LIGHT, 'purple'));
    });

    it('line and fill opacity, and line width', () => {
      const s = tile({
        sparklineColor: { mode: 'text' },
        sparklineLineOpacity: 45,
        sparklineFillOpacity: 18,
        sparklineLineWidth: 3,
      });
      expect(s).toEqual({ lineColor: 'rgba(1, 2, 3, 0.45)', fillColor: 'rgba(1, 2, 3, 0.18)', lineWidth: 3 });
      expect(tile({ sparklineFillOpacity: 0 }).fillColor).toBe(tinycolor(green).setAlpha(0).toRgbString());
      expect(tile({ sparklineLineOpacity: 100 }).lineColor).toBe(green);
    });
  });
});

describe('getStatTileStyling', () => {
  const thresholds = {
    mode: ThresholdsMode.Absolute,
    steps: [
      { value: -Infinity, color: 'green' },
      { value: 50, color: 'red' },
    ],
  };

  const tiles = (theme: GrafanaTheme2, config: object, values = [10, 90]): FieldDisplay[] => {
    let seriesIndex = 0;
    const data = ['a', 'b'].map((name, i) => {
      const frame = createDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1, 2] },
          { name, type: FieldType.number, values: [values[i], values[i]], config: { ...config } },
        ],
      });
      frame.fields[1].state = { seriesIndex: seriesIndex++, range: { min: 0, max: 100, delta: 100 } };
      return frame;
    });
    return getFieldDisplayValues({
      data,
      reduceOptions: { values: false, calcs: [ReducerID.lastNotNull] },
      fieldConfig: { defaults: {}, overrides: [] },
      replaceVariables: (v) => v,
      theme,
    });
  };

  it('finds the colour name behind each tile (thresholds) for the shades', () => {
    const [a, b] = tiles(LIGHT, { color: { mode: FieldColorModeId.Thresholds }, thresholds });
    const styling: StatStyling = { backgroundColor: { mode: 'shade', shade: 'softer' } };
    expect(getStatTileStyling(LIGHT, a, styling).background).toBe(getRelativeShadeColor(LIGHT, 'green', 'softer'));
    expect(getStatTileStyling(LIGHT, b, styling).background).toBe(getRelativeShadeColor(LIGHT, 'red', 'softer'));
  });

  it('the series’ override (custom) wins over the panel option', () => {
    const [a] = tiles(LIGHT, {
      color: { mode: FieldColorModeId.Thresholds },
      thresholds,
      custom: { styling: { backgroundColor: { mode: 'fixed', fixedColor: 'black' } } },
    });
    expect(getStatTileStyling(LIGHT, a, { backgroundColor: { mode: 'value' } }).background).toBe(color(LIGHT, 'black'));
  });

  it('classic palette slots: named slots have their shades, hex slots their nearest hue’s', () => {
    for (const theme of Object.values(THEMES)) {
      const [a] = tiles(theme, { color: { mode: FieldColorModeId.PaletteClassic } });
      // the first slot: Grafana's `green`, Atlas's lime 600 (light) or lime 400 (dark), nearest Atlas's lime hue
      const slot = theme.visualization.palette[0];
      const tile = getStatTileStyling(theme, a, { backgroundColor: { mode: 'shade', shade: 'stronger' } });
      expect(tile.background).toBe(getRelativeShadeColor(theme, slot.startsWith('#') ? 'lime' : slot, 'stronger'));
    }
  });
});

describe('getSmallestValueFontSize (FormattedValueDisplay draws a unit suffix smaller)', () => {
  it.each([
    [30, '%', 18],
    [26, ' ms', 15.6],
    [25, '%', 20],
    [20, '%', 16],
    [19, '%', 17.1],
    [30, '', 30],
    [30, undefined, 30],
  ])('a %s px value with suffix %j: %s px', (size, suffix, expected) => {
    expect(getSmallestValueFontSize(size, suffix)).toBeCloseTo(expected, 5);
  });
});

describe('edge cases', () => {
  it('a value without a colour is CSS gray, which the contrast helpers can read (no throw)', () => {
    const [tile] = getFieldDisplayValues({
      data: [
        createDataFrame({
          fields: [{ name: 'v', type: FieldType.number, values: [1], config: {} }],
        }),
      ],
      reduceOptions: { values: false, calcs: [ReducerID.lastNotNull] },
      fieldConfig: { defaults: {}, overrides: [] },
      replaceVariables: (v) => v,
      theme: LIGHT,
    });
    const withoutColor = { ...tile, display: { ...tile.display, color: undefined } };
    const styling = getStatTileStyling(LIGHT, withoutColor, {
      textColor: { mode: 'value' },
      backgroundColor: { mode: 'value' },
    });
    expect(styling.background).toBe(GRAY);
    expect(() => styling.getTextColor('value', 40, 500)).not.toThrow();
    // Gray has no name: a shade of it is the theme's gray hue's (Atlas), or gray itself (stock Grafana has no gray hue)
    const atlasLight = THEMES['Atlas light'];
    const soft = { backgroundColor: { mode: 'shade' as const, shade: 'soft' as const } };
    expect(getStatTileStyling(atlasLight, withoutColor, soft).background).toBe(color(atlasLight, 'light-gray'));
    expect(getStatTileStyling(LIGHT, withoutColor, soft).background).toBe(GRAY);
  });

  it('a transparent panel: Automatic measures against the dashboard canvas; a fixed colour is drawn as chosen', () => {
    const [tile] = getFieldDisplayValues({
      data: [createDataFrame({ fields: [{ name: 'v', type: FieldType.number, values: [1], config: {} }] })],
      reduceOptions: { values: false, calcs: [ReducerID.lastNotNull] },
      fieldConfig: { defaults: {}, overrides: [] },
      replaceVariables: (v) => v,
      theme: LIGHT,
    });
    const automatic: StatStyling = { textColor: { mode: 'automatic' } };
    const { primary, canvas } = LIGHT.colors.background;
    const from = tile.display.color;
    expect(getStatTileStyling(LIGHT, tile, automatic).getTextColor('name', 14, 400)).toBe(
      getAutomaticText(LIGHT, primary, 4.5, { background: primary, from })
    );
    expect(getStatTileStyling(LIGHT, tile, automatic, true).getTextColor('name', 14, 400)).toBe(
      getAutomaticText(LIGHT, canvas, 4.5, { background: canvas, from })
    );
    const fixed: StatStyling = { textColor: { mode: 'fixed', fixedColor: '#808080' } };
    expect(getStatTileStyling(LIGHT, tile, fixed, true).getTextColor('name', 14, 400)).toBe('#808080');
  });
});

describe('unset parts follow core: Value mode without a background, Background Solid with one', () => {
  const green = color(LIGHT, 'green');
  const valueFill = tinycolor(green).setAlpha(0.2).toRgbString();
  const backgrounds: Array<[string, StatStyling['backgroundColor'], string | undefined]> = [
    ['not set', undefined, undefined],
    ['None', { mode: 'none' }, undefined],
    ['Value', { mode: 'value' }, green],
    ['a shade', { mode: 'shade', shade: 'softer' }, getRelativeShadeColor(LIGHT, 'green', 'softer')],
    ['Fixed', { mode: 'fixed', fixedColor: 'purple' }, color(LIGHT, 'purple')],
  ];

  describe.each(backgrounds)('Background %s', (_, backgroundColor, drawn) => {
    const sparkline = (styling: StatStyling) =>
      getTileStyling(LIGHT, green, 'green', { backgroundColor, ...styling }).getSparkline('rgb(1, 2, 3)');

    it('Sparkline color and fill opacity not set', () => {
      expect(sparkline({})).toEqual(
        drawn
          ? // core's Background Solid on the drawn tile colour
            { lineColor: tinycolor(drawn).brighten(40).toRgbString(), fillColor: 'rgba(255,255,255,0.4)', lineWidth: 1 }
          : // core's Value mode
            { lineColor: green, fillColor: valueFill, lineWidth: 1 }
      );
    });

    it('Sparkline color set, fill opacity not set', () => {
      const s = sparkline({ sparklineColor: { mode: 'fixed', fixedColor: 'blue' } });
      expect(s.lineColor).toBe(color(LIGHT, 'blue'));
      expect(s.fillColor).toBe(
        drawn ? 'rgba(255,255,255,0.4)' : tinycolor(color(LIGHT, 'blue')).setAlpha(0.2).toRgbString()
      );
    });

    it('Sparkline color not set, fill opacity set: the line colour at that opacity', () => {
      const s = sparkline({ sparklineFillOpacity: 30 });
      const line = drawn ? tinycolor(drawn).brighten(40).toRgbString() : green;
      expect(s).toEqual({ lineColor: line, fillColor: tinycolor(line).setAlpha(0.3).toRgbString(), lineWidth: 1 });
    });

    it('both set; Same as text is the text colour as drawn', () => {
      const s = sparkline({ sparklineColor: { mode: 'text' }, sparklineFillOpacity: 10, sparklineLineOpacity: 50 });
      expect(s).toEqual({ lineColor: 'rgba(1, 2, 3, 0.5)', fillColor: 'rgba(1, 2, 3, 0.1)', lineWidth: 1 });
    });
  });

  it('on Background Value the unset sparkline is visibly different from the tile (not the value colour)', () => {
    const s = getTileStyling(LIGHT, green, 'green', { backgroundColor: { mode: 'value' } }).getSparkline(undefined);
    expect(tinycolor.equals(s.lineColor, green)).toBe(false);
  });
});
