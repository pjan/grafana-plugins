import tinycolor from 'tinycolor2';

import { FieldColorModeId, FieldType, getFieldColorModeForField } from '@grafana/data';

import { getNearestHue, getRelativeShadeColor, getShadeColor, type RelativeShade } from './shades';
import { getColorScheme, getValueShadeColor, interpolateColorScheme, shadeColorScheme } from './schemes';
import { makeField, THEMES } from './testdata/themes';

const LIGHT = THEMES['Grafana light'];
const DARK = THEMES['Grafana dark'];
const POSITIONS = [0, 0.25, 0.5, 0.75, 1];

const field = (mode: string, theme = LIGHT) =>
  makeField(theme, { name: 'cpu', type: FieldType.number, values: [], config: { color: { mode } } });

// Hand-computed (job tmp table-plan/step7-1-spike/oracle6.py, a separate implementation of the B-spline): Green-Yellow-
// Red (by value), its stops shaded by their own hue (oracle4.py ranks the shades) and interpolated at 0, 0.25, 0.5,
// 0.75 and 1
const EXPECTED = {
  'Grafana light': {
    core: ['rgb(86, 166, 75)', 'rgb(160, 181, 46)', 'rgb(213, 172, 32)', 'rgb(229, 121, 42)', 'rgb(224, 47, 68)'],
    soft: ['rgb(115, 191, 105)', 'rgb(180, 203, 76)', 'rgb(226, 192, 61)', 'rgb(243, 144, 69)', 'rgb(242, 73, 92)'],
    stronger: ['rgb(25, 115, 14)', 'rgb(110, 132, 8)', 'rgb(169, 124, 6)', 'rgb(184, 76, 12)', 'rgb(173, 3, 23)'],
  },
  'Grafana dark': {
    core: ['rgb(115, 191, 105)', 'rgb(180, 203, 76)', 'rgb(226, 192, 61)', 'rgb(243, 144, 69)', 'rgb(242, 73, 92)'],
    soft: ['rgb(86, 166, 75)', 'rgb(160, 181, 46)', 'rgb(213, 172, 32)', 'rgb(229, 121, 42)', 'rgb(224, 47, 68)'],
    stronger: [
      'rgb(200, 242, 194)',
      'rgb(226, 243, 175)',
      'rgb(246, 233, 164)',
      'rgb(254, 205, 166)',
      'rgb(255, 166, 176)',
    ],
  },
};

describe('continuous colour schemes', () => {
  it('reads a continuous by-value scheme’s stops as Grafana resolves them; nothing for other colour modes', () => {
    expect(getColorScheme(field(FieldColorModeId.ContinuousGrYlRd), LIGHT)!.stops).toEqual([
      '#56A64B',
      '#F2CC0C',
      '#E02F44',
    ]);
    for (const mode of [
      FieldColorModeId.Thresholds,
      FieldColorModeId.Fixed,
      FieldColorModeId.PaletteClassic,
      FieldColorModeId.Shades,
    ]) {
      expect(getColorScheme(field(mode), LIGHT)).toBeUndefined();
    }
  });

  it.each(Object.keys(EXPECTED) as Array<keyof typeof EXPECTED>)(
    'interpolates as Grafana’s own calculator does (%s), at hand-computed colours',
    (name) => {
      const theme = THEMES[name];
      const f = field(FieldColorModeId.ContinuousGrYlRd, theme);
      const mode = getFieldColorModeForField(f);
      // Grafana builds a continuous scheme's interpolator once, from the stops of the first theme it is asked for, and
      // keeps it on its shared mode object (fieldColor.ts `getInterpolator`); a fresh session asked for this theme
      // starts without one. The Atlas theme plugin resets it on a theme switch for the same reason.
      (mode as unknown as { interpolator?: unknown }).interpolator = undefined;
      const calculator = mode.getCalculator(f, theme);
      const scheme = getColorScheme(f, theme)!;
      expect(POSITIONS.map((p) => interpolateColorScheme(scheme, p))).toEqual(POSITIONS.map((p) => calculator(0, p)));
      expect(POSITIONS.map((p) => interpolateColorScheme(scheme, p))).toEqual(EXPECTED[name].core);
    }
  );

  it.each([
    ['Grafana light', 'soft'],
    ['Grafana light', 'stronger'],
    ['Grafana dark', 'soft'],
    ['Grafana dark', 'stronger'],
  ] as const)(
    'a shade of a scheme colour: the stops shaded, interpolated at the value’s position (%s, %s)',
    (name, shade) => {
      const theme = THEMES[name];
      const scheme = getColorScheme(field(FieldColorModeId.ContinuousGrYlRd, theme), theme)!;
      const colors = POSITIONS.map((position) =>
        getValueShadeColor(theme, '#000000', undefined, shade, { scheme, position })
      );
      expect(colors).toEqual(EXPECTED[name][shade]);
    }
  );

  it('the nearest-hue rule would break the transition (the colour between green and yellow has no hue in reach)', () => {
    const scheme = getColorScheme(field(FieldColorModeId.ContinuousGrYlRd), LIGHT)!;
    const between = interpolateColorScheme(scheme, 0.25); // rgb(160, 181, 46)
    expect(getShadeColor(LIGHT, between, undefined, 'stronger')).not.toBe('rgb(110, 132, 8)');
  });

  it('shades named stops by their name (Blue-Yellow-Red: dark-blue, super-light-yellow, dark-red)', () => {
    const scheme = getColorScheme(field(FieldColorModeId.ContinuousBlYlRd), LIGHT)!;
    expect(shadeColorScheme(LIGHT, scheme, 'softer').stops).toEqual(['#8AB8FF', '#FFEE52', '#FF7383']);
  });

  it.each(['Atlas light', 'Atlas dark', 'Grafana light', 'Grafana dark'])(
    'a “from background” scheme (Blues) keeps its panel-bg stop unshaded, also in a theme with a gray hue (%s)',
    (name) => {
      const theme = THEMES[name];
      const scheme = getColorScheme(field(FieldColorModeId.ContinuousBlues, theme), theme)!;
      const panelBg = theme.visualization.getColorByName('panel-bg');
      expect(scheme.stops).toEqual([panelBg, theme.visualization.getColorByName('dark-blue')]);
      for (const shade of ['softer', 'soft', 'base', 'strong', 'stronger'] as const) {
        const shaded = shadeColorScheme(theme, scheme, shade).stops;
        // the panel colour stays (Atlas has a gray hue, which the nearest-hue rule would give it: Atlas light Soft
        // #c6c8c5, Atlas dark Soft #6d777b); dark-blue takes the shade of the blue hue
        expect(shaded[0]).toBe(panelBg);
        expect(shaded[1]).toBe(getRelativeShadeColor(theme, 'blue', shade));
      }
      // at position 0 a shaded Blues is the panel colour itself
      expect(getValueShadeColor(theme, panelBg, undefined, 'soft', { scheme, position: 0 })).toBe(
        tinycolor(panelBg).toRgbString()
      );
    }
  );

  it('stops that are Grafana’s `text` or `transparent` colour keep their colour too', () => {
    const theme = THEMES['Atlas light'];
    const text = theme.visualization.getColorByName('text');
    const transparent = theme.visualization.getColorByName('transparent');
    const green = theme.visualization.getColorByName('green');
    expect(shadeColorScheme(theme, { stops: [text, transparent, green] }, 'softer').stops).toEqual([
      text,
      transparent,
      getRelativeShadeColor(theme, 'green', 'softer'),
    ]);
  });

  it('an infinite position is the scheme’s end, as Grafana’s interpolator clamps it; NaN has no position', () => {
    const scheme = getColorScheme(field(FieldColorModeId.ContinuousGrYlRd), LIGHT)!;
    expect(getValueShadeColor(LIGHT, '#000000', undefined, 'soft', { scheme, position: Infinity })).toBe(
      EXPECTED['Grafana light'].soft[4]
    );
    expect(getValueShadeColor(LIGHT, '#000000', undefined, 'soft', { scheme, position: -Infinity })).toBe(
      EXPECTED['Grafana light'].soft[0]
    );
    expect(getValueShadeColor(LIGHT, '#56A64B', 'green', 'soft', { scheme, position: NaN })).toBe(
      getShadeColor(LIGHT, '#56A64B', 'green', 'soft')
    );
  });

  it('without a scheme: the shade of the colour’s name or nearest hue, as getShadeColor (unchanged)', () => {
    expect(getValueShadeColor(LIGHT, '#56A64B', 'green', 'stronger')).toBe(
      getShadeColor(LIGHT, '#56A64B', 'green', 'stronger')
    );
    expect(getValueShadeColor(DARK, '#7EB26D', undefined, 'soft')).toBe(
      getShadeColor(DARK, '#7EB26D', undefined, 'soft')
    );
  });
});

// Atlas 4.2.0 adds lemon (OKLCH 95.5°, between Grafana's yellow and lime; pjan, 2026-10-11): Viridis's top colour takes
// lemon's shades, Magma's top keeps lime's, and the other schemes shade as before. The expected colours are those of
// the Atlas 4.1.1 copy (recorded before the update, job tmp table-plan/build1/lemon-before2.json), at the positions 0,
// 0.25, 0.5, 0.75 and 1.
const ATLAS_UNCHANGED = {
  'Atlas light': {
    'continuous-magma': {
      softer: [
        'rgb(218, 218, 217)',
        'rgb(226, 211, 253)',
        'rgb(250, 207, 223)',
        'rgb(253, 209, 189)',
        'rgb(215, 223, 176)',
      ],
      soft: [
        'rgb(198, 200, 197)',
        'rgb(211, 189, 250)',
        'rgb(247, 181, 206)',
        'rgb(250, 184, 154)',
        'rgb(195, 206, 132)',
      ],
      base: [
        'rgb(177, 181, 178)',
        'rgb(197, 164, 250)',
        'rgb(244, 152, 189)',
        'rgb(248, 157, 114)',
        'rgb(176, 188, 83)',
      ],
      strong: [
        'rgb(154, 162, 160)',
        'rgb(182, 139, 246)',
        'rgb(229, 127, 168)',
        'rgb(241, 128, 73)',
        'rgb(156, 167, 57)',
      ],
      stronger: ['rgb(85, 94, 101)', 'rgb(104, 83, 135)', 'rgb(134, 73, 96)', 'rgb(135, 78, 50)', 'rgb(90, 97, 30)'],
    },
    'continuous-GrYlRd': {
      soft: [
        'rgb(155, 213, 168)',
        'rgb(195, 202, 153)',
        'rgb(227, 193, 147)',
        'rgb(244, 187, 156)',
        'rgb(252, 182, 174)',
      ],
      stronger: ['rgb(60, 102, 57)', 'rgb(91, 93, 45)', 'rgb(116, 85, 41)', 'rgb(131, 79, 50)', 'rgb(140, 73, 67)'],
    },
    'continuous-blues': {
      soft: [
        'rgb(255, 255, 255)',
        'rgb(227, 243, 255)',
        'rgb(198, 231, 255)',
        'rgb(170, 218, 255)',
        'rgb(141, 206, 255)',
      ],
      stronger: [
        'rgb(255, 255, 255)',
        'rgb(201, 216, 225)',
        'rgb(147, 176, 195)',
        'rgb(93, 137, 165)',
        'rgb(39, 97, 135)',
      ],
    },
  },
  'Atlas dark': {
    'continuous-magma': {
      softer: ['rgb(85, 94, 101)', 'rgb(104, 83, 135)', 'rgb(134, 73, 96)', 'rgb(135, 78, 50)', 'rgb(90, 97, 30)'],
      soft: ['rgb(109, 119, 123)', 'rgb(133, 103, 176)', 'rgb(172, 91, 119)', 'rgb(177, 94, 55)', 'rgb(114, 123, 40)'],
      base: [
        'rgb(132, 142, 142)',
        'rgb(158, 121, 214)',
        'rgb(206, 107, 141)',
        'rgb(213, 109, 62)',
        'rgb(136, 146, 50)',
      ],
      strong: [
        'rgb(154, 162, 160)',
        'rgb(182, 139, 246)',
        'rgb(229, 127, 168)',
        'rgb(241, 128, 73)',
        'rgb(156, 167, 57)',
      ],
      stronger: [
        'rgb(218, 218, 217)',
        'rgb(226, 211, 253)',
        'rgb(250, 207, 223)',
        'rgb(253, 209, 189)',
        'rgb(215, 223, 176)',
      ],
    },
    'continuous-GrYlRd': {
      soft: ['rgb(66, 131, 75)', 'rgb(110, 119, 58)', 'rgb(147, 107, 50)', 'rgb(170, 96, 59)', 'rgb(186, 85, 78)'],
      stronger: [
        'rgb(191, 227, 199)',
        'rgb(217, 220, 189)',
        'rgb(237, 214, 186)',
        'rgb(248, 210, 191)',
        'rgb(254, 207, 202)',
      ],
    },
    'continuous-blues': {
      soft: ['rgb(1, 2, 6)', 'rgb(10, 32, 49)', 'rgb(19, 63, 91)', 'rgb(28, 93, 134)', 'rgb(37, 123, 176)'],
      stronger: ['rgb(1, 2, 6)', 'rgb(48, 57, 67)', 'rgb(94, 113, 128)', 'rgb(141, 168, 189)', 'rgb(187, 223, 250)'],
    },
  },
} as const;

describe('Atlas 4.2.0: the lemon hue', () => {
  const LEMON = {
    'Atlas light': ['#e6dbae', '#dac780', '#ceb346', '#b99e29', '#6c5c15'],
    'Atlas dark': ['#6c5c15', '#88741b', '#a28a23', '#b99e29', '#e6dbae'],
  } as const;
  const NAMES = ['super-light-lemon', 'light-lemon', 'lemon', 'semi-dark-lemon', 'dark-lemon'];
  const SHADES = ['softer', 'soft', 'base', 'strong', 'stronger'] as const;

  it.each(['Atlas light', 'Atlas dark'] as const)('lemon’s named shades resolve per mode, after lime (%s)', (name) => {
    const theme = THEMES[name];
    expect(NAMES.map((n) => theme.visualization.getColorByName(n).toLowerCase())).toEqual(LEMON[name]);
    // the theme's type lists Grafana's six hues; the Atlas theme appends its own
    const hues: string[] = theme.visualization.hues.map((h) => h.name);
    expect(hues.indexOf('lemon')).toBe(hues.indexOf('lime') + 1);
    // ranked by contrast with the panel background, Softer to Stronger: the names' order in both modes (light lemon200
    // … lemon800, dark lemon800 … lemon200)
    expect(SHADES.map((s) => getRelativeShadeColor(theme, 'lemon', s)!.toLowerCase())).toEqual(LEMON[name]);
  });

  it.each(['Atlas light', 'Atlas dark'] as const)(
    'Viridis’s top (#fde725) takes lemon’s shades, Magma’s top (#fcfdbf) still lime’s (%s)',
    (name) => {
      const theme = THEMES[name];
      expect(getNearestHue(theme, '#fde725')).toBe('lemon');
      expect(getNearestHue(theme, '#fcfdbf')).toBe('lime');
      const viridis = getColorScheme(field(FieldColorModeId.ContinuousViridis, theme), theme)!;
      for (const shade of SHADES) {
        expect(
          tinycolor(
            getValueShadeColor(theme, '#fde725', undefined, shade, { scheme: viridis, position: 1 })!
          ).toHexString()
        ).toBe(getRelativeShadeColor(theme, 'lemon', shade)!.toLowerCase());
      }
      // the stock themes have no lemon hue: nothing changes there
      expect(getNearestHue(THEMES['Grafana light'], '#fde725')).not.toBe('lemon');
    }
  );

  it.each(['Atlas light', 'Atlas dark'] as const)(
    'Magma, Green-Yellow-Red and Blues shade exactly as with Atlas 4.1.1 (%s)',
    (name) => {
      const theme = THEMES[name];
      for (const [mode, shades] of Object.entries(ATLAS_UNCHANGED[name])) {
        const scheme = getColorScheme(field(mode, theme), theme)!;
        for (const [shade, expected] of Object.entries(shades)) {
          expect(
            POSITIONS.map((position) =>
              getValueShadeColor(theme, '#000000', undefined, shade as RelativeShade, { scheme, position })
            )
          ).toEqual(expected);
        }
      }
    }
  );
});
