import {
  createTheme,
  type DataFrame,
  type Field,
  type FieldConfigSource,
  FieldColorModeId,
  FieldType,
} from '@grafana/data';
import { GraphDrawStyle } from '@grafana/schema';

import { hasLineColor, withPickedColor } from './legendColor';

const LIGHT = createTheme({ colors: { mode: 'light' } });

const series = (name: string, seriesIndex: number, styling?: object): Field => ({
  name,
  type: FieldType.number,
  values: [1, 2],
  config: {
    color: { mode: FieldColorModeId.PaletteClassic },
    custom: { drawStyle: GraphDrawStyle.Line, lineWidth: 1, ...(styling ? { styling } : {}) },
  },
  state: { seriesIndex },
});
const frames: DataFrame[] = [
  {
    fields: [
      { name: 'time', type: FieldType.time, values: [1, 2], config: {} },
      series('a', 0, { lineColor: { mode: 'shade', shade: 'stronger' } }),
      series('b', 1),
    ],
    length: 2,
  },
];

const PICKED = [
  { id: 'color', value: { mode: 'fixed', fixedColor: 'purple' } },
  { id: 'custom.styling.lineColor', value: { mode: 'fixed', fixedColor: 'purple' } },
];

describe('hasLineColor', () => {
  it('is true for a series with a Line color drawn, by its legend label', () => {
    expect(hasLineColor(frames, 'a', LIGHT)).toBe(true);
    expect(hasLineColor(frames, 'b', LIGHT)).toBe(false);
    expect(hasLineColor(frames, 'nope', LIGHT)).toBe(false);
    expect(hasLineColor(null, 'a', LIGHT)).toBe(false);
  });
});

describe('withPickedColor', () => {
  const empty: FieldConfigSource = { defaults: {}, overrides: [] };

  it('adds the series’ override with the colour and the Line color, as Grafana adds the colour', () => {
    expect(withPickedColor(empty, 'a', 'purple')).toEqual({
      defaults: {},
      overrides: [{ matcher: { id: 'byName', options: 'a' }, properties: PICKED }],
    });
  });

  it('updates the series’ existing override, keeping its other properties and the other overrides', () => {
    const other = { matcher: { id: 'byName', options: 'b' }, properties: [{ id: 'color', value: 'x' }] };
    const fieldConfig: FieldConfigSource = {
      defaults: { unit: 'short' },
      overrides: [
        other,
        {
          matcher: { id: 'byName', options: 'a' },
          properties: [
            { id: 'displayName', value: 'A' },
            { id: 'custom.styling.lineColor', value: { mode: 'shade', shade: 'softer' } },
          ],
        },
      ],
    };
    expect(withPickedColor(fieldConfig, 'a', 'purple')).toEqual({
      defaults: { unit: 'short' },
      overrides: [
        other,
        {
          matcher: { id: 'byName', options: 'a' },
          properties: [{ id: 'displayName', value: 'A' }, PICKED[1], PICKED[0]],
        },
      ],
    });
    // the field config itself is not changed
    expect(fieldConfig.overrides[1].properties).toHaveLength(2);
  });
});
