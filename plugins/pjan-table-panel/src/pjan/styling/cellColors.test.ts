import { cache } from '@emotion/css';

import {
  FALLBACK_COLOR,
  type Field,
  fieldColorModeRegistry,
  FieldColorModeId,
  FieldType,
  getDisplayProcessor,
  type GrafanaTheme2,
  MappingType,
  ThresholdsMode,
} from '@grafana/data';
import { TableCellBackgroundDisplayMode, TableCellDisplayMode } from '@grafana/schema';
import { getTextColorForBackground } from '@grafana/ui';
import { makeField, THEMES } from '@pjan/grafana-styling/src/testdata/themes';

import {
  getCellActionStyles,
  getGridStyles,
  getLinkStyles,
  getTooltipStyles,
} from '../../packages/grafana-ui/src/components/Table/TableNG/styles';
import {
  getApplyToRowBgFn,
  getCellColorInlineStylesFactory,
} from '../../packages/grafana-ui/src/components/Table/TableNG/utils';
import { type TableCellOptions } from '../../packages/grafana-ui/src/components/Table/types';

import {
  getCellColorsFactory,
  getFillStops,
  getGridBackground,
  getPillTextColorFn,
  getRowFill,
  getTextFont,
  getTextOnFill,
  getTooltipBackground,
} from './cellColors';
import { type FieldStyling } from './options';

const LIGHT = THEMES['Grafana light'];
const DARK = THEMES['Grafana dark'];

// Expected colours are hand-computed, separately from the shared package (job tmp table-plan/build1/oracle.py,
// oracle_b1.py and oracle6.py): Grafana's luminance rounded to 3 digits, contrast (L1 + 0.05) / (L2 + 0.05), 1 % sRGB
// steps from the start colour towards the theme's page colour (background.canvas) or text.maxContrast, the first
// reaching 4.5:1 (else 4.2:1, else the extreme with the higher contrast); tinycolor's darken and spin for the gradient
// start; d3's B-spline for continuous schemes.
// Grafana light: green #56A64B, red #E02F44, canvas #fbfbfb, primary #ffffff, maxContrast #000000.
// Grafana dark: green #73BF69, red #F2495C, blue #5794F2, canvas #111217, primary #181b1f, maxContrast #ffffff.

const AUTOMATIC = { mode: 'automatic' } as const;
const SOFT = { mode: 'shade', shade: 'soft' } as const;
const STRONGER = { mode: 'shade', shade: 'stronger' } as const;
const BASIC = { type: TableCellDisplayMode.ColorBackground, mode: TableCellBackgroundDisplayMode.Basic } as const;
const GRADIENT = { type: TableCellDisplayMode.ColorBackground, mode: TableCellBackgroundDisplayMode.Gradient } as const;
const COLOR_TEXT = { type: TableCellDisplayMode.ColorText } as const;

const TRAFFIC = {
  mode: ThresholdsMode.Absolute,
  steps: [
    { value: -Infinity, color: 'green' },
    { value: 50, color: 'red' },
  ],
};
const only = (color: string) => ({ ...TRAFFIC, steps: [{ value: -Infinity, color }] });

/** A number column with green below 50 and red from 50, and its cell type and styling. */
const numberField = (theme: GrafanaTheme2, cellOptions: TableCellOptions, styling?: FieldStyling, steps = TRAFFIC) =>
  makeField(theme, {
    name: 'value',
    type: FieldType.number,
    values: [10, 90],
    config: { thresholds: steps, custom: { cellOptions, ...(styling ? { styling } : {}) } },
  });

/** Core's styles and the plugin's for one value (index 0 green, 1 red) of a field. */
function styles(theme: GrafanaTheme2, field: Field, index = 0, transparent = false) {
  const cellOptions = field.config.custom.cellOptions;
  const displayValue = field.display!(field.values[index]);
  const core = getCellColorInlineStylesFactory(theme)(cellOptions, displayValue, false);
  const plugin = getCellColorInlineStylesFactory(theme, getGridBackground(theme, transparent))(
    cellOptions,
    displayValue,
    false,
    field
  );
  return { core, plugin };
}

// The serialised CSS Emotion registered for a class name
const cssOf = (className: string) => cache.registered[className.split(' ').find((c) => cache.registered[c])!];

describe('the table background', () => {
  it.each([false, true])('is getGridStyles’ --rdg-background-color (transparent %s)', (transparent) => {
    for (const theme of Object.values(THEMES)) {
      const background = getGridBackground(theme, transparent);
      expect(cssOf(getGridStyles(theme, false, transparent).grid)).toContain(`--rdg-background-color:${background};`);
    }
  });

  it.each([false, true])('follows visualDesignRefresh as getGridStyles does (transparent %s)', (transparent) => {
    const distinct: GrafanaTheme2 = {
      ...LIGHT,
      flags: { visualDesignRefresh: true },
      colors: {
        ...LIGHT.colors,
        background: { ...LIGHT.colors.background, canvas: '#010101', primary: '#020202', page: '#030303' },
      },
      components: { ...LIGHT.components, panel: { ...LIGHT.components.panel, background: '#040404' } },
    };
    const background = getGridBackground(distinct, transparent);
    expect(background).toBe(transparent ? '#030303' : '#040404');
    expect(cssOf(getGridStyles(distinct, false, transparent).grid)).toContain(`--rdg-background-color:${background};`);
  });

  it('Tooltip from field’s popover is drawn on getTooltipStyles’ tooltipWrapper background', () => {
    for (const theme of Object.values(THEMES)) {
      expect(cssOf(getTooltipStyles(theme, 'left').tooltipWrapper)).toContain(
        `background:${getTooltipBackground(theme)};`
      );
    }
  });
});

describe('core styles the options rely on (documented in UPSTREAM.md)', () => {
  it('links in cells that can be coloured inherit the cell’s text colour, so they follow Text color', () => {
    expect(cssOf(getLinkStyles(LIGHT, true))).toMatch(/a\{[^}]*color:inherit;/);
    expect(cssOf(getLinkStyles(LIGHT, false))).toContain(`color:${LIGHT.colors.text.link};`);
  });

  it('the cell-action buttons (inspect, filter) keep their own backdrop and theme text', () => {
    for (const theme of [LIGHT, DARK]) {
      const css = cssOf(getCellActionStyles(theme, 'left'));
      expect(css).toContain(`color:${theme.colors.text.primary};`);
      expect(css).toContain(theme.isDark ? 'background:rgba(0, 0, 0, 0.7);' : 'background:rgba(255, 255, 255, 0.7);');
    }
  });
});

describe('fonts measured for Automatic', () => {
  it('cells at 14 px and pills at 12 px, regular: both need 4.5:1', () => {
    const field = numberField(LIGHT, BASIC);
    expect(getTextFont(LIGHT, 'cell', field)).toEqual({ size: 14, weight: 400 });
    expect(getTextFont(LIGHT, 'pill', field)).toEqual({ size: 12, weight: 400 });
  });

  it('the measurement takes the font it is given (where Text weight will plug in)', () => {
    const fill = { stops: ['#56A64B'], drawnByPlugin: true };
    const at = (size: number, weight: number) =>
      getTextOnFill(LIGHT, undefined, '#56A64B', 'green', fill, { size, weight }, '#ffffff');
    expect(at(14, 400)).toBe('rgb(27,51,23)'); // 4.5:1
    expect(at(12, 400)).toBe('rgb(27,51,23)');
    expect(at(18.66, 700)).not.toBe(at(18.66, 400)); // large text from 18.66 px bold: 3:1
    expect(at(24, 400)).toBe(at(18.66, 700));
  });
});

describe('nothing set: core, exactly', () => {
  it.each([
    ['unset', undefined],
    ['an empty styling object', {}],
    ['an incomplete fixed colour', { textColor: { mode: 'fixed' } }],
    ['an unknown mode', { textColor: { mode: 'state' } }],
    ['Background color Value (not one of its modes)', { backgroundColor: { mode: 'value' } }],
    ['Background color without a shade', { backgroundColor: { mode: 'shade' } }],
  ] as Array<[string, FieldStyling | undefined]>)('with %s the styles equal core’s', (_, styling) => {
    for (const theme of Object.values(THEMES)) {
      for (const cellOptions of [BASIC, GRADIENT, COLOR_TEXT, { type: TableCellDisplayMode.Auto }] as const) {
        for (const index of [0, 1]) {
          const { core, plugin } = styles(theme, numberField(theme, cellOptions, styling), index);
          expect(plugin).toEqual(core);
        }
      }
    }
  });

  it('unset, the hook returns core’s styles object itself', () => {
    const hook = getCellColorsFactory(LIGHT, '#ffffff', (c) => c);
    const coreStyles = { color: 'rgb(247, 248, 250)', background: '#56A64B' };
    expect(hook(coreStyles, BASIC, '#56A64B', numberField(LIGHT, BASIC))).toBe(coreStyles);
    expect(hook(coreStyles, BASIC, '#56A64B', numberField(LIGHT, BASIC, {}))).toBe(coreStyles);
  });

  it('the factory without a field (core’s own calls and the copied tests) is core’s', () => {
    const field = numberField(LIGHT, BASIC, { textColor: AUTOMATIC, backgroundColor: SOFT });
    const displayValue = field.display!(10);
    expect(getCellColorInlineStylesFactory(LIGHT, '#ffffff')(BASIC, displayValue, false)).toEqual(
      getCellColorInlineStylesFactory(LIGHT)(BASIC, displayValue, false)
    );
  });

  it('does nothing on other cell types, set or not', () => {
    for (const type of [TableCellDisplayMode.Auto, TableCellDisplayMode.Pill, TableCellDisplayMode.JSONView]) {
      const { core, plugin } = styles(
        LIGHT,
        numberField(LIGHT, { type } as TableCellOptions, { textColor: AUTOMATIC, backgroundColor: SOFT })
      );
      expect(plugin).toEqual(core);
      expect(plugin).toEqual({});
    }
  });
});

describe('Text color on Colored background', () => {
  it('Automatic on a basic fill: the first readable colour of the fill’s hue (hand-computed)', () => {
    // green: 69 % towards black, 4.52:1; red: 95 %, 4.57:1
    expect(styles(LIGHT, numberField(LIGHT, BASIC, { textColor: AUTOMATIC }), 0).plugin.color).toBe('rgb(27,51,23)');
    expect(styles(LIGHT, numberField(LIGHT, BASIC, { textColor: AUTOMATIC }), 1).plugin.color).toBe('rgb(11,2,3)');
    // dark green: 70 % towards the canvas, 4.60:1
    expect(styles(DARK, numberField(DARK, BASIC, { textColor: AUTOMATIC }), 0).plugin.color).toBe('rgb(46,70,48)');
    // core: near-white by brightness (green's is 131.7, below 180); the fill is core's
    const { core, plugin } = styles(LIGHT, numberField(LIGHT, BASIC, { textColor: AUTOMATIC }), 0);
    expect(core.color).toBe('rgb(247, 248, 250)');
    expect(plugin.background).toBe(core.background);
  });

  it('Automatic on a gradient: every step measured against both stops, the worse counts (hand-computed)', () => {
    // Grafana light green: stops #56A64B and rgb(98,182,94) (lightened 7, spun 5); the darker stop decides
    const light = styles(LIGHT, numberField(LIGHT, GRADIENT, { textColor: AUTOMATIC }), 0);
    expect(light.core.background).toBe('linear-gradient(120deg, rgb(98, 182, 94), #56A64B)');
    expect(light.plugin.background).toBe(light.core.background);
    expect(light.plugin.color).toBe('rgb(27,51,23)');
    // Grafana dark green: stops #73BF69 and rgb(77,172,73) (darkened 10): 78 % towards the canvas, 4.52:1 on the
    // darker stop (on the green alone: rgb(46,70,48), 3.59:1 on the darker stop)
    const dark = styles(DARK, numberField(DARK, GRADIENT, { textColor: AUTOMATIC }), 0);
    expect(dark.core.background).toBe('linear-gradient(120deg, rgb(77, 172, 73), #73BF69)');
    expect(dark.plugin.color).toBe('rgb(37,53,39)');
    // Grafana dark blue: no step reaches 4.2:1 on both stops; the canvas has the higher lowest contrast, 3.73:1
    expect(styles(DARK, numberField(DARK, GRADIENT, { textColor: AUTOMATIC }, only('blue')), 0).plugin.color).toBe(
      'rgb(17,18,23)'
    );
  });

  it('Value, a shade and Fixed are drawn as chosen, on basic and gradient fills alike', () => {
    for (const cellOptions of [BASIC, GRADIENT]) {
      const color = (textColor: FieldStyling['textColor']) =>
        styles(LIGHT, numberField(LIGHT, cellOptions, { textColor }), 0).plugin.color;
      expect(color({ mode: 'value' })).toBe('#56A64B');
      // Stronger: the shade with the most contrast with the panel background (white): dark-green
      expect(color(STRONGER)).toBe('#19730E');
      expect(color({ mode: 'shade', shade: 'softer' })).toBe('#96D98D'); // super-light-green
      expect(color({ mode: 'fixed', fixedColor: 'purple' })).toBe('#A352CC');
      expect(color({ mode: 'fixed', fixedColor: '#123456' })).toBe('#123456');
    }
    // in dark, Stronger is the lightest shade: super-light-green
    expect(styles(DARK, numberField(DARK, BASIC, { textColor: STRONGER }), 0).plugin.color).toBe('#C8F2C2');
  });

  it('colours without a name: the nearest hue’s shades; without a hue, a shade is Automatic', () => {
    // #7EB26D (Grafana's first classic colour) is nearest to the green hue in Grafana light
    expect(styles(LIGHT, numberField(LIGHT, BASIC, { textColor: STRONGER }, only('#7EB26D')), 0).plugin.color).toBe(
      '#19730E'
    );
    // a gray hex has no hue in Grafana's stock themes: 81 % towards black (hand-computed)
    expect(styles(LIGHT, numberField(LIGHT, BASIC, { textColor: STRONGER }, only('#808080')), 0).plugin.color).toBe(
      'rgb(24,24,24)'
    );
  });

  it('a transparent cell on a coloured row gets no text colour, so it keeps the row’s, as core', () => {
    const field = numberField(LIGHT, BASIC, { textColor: AUTOMATIC, backgroundColor: SOFT }, only('transparent'));
    const displayValue = field.display!(10);
    expect(getCellColorInlineStylesFactory(LIGHT, '#ffffff')(BASIC, displayValue, true, field)).toEqual({});
  });
});

describe('Background color', () => {
  const bg = (
    theme: GrafanaTheme2,
    backgroundColor: FieldStyling['backgroundColor'],
    textColor?: FieldStyling['textColor'],
    cellOptions: TableCellOptions = BASIC,
    steps = TRAFFIC,
    index = 0
  ) => styles(theme, numberField(theme, cellOptions, { backgroundColor, textColor }, steps), index).plugin;

  it('basic: a shade of the value’s colour, ranked by contrast with the panel background; unset text is Automatic on it (hand-computed)', () => {
    // Grafana light greens, softer to stronger: super-light, light, base, semi-dark, dark
    expect(bg(LIGHT, { mode: 'shade', shade: 'softer' })).toEqual({ background: '#96D98D', color: 'rgb(63,91,59)' });
    expect(bg(LIGHT, SOFT)).toEqual({ background: '#73BF69', color: 'rgb(43,71,39)' });
    expect(bg(LIGHT, { mode: 'shade', shade: 'base' })).toEqual({ background: '#56A64B', color: 'rgb(27,51,23)' });
    expect(bg(LIGHT, { mode: 'shade', shade: 'strong' })).toEqual({ background: '#37872D', color: 'rgb(2,5,2)' });
    expect(bg(LIGHT, STRONGER)).toEqual({ background: '#19730E', color: 'rgb(213,228,211)' });
    // Grafana dark: Soft is semi-dark-green, 79 % towards the canvas; Stronger super-light-green, 60 %
    expect(bg(DARK, SOFT)).toEqual({ background: '#56A64B', color: 'rgb(31,49,34)' });
    expect(bg(DARK, STRONGER)).toEqual({ background: '#C8F2C2', color: 'rgb(90,108,91)' });
  });

  it('basic: a fixed colour, drawn as chosen; unset text Automatic on it', () => {
    expect(bg(LIGHT, { mode: 'fixed', fixedColor: 'blue' })).toEqual({ background: '#3274D9', color: 'rgb(2,5,9)' });
    expect(bg(DARK, { mode: 'fixed', fixedColor: 'blue' })).toEqual({ background: '#5794F2', color: 'rgb(32,45,69)' });
  });

  it('gradient (variant B): a shade keeps core’s gradient, built from the shaded colour; Automatic on both stops (hand-computed)', () => {
    // Grafana light: Soft green #73BF69, start lightened 7 and spun 5: rgb(132, 202, 130); 63 % towards black
    expect(bg(LIGHT, SOFT, undefined, GRADIENT)).toEqual({
      background: 'linear-gradient(120deg, rgb(132, 202, 130), #73BF69)',
      color: 'rgb(43,71,39)',
    });
    // Soft red #F2495C, start rgb(244, 106, 110): 75 % towards black
    expect(bg(LIGHT, SOFT, undefined, GRADIENT, TRAFFIC, 1)).toEqual({
      background: 'linear-gradient(120deg, rgb(244, 106, 110), #F2495C)',
      color: 'rgb(61,18,23)',
    });
    // Stronger green #19730E, start rgb(21, 147, 18): no step reaches 4.2:1 on both stops, the page colour has the
    // higher lowest contrast (3.89:1)
    expect(bg(LIGHT, STRONGER, undefined, GRADIENT)).toEqual({
      background: 'linear-gradient(120deg, rgb(21, 147, 18), #19730E)',
      color: 'rgb(251,251,251)',
    });
    // Grafana dark: Soft green #56A64B, start darkened 10: rgb(62, 131, 59); the canvas (#111217), 4.04:1
    expect(bg(DARK, SOFT, undefined, GRADIENT)).toEqual({
      background: 'linear-gradient(120deg, rgb(62, 131, 59), #56A64B)',
      color: 'rgb(17,18,23)',
    });
    // Stronger #C8F2C2, start rgb(155, 233, 152): 65 % towards the canvas, 4.62:1 on the darker stop
    expect(bg(DARK, STRONGER, undefined, GRADIENT)).toEqual({
      background: 'linear-gradient(120deg, rgb(155, 233, 152), #C8F2C2)',
      color: 'rgb(81,96,83)',
    });
  });

  it('gradient: the gradient is core’s rule, whatever the colour (core’s own start colour of the shade)', () => {
    // Background color Base is the value's own colour: the same gradient as core's, the text Automatic on it
    const base = styles(LIGHT, numberField(LIGHT, GRADIENT, { backgroundColor: { mode: 'shade', shade: 'base' } }));
    expect(base.plugin.background).toBe(base.core.background);
    expect(base.plugin.color).toBe('rgb(27,51,23)');
  });

  it('gradient: Fixed doesn’t apply (core’s gradient and text, as unset); with Text color set, that text on core’s gradient', () => {
    const fixed = { mode: 'fixed', fixedColor: 'blue' } as const;
    for (const theme of [LIGHT, DARK]) {
      const unset = styles(theme, numberField(theme, GRADIENT, { backgroundColor: fixed }));
      expect(unset.plugin).toEqual(unset.core);
    }
    const withText = styles(LIGHT, numberField(LIGHT, GRADIENT, { backgroundColor: fixed, textColor: AUTOMATIC }));
    expect(withText.plugin).toEqual({ background: withText.core.background, color: 'rgb(27,51,23)' });
  });

  it('with Text color set, the text is drawn as chosen on the plugin’s fill', () => {
    expect(bg(LIGHT, SOFT, STRONGER).color).toBe('#19730E');
    expect(bg(LIGHT, SOFT, { mode: 'value' }).color).toBe('#56A64B');
    expect(bg(LIGHT, SOFT, AUTOMATIC).color).toBe('rgb(43,71,39)');
    expect(bg(LIGHT, SOFT, { mode: 'fixed', fixedColor: 'red' }).color).toBe('#E02F44');
    expect(bg(LIGHT, SOFT, STRONGER, GRADIENT).color).toBe('#19730E');
  });

  it('colours without a name: the nearest hue’s shade; without a hue, the value’s colour (Stat plus’s rule)', () => {
    expect(bg(LIGHT, STRONGER, undefined, BASIC, only('#7EB26D')).background).toBe('#19730E');
    // a gray hex has no hue in Grafana's stock themes: the fill is the value's colour, the text Automatic on it
    expect(bg(LIGHT, STRONGER, undefined, BASIC, only('#808080'))).toEqual({
      background: '#808080',
      color: 'rgb(24,24,24)',
    });
  });

  it('does nothing on Colored text, Pill and Auto cells', () => {
    for (const cellOptions of [COLOR_TEXT, { type: TableCellDisplayMode.Pill }, { type: TableCellDisplayMode.Auto }]) {
      const { core, plugin } = styles(
        LIGHT,
        numberField(LIGHT, cellOptions as TableCellOptions, { backgroundColor: SOFT })
      );
      expect(plugin).toEqual(core);
    }
  });
});

describe('Apply to entire row', () => {
  const row = (theme: GrafanaTheme2, styling?: FieldStyling, mode = TableCellBackgroundDisplayMode.Basic) => {
    const rowField = numberField(
      theme,
      { type: TableCellDisplayMode.ColorBackground, mode, applyToRow: true },
      styling
    );
    const other = numberField(theme, { type: TableCellDisplayMode.Auto }, { textColor: { mode: 'value' } });
    const plugin = getApplyToRowBgFn([other, rowField], getCellColorInlineStylesFactory(theme, '#ffffff'))!;
    const core = getApplyToRowBgFn([other, rowField], getCellColorInlineStylesFactory(theme))!;
    return { plugin: plugin(0), core: core(0) };
  };

  it('unset on the field that colours the row: core’s row, whatever other fields set', () => {
    const { core, plugin } = row(LIGHT);
    expect(plugin).toEqual(core);
    expect(plugin.color).toBe('rgb(247, 248, 250)');
  });

  it('the row’s text follows the Text color of the field that colours the row', () => {
    expect(row(LIGHT, { textColor: AUTOMATIC }).plugin).toEqual({ color: 'rgb(27,51,23)', background: '#56A64B' });
  });

  it('its Background color fills the row (basic: solid; gradient: the shaded gradient), with Automatic text', () => {
    expect(row(LIGHT, { backgroundColor: SOFT }).plugin).toEqual({ background: '#73BF69', color: 'rgb(43,71,39)' });
    expect(row(LIGHT, { backgroundColor: SOFT }, TableCellBackgroundDisplayMode.Gradient).plugin).toEqual({
      background: 'linear-gradient(120deg, rgb(132, 202, 130), #73BF69)',
      color: 'rgb(43,71,39)',
    });
  });
});

describe('Text color on Colored text', () => {
  it('Automatic starts from the value’s colour, against the table background (hand-computed)', () => {
    // green on white: 21 % towards black, 4.61:1; red on white already reaches 4.51:1, so it stays
    expect(styles(LIGHT, numberField(LIGHT, COLOR_TEXT, { textColor: AUTOMATIC }), 0).plugin.color).toBe(
      'rgb(68,131,59)'
    );
    expect(styles(LIGHT, numberField(LIGHT, COLOR_TEXT, { textColor: AUTOMATIC }), 1).plugin.color).toBe(
      'rgb(224,47,68)'
    );
    // dark green on #181b1f already reaches 7.69:1
    expect(styles(DARK, numberField(DARK, COLOR_TEXT, { textColor: AUTOMATIC }), 0).plugin.color).toBe(
      'rgb(115,191,105)'
    );
    expect(styles(LIGHT, numberField(LIGHT, COLOR_TEXT), 0).core.color).toBe('#56A64B');
  });

  it('a transparent panel: against the dashboard canvas the table shows (hand-computed)', () => {
    // green on #fbfbfb: 22 % towards black, 4.57:1; dark green on #111217 already reaches 8.38:1
    expect(styles(LIGHT, numberField(LIGHT, COLOR_TEXT, { textColor: AUTOMATIC }), 0, true).plugin.color).toBe(
      'rgb(67,129,59)'
    );
    expect(styles(DARK, numberField(DARK, COLOR_TEXT, { textColor: AUTOMATIC }), 0, true).plugin.color).toBe(
      'rgb(115,191,105)'
    );
  });

  it('Value, a shade and Fixed as chosen; Background color doesn’t apply', () => {
    const color = (styling: FieldStyling) => styles(LIGHT, numberField(LIGHT, COLOR_TEXT, styling), 0).plugin;
    expect(color({ textColor: { mode: 'value' } })).toEqual({ color: '#56A64B' });
    expect(color({ textColor: STRONGER, backgroundColor: SOFT })).toEqual({ color: '#19730E' });
    expect(color({ textColor: { mode: 'fixed', fixedColor: 'purple' } })).toEqual({ color: '#A352CC' });
  });

  it('`text` and `transparent` steps: theme text stays, a transparent colour becomes readable gray', () => {
    const color = (step: string, textColor: FieldStyling['textColor'], transparent = false) =>
      styles(LIGHT, numberField(LIGHT, COLOR_TEXT, { textColor }, only(step)), 0, transparent).plugin.color;
    expect(color('text', AUTOMATIC)).toBe('rgb(36,41,46)');
    // 'rgba(255, 255, 255, 0)' composited over white: 54 % towards black, 4.6:1; over the canvas, the same
    expect(color('transparent', AUTOMATIC)).toBe('rgb(117,117,117)');
    expect(color('transparent', AUTOMATIC, true)).toBe('rgb(115,115,115)');
    // Grafana's special names have no shades: a shade is Automatic
    expect(color('transparent', STRONGER)).toBe('rgb(117,117,117)');
    expect(color('text', STRONGER)).toBe('rgb(36,41,46)');
  });

  it('Tooltip from field: against what it is drawn on, when given', () => {
    const field = numberField(LIGHT, COLOR_TEXT, { textColor: AUTOMATIC });
    const factory = getCellColorInlineStylesFactory(LIGHT, getGridBackground(LIGHT, true));
    const displayValue = field.display!(10);
    expect(factory(COLOR_TEXT, displayValue, false, field).color).toBe('rgb(67,129,59)'); // the canvas
    expect(factory(COLOR_TEXT, displayValue, false, field, getTooltipBackground(LIGHT)).color).toBe('rgb(68,131,59)');
  });
});

describe('the fill a row draws, for Colored text on it (Apply to entire row)', () => {
  it('reads the colours of the row’s background as the cell’s styles give it', () => {
    expect(getRowFill({})).toBeUndefined();
    expect(getRowFill({ background: '#56A64B', color: 'x' })).toBe('#56A64B');
    expect(getFillStops('#56A64B')).toEqual(['#56A64B']);
    expect(getFillStops('rgba(1, 2, 3, 0.5)')).toEqual(['rgba(1, 2, 3, 0.5)']);
    expect(getFillStops('linear-gradient(120deg, rgb(98, 182, 94), #56A64B)')).toEqual(['rgb(98, 182, 94)', '#56A64B']);
    expect(getFillStops('radial-gradient(red, blue)')).toBeUndefined();
  });

  it('reads core’s gradient and the plugin’s shaded gradient as the copied factory writes them', () => {
    const { core } = styles(DARK, numberField(DARK, GRADIENT), 0);
    expect(getFillStops(String(core.background))).toEqual(['rgb(77, 172, 73)', '#73BF69']);
    const { plugin } = styles(DARK, numberField(DARK, GRADIENT, { backgroundColor: SOFT }), 0);
    expect(getFillStops(String(plugin.background))).toEqual(['rgb(62, 131, 59)', '#56A64B']);
  });

  it('measures Colored text on the row’s fill as drawn: core’s basic or gradient, or the plugin’s (hand-computed)', () => {
    const textOn = (theme: GrafanaTheme2, rowFill: string | undefined) => {
      const field = numberField(theme, COLOR_TEXT, { textColor: AUTOMATIC });
      return getCellColorInlineStylesFactory(theme, getGridBackground(theme))(
        COLOR_TEXT,
        field.display!(90), // red
        true,
        field,
        rowFill
      ).color;
    };
    // Grafana light red (#E02F44): on white it stays; on the green row (#56A64B) 60 % towards black, 4.52:1; on a
    // plugin Soft row (#73BF69) 44 %, 4.60:1, and the same on its shaded gradient (the lighter start doesn't decide)
    expect(textOn(LIGHT, undefined)).toBe('rgb(224,47,68)');
    expect(textOn(LIGHT, '#56A64B')).toBe('rgb(90,19,27)');
    expect(textOn(LIGHT, '#73BF69')).toBe('rgb(125,26,38)');
    expect(textOn(LIGHT, 'linear-gradient(120deg, rgb(132, 202, 130), #73BF69)')).toBe('rgb(125,26,38)');
    // Grafana dark red (#F2495C) on the green row: basic 58 %, 4.55:1; gradient (both stops) 71 %, 4.52:1; on the
    // plugin's Soft row (#56A64B) 74 %, 4.52:1; on its shaded gradient no step reaches 4.2:1, the canvas (4.04:1)
    expect(textOn(DARK, '#73BF69')).toBe('rgb(112,41,52)');
    expect(textOn(DARK, 'linear-gradient(120deg, rgb(77, 172, 73), #73BF69)')).toBe('rgb(82,34,43)');
    expect(textOn(DARK, '#56A64B')).toBe('rgb(76,32,41)');
    expect(textOn(DARK, 'linear-gradient(120deg, rgb(62, 131, 59), #56A64B)')).toBe('rgb(17,18,23)');
  });

  it('unset Text color on a coloured row: core’s value colour, whatever the row', () => {
    const field = numberField(LIGHT, COLOR_TEXT);
    const factory = getCellColorInlineStylesFactory(LIGHT, '#ffffff');
    expect(factory(COLOR_TEXT, field.display!(90), true, field, '#56A64B').color).toBe('#E02F44');
  });
});

describe('continuous colour schemes (Green-Yellow-Red by value, field min 0 and max 100)', () => {
  // Hand-computed (oracle6.py, oracle_b1.py): the scheme's stops shaded by their own hue, interpolated with d3's
  // B-spline at the value's position; Automatic on the result
  const VALUES = [0, 25, 50, 75, 100];
  const EXPECTED = {
    light: {
      core: ['rgb(86, 166, 75)', 'rgb(160, 181, 46)', 'rgb(213, 172, 32)', 'rgb(229, 121, 42)', 'rgb(224, 47, 68)'],
      soft: ['rgb(115, 191, 105)', 'rgb(180, 203, 76)', 'rgb(226, 192, 61)', 'rgb(243, 144, 69)', 'rgb(242, 73, 92)'],
      softText: ['rgb(43,71,39)', 'rgb(74,83,31)', 'rgb(93,79,25)', 'rgb(90,53,26)', 'rgb(61,18,23)'],
      softStart: [
        'rgb(132, 202, 130)',
        'rgb(183, 211, 104)',
        'rgb(231, 214, 92)',
        'rgb(245, 176, 103)',
        'rgb(244, 106, 110)',
      ],
      softGradientText: ['rgb(43,71,39)', 'rgb(74,83,31)', 'rgb(93,79,25)', 'rgb(90,53,26)', 'rgb(61,18,23)'],
      stronger: ['rgb(25, 115, 14)', 'rgb(110, 132, 8)', 'rgb(169, 124, 6)', 'rgb(184, 76, 12)', 'rgb(173, 3, 23)'],
    },
    dark: {
      core: ['rgb(115, 191, 105)', 'rgb(180, 203, 76)', 'rgb(226, 192, 61)', 'rgb(243, 144, 69)', 'rgb(242, 73, 92)'],
      soft: ['rgb(86, 166, 75)', 'rgb(160, 181, 46)', 'rgb(213, 172, 32)', 'rgb(229, 121, 42)', 'rgb(224, 47, 68)'],
      softText: ['rgb(31,49,34)', 'rgb(60,67,30)', 'rgb(80,67,26)', 'rgb(64,41,27)', 'rgb(255,255,255)'],
      softStart: [
        'rgb(62, 131, 59)',
        'rgb(115, 140, 36)',
        'rgb(169, 148, 25)',
        'rgb(196, 111, 24)',
        'rgb(191, 29, 34)',
      ],
      softGradientText: ['rgb(17,18,23)', 'rgb(26,28,24)', 'rgb(50,44,25)', 'rgb(36,27,25)', 'rgb(255,255,255)'],
      stronger: [
        'rgb(200, 242, 194)',
        'rgb(226, 243, 175)',
        'rgb(246, 233, 164)',
        'rgb(254, 205, 166)',
        'rgb(255, 166, 176)',
      ],
    },
  };
  const themes = { light: LIGHT, dark: DARK } as const;

  const cells = (theme: GrafanaTheme2, cellOptions: TableCellOptions, styling?: FieldStyling) => {
    // Grafana builds a continuous scheme's interpolator once, from the stops of the first theme it is asked for, and
    // keeps it on its shared mode object (fieldColor.ts `getInterpolator`); a fresh session for this theme starts
    // without one (as the shared package's schemes.test.ts)
    const mode = fieldColorModeRegistry.get(FieldColorModeId.ContinuousGrYlRd) as unknown as { interpolator?: unknown };
    mode.interpolator = undefined;
    const field = makeField(theme, {
      name: 'cpu',
      type: FieldType.number,
      values: VALUES,
      config: {
        min: 0,
        max: 100,
        color: { mode: FieldColorModeId.ContinuousGrYlRd },
        custom: { cellOptions, ...(styling ? { styling } : {}) },
      },
    });
    const factory = getCellColorInlineStylesFactory(theme, getGridBackground(theme));
    return VALUES.map((v) => factory(cellOptions, field.display!(v), false, field));
  };

  describe.each(['light', 'dark'] as const)('%s', (mode) => {
    const theme = themes[mode];
    const want = EXPECTED[mode];

    it('core’s colours at 0, 0.25, 0.5, 0.75 and 1, unchanged with nothing set', () => {
      expect(cells(theme, BASIC).map((s) => s.background)).toEqual(want.core);
      expect(cells(theme, COLOR_TEXT, {}).map((s) => s.color)).toEqual(want.core);
    });

    it('Background color Soft, basic: the stops shaded and interpolated at each value’s position; Automatic on it', () => {
      const drawn = cells(theme, BASIC, { backgroundColor: SOFT });
      expect(drawn.map((s) => s.background)).toEqual(want.soft);
      expect(drawn.map((s) => s.color)).toEqual(want.softText);
    });

    it('Background color Soft, gradient: core’s gradient built from that colour; Automatic on both stops', () => {
      const drawn = cells(theme, GRADIENT, { backgroundColor: SOFT });
      expect(drawn.map((s) => s.background)).toEqual(
        want.soft.map((soft, i) => `linear-gradient(120deg, ${want.softStart[i]}, ${soft})`)
      );
      expect(drawn.map((s) => s.color)).toEqual(want.softGradientText);
    });

    it('Text color Stronger on Colored text and on a fill: the stops in the strongest shade, interpolated', () => {
      expect(cells(theme, COLOR_TEXT, { textColor: STRONGER }).map((s) => s.color)).toEqual(want.stronger);
      expect(cells(theme, BASIC, { textColor: STRONGER }).map((s) => s.color)).toEqual(want.stronger);
    });
  });

  it('Automatic on Colored text starts from the scheme’s colour itself (light, hand-computed)', () => {
    expect(cells(LIGHT, COLOR_TEXT, { textColor: AUTOMATIC }).map((s) => s.color)).toEqual([
      'rgb(68,131,59)',
      'rgb(110,125,32)',
      'rgb(143,115,21)',
      'rgb(181,96,33)',
      'rgb(224,47,68)',
    ]);
  });

  it('two columns with different schemes and the same value colour at the same position don’t share a cache entry', () => {
    // One factory (one table), two columns: Green-Yellow-Red and Blues, both Background color Soft, the same value colour
    // handed in at the same position; each must get its own scheme's shade
    const column = (mode: string) =>
      makeField(LIGHT, {
        name: mode,
        type: FieldType.number,
        values: [25],
        config: {
          min: 0,
          max: 100,
          color: { mode },
          custom: { cellOptions: BASIC, styling: { backgroundColor: SOFT } },
        },
      });
    const grylrd = column(FieldColorModeId.ContinuousGrYlRd);
    const blues = column(FieldColorModeId.ContinuousBlues);
    const core = { color: 'rgb(32, 34, 38)', background: 'rgb(160, 181, 46)' };
    const shared = getCellColorsFactory(LIGHT, '#ffffff', (c) => c);
    const first = shared(core, BASIC, 'rgb(160, 181, 46)', grylrd, undefined, 0.25);
    const second = shared(core, BASIC, 'rgb(160, 181, 46)', blues, undefined, 0.25);
    expect(first.background).toBe('rgb(180, 203, 76)'); // Soft Green-Yellow-Red at 0.25 (hand-computed)
    expect(second).toEqual(
      getCellColorsFactory(LIGHT, '#ffffff', (c) => c)(core, BASIC, 'rgb(160, 181, 46)', blues, undefined, 0.25)
    );
    expect(second.background).not.toBe(first.background);
  });

  it('an infinite value is the scheme’s end, as Grafana draws it', () => {
    const field = makeField(LIGHT, {
      name: 'cpu',
      type: FieldType.number,
      values: [Infinity],
      config: {
        min: 0,
        max: 100,
        color: { mode: FieldColorModeId.ContinuousGrYlRd },
        custom: { cellOptions: BASIC, styling: { backgroundColor: SOFT } },
      },
    });
    const displayValue = field.display!(Infinity);
    expect(displayValue.percent).toBe(Infinity);
    expect(getCellColorInlineStylesFactory(LIGHT, '#ffffff')(BASIC, displayValue, false, field).background).toBe(
      'rgb(242, 73, 92)' // Soft at 1 (hand-computed)
    );
  });

  it('a mapped value’s colour keeps its own name (no position): the shade of its hue', () => {
    const field = makeField(LIGHT, {
      name: 'cpu',
      type: FieldType.number,
      values: [50],
      config: {
        min: 0,
        max: 100,
        color: { mode: FieldColorModeId.ContinuousGrYlRd },
        mappings: [{ type: MappingType.ValueToText, options: { '50': { color: 'purple', index: 0 } } }],
        custom: { cellOptions: BASIC, styling: { backgroundColor: SOFT } },
      },
    });
    const displayValue = field.display!(50);
    expect(displayValue.percent).toBeUndefined();
    expect(getCellColorInlineStylesFactory(LIGHT, '#ffffff')(BASIC, displayValue, false, field).background).toBe(
      '#B877D9' // light-purple
    );
  });
});

describe('the cache is keyed on the theme', () => {
  it('the same colour and setting give each theme its own result', () => {
    const field = numberField(LIGHT, BASIC, { textColor: AUTOMATIC });
    const displayValue = { text: '10', numeric: 10, color: '#56A64B' };
    const light = getCellColorInlineStylesFactory(LIGHT, '#ffffff')(BASIC, displayValue, false, field);
    const dark = getCellColorInlineStylesFactory(DARK, '#181b1f')(BASIC, displayValue, false, field);
    expect(light.color).toBe('rgb(27,51,23)');
    expect(dark.color).not.toBe(light.color);
  });
});

describe('text on a fill (getTextOnFill), the path cells, rows and pills share', () => {
  const font = { size: 14, weight: 400 };
  it('unset: core’s text (undefined) on core’s fill, Automatic on a fill the plugin draws', () => {
    expect(
      getTextOnFill(LIGHT, undefined, '#56A64B', 'green', { stops: ['#56A64B'], drawnByPlugin: false }, font, '#ffffff')
    ).toBeUndefined();
    expect(
      getTextOnFill(LIGHT, undefined, '#56A64B', 'green', { stops: ['#73BF69'], drawnByPlugin: true }, font, '#ffffff')
    ).toBe('rgb(43,71,39)');
  });
});

describe('Text color on pills (getPillTextColorFn)', () => {
  const MAPPED = {
    type: MappingType.ValueToText,
    options: { up: { color: 'green', index: 0 }, down: { color: 'red', index: 1 } },
  } as const;

  /** A pill column, after render-hooks.tsx has replaced the colour config of a mapped pill field (as it does). */
  const pillField = (theme: GrafanaTheme2, styling?: FieldStyling, mapped = true) => {
    const field = makeField(theme, {
      name: 'status',
      type: FieldType.string,
      values: ['up', 'down'],
      config: {
        thresholds: TRAFFIC,
        color: { mode: FieldColorModeId.Thresholds },
        mappings: mapped ? [MAPPED] : [],
        custom: { cellOptions: { type: TableCellDisplayMode.Pill }, ...(styling ? { styling } : {}) },
      },
    });
    if (!mapped) {
      return field;
    }
    // render-hooks.tsx (copied): "make sure we use mappings exclusively if they exist"
    const replaced: Field = {
      ...field,
      config: {
        ...field.config,
        color: {
          ...field.config.color,
          mode: FieldColorModeId.Fixed,
          fixedColor: field.config.color?.fixedColor ?? FALLBACK_COLOR,
        },
      },
    };
    replaced.display = getDisplayProcessor({ field: replaced, theme });
    return replaced;
  };

  it('unset (or incomplete, or only Background color): core’s own function, the same one', () => {
    for (const styling of [undefined, {}, { textColor: { mode: 'shade' } }, { backgroundColor: SOFT }] as Array<
      FieldStyling | undefined
    >) {
      expect(getPillTextColorFn(getTextColorForBackground, pillField(LIGHT, styling), LIGHT, '#ffffff')).toBe(
        getTextColorForBackground
      );
    }
  });

  it('a mapped pill’s shade is of its mapping colour’s hue (the field’s colour config was replaced with Fixed)', () => {
    const field = pillField(LIGHT, { textColor: STRONGER });
    expect(field.display!('up').color).toBe('#56A64B'); // the mapping's green, not FALLBACK_COLOR
    const text = getPillTextColorFn(getTextColorForBackground, field, LIGHT, '#ffffff');
    expect(text('#56A64B')).toBe('#19730E'); // dark-green
    expect(text('#E02F44')).toBe('#AD0317'); // dark-red
  });

  it('Automatic on the pill’s fill at 12 px (hand-computed), Value, Fixed', () => {
    const text = (styling: FieldStyling, theme = LIGHT) =>
      getPillTextColorFn(getTextColorForBackground, pillField(theme, styling), theme, getGridBackground(theme));
    expect(text({ textColor: AUTOMATIC })('#56A64B')).toBe('rgb(27,51,23)');
    expect(text({ textColor: AUTOMATIC }, DARK)('#73BF69')).toBe('rgb(46,70,48)');
    expect(text({ textColor: { mode: 'value' } })('#56A64B')).toBe('#56A64B');
    expect(text({ textColor: { mode: 'fixed', fixedColor: 'blue' } })('#56A64B')).toBe('#3274D9');
  });

  it('string-hash pills (hex colours without a name) take their nearest hue’s shades', () => {
    const text = getPillTextColorFn(
      getTextColorForBackground,
      pillField(LIGHT, { textColor: STRONGER }, false),
      LIGHT,
      '#ffffff'
    );
    expect(text('#7EB26D')).toBe('#19730E'); // classic green: Grafana light's green hue
    expect(text('#808080')).toBe('rgb(24,24,24)'); // no hue: Automatic
  });

  it('a transparent pill: Automatic against the table background it shows', () => {
    const text = (background: string) =>
      getPillTextColorFn(getTextColorForBackground, pillField(LIGHT, { textColor: AUTOMATIC }), LIGHT, background);
    expect(text('#ffffff')('rgba(0,0,0,0)')).toBe('rgb(117,117,117)');
    expect(text('#fbfbfb')('rgba(0,0,0,0)')).toBe('rgb(115,115,115)');
  });

  it('is keyed on the theme: a function per theme, each with its own result', () => {
    const light = getPillTextColorFn(
      getTextColorForBackground,
      pillField(LIGHT, { textColor: AUTOMATIC }),
      LIGHT,
      '#ffffff'
    );
    const dark = getPillTextColorFn(
      getTextColorForBackground,
      pillField(DARK, { textColor: AUTOMATIC }),
      DARK,
      '#181b1f'
    );
    expect(light('#56A64B')).toBe('rgb(27,51,23)');
    expect(dark('#56A64B')).not.toBe(light('#56A64B'));
  });
});
