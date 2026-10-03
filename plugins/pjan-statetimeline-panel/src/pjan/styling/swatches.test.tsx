import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';

import {
  type FieldConfig,
  FieldColorModeId,
  FieldMatcherID,
  type FieldConfigSource,
  MappingType,
  ThemeContext,
} from '@grafana/data';
import { type VizLegendItem } from '@grafana/ui';
import { getRelativeShadeColor, toCanvasColor } from '@pjan/grafana-styling';

import { prepareTimelineLegendItems } from '../../core/components/TimelineChart/utils';

import { getLegendItemsWithDrawnColors, useFieldsWithDrawnColors } from './swatches';
import { LIGHT as theme, processFrame, THEMES } from './testdata/fixtures';

const config: FieldConfig = {
  mappings: [
    {
      type: MappingType.ValueToText,
      options: { up: { color: 'green', index: 0 }, down: { color: 'red', index: 1 } },
    },
  ],
};
const frameWith = (fieldConfig: FieldConfigSource) =>
  processFrame(theme, ['a', 'b'], ['up', 'down'], fieldConfig, config);
const onRow = (name: string, value: unknown): FieldConfigSource => ({
  defaults: {},
  overrides: [
    { matcher: { id: FieldMatcherID.byName, options: name }, properties: [{ id: 'custom.styling.fillColor', value }] },
  ],
});
const legendOf = (fieldConfig: FieldConfigSource, look?: 'pill') => {
  const frames = [frameWith(fieldConfig)];
  const items = prepareTimelineLegendItems(frames, { showLegend: true } as never, theme);
  return getLegendItemsWithDrawnColors(items, frames, theme, { look });
};
const colorsOf = (items?: VizLegendItem[]) => items?.map((item) => [item.label, item.color]);
const shade = (name: string, s: Parameters<typeof getRelativeShadeColor>[2]) =>
  toCanvasColor(theme, getRelativeShadeColor(theme, name, s)!);
const green = theme.visualization.getColorByName('green');
const red = theme.visualization.getColorByName('red');

describe('getLegendItemsWithDrawnColors', () => {
  it('returns core’s items as they are when nothing is set', () => {
    const frames = [frameWith({ defaults: {}, overrides: [] })];
    const items = prepareTimelineLegendItems(frames, { showLegend: true } as never, theme);
    expect(getLegendItemsWithDrawnColors(items, frames, theme, {})).toBe(items);
  });

  it('shows the fill drawn: the default for every row', () => {
    const items = legendOf({
      defaults: { custom: { styling: { fillColor: { mode: 'shade', shade: 'stronger' } } } },
      overrides: [],
    });
    expect(colorsOf(items)).toEqual([
      ['up', shade('green', 'stronger')],
      ['down', shade('red', 'stronger')],
    ]);
  });

  it('per row: the first row that has the state colour decides', () => {
    // row a is not styled and has green: green stays
    expect(colorsOf(legendOf(onRow('b', { mode: 'shade', shade: 'softer' })))).toEqual([
      ['up', green],
      ['down', red],
    ]);
    expect(colorsOf(legendOf(onRow('a', { mode: 'shade', shade: 'softer' })))).toEqual([
      ['up', shade('green', 'softer')],
      ['down', shade('red', 'softer')],
    ]);
  });

  it('a hex state colour shows the shade of its nearest hue that the boxes are drawn in', () => {
    // #629E51 (Grafana's classic palette) is nearest Grafana light's green (a separate implementation of the rule)
    const hexConfig: FieldConfig = {
      mappings: [{ type: MappingType.ValueToText, options: { up: { color: '#629E51', index: 0 } } }],
    };
    const frames = [
      processFrame(
        theme,
        ['a'],
        ['up'],
        { defaults: { custom: { styling: { fillColor: { mode: 'shade', shade: 'softer' } } } }, overrides: [] },
        hexConfig
      ),
    ];
    const items = prepareTimelineLegendItems(frames, { showLegend: true } as never, theme);
    expect(colorsOf(getLegendItemsWithDrawnColors(items, frames, theme, {}))).toEqual([
      ['up', shade('green', 'softer')],
    ]);
  });

  it('a classic palette: each row’s own slot decides, so an override on a later row shows in its item', () => {
    // Atlas light's palette is hex: series 0, 1, 2 are lime, violet and cyan 600; only row c is styled
    const atlas = THEMES['Atlas light'];
    const frames = [
      processFrame(
        atlas,
        ['a', 'b', 'c'],
        ['up'],
        {
          defaults: { color: { mode: FieldColorModeId.PaletteClassic } },
          overrides: [
            {
              matcher: { id: FieldMatcherID.byName, options: 'c' },
              properties: [{ id: 'custom.styling.fillColor', value: { mode: 'shade', shade: 'softer' } }],
            },
          ],
        },
        { color: { mode: FieldColorModeId.PaletteClassic } }
      ),
    ];
    const cyan = frames[0].fields[3].display!('up').color!;
    expect(cyan).toBe(atlas.visualization.palette[2]);
    const items: VizLegendItem[] = frames[0].fields.slice(1).map((field, i) => ({
      label: field.name,
      color: field.display!('up').color!,
      yAxis: i,
    }));
    expect(colorsOf(getLegendItemsWithDrawnColors(items, frames, atlas, {}))).toEqual([
      ['a', atlas.visualization.palette[0]],
      ['b', atlas.visualization.palette[1]],
      ['c', toCanvasColor(atlas, getRelativeShadeColor(atlas, 'cyan', 'softer')!)],
    ]);
  });

  it('the Pill look: the softest shade, its opaque fill', () => {
    expect(colorsOf(legendOf({ defaults: {}, overrides: [] }, 'pill'))).toEqual([
      ['up', shade('green', 'softer')],
      ['down', shade('red', 'softer')],
    ]);
  });
});

describe('useFieldsWithDrawnColors', () => {
  // The panel's theme, which the frame was processed with
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );

  it('returns the frame’s own fields when nothing is set', () => {
    const frame = frameWith({ defaults: {}, overrides: [] });
    const { result } = renderHook(() => useFieldsWithDrawnColors(frame, {}), { wrapper });
    expect(result.current).toBe(frame.fields);
  });

  it('gives the styled rows the fill drawn as display colour, and keeps the rest', () => {
    const frame = frameWith(onRow('b', { mode: 'shade', shade: 'strong' }));
    const { result } = renderHook(() => useFieldsWithDrawnColors(frame, undefined), { wrapper });
    const [time, a, b] = result.current;
    expect(time).toBe(frame.fields[0]);
    expect(a).toBe(frame.fields[1]);
    expect(b.display!('up')).toEqual({ ...frame.fields[2].display!('up'), color: shade('green', 'strong') });
    expect(b.config).toBe(frame.fields[2].config);
  });
});
