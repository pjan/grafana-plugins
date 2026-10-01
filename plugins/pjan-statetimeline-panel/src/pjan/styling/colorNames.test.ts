import {
  type Field,
  type FieldColorModeId,
  FieldType,
  getDisplayProcessor,
  type GrafanaTheme2,
  MappingType,
  SpecialValueMatch,
  ThresholdsMode,
  dateTime,
} from '@grafana/data';

import { prepareTimelineFields } from '../../core/components/TimelineChart/utils';

import { getColorNameLookup } from './colorNames';
import { getRelativeShadeColor } from './shades';
import { makeField, THEMES as themes } from './testdata/fixtures';

/** The colour name behind each value's colour, as the drawing code would get it. */
const namesOf = (theme: GrafanaTheme2, field: Field) => {
  const lookup = getColorNameLookup(field, theme);
  return field.values.map((v) => lookup.get(field.display!(v).color!));
};

// A theme copy whose getColorByName returns names unchanged: the display processor then returns the name.
const nameThemeOf = (theme: GrafanaTheme2): GrafanaTheme2 => ({
  ...theme,
  visualization: { ...theme.visualization, getColorByName: (name: string) => name },
});

const mappings = [
  {
    type: MappingType.ValueToText,
    options: { up: { color: 'super-light-green', index: 0 }, down: { color: 'red', index: 1 } },
  },
  { type: MappingType.RangeToText, options: { from: 100, to: 200, result: { color: 'semi-dark-yellow', index: 2 } } },
  { type: MappingType.RegexToText, options: { pattern: '/^err/', result: { color: 'dark-red', index: 3 } } },
  { type: MappingType.SpecialValue, options: { match: SpecialValueMatch.Null, result: { color: 'blue', index: 4 } } },
  { type: MappingType.ValueToText, options: { hex: { color: '#ff00ff', index: 5 } } },
] as const;

describe.each(Object.entries(themes))('colour names at draw time (%s)', (_, theme) => {
  it('value mappings: value, range, regex, special; hex colours have no name', () => {
    const field = makeField(theme, {
      values: ['up', 'down', 150, 'error 3', null, 'hex', 'unmapped'],
      config: { mappings: mappings as never },
    });
    expect(namesOf(theme, field)).toEqual([
      'super-light-green',
      'red',
      'semi-dark-yellow',
      'dark-red',
      'blue',
      undefined, // #ff00ff
      undefined, // unmapped string: thresholds fallback (not configured here: Grafana's default thresholds)
    ]);
  });

  it('thresholds (absolute and percentage)', () => {
    const thresholds = {
      mode: ThresholdsMode.Absolute,
      steps: [
        { value: -Infinity, color: 'green' },
        { value: 50, color: 'light-orange' },
        { value: 80, color: 'dark-red' },
      ],
    };
    const absolute = makeField(theme, {
      type: FieldType.number,
      values: [10, 60, 90],
      config: { color: { mode: 'thresholds' as FieldColorModeId }, thresholds },
    });
    expect(namesOf(theme, absolute)).toEqual(['green', 'light-orange', 'dark-red']);
    const percentage = makeField(theme, {
      type: FieldType.number,
      values: [0, 55, 100],
      config: {
        min: 0,
        max: 200,
        color: { mode: 'thresholds' as FieldColorModeId },
        thresholds: { ...thresholds, mode: ThresholdsMode.Percentage },
      },
    });
    expect(namesOf(theme, percentage)).toEqual(['green', 'green', 'light-orange']);
  });

  it('thresholds merged by prepareTimelineFields (mergeValues)', () => {
    const range = { from: dateTime(0), to: dateTime(10), raw: { from: dateTime(0), to: dateTime(10) } };
    const value = makeField(theme, {
      name: 'value',
      type: FieldType.number,
      values: [10, 60, 90],
      config: {
        color: { mode: 'thresholds' as FieldColorModeId },
        thresholds: {
          mode: ThresholdsMode.Absolute,
          steps: [
            { value: -Infinity, color: 'green' },
            { value: 50, color: 'light-orange' },
            { value: 80, color: 'dark-red' },
          ],
        },
      },
    });
    const time = { name: 'time', type: FieldType.time, values: [1, 2, 3], config: {} };
    const { frames } = prepareTimelineFields([{ fields: [time, value], length: 3 }], true, range, theme);
    const merged = frames![0].fields[1];
    expect(merged.type).toBe(FieldType.string); // merged into threshold labels
    expect(namesOf(theme, merged)).toEqual(['green', 'light-orange', 'dark-red']);
  });

  it('fixed colour, booleans, classic palette', () => {
    const fixed = makeField(theme, {
      values: ['a'],
      config: { color: { mode: 'fixed' as FieldColorModeId, fixedColor: 'light-blue' } },
    });
    expect(namesOf(theme, fixed)).toEqual(['light-blue']);

    const bool = makeField(theme, { type: FieldType.boolean, values: [true, false] });
    expect(namesOf(theme, bool)).toEqual(['green', 'red']);

    const palette = makeField(theme, {
      values: ['a'],
      config: { color: { mode: 'palette-classic' as FieldColorModeId } },
      state: { seriesIndex: 2 },
    });
    // Grafana's classic palette is names; Atlas's is hex colours (atlas-theme.json visualization.palette).
    expect(namesOf(theme, palette)).toEqual([theme.visualization.palette[2][0] === '#' ? undefined : 'blue']);
  });

  it('continuous schemes have no name', () => {
    const field = makeField(theme, {
      type: FieldType.number,
      values: [0, 50, 100],
      config: { min: 0, max: 100, color: { mode: 'continuous-GrYlRd' as FieldColorModeId } },
    });
    expect(namesOf(theme, field)).toEqual([undefined, undefined, undefined]);
  });

  it('a continuous scheme (the panel’s default colour mode) with mappings: only the mapped values have names', () => {
    const field = makeField(theme, {
      type: FieldType.number,
      values: [1, 0, 100],
      config: {
        min: 0,
        max: 100,
        color: { mode: 'continuous-GrYlRd' as FieldColorModeId },
        // Grafana's default thresholds are always there; in a continuous mode they don't colour anything
        thresholds: { mode: ThresholdsMode.Absolute, steps: [{ value: -Infinity, color: 'green' }] },
        mappings: [{ type: MappingType.ValueToText, options: { 1: { color: 'semi-dark-blue', index: 0 } } }],
      },
    });
    expect(namesOf(theme, field)).toEqual(['semi-dark-blue', undefined, undefined]);
  });

  it('agrees with a display processor on a name-preserving theme copy, for discrete colour sources', () => {
    const field = makeField(theme, {
      values: ['up', 'down', 150, 'error 3', null],
      config: { mappings: mappings as never },
    });
    const byName = getDisplayProcessor({ field, theme: nameThemeOf(theme) });
    expect(namesOf(theme, field)).toEqual(field.values.map((v) => byName(v).color));
  });
});

describe('names only a theme plugin resolves (Atlas extras)', () => {
  const field = (theme: GrafanaTheme2) =>
    makeField(theme, {
      values: ['a', 'b'],
      config: {
        mappings: [
          {
            type: MappingType.ValueToText,
            options: { a: { color: 'super-light-gray', index: 0 }, b: { color: 'teal', index: 1 } },
          },
        ],
      },
    });

  it('Atlas: both are names with five ranked shades', () => {
    const theme = themes['Atlas light'];
    expect(namesOf(theme, field(theme))).toEqual(['super-light-gray', 'teal']);
    expect(getRelativeShadeColor(theme, 'super-light-gray', 'stronger')).toBe(
      theme.visualization.getColorByName('dark-gray')
    );
  });

  it('stock Grafana: super-light-gray is unknown (drawn black), teal is a CSS colour without shades', () => {
    const theme = themes['Grafana light'];
    expect(namesOf(theme, field(theme))).toEqual([undefined, 'teal']);
    expect(getRelativeShadeColor(theme, 'teal', 'soft')).toBeUndefined(); // falls back to the state colour
  });
});
