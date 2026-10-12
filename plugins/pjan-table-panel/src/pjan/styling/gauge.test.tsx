import { render } from '@testing-library/react';
import { type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import tinycolor from 'tinycolor2';

import {
  applyFieldOverrides,
  type DisplayValue,
  type Field,
  FieldColorModeId,
  type FieldConfig,
  FieldType,
  getDisplayProcessor,
  getFieldColorMode,
  type GrafanaTheme2,
  MappingType,
  type ThresholdsConfig,
  ThresholdsMode,
  toDataFrame,
  VizOrientation,
} from '@grafana/data';
import {
  BarGaugeDisplayMode,
  BarGaugeValueMode,
  TableCellBackgroundDisplayMode,
  TableCellDisplayMode,
} from '@grafana/schema';
import { BarGauge as GrafanaBarGauge, ThemeContext } from '@grafana/ui';
import { THEMES } from '@pjan/grafana-styling/src/testdata/themes';

import { BarGauge, getBarGradient } from '../../packages/grafana-ui/src/components/BarGauge/BarGauge';
import { BarGaugeCell } from '../../packages/grafana-ui/src/components/Table/TableNG/Cells/BarGaugeCell';
import { TableNG } from '../../packages/grafana-ui/src/components/Table/TableNG/TableNG';

import { createShadedColorMode, getGaugeProps, type GaugeProps, shadeThresholds } from './gauge';

// Gauge color (build 4): the resolver (`getGaugeProps`), the copied BarGauge's hook (`pjanColorMode`) and the copied
// BarGaugeCell as drawn (its markup, rendered with react-dom/server, which keeps gradients as written; jsdom's style
// parser would drop them). Expected colours are worked out by hand (job tmp table-plan/build4/oracle.py, from the themes'
// colours alone: Grafana's 3-digit luminance, the five shades ranked by contrast with the panel background, the nearest
// hue in OKLCH, d3's B-spline), separately from the shared package.

type ThemeName = 'Grafana light' | 'Grafana dark' | 'Atlas light' | 'Atlas dark';
type Shade = 'softer' | 'soft' | 'base' | 'strong' | 'stronger';
const THEME_NAMES: ThemeName[] = ['Grafana light', 'Grafana dark', 'Atlas light', 'Atlas dark'];
const SHADES: Shade[] = ['softer', 'soft', 'base', 'strong', 'stronger'];
// The positions (and values, from 0 to 100) Green-Yellow-Red is checked at
const POSITIONS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

interface Hand {
  steps: Record<Shade, Record<string, string>>;
  grylrd: Record<Shade | 'core', string[]>;
  hex: Record<string, { soft: string | null; stronger: string | null }>;
}

// Worked out by hand (oracle.py): green, yellow and red (and Atlas's lemon) in each shade; Green-Yellow-Red at POSITIONS,
// from the theme's own stops (core) and with its stops shaded; hex colours without a name in Soft and Stronger. (Core
// itself draws a scheme's value colours with the interpolator Grafana builds once per page, from the stops of the first
// theme it is asked for, so in this file only the first theme's core colours are its own: UPSTREAM.md, "Live theme
// switch". The plugin shades the stops of the theme it draws in.)
const HAND: Record<ThemeName, Hand> = {
  'Grafana light': {
    steps: {
      softer: { green: '#96D98D', yellow: '#FFEE52', red: '#FF7383' },
      soft: { green: '#73BF69', yellow: '#FADE2A', red: '#F2495C' },
      base: { green: '#56A64B', yellow: '#F2CC0C', red: '#E02F44' },
      strong: { green: '#37872D', yellow: '#E0B400', red: '#C4162A' },
      stronger: { green: '#19730E', yellow: '#CC9D00', red: '#AD0317' },
    },
    grylrd: {
      core: [
        'rgb(86, 166, 75)',
        'rgb(117, 173, 63)',
        'rgb(160, 181, 46)',
        'rgb(213, 172, 32)',
        'rgb(229, 121, 42)',
        'rgb(227, 78, 57)',
        'rgb(224, 47, 68)',
      ],
      softer: [
        'rgb(150, 217, 141)',
        'rgb(171, 221, 129)',
        'rgb(200, 225, 114)',
        'rgb(238, 214, 100)',
        'rgb(253, 174, 109)',
        'rgb(255, 139, 121)',
        'rgb(255, 115, 131)',
      ],
      soft: [
        'rgb(115, 191, 105)',
        'rgb(142, 197, 93)',
        'rgb(180, 203, 76)',
        'rgb(226, 192, 61)',
        'rgb(243, 144, 69)',
        'rgb(243, 103, 82)',
        'rgb(242, 73, 92)',
      ],
      base: [
        'rgb(86, 166, 75)',
        'rgb(117, 173, 63)',
        'rgb(160, 181, 46)',
        'rgb(213, 172, 32)',
        'rgb(229, 121, 42)',
        'rgb(227, 78, 57)',
        'rgb(224, 47, 68)',
      ],
      strong: [
        'rgb(55, 135, 45)',
        'rgb(89, 144, 36)',
        'rgb(135, 153, 24)',
        'rgb(191, 146, 15)',
        'rgb(206, 97, 23)',
        'rgb(201, 53, 34)',
        'rgb(196, 22, 42)',
      ],
      stronger: [
        'rgb(25, 115, 14)',
        'rgb(61, 123, 11)',
        'rgb(110, 132, 8)',
        'rgb(169, 124, 6)',
        'rgb(184, 76, 12)',
        'rgb(179, 34, 18)',
        'rgb(173, 3, 23)',
      ],
    },
    hex: {
      '#629E51': { soft: '#73BF69', stronger: '#19730E' },
      '#890F02': { soft: '#F2495C', stronger: '#AD0317' },
      '#008080': { soft: null, stronger: null },
    },
  },
  'Grafana dark': {
    steps: {
      softer: { green: '#37872D', yellow: '#E0B400', red: '#C4162A' },
      soft: { green: '#56A64B', yellow: '#F2CC0C', red: '#E02F44' },
      base: { green: '#73BF69', yellow: '#FADE2A', red: '#F2495C' },
      strong: { green: '#96D98D', yellow: '#FFEE52', red: '#FF7383' },
      stronger: { green: '#C8F2C2', yellow: '#FFF899', red: '#FFA6B0' },
    },
    grylrd: {
      core: [
        'rgb(115, 191, 105)',
        'rgb(142, 197, 93)',
        'rgb(180, 203, 76)',
        'rgb(226, 192, 61)',
        'rgb(243, 144, 69)',
        'rgb(243, 103, 82)',
        'rgb(242, 73, 92)',
      ],
      softer: [
        'rgb(55, 135, 45)',
        'rgb(89, 144, 36)',
        'rgb(135, 153, 24)',
        'rgb(191, 146, 15)',
        'rgb(206, 97, 23)',
        'rgb(201, 53, 34)',
        'rgb(196, 22, 42)',
      ],
      soft: [
        'rgb(86, 166, 75)',
        'rgb(117, 173, 63)',
        'rgb(160, 181, 46)',
        'rgb(213, 172, 32)',
        'rgb(229, 121, 42)',
        'rgb(227, 78, 57)',
        'rgb(224, 47, 68)',
      ],
      base: [
        'rgb(115, 191, 105)',
        'rgb(142, 197, 93)',
        'rgb(180, 203, 76)',
        'rgb(226, 192, 61)',
        'rgb(243, 144, 69)',
        'rgb(243, 103, 82)',
        'rgb(242, 73, 92)',
      ],
      strong: [
        'rgb(150, 217, 141)',
        'rgb(171, 221, 129)',
        'rgb(200, 225, 114)',
        'rgb(238, 214, 100)',
        'rgb(253, 174, 109)',
        'rgb(255, 139, 121)',
        'rgb(255, 115, 131)',
      ],
      stronger: [
        'rgb(200, 242, 194)',
        'rgb(211, 243, 186)',
        'rgb(226, 243, 175)',
        'rgb(246, 233, 164)',
        'rgb(254, 205, 166)',
        'rgb(255, 182, 171)',
        'rgb(255, 166, 176)',
      ],
    },
    hex: {
      '#629E51': { soft: '#56A64B', stronger: '#C8F2C2' },
      '#890F02': { soft: '#E02F44', stronger: '#FFA6B0' },
      '#008080': { soft: null, stronger: null },
    },
  },
  'Atlas light': {
    steps: {
      softer: { green: '#bfe3c7', yellow: '#f4d5b2', red: '#fecfca', lemon: '#e6dbae' },
      soft: { green: '#9bd5a8', yellow: '#eebf87', red: '#fcb6ae', lemon: '#dac780' },
      base: { green: '#6fc686', yellow: '#eaa74f', red: '#ff978d', lemon: '#ceb346' },
      strong: { green: '#46b469', yellow: '#d59236', red: '#ff736a', lemon: '#b99e29' },
      stronger: { green: '#3c6639', yellow: '#7c541e', red: '#8c4943', lemon: '#6c5c15' },
    },
    grylrd: {
      core: [
        'rgb(111, 198, 134)',
        'rgb(135, 192, 123)',
        'rgb(170, 183, 109)',
        'rgb(217, 170, 99)',
        'rgb(242, 159, 112)',
        'rgb(251, 154, 129)',
        'rgb(255, 151, 141)',
      ],
      softer: [
        'rgb(191, 227, 199)',
        'rgb(202, 224, 195)',
        'rgb(217, 220, 189)',
        'rgb(237, 214, 186)',
        'rgb(248, 210, 191)',
        'rgb(252, 208, 197)',
        'rgb(254, 207, 202)',
      ],
      soft: [
        'rgb(155, 213, 168)',
        'rgb(172, 209, 161)',
        'rgb(195, 202, 153)',
        'rgb(227, 193, 147)',
        'rgb(244, 187, 156)',
        'rgb(249, 184, 166)',
        'rgb(252, 182, 174)',
      ],
      base: [
        'rgb(111, 198, 134)',
        'rgb(135, 192, 123)',
        'rgb(170, 183, 109)',
        'rgb(217, 170, 99)',
        'rgb(242, 159, 112)',
        'rgb(251, 154, 129)',
        'rgb(255, 151, 141)',
      ],
      strong: [
        'rgb(70, 180, 105)',
        'rgb(98, 173, 95)',
        'rgb(139, 163, 82)',
        'rgb(196, 147, 71)',
        'rgb(232, 131, 82)',
        'rgb(246, 121, 96)',
        'rgb(255, 115, 106)',
      ],
      stronger: [
        'rgb(60, 102, 57)',
        'rgb(73, 98, 52)',
        'rgb(91, 93, 45)',
        'rgb(116, 85, 41)',
        'rgb(131, 79, 50)',
        'rgb(137, 75, 60)',
        'rgb(140, 73, 67)',
      ],
    },
    hex: {
      '#629E51': { soft: '#9bd5a8', stronger: '#3c6639' },
      '#890F02': { soft: '#fcb6ae', stronger: '#8c4943' },
      '#008080': { soft: null, stronger: null },
    },
  },
  'Atlas dark': {
    steps: {
      softer: { green: '#3c6639', yellow: '#7c541e', red: '#8c4943', lemon: '#6c5c15' },
      soft: { green: '#42834b', yellow: '#9d6b25', red: '#ba554e', lemon: '#88741b' },
      base: { green: '#439c5e', yellow: '#ba7f2d', red: '#ea5a53', lemon: '#a28a23' },
      strong: { green: '#46b469', yellow: '#d59236', red: '#ff736a', lemon: '#b99e29' },
      stronger: { green: '#bfe3c7', yellow: '#f4d5b2', red: '#fecfca', lemon: '#e6dbae' },
    },
    grylrd: {
      core: [
        'rgb(67, 156, 94)',
        'rgb(91, 150, 84)',
        'rgb(125, 141, 71)',
        'rgb(174, 126, 60)',
        'rgb(209, 108, 66)',
        'rgb(224, 97, 76)',
        'rgb(234, 90, 83)',
      ],
      softer: [
        'rgb(60, 102, 57)',
        'rgb(73, 98, 52)',
        'rgb(91, 93, 45)',
        'rgb(116, 85, 41)',
        'rgb(131, 79, 50)',
        'rgb(137, 75, 60)',
        'rgb(140, 73, 67)',
      ],
      soft: [
        'rgb(66, 131, 75)',
        'rgb(84, 126, 68)',
        'rgb(110, 119, 58)',
        'rgb(147, 107, 50)',
        'rgb(170, 96, 59)',
        'rgb(180, 89, 70)',
        'rgb(186, 85, 78)',
      ],
      base: [
        'rgb(67, 156, 94)',
        'rgb(91, 150, 84)',
        'rgb(125, 141, 71)',
        'rgb(174, 126, 60)',
        'rgb(209, 108, 66)',
        'rgb(224, 97, 76)',
        'rgb(234, 90, 83)',
      ],
      strong: [
        'rgb(70, 180, 105)',
        'rgb(98, 173, 95)',
        'rgb(139, 163, 82)',
        'rgb(196, 147, 71)',
        'rgb(232, 131, 82)',
        'rgb(246, 121, 96)',
        'rgb(255, 115, 106)',
      ],
      stronger: [
        'rgb(191, 227, 199)',
        'rgb(202, 224, 195)',
        'rgb(217, 220, 189)',
        'rgb(237, 214, 186)',
        'rgb(248, 210, 191)',
        'rgb(252, 208, 197)',
        'rgb(254, 207, 202)',
      ],
    },
    hex: {
      '#629E51': { soft: '#42834b', stronger: '#bfe3c7' },
      '#890F02': { soft: '#ba554e', stronger: '#fecfca' },
      '#008080': { soft: null, stronger: null },
    },
  },
};

// Viridis (Grafana's nine samples, no names) in Atlas, Soft: each sample in the Soft shade of its nearest hue (purple,
// violet, indigo, -, teal, teal, green, lime, lemon in light; the fourth cyan in dark), the top one lemon's; a sample no
// hue wins (light's fourth) stays as it is
const HAND_VIRIDIS_SOFT: Partial<Record<ThemeName, string[]>> = {
  'Atlas light': ['#e8b7ef', '#cfbefc', '#aec8ff', '#2c728e', '#7ad8c4', '#7ad8c4', '#9bd5a8', '#c3ce84', '#dac780'],
  'Atlas dark': ['#9c5ea6', '#8069b2', '#5273c0', '#037f9d', '#03846a', '#03846a', '#42834b', '#727b28', '#88741b'],
};

// Grafana's Green-Yellow-Red stops in each theme (green, yellow and red resolved): what its own mode keeps returning
const LIGHT_GRYLRD: Record<string, string[]> = {
  'Grafana light': ['#56A64B', '#F2CC0C', '#E02F44'],
  'Atlas light': ['#6fc686', '#eaa74f', '#ff978d'],
};
const DARK_GRYLRD: Record<string, string[]> = {
  'Grafana dark': ['#73BF69', '#FADE2A', '#F2495C'],
  'Atlas dark': ['#439c5e', '#ba7f2d', '#ea5a53'],
};

const shadeOf = (shade: Shade) => ({ mode: 'shade', shade });
const FIXED_PURPLE = { mode: 'fixed', fixedColor: 'purple' };
const MODES = [BarGaugeDisplayMode.Basic, BarGaugeDisplayMode.Gradient, BarGaugeDisplayMode.Lcd];
const VALUE_MODES = [BarGaugeValueMode.Color, BarGaugeValueMode.Text, BarGaugeValueMode.Hidden];

// green below 50, yellow from 50, red from 80
const TRAFFIC: ThresholdsConfig = {
  mode: ThresholdsMode.Absolute,
  steps: [
    { value: -Infinity, color: 'green' },
    { value: 50, color: 'yellow' },
    { value: 80, color: 'red' },
  ],
};

interface FieldSpec {
  values?: number[];
  thresholds?: ThresholdsConfig;
  color?: FieldConfig['color'];
  mappings?: FieldConfig['mappings'];
  styling?: object;
  mode?: BarGaugeDisplayMode;
  valueMode?: BarGaugeValueMode;
}

/** A gauge column as the table gets it: min 0 and max 100, Grafana's display processor for the theme. */
function gaugeField(theme: GrafanaTheme2, spec: FieldSpec = {}): Field {
  const field: Field = {
    name: 'gauge',
    type: FieldType.number,
    values: spec.values ?? [10, 60, 90],
    config: {
      min: 0,
      max: 100,
      thresholds: spec.thresholds ?? TRAFFIC,
      color: spec.color ?? { mode: FieldColorModeId.Thresholds },
      ...(spec.mappings ? { mappings: spec.mappings } : {}),
      custom: {
        cellOptions: {
          type: TableCellDisplayMode.Gauge,
          mode: spec.mode ?? BarGaugeDisplayMode.Gradient,
          valueDisplayMode: spec.valueMode ?? BarGaugeValueMode.Color,
        },
        ...(spec.styling ? { styling: spec.styling } : {}),
      },
    },
    state: {},
  };
  field.display = getDisplayProcessor({ field, theme });
  return field;
}

/** What BarGaugeCell hands the hook: core's config (min, max, thresholds), display and value. */
const coreProps = (field: Field, value: number): GaugeProps => ({
  config: { ...field.config },
  display: field.display,
  value: field.display!(value),
});

const GRYLRD = { mode: FieldColorModeId.ContinuousGrYlRd };

describe('getGaugeProps: unset, and Fixed', () => {
  const theme = THEMES['Grafana light'];

  it.each(MODES)('unset (%s): core’s own props, the same object', (mode) => {
    const field = gaugeField(theme);
    const core = coreProps(field, 60);
    expect(getGaugeProps(field, theme, mode, core)).toBe(core);
  });

  it.each([
    { mode: 'shade' },
    { mode: 'fixed' },
    { mode: 'automatic' },
    { mode: 'value' },
    { mode: 'none' },
    { mode: 'shade', shade: 'brightest' },
  ])('an incomplete setting, or a mode Gauge color doesn’t have, is unset: %j', (setting) => {
    const field = gaugeField(theme, { styling: { gaugeColor: setting } });
    const core = coreProps(field, 60);
    for (const mode of MODES) {
      expect(getGaugeProps(field, theme, mode, core)).toBe(core);
    }
  });

  it('Fixed, basic gauge: one colour for the bar (the value’s colour), config and display core’s', () => {
    const field = gaugeField(theme, { styling: { gaugeColor: FIXED_PURPLE } });
    const core = coreProps(field, 60);
    const props = getGaugeProps(field, theme, BarGaugeDisplayMode.Basic, core);
    expect(props.value).toEqual({ ...core.value, color: '#A352CC' }); // Grafana light purple
    expect(props.config).toBe(core.config);
    expect(props.display).toBe(core.display);
    expect(props.colorMode).toBeUndefined();
  });

  it.each([BarGaugeDisplayMode.Gradient, BarGaugeDisplayMode.Lcd])(
    'Fixed is ignored in %s gauges: core’s own props',
    (mode) => {
      for (const color of [undefined, GRYLRD]) {
        const field = gaugeField(theme, { styling: { gaugeColor: FIXED_PURPLE }, color });
        const core = coreProps(field, 60);
        expect(getGaugeProps(field, theme, mode, core)).toBe(core);
      }
    }
  );
});

describe.each(THEME_NAMES)('per colour stop, %s', (themeName) => {
  const theme = THEMES[themeName];
  const hand = HAND[themeName];
  const named = (shade: Shade) => (name: string) => hand.steps[shade][name];

  describe.each(SHADES)('thresholds green → yellow → red, %s', (shade) => {
    const field = gaugeField(theme, { styling: { gaugeColor: shadeOf(shade) } });
    const at = (value: number) => (value >= 80 ? 'red' : value >= 50 ? 'yellow' : 'green');

    it('gradient: each step in the shade of its own hue (values and mode kept), and the value', () => {
      for (const value of [10, 60, 90]) {
        const core = coreProps(field, value);
        const props = getGaugeProps(field, theme, BarGaugeDisplayMode.Gradient, core);
        expect(props.config.thresholds).toEqual({
          mode: ThresholdsMode.Absolute,
          steps: [
            { value: -Infinity, color: named(shade)('green') },
            { value: 50, color: named(shade)('yellow') },
            { value: 80, color: named(shade)('red') },
          ],
        });
        expect(props.config.min).toBe(0);
        expect(props.config.max).toBe(100);
        expect(props.value).toEqual({ ...core.value, color: named(shade)(at(value)) });
        expect(props.display).toBe(core.display);
        expect(props.colorMode).toBeUndefined();
      }
    });

    it('LCD: each cell’s colour (the display processor’s) and the value; the config core’s', () => {
      const core = coreProps(field, 90);
      const props = getGaugeProps(field, theme, BarGaugeDisplayMode.Lcd, core);
      for (const value of [0, 25, 49, 50, 79, 80, 100]) {
        expect(props.display!(value).color).toBe(named(shade)(at(value)));
        expect(props.display!(value).text).toBe(core.display!(value).text);
      }
      expect(props.value.color).toBe(named(shade)('red'));
      expect(props.config).toBe(core.config);
    });

    it('basic: the value’s colour only (the bar)', () => {
      const core = coreProps(field, 60);
      const props = getGaugeProps(field, theme, BarGaugeDisplayMode.Basic, core);
      expect(props).toEqual({ ...core, value: { ...core.value, color: named(shade)('yellow') } });
      expect(props.config).toBe(core.config);
      expect(props.display).toBe(core.display);
    });
  });

  describe.each(SHADES)('a continuous Green-Yellow-Red scheme, %s', (shade) => {
    const field = gaugeField(theme, { color: GRYLRD, styling: { gaugeColor: shadeOf(shade) } });
    const values = POSITIONS.map((p) => p * 100);

    it('gradient: the bar from the scheme’s shaded stops (a colour mode of the plugin’s), and the value', () => {
      for (const [k, value] of values.entries()) {
        const core = coreProps(field, value);
        const props = getGaugeProps(field, theme, BarGaugeDisplayMode.Gradient, core);
        expect(props.colorMode!.getColors!(theme)).toEqual([
          named(shade)('green'),
          named(shade)('yellow'),
          named(shade)('red'),
        ]);
        expect(props.colorMode).toMatchObject({ id: FieldColorModeId.ContinuousGrYlRd, isContinuous: true });
        expect(props.value).toEqual({ ...core.value, color: hand.grylrd[shade][k] });
        expect(props.config).toBe(core.config);
        expect(props.display).toBe(core.display);
      }
    });

    it('LCD: each cell interpolated from the shaded stops at its position, and the value', () => {
      const core = coreProps(field, 75);
      const props = getGaugeProps(field, theme, BarGaugeDisplayMode.Lcd, core);
      expect(values.map((v) => props.display!(v).color)).toEqual(hand.grylrd[shade]);
      expect(props.value.color).toBe(hand.grylrd[shade][4]);
      expect(props.colorMode).toBeUndefined();
    });

    it('basic: the value, interpolated from the shaded stops', () => {
      for (const [k, value] of values.entries()) {
        const props = getGaugeProps(field, theme, BarGaugeDisplayMode.Basic, coreProps(field, value));
        expect(props.value.color).toBe(hand.grylrd[shade][k]);
        expect(props.colorMode).toBeUndefined();
      }
    });

    it('the plugin’s colour mode interpolates as Grafana’s calculator, and Grafana’s own mode is left as it is', () => {
      const props = getGaugeProps(field, theme, BarGaugeDisplayMode.Gradient, coreProps(field, 50));
      const calculate = props.colorMode!.getCalculator(field, theme);
      expect(POSITIONS.map((p) => calculate(p * 100, p))).toEqual(hand.grylrd[shade]);
      const registered = getFieldColorMode(FieldColorModeId.ContinuousGrYlRd);
      expect(registered).not.toBe(props.colorMode);
      expect(registered.getColors!(theme)).toEqual(theme.isDark ? DARK_GRYLRD[themeName] : LIGHT_GRYLRD[themeName]);
    });
  });

  it('Atlas’s lemon: a threshold step named lemon takes its own hue’s shades', () => {
    if (!themeName.startsWith('Atlas')) {
      return;
    }
    const thresholds = { mode: ThresholdsMode.Absolute, steps: [{ value: -Infinity, color: 'lemon' }] };
    for (const shade of SHADES) {
      expect(shadeThresholds(theme, thresholds, shade).steps[0].color).toBe(hand.steps[shade].lemon);
    }
  });

  it('colours without a name: a hex step by its nearest hue; without a hue (or a special name) as saved', () => {
    const thresholds = {
      mode: ThresholdsMode.Absolute,
      steps: [
        { value: -Infinity, color: '#629E51' },
        { value: 20, color: '#890F02' },
        { value: 40, color: '#008080' },
        { value: 60, color: 'transparent' },
        { value: 80, color: 'text' },
      ],
    };
    for (const shade of ['soft', 'stronger'] as const) {
      expect(shadeThresholds(theme, thresholds, shade).steps.map((s) => s.color)).toEqual([
        hand.hex['#629E51'][shade],
        hand.hex['#890F02'][shade],
        '#008080',
        'transparent',
        'text',
      ]);
    }
  });
});

describe('per colour stop: other colour sources', () => {
  it.each(['Atlas light', 'Atlas dark'] as const)(
    'Viridis in %s: each of Grafana’s nine samples by its nearest hue, the top one lemon’s',
    (themeName) => {
      const theme = THEMES[themeName];
      const field = gaugeField(theme, {
        color: { mode: FieldColorModeId.ContinuousViridis },
        styling: { gaugeColor: shadeOf('soft') },
      });
      const props = getGaugeProps(field, theme, BarGaugeDisplayMode.Gradient, coreProps(field, 50));
      expect(props.colorMode!.getColors!(theme)).toEqual(HAND_VIRIDIS_SOFT[themeName]);
    }
  );

  it('a mapped value on a scheme field has no position: the shade of its mapping colour’s name', () => {
    const theme = THEMES['Grafana dark'];
    const mappings: FieldConfig['mappings'] = [
      { type: MappingType.ValueToText, options: { '42': { color: 'purple', index: 0 } } },
    ];
    const field = gaugeField(theme, { color: GRYLRD, mappings, styling: { gaugeColor: shadeOf('stronger') } });
    const core = coreProps(field, 42);
    expect(core.value.color).toBe('#B877D9'); // purple in Grafana dark
    expect(core.value.percent).toBeUndefined();
    expect(getGaugeProps(field, theme, BarGaugeDisplayMode.Basic, core).value.color).toBe('#DEB6F2'); // super-light-purple, the strongest in dark (hand-computed)
  });

  it('a value mapped to transparent (Atlas’s “unlimited”) stays transparent, with a shade and with Fixed', () => {
    for (const themeName of THEME_NAMES) {
      const theme = THEMES[themeName];
      const mappings: FieldConfig['mappings'] = [
        { type: MappingType.ValueToText, options: { '-1': { color: 'transparent', index: 0, text: ' ' } } },
      ];
      for (const gaugeColor of [shadeOf('stronger'), shadeOf('softer'), FIXED_PURPLE]) {
        const field = gaugeField(theme, { mappings, styling: { gaugeColor } });
        const core = coreProps(field, -1);
        expect(tinycolor(core.value.color).getAlpha()).toBe(0);
        for (const mode of MODES) {
          expect(getGaugeProps(field, theme, mode, core).value).toEqual(core.value);
        }
        // and so it draws: core's basic gauge
        const spec = { mappings, mode: BarGaugeDisplayMode.Basic, values: [-1, 50, 90] };
        expect(draw(BarGaugeCell, gaugeField(theme, { ...spec, styling: { gaugeColor } }), theme, 0)).toBe(
          draw(CoreCell, gaugeField(theme, spec), theme, 0)
        );
      }
    }
  });

  it.each(['#00000000', 'rgba(0, 0, 0, 0)'])(
    'a value mapped to %s (alpha 0, no `transparent` name) stays as core in Atlas dark, under a shade and Fixed',
    (color) => {
      // Atlas has a gray hue, so without the guard such a colour (read as black) would take gray's shade
      const theme = THEMES['Atlas dark'];
      const mappings: FieldConfig['mappings'] = [
        { type: MappingType.ValueToText, options: { '-1': { color, index: 0, text: ' ' } } },
      ];
      for (const gaugeColor of [shadeOf('stronger'), shadeOf('soft'), FIXED_PURPLE]) {
        const field = gaugeField(theme, { mappings, styling: { gaugeColor } });
        const core = coreProps(field, -1);
        expect(tinycolor(core.value.color).getAlpha()).toBe(0);
        for (const mode of MODES) {
          const props = getGaugeProps(field, theme, mode, core);
          expect(props.value).toEqual(core.value);
          if (mode === BarGaugeDisplayMode.Lcd && gaugeColor !== FIXED_PURPLE) {
            // each LCD cell at -1 too (the display processor's colour for it)
            expect(props.display!(-1)).toEqual(core.display!(-1));
          }
        }
        // drawn: the basic gauge's stub (the value's colour) as core's; gradient and LCD gauges draw their bar from the
        // thresholds, not the value, so there only the value's colour is core's (above)
        const spec = { mappings, values: [-1, 50, 90], mode: BarGaugeDisplayMode.Basic };
        expect(draw(BarGaugeCell, gaugeField(theme, { ...spec, styling: { gaugeColor } }), theme, 0)).toBe(
          draw(CoreCell, gaugeField(theme, spec), theme, 0)
        );
      }
    }
  );

  it('LCD: the wrapped display processor passes its decimals on, as Grafana’s', () => {
    const theme = THEMES['Grafana light'];
    const field = gaugeField(theme, { styling: { gaugeColor: shadeOf('soft') } });
    field.config.unit = 'percent';
    field.display = getDisplayProcessor({ field, theme });
    const props = getGaugeProps(field, theme, BarGaugeDisplayMode.Lcd, coreProps(field, 60));
    expect(props.display!(60.123, 2).text).toBe(field.display(60.123, 2).text);
    expect(props.display!(60.123, 2).text).toBe('60.12');
    expect(props.display!(60.123, 0).text).toBe('60');
  });

  it('a value without a colour stays without one, with a shade and with Fixed', () => {
    const theme = THEMES['Grafana light'];
    const field = gaugeField(theme, { styling: { gaugeColor: shadeOf('soft') } });
    const core = { ...coreProps(field, 60), value: { numeric: 60, text: '60' } as DisplayValue };
    expect(getGaugeProps(field, theme, BarGaugeDisplayMode.Basic, core).value).toEqual(core.value);
    const fixedField = gaugeField(theme, { styling: { gaugeColor: FIXED_PURPLE } });
    expect(getGaugeProps(fixedField, theme, BarGaugeDisplayMode.Basic, core)).toBe(core);
  });

  it('other colour modes (a palette, a fixed colour) in a gradient gauge: the value’s colour, which the bar is', () => {
    const theme = THEMES['Grafana light'];
    const field = gaugeField(theme, {
      color: { mode: FieldColorModeId.Fixed, fixedColor: 'green' },
      styling: { gaugeColor: shadeOf('stronger') },
    });
    const core = coreProps(field, 60);
    const props = getGaugeProps(field, theme, BarGaugeDisplayMode.Gradient, core);
    expect(props.value.color).toBe('#19730E');
    expect(props.config).toBe(core.config);
    expect(props.colorMode).toBeUndefined();
    // what the copied BarGauge draws for a mode without thresholds or a scheme: the value's colour
    expect(getBarGradient({ ...barGaugeProps(theme), field: props.config, value: props.value }, 100)).toBe('#19730E');
  });

  it('the shaded thresholds and colour modes are cached per theme, thresholds and shade', () => {
    const theme = THEMES['Grafana light'];
    expect(shadeThresholds(theme, TRAFFIC, 'soft')).toBe(shadeThresholds(theme, TRAFFIC, 'soft'));
    expect(shadeThresholds(theme, TRAFFIC, 'soft')).not.toBe(shadeThresholds(theme, TRAFFIC, 'strong'));
    expect(shadeThresholds(theme, TRAFFIC, 'soft')).not.toBe(shadeThresholds(THEMES['Grafana dark'], TRAFFIC, 'soft'));
    const field = gaugeField(theme, { color: GRYLRD, styling: { gaugeColor: shadeOf('soft') } });
    const a = getGaugeProps(field, theme, BarGaugeDisplayMode.Gradient, coreProps(field, 10)).colorMode;
    const b = getGaugeProps(field, theme, BarGaugeDisplayMode.Gradient, coreProps(field, 90)).colorMode;
    expect(a).toBe(b);
  });
});

// --- The copied BarGauge's hook -------------------------------------------------------------------------------------

const barGaugeProps = (theme: GrafanaTheme2) => ({
  width: 200,
  height: 24,
  theme,
  orientation: VizOrientation.Horizontal,
  displayMode: BarGaugeDisplayMode.Gradient,
  field: { min: 0, max: 100, color: GRYLRD },
  value: { numeric: 100, text: '100' },
});

describe('the copied BarGauge: pjanColorMode', () => {
  const theme = THEMES['Grafana light'];

  it('without it, the gradient of a continuous scheme is Grafana’s (its registered mode’s stops)', () => {
    expect(getBarGradient(barGaugeProps(theme), 100)).toBe(
      'linear-gradient(90deg, #56A64B 0px, #F2CC0C 50px, #E02F44 100px)'
    );
  });

  it('with it, the gradient reads that mode’s stops instead, at the same places', () => {
    const mode = createShadedColorMode(getFieldColorMode(FieldColorModeId.ContinuousGrYlRd), {
      stops: ['#96D98D', '#FFEE52', '#FF7383'],
    });
    expect(getBarGradient({ ...barGaugeProps(theme), pjanColorMode: mode }, 100)).toBe(
      'linear-gradient(90deg, #96D98D 0px, #FFEE52 50px, #FF7383 100px)'
    );
  });

  it('it changes nothing else: thresholds still come from the field config, solid colours from the value', () => {
    const mode = createShadedColorMode(getFieldColorMode(FieldColorModeId.ContinuousGrYlRd), { stops: ['#000000'] });
    const thresholds = {
      ...barGaugeProps(theme),
      field: { min: 0, max: 100, thresholds: TRAFFIC, color: { mode: FieldColorModeId.Thresholds } },
    };
    expect(getBarGradient(thresholds, 100)).toBe(getBarGradient({ ...thresholds, pjanColorMode: undefined }, 100));
    // (a colour mode given only for a scheme: BarGaugeCell never passes one for thresholds)
    expect(mode.isContinuous).toBe(true);
  });
});

// --- The copied BarGaugeCell, as drawn -----------------------------------------------------------------------------

// Core's BarGaugeCell: the copied cell with Grafana's own BarGauge (the public @grafana/ui one) and without the hook
// (getGaugeProps hands back core's props), in a module registry of its own
function loadCoreCell(): ComponentType<Parameters<typeof BarGaugeCell>[0]> {
  let cell!: ComponentType<Parameters<typeof BarGaugeCell>[0]>;
  jest.isolateModules(() => {
    jest.doMock('../../packages/grafana-ui/src/components/BarGauge/BarGauge', () => ({ BarGauge: GrafanaBarGauge }));
    jest.doMock('./gauge', () => ({
      getGaugeProps: (_field: unknown, _theme: unknown, _mode: unknown, core: unknown) => core,
    }));
    cell = require('../../packages/grafana-ui/src/components/Table/TableNG/Cells/BarGaugeCell').BarGaugeCell;
  });
  return cell;
}
const CoreCell = loadCoreCell();

const draw = (Cell: ComponentType<Parameters<typeof BarGaugeCell>[0]>, field: Field, theme: GrafanaTheme2, row = 1) =>
  renderToStaticMarkup(
    <Cell field={field} theme={theme} value={field.values[row]} rowIdx={row} width={240} height={36} />
  );

describe('the copied BarGaugeCell, as drawn', () => {
  it('core’s cell here is Grafana’s BarGauge, the plugin’s the copy', () => {
    expect(BarGauge).not.toBe(GrafanaBarGauge);
  });

  const COLOR_SOURCES: Array<[string, Partial<FieldSpec>]> = [
    ['thresholds', {}],
    ['Green-Yellow-Red', { color: GRYLRD }],
    ['a value mapping', { mappings: [{ type: MappingType.ValueToText, options: { '60': { color: 'purple' } } }] }],
    ['the classic palette', { color: { mode: FieldColorModeId.PaletteClassic } }],
    ['a single color', { color: { mode: FieldColorModeId.Fixed, fixedColor: 'orange' } }],
    ['shades of a color', { color: { mode: FieldColorModeId.Shades, fixedColor: 'blue' } }],
  ];

  describe.each(THEME_NAMES)('%s', (themeName) => {
    const theme = THEMES[themeName];

    it.each(MODES)('nothing set equals core (%s, every value display, every colour source, every row)', (mode) => {
      let compared = 0;
      for (const valueMode of VALUE_MODES) {
        for (const [, source] of COLOR_SOURCES) {
          for (const row of [0, 1, 2]) {
            const spec = { ...source, mode, valueMode };
            const plugin = draw(BarGaugeCell, gaugeField(theme, spec), theme, row);
            expect(plugin).toBe(draw(CoreCell, gaugeField(theme, spec), theme, row));
            compared++;
          }
        }
      }
      expect(compared).toBe(54);
    });

    it.each([BarGaugeDisplayMode.Gradient, BarGaugeDisplayMode.Lcd])(
      'Fixed is ignored in %s gauges: as core',
      (mode) => {
        for (const valueMode of VALUE_MODES) {
          for (const [, source] of COLOR_SOURCES) {
            const spec = { ...source, mode, valueMode };
            expect(
              draw(BarGaugeCell, gaugeField(theme, { ...spec, styling: { gaugeColor: FIXED_PURPLE } }), theme)
            ).toBe(draw(CoreCell, gaugeField(theme, spec), theme));
          }
        }
      }
    );

    it('Fixed on a basic gauge: core’s gauge in that colour (bar and Value color), the text colour of Text as core', () => {
      const purple = theme.visualization.getColorByName('purple');
      for (const valueMode of VALUE_MODES) {
        const spec = { mode: BarGaugeDisplayMode.Basic, valueMode };
        const plugin = draw(BarGaugeCell, gaugeField(theme, { ...spec, styling: { gaugeColor: FIXED_PURPLE } }), theme);
        // core with a fixed colour (the same purple) draws the same gauge
        const core = draw(
          CoreCell,
          gaugeField(theme, { ...spec, color: { mode: FieldColorModeId.Fixed, fixedColor: 'purple' } }),
          theme
        );
        expect(plugin).toBe(core);
        expect(plugin).toContain(`border-right:2px solid ${purple}`);
        expect(plugin).toContain(`background:${tinycolor(purple).setAlpha(0.35).toRgbString()}`);
      }
    });

    it.each(SHADES)(
      'a shade on thresholds (%s): core’s gauge with each step in the hand-computed shade, in every mode and value display',
      (shade) => {
        const steps = HAND[themeName].steps[shade];
        const shaded = {
          ...TRAFFIC,
          steps: TRAFFIC.steps.map((s) => ({ ...s, color: steps[s.color] })),
        };
        for (const mode of MODES) {
          for (const valueMode of VALUE_MODES) {
            for (const row of [0, 1, 2]) {
              const spec = { mode, valueMode };
              const plugin = draw(
                BarGaugeCell,
                gaugeField(theme, { ...spec, styling: { gaugeColor: shadeOf(shade) } }),
                theme,
                row
              );
              expect(plugin).toBe(draw(CoreCell, gaugeField(theme, { ...spec, thresholds: shaded }), theme, row));
            }
          }
        }
      }
    );

    it.each(SHADES)('a shade on Green-Yellow-Red (%s): the gradient’s stops and the value, hand-computed', (shade) => {
      const hand = HAND[themeName];
      const want = hand.grylrd[shade];
      // the values at the positions 0.25, 0.75 and 1
      const field = (styling?: object) =>
        gaugeField(theme, { color: GRYLRD, values: [25, 75, 100], valueMode: BarGaugeValueMode.Color, styling });
      for (const [row, k] of [
        [0, 2],
        [1, 4],
        [2, 6],
      ]) {
        const coreDrawn = draw(CoreCell, field(), theme, row);
        const plugin = draw(BarGaugeCell, field({ gaugeColor: shadeOf(shade) }), theme, row);
        const [g, y, r] = LIGHT_GRYLRD[themeName] ?? DARK_GRYLRD[themeName];
        const stops = [hand.steps[shade].green, hand.steps[shade].yellow, hand.steps[shade].red];
        // core's drawing with the stops and the value's colour replaced by the hand-computed ones
        // core's value colour as drawn (Grafana's interpolator, see HAND), in the value's style
        const coreValue = /data-testid="data-testid Bar gauge value"/.test(coreDrawn)
          ? /style="color:(rgb\([^)]*\))/.exec(coreDrawn)![1]
          : undefined;
        expect(coreValue).toBeDefined();
        const expected = coreDrawn
          .replace(`${g} 0px`, `${stops[0]} 0px`)
          .replace(new RegExp(`${y} (\\d+px)`), `${stops[1]} $1`)
          .replace(new RegExp(`${r} (\\d+px)`), `${stops[2]} $1`)
          .replace(`color:${coreValue}`, `color:${want[k]}`);
        expect(coreDrawn).toContain(`linear-gradient(90deg, ${g} 0px, ${y} `);
        expect(plugin).toBe(expected);
      }
    });
  });
});

// --- In the copied TableNG (jsdom) ---------------------------------------------------------------------------------

describe('Gauge color in the copied TableNG', () => {
  const originalResizeObserver = global.ResizeObserver;
  beforeAll(() => {
    // jsdom has no ResizeObserver (the copied TableNG.test.tsx stubs it the same way)
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });
  afterAll(() => {
    global.ResizeObserver = originalResizeObserver;
  });

  const NO_ACTIONS = () => [];
  const gauge = (styling?: object) => ({
    thresholds: TRAFFIC,
    color: { mode: FieldColorModeId.Thresholds },
    min: 0,
    max: 100,
    custom: {
      cellOptions: {
        type: TableCellDisplayMode.Gauge,
        mode: BarGaugeDisplayMode.Basic,
        valueDisplayMode: BarGaugeValueMode.Color,
      },
      ...(styling ? { styling } : {}),
    },
  });

  it('reaches the gauge cells of its column only, and nothing else', () => {
    const theme = THEMES['Grafana dark'];
    const [data] = applyFieldOverrides({
      data: [
        toDataFrame({
          fields: [
            {
              name: 'set',
              type: FieldType.number,
              values: [10, 90],
              config: gauge({ gaugeColor: shadeOf('stronger') }),
            },
            { name: 'unset', type: FieldType.number, values: [10, 90], config: gauge() },
            // Colored background with Gauge color: not a gauge, as core
            {
              name: 'fill',
              type: FieldType.number,
              values: [10, 90],
              config: {
                thresholds: TRAFFIC,
                color: { mode: FieldColorModeId.Thresholds },
                custom: {
                  cellOptions: {
                    type: TableCellDisplayMode.ColorBackground,
                    mode: TableCellBackgroundDisplayMode.Basic,
                  },
                  styling: { gaugeColor: shadeOf('stronger') },
                },
              },
            },
          ],
        }),
      ],
      fieldConfig: { defaults: {}, overrides: [] },
      replaceVariables: (value) => value,
      timeZone: 'utc',
      theme,
    });
    const { container } = render(
      <ThemeContext.Provider value={theme}>
        <TableNG getActions={NO_ACTIONS} enableVirtualization={false} data={data} width={900} height={300} />
      </ThemeContext.Provider>
    );
    const rows = [...container.querySelectorAll('[role="row"]')]
      .map((row) => [...row.querySelectorAll<HTMLElement>('[role="gridcell"]')])
      .filter((row) => row.length > 0);
    const valueColor = (cell: HTMLElement) =>
      cell.querySelector<HTMLElement>('[data-testid="data-testid Bar gauge value"]')!.style.color;
    // Grafana dark: green #73BF69 and red #F2495C; Stronger: super-light green #C8F2C2 and red #FFA6B0
    expect(rows.map((row) => valueColor(row[0]))).toEqual(['rgb(200, 242, 194)', 'rgb(255, 166, 176)']);
    expect(rows.map((row) => valueColor(row[1]))).toEqual(['rgb(115, 191, 105)', 'rgb(242, 73, 92)']);
    expect(rows.map((row) => row[2].style.background)).toEqual(['rgb(115, 191, 105)', 'rgb(242, 73, 92)']);
  });
});
