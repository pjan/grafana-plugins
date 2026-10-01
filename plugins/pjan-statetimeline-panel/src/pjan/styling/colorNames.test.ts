import { dateTime, type FieldColorModeId, FieldType, ThresholdsMode } from '@grafana/data';
import { getColorNameLookup } from '@pjan/grafana-styling';

import { prepareTimelineFields } from '../../core/components/TimelineChart/utils';

import { makeField, THEMES as themes } from './testdata/fixtures';

// The shared package tests the colour names of a field; this checks them on the fields the timeline draws.
describe.each(Object.entries(themes))('colour names of timeline fields (%s)', (_, theme) => {
  const namesOf = (field: ReturnType<typeof makeField>) => {
    const lookup = getColorNameLookup(field, theme);
    return field.values.map((v) => lookup.get(field.display!(v).color!));
  };

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
    expect(namesOf(merged)).toEqual(['green', 'light-orange', 'dark-red']);
  });
});
