import {
  createTheme,
  type DataFrame,
  type Field,
  FieldColorModeId,
  FieldType,
  getDisplayProcessor,
  getFieldSeriesColor,
} from '@grafana/data';
import { GraphDrawStyle, GraphGradientMode } from '@grafana/schema';

import { withLineSwatchDisplay, withLineSwatches } from './swatches';

const LIGHT = createTheme({ colors: { mode: 'light' } });

const series = (name: string, seriesIndex: number, styling?: object): Field => {
  const field: Field = {
    name,
    type: FieldType.number,
    values: [1, 2],
    config: {
      color: { mode: FieldColorModeId.PaletteClassic },
      custom: { drawStyle: GraphDrawStyle.Line, lineWidth: 1, ...(styling ? { styling } : {}) },
    },
    state: { seriesIndex },
  };
  field.display = getDisplayProcessor({ field, theme: LIGHT });
  return field;
};
const frame = (...fields: Field[]): DataFrame => ({
  fields: [{ name: 'time', type: FieldType.time, values: [1, 2], config: {} }, ...fields],
  length: 2,
});
const darkRed = LIGHT.visualization.getColorByName('dark-red');

describe('withLineSwatches (legend)', () => {
  it('gives a series with a Line color that colour, and leaves the others', () => {
    const frames = [frame(series('a', 0, { lineColor: { mode: 'fixed', fixedColor: 'dark-red' } }), series('b', 1))];
    const [legend] = withLineSwatches(frames, LIGHT);
    expect(getFieldSeriesColor(legend.fields[1], LIGHT).color).toBe(darkRed);
    expect(legend.fields[2]).toBe(frames[0].fields[2]);
    // the frame itself is not changed
    expect(getFieldSeriesColor(frames[0].fields[1], LIGHT).color).not.toBe(darkRed);
  });

  it('returns the frames themselves when no series has a Line color', () => {
    const frames = [frame(series('a', 0), series('b', 1, { fillColor: { mode: 'series' } }))];
    expect(withLineSwatches(frames, LIGHT)).toBe(frames);
  });

  it.each([
    ['line width 0', { lineWidth: 0 }],
    ['the Points style', { drawStyle: GraphDrawStyle.Points }],
    ['the Scheme gradient', { gradientMode: GraphGradientMode.Scheme }],
  ])('keeps the series colour where Line color is hidden (%s)', (_name, custom) => {
    const styled = series('a', 0, { lineColor: { mode: 'fixed', fixedColor: 'dark-red' } });
    styled.config.custom = { ...styled.config.custom, ...custom };
    const frames = [frame(styled)];
    expect(withLineSwatches(frames, LIGHT)).toBe(frames);
    expect(withLineSwatchDisplay(frames[0], LIGHT)).toBe(frames[0]);
  });
});

describe('withLineSwatchDisplay (tooltip)', () => {
  it('gives a series with a Line color that display colour, and keeps its text', () => {
    const aligned = frame(series('a', 0, { lineColor: { mode: 'fixed', fixedColor: 'dark-red' } }), series('b', 1));
    const tooltip = withLineSwatchDisplay(aligned, LIGHT);
    expect(tooltip.fields[1].display!(2)).toEqual({ ...aligned.fields[1].display!(2), color: darkRed });
    expect(tooltip.fields[2]).toBe(aligned.fields[2]);
  });

  it('returns the frame itself when no series has a Line color', () => {
    const aligned = frame(series('a', 0), series('b', 1));
    expect(withLineSwatchDisplay(aligned, LIGHT)).toBe(aligned);
  });

  it('works the frame out once per aligned frame and theme', () => {
    const aligned = frame(series('a', 0, { lineColor: { mode: 'fixed', fixedColor: 'dark-red' } }));
    const first = withLineSwatchDisplay(aligned, LIGHT);
    expect(withLineSwatchDisplay(aligned, LIGHT)).toBe(first);
    const dark = createTheme({ colors: { mode: 'dark' } });
    expect(withLineSwatchDisplay(aligned, dark)).not.toBe(first);
    expect(withLineSwatchDisplay(aligned, dark).fields[1].display!(1).color).toBe(
      dark.visualization.getColorByName('dark-red')
    );
  });
});
