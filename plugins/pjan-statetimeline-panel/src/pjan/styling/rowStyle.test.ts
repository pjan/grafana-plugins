import { type FieldColorModeId, FieldType, type GrafanaTheme2, MappingType, type ValueMapping } from '@grafana/data';
import { UPLOT_AXIS_FONT_SIZE } from '@grafana/ui';
import {
  getAutomaticText,
  getMinTextContrast,
  getRelativeShadeColor,
  getTextContrast,
  toCanvasColor,
} from '@pjan/grafana-styling';

import { type FieldConfigWithStyling, type TimelineStylingOptions } from './options';
import { getRowStyle } from './rowStyle';
import { LIGHT, makeField, THEMES } from './testdata/fixtures';

const mappings: ValueMapping[] = [
  {
    type: MappingType.ValueToText,
    options: {
      ok: { color: 'green', index: 0 },
      warn: { color: 'semi-dark-yellow', index: 1 },
      hex: { color: '#8e8e8e', index: 2 },
    },
  },
];

const rowWith = (theme: GrafanaTheme2, custom: FieldConfigWithStyling, config = {}) =>
  makeField(theme, { values: ['ok', 'warn', 'hex'], config: { mappings, ...config, custom } });

const stateColor = (theme: GrafanaTheme2, value: string) => rowWith(theme, {}).display!(value).color!;

const shade = (theme: GrafanaTheme2, name: string, s: Parameters<typeof getRelativeShadeColor>[2]) =>
  toCanvasColor(theme, getRelativeShadeColor(theme, name, s)!);

const PILL: TimelineStylingOptions = { look: 'pill' };

// Values are 12 px at weight 500: getMinTextContrast gives 4.5:1, as before it existed.
const VALUE_MIN_CONTRAST = 4.5;

describe('getRowStyle', () => {
  it('is undefined when neither the row nor the look sets a box colour', () => {
    expect(getRowStyle(rowWith(LIGHT, {}), LIGHT, {})).toBeUndefined();
    expect(getRowStyle(rowWith(LIGHT, {}), LIGHT, { look: 'grafana', gridColor: 'red' })).toBeUndefined();
  });

  it('treats incomplete or foreign values as unset', () => {
    const custom = {
      fillColor: { mode: 'automatic' }, // text only
      lineColor: { mode: 'fixed' }, // no colour picked yet
      valueColor: { mode: 'shade', shade: 'darkest' },
    } as unknown as FieldConfigWithStyling;
    expect(getRowStyle(rowWith(LIGHT, custom), LIGHT, {})).toBeUndefined();
  });

  describe.each(Object.entries(THEMES))('%s', (_, theme) => {
    const green = stateColor(theme, 'ok');
    const yellow = stateColor(theme, 'warn');
    const hex = stateColor(theme, 'hex');

    it('Fill color: a relative shade of the state colour, whichever shade the state uses', () => {
      const row = getRowStyle(rowWith(theme, { fillColor: { mode: 'shade', shade: 'stronger' } }), theme, {})!;
      expect(row.getFill(green)).toBe(shade(theme, 'green', 'stronger'));
      // semi-dark-yellow's strongest shade is the strongest of all yellows
      expect(row.getFill(yellow)).toBe(shade(theme, 'yellow', 'stronger'));
      expect(row.getLine(green)).toBeUndefined();
      expect(row.getValueText(green, green)).toBeUndefined();
    });

    it('Fill and Line color fall back to the state colour for a colour without a name', () => {
      const row = getRowStyle(
        rowWith(theme, { fillColor: { mode: 'shade', shade: 'soft' }, lineColor: { mode: 'shade', shade: 'base' } }),
        theme,
        {}
      )!;
      expect(row.getFill(hex)).toBeUndefined();
      expect(row.getLine(hex)).toBeUndefined();
    });

    it('Line color: a relative shade, or a fixed colour for every state', () => {
      const byShade = getRowStyle(rowWith(theme, { lineColor: { mode: 'shade', shade: 'softer' } }), theme, {})!;
      expect(byShade.getLine(green)).toBe(shade(theme, 'green', 'softer'));
      const fixed = getRowStyle(rowWith(theme, { lineColor: { mode: 'fixed', fixedColor: 'purple' } }), theme, {})!;
      expect([green, yellow, hex].map(fixed.getLine)).toEqual(Array(3).fill(toCanvasColor(theme, 'purple')));
      expect(fixed.getFill(green)).toBeUndefined();
    });

    it('Value color "Automatic": the first readable shade of the box’s hue, on the fill as drawn', () => {
      const row = getRowStyle(rowWith(theme, { valueColor: { mode: 'automatic' } }), theme, {})!;
      for (const fill of [green, yellow, 'rgb(0,0,0)', 'rgb(255,255,255)', 'rgba(255,255,255,0.1)']) {
        const text = row.getValueText(green, fill);
        expect(text).toBe(getAutomaticText(theme, fill, VALUE_MIN_CONTRAST));
        expect(getTextContrast(theme, text!, fill)).toBeGreaterThanOrEqual(4.2);
      }
    });

    if (theme === LIGHT) {
      it('Value color "Automatic" on Grafana light’s green, worked out by hand', () => {
        // #56A64B: 69 % towards black (#000000) reaches 4.52:1; the page colour (#fbfbfb) never reaches 4.5:1
        const row = getRowStyle(rowWith(theme, { valueColor: { mode: 'automatic' } }), theme, {})!;
        expect(row.getValueText(green, green)).toBe('rgb(27,51,23)');
      });
    }

    it('Value color "Automatic" composites a translucent fill over what is behind the panel', () => {
      const canvas = theme.colors.background.canvas;
      const plain = getRowStyle(rowWith(theme, { valueColor: { mode: 'automatic' } }), theme, {})!;
      const transparent = getRowStyle(rowWith(theme, { valueColor: { mode: 'automatic' } }), theme, {}, canvas)!;
      const fill = 'rgba(255,255,255,0.1)';
      expect(transparent.getValueText(green, fill)).toBe(
        getAutomaticText(theme, fill, VALUE_MIN_CONTRAST, { background: canvas })
      );
      expect(plain.getValueText(green, fill)).toBe(getAutomaticText(theme, fill, VALUE_MIN_CONTRAST));
    });

    it('Value color shade or fixed: drawn as chosen, whatever its contrast with the fill', () => {
      const fills = [theme.colors.background.primary, 'rgb(128,128,128)', green, yellow];
      for (const valueColor of [
        { mode: 'shade', shade: 'stronger' },
        { mode: 'shade', shade: 'softer' },
        { mode: 'fixed', fixedColor: 'dark-blue' },
        { mode: 'fixed', fixedColor: 'super-light-orange' },
      ] as const) {
        const row = getRowStyle(rowWith(theme, { valueColor }), theme, {})!;
        const wanted =
          valueColor.mode === 'shade'
            ? shade(theme, 'green', valueColor.shade)
            : toCanvasColor(theme, valueColor.fixedColor);
        for (const fill of fills) {
          expect(row.getValueText(green, fill)).toBe(wanted);
        }
      }
    });

    it('Value color shade falls back to Automatic for a colour without a name', () => {
      const row = getRowStyle(rowWith(theme, { valueColor: { mode: 'shade', shade: 'stronger' } }), theme, {})!;
      expect(row.getValueText(hex, hex)).toBe(getAutomaticText(theme, hex, VALUE_MIN_CONTRAST));
    });

    it('Fill color fixed: the same colour for every state', () => {
      const row = getRowStyle(rowWith(theme, { fillColor: { mode: 'fixed', fixedColor: 'purple' } }), theme, {})!;
      expect([green, yellow, hex].map(row.getFill)).toEqual(Array(3).fill(toCanvasColor(theme, 'purple')));
    });

    it('the Pill look sets fill softer, line base, value Automatic, for the options left unset', () => {
      const row = getRowStyle(rowWith(theme, {}), theme, PILL)!;
      expect(row.getFill(green)).toBe(shade(theme, 'green', 'softer'));
      expect(row.getLine(green)).toBe(shade(theme, 'green', 'base'));
      const fill = row.getFill(green)!;
      expect(row.getValueText(green, fill)).toBe(getAutomaticText(theme, fill, VALUE_MIN_CONTRAST));

      const own = getRowStyle(
        rowWith(theme, {
          fillColor: { mode: 'shade', shade: 'strong' },
          lineColor: { mode: 'fixed', fixedColor: 'red' },
        }),
        theme,
        PILL
      )!;
      expect(own.getFill(green)).toBe(shade(theme, 'green', 'strong'));
      expect(own.getLine(green)).toBe(toCanvasColor(theme, 'red'));
    });
  });

  it('Pill in the Atlas themes: a tinted value text with 4.5:1 on the softest fill', () => {
    // computed by hand: super-light-green is emerald 200 (#bfe3c7) in light, 57 % towards ink; emerald 800 (#3c6639)
    // in dark, 79 % towards the light page colour
    const expected = { 'Atlas light': 'rgb(83,99,89)', 'Atlas dark': 'rgb(205,217,209)' } as const;
    for (const name of ['Atlas light', 'Atlas dark'] as const) {
      const theme = THEMES[name];
      const green = stateColor(theme, 'ok');
      const row = getRowStyle(rowWith(theme, {}), theme, PILL)!;
      expect(row.getValueText(green, row.getFill(green)!)).toBe(expected[name]);
    }
  });

  it('continuous schemes have no names: the state colour for fill and line, Automatic for the value', () => {
    const field = makeField(LIGHT, {
      type: FieldType.number,
      values: [0, 50, 100],
      config: {
        min: 0,
        max: 100,
        color: { mode: 'continuous-GrYlRd' as FieldColorModeId },
        custom: { fillColor: { mode: 'shade', shade: 'softer' }, valueColor: { mode: 'shade', shade: 'stronger' } },
      },
    });
    const row = getRowStyle(field, LIGHT, {})!;
    const color = field.display!(50).color!;
    expect(row.getFill(color)).toBeUndefined();
    expect(row.getValueText(color, color)).toBe(getAutomaticText(LIGHT, color, VALUE_MIN_CONTRAST));
  });

  it('the Atlas classic palette is hex colours: no shades', () => {
    const theme = THEMES['Atlas light'];
    const field = makeField(theme, {
      values: ['a'],
      config: {
        color: { mode: 'palette-classic' as FieldColorModeId },
        custom: { fillColor: { mode: 'shade', shade: 'soft' } },
      },
      state: { seriesIndex: 1 },
    });
    const color = field.display!('a').color!;
    expect(color).toBe(theme.visualization.palette[1]);
    expect(getRowStyle(field, theme, {})!.getFill(color)).toBeUndefined();
  });
});

describe('text contrast of the timeline (getMinTextContrast)', () => {
  it('needs 4.5:1 for all its text, as before: values, row names and the bold 00:00 labels are 12 px', () => {
    expect(getMinTextContrast(12, 500)).toBe(VALUE_MIN_CONTRAST);
    expect(getMinTextContrast(UPLOT_AXIS_FONT_SIZE, 400)).toBe(4.5);
    expect(getMinTextContrast(UPLOT_AXIS_FONT_SIZE, 700)).toBe(4.5);
  });
});
