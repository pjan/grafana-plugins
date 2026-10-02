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
import { getTextColorForAlphaBackground } from '@grafana/ui';
import { getRelativeShadeColor, getTextContrast } from '@pjan/grafana-styling';
import { LIGHT, THEMES } from '@pjan/grafana-styling/src/testdata/themes';

import { type StatStyling } from './options';
import {
  CORE_TEXT_COLORS,
  getSmallestValueFontSize,
  getStatTileStyling,
  getTileStyling,
  GRAY,
  resolveStyling,
} from './tileStyling';

const DARK = THEMES['Grafana dark'];
const color = (theme: GrafanaTheme2, name: string) => theme.visualization.getColorByName(name);
const [CORE_LIGHT_TEXT, CORE_DARK_TEXT] = CORE_TEXT_COLORS;

describe('resolveStyling', () => {
  it('a series override wins over the panel option, setting by setting', () => {
    const panel: StatStyling = {
      backgroundColor: { mode: 'value' },
      textColor: { mode: 'contrast' },
      sparklineLineWidth: 2,
    };
    const custom = { backgroundColor: { mode: 'fixed', fixedColor: 'black' }, sparklineFillOpacity: 40 };
    expect(resolveStyling(custom, panel)).toEqual({
      backgroundColor: { mode: 'fixed', fixedColor: 'black' },
      textColor: { mode: 'contrast' },
      sparklineFillOpacity: 40,
      sparklineLineWidth: 2,
    });
  });

  it('an incomplete or out-of-range setting counts as unset, so the next level applies', () => {
    const panel: StatStyling = { backgroundColor: { mode: 'value' }, sparklineLineWidth: 3 };
    expect(resolveStyling({ backgroundColor: { mode: 'fixed' }, sparklineLineWidth: 9 }, panel)).toEqual(panel);
    // a mode the setting doesn't offer
    expect(resolveStyling({ textColor: { mode: 'none' } }, {})).toEqual({});
    expect(resolveStyling(undefined, undefined)).toEqual({});
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

    it('a shade of a colour without a name falls back to the value colour', () => {
      expect(
        getTileStyling(LIGHT, '#8e8e8e', undefined, { backgroundColor: { mode: 'shade', shade: 'soft' } }).background
      ).toBe('#8e8e8e');
    });
  });

  describe('Text color', () => {
    it('not set, on a background: core’s text colour for that background, for every element', () => {
      const soft = getRelativeShadeColor(DARK, 'green', 'soft')!;
      const tile = getTileStyling(DARK, color(DARK, 'green'), 'green', {
        backgroundColor: { mode: 'shade', shade: 'soft' },
      });
      for (const element of ['value', 'name', 'percent'] as const) {
        expect(tile.getTextColor(element, 14, 400)).toBe(getTextColorForAlphaBackground(soft, true));
      }
    });

    it('best contrast is the one of core’s two text colours with the higher contrast', () => {
      const onYellow = getTileStyling(LIGHT, color(LIGHT, 'yellow'), 'yellow', {
        backgroundColor: { mode: 'value' },
        textColor: { mode: 'contrast' },
      });
      expect(onYellow.getTextColor('value', 40, 500)).toBe(CORE_DARK_TEXT);
      const onBlue = getTileStyling(LIGHT, color(LIGHT, 'dark-blue'), 'dark-blue', {
        backgroundColor: { mode: 'value' },
        textColor: { mode: 'contrast' },
      });
      expect(onBlue.getTextColor('name', 12, 400)).toBe(CORE_LIGHT_TEXT);
    });

    it('a colour is kept where it reaches the minimum for the element’s size, else best contrast', () => {
      // Green on the light panel background: about 3.0:1. Enough for a 40 px value (3:1), not for a 14 px name.
      const g = color(LIGHT, 'green');
      const contrast = getTextContrast(LIGHT, g, LIGHT.colors.background.primary);
      expect(contrast).toBeGreaterThanOrEqual(3);
      expect(contrast).toBeLessThan(4.5);
      const tile = getTileStyling(LIGHT, g, 'green', { textColor: { mode: 'value' } });
      expect(tile.getTextColor('value', 40, 500)).toBe(g);
      expect(tile.getTextColor('value', 23, 500)).toBe(CORE_DARK_TEXT);
      expect(tile.getTextColor('name', 14, 400)).toBe(CORE_DARK_TEXT);
      expect(tile.getTextColor('name', 20, 700)).toBe(g); // 18.66 px bold is large text
    });

    it('pjan’s example: on a fixed black background, the value colour unless it is too dark (dark blue)', () => {
      const styling: StatStyling = {
        backgroundColor: { mode: 'fixed', fixedColor: 'black' },
        textColor: { mode: 'value' },
      };
      for (const theme of [LIGHT, DARK]) {
        const green = getTileStyling(theme, color(theme, 'green'), 'green', styling);
        expect(green.getTextColor('value', 20, 500)).toBe(color(theme, 'green'));
        expect(green.getTextColor('name', 12, 400)).toBe(color(theme, 'green'));
        // Dark blue on black: below 4.5:1 (best contrast below 24 px); 2.8:1 in the light theme (#1250B0, best contrast
        // at any size), 3.5:1 in the dark theme (#1F60C4, kept for large text)
        const blue = getTileStyling(theme, color(theme, 'dark-blue'), 'dark-blue', styling);
        expect(blue.getTextColor('value', 20, 500)).toBe(CORE_LIGHT_TEXT);
        expect(blue.getTextColor('name', 12, 400)).toBe(CORE_LIGHT_TEXT);
        expect(blue.getTextColor('value', 30, 500)).toBe(theme.isDark ? color(theme, 'dark-blue') : CORE_LIGHT_TEXT);
      }
    });

    it('a shade, a fixed colour, and a shade of a colour without a name', () => {
      const strong = getRelativeShadeColor(LIGHT, 'green', 'stronger')!;
      const shaded = getTileStyling(LIGHT, color(LIGHT, 'green'), 'green', {
        textColor: { mode: 'shade', shade: 'stronger' },
      });
      expect(shaded.getTextColor('name', 14, 400)).toBe(strong);
      const fixed = getTileStyling(LIGHT, color(LIGHT, 'green'), 'green', {
        textColor: { mode: 'fixed', fixedColor: 'black' },
      });
      expect(fixed.getTextColor('value', 30, 500)).toBe(color(LIGHT, 'black'));
      const unnamed = getTileStyling(LIGHT, '#ff00ff', undefined, { textColor: { mode: 'shade', shade: 'stronger' } });
      expect(unnamed.getTextColor('value', 60, 500)).toBe(CORE_DARK_TEXT);
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
      custom: { backgroundColor: { mode: 'fixed', fixedColor: 'black' } },
    });
    expect(getStatTileStyling(LIGHT, a, { backgroundColor: { mode: 'value' } }).background).toBe(color(LIGHT, 'black'));
  });

  it('classic palette slots: named slots have shades, hex slots fall back to the value colour', () => {
    for (const theme of Object.values(THEMES)) {
      const [a] = tiles(theme, { color: { mode: FieldColorModeId.PaletteClassic } });
      const slot = theme.visualization.palette[0];
      const tile = getStatTileStyling(theme, a, { backgroundColor: { mode: 'shade', shade: 'stronger' } });
      expect(tile.background).toBe(
        slot.startsWith('#') ? a.display.color : getRelativeShadeColor(theme, slot, 'stronger')
      );
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
  });

  it('a transparent panel measures against the dashboard canvas, not the panel background', () => {
    // #767676 is 4.55:1 on the light panel background (#ffffff), 4.39:1 on its canvas (#fbfbfb)
    const fixed: StatStyling = { textColor: { mode: 'fixed', fixedColor: '#767676' } };
    const [tile] = getFieldDisplayValues({
      data: [createDataFrame({ fields: [{ name: 'v', type: FieldType.number, values: [1], config: {} }] })],
      reduceOptions: { values: false, calcs: [ReducerID.lastNotNull] },
      fieldConfig: { defaults: {}, overrides: [] },
      replaceVariables: (v) => v,
      theme: LIGHT,
    });
    expect(getStatTileStyling(LIGHT, tile, fixed).getTextColor('name', 14, 400)).toBe('#767676');
    expect(getStatTileStyling(LIGHT, tile, fixed, true).getTextColor('name', 14, 400)).toBe(CORE_DARK_TEXT);
    // #808080 is 4.36:1 on the dark panel background (#181b1f), 4.75:1 on its canvas (#111217)
    const grey: StatStyling = { textColor: { mode: 'fixed', fixedColor: '#808080' } };
    expect(getStatTileStyling(DARK, tile, grey).getTextColor('name', 14, 400)).toBe(CORE_LIGHT_TEXT);
    expect(getStatTileStyling(DARK, tile, grey, true).getTextColor('name', 14, 400)).toBe('#808080');
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

    it('both set; Same as text is the text colour after its contrast fallback', () => {
      const s = sparkline({ sparklineColor: { mode: 'text' }, sparklineFillOpacity: 10, sparklineLineOpacity: 50 });
      expect(s).toEqual({ lineColor: 'rgba(1, 2, 3, 0.5)', fillColor: 'rgba(1, 2, 3, 0.1)', lineWidth: 1 });
    });
  });

  it('on Background Value the unset sparkline is visibly different from the tile (not the value colour)', () => {
    const s = getTileStyling(LIGHT, green, 'green', { backgroundColor: { mode: 'value' } }).getSparkline(undefined);
    expect(tinycolor.equals(s.lineColor, green)).toBe(false);
  });
});
