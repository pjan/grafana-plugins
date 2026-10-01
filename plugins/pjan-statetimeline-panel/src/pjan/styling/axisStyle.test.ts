import type uPlot from 'uplot';

import {
  dateTime,
  type FieldConfig,
  FieldMatcherID,
  type FieldConfigSource,
  MappingType,
  type TimeRange,
} from '@grafana/data';
import { FIXED_UNIT, UPlotConfigBuilder } from '@grafana/ui';
import { getColorNameLookup, getSoftestReadableShadeColor, toCanvasColor } from '@pjan/grafana-styling';

import { addAxisStyling, DAY_BOUNDARY_FONT_WEIGHT, getCurrentStateValue, getRowNameStateColor } from './axisStyle';
import { type TimelineStylingOptions } from './options';
import { LIGHT as theme, makeField, processFrame } from './testdata/fixtures';

describe('getCurrentStateValue', () => {
  const times = [0, 10, 20, 30];

  it('is the last non-null value in the time range', () => {
    expect(getCurrentStateValue(times, ['a', 'b', 'c', 'd'], 0, 40)).toBe('d');
    expect(getCurrentStateValue(times, ['a', 'b', null, undefined], 0, 40)).toBe('b');
    // values after the range don't count
    expect(getCurrentStateValue(times, ['a', 'b', 'c', 'd'], 0, 25)).toBe('c');
  });

  it('counts the last value before the range: its box is drawn from the start of the range', () => {
    expect(getCurrentStateValue(times, ['a', 'b', null, null], 15, 40)).toBe('b');
    expect(getCurrentStateValue(times, ['a', 'b', 'c', 'd'], 35, 40)).toBe('d');
    // earlier ones don't
    expect(getCurrentStateValue(times, ['a', null, null, null], 15, 40)).toBeUndefined();
  });

  it('is undefined for a row without values in the range', () => {
    expect(getCurrentStateValue(times, [null, null, null, null], 0, 40)).toBeUndefined();
    expect(getCurrentStateValue(times, ['a', 'b', 'c', 'd'], -20, -10)).toBeUndefined();
  });
});

describe('getRowNameStateColor', () => {
  const field = makeField(theme, {
    values: ['ok', 'warn', 'dim', 'ink'],
    config: {
      mappings: [
        {
          type: MappingType.ValueToText,
          options: {
            ok: { color: 'super-light-green', index: 0 },
            warn: { color: 'yellow', index: 1 },
            dim: { color: '#dddddd', index: 2 },
            ink: { color: '#333333', index: 3 },
          },
        },
      ],
    },
  });
  const names = getColorNameLookup(field, theme);
  const colorOf = (value: string) => getRowNameStateColor(theme, names, field.display!(value).color!);

  it('is the softest shade of the hue that reaches 4.5:1 on the panel background', () => {
    // green on white: 1.67, 2.24, 3.02, 4.51, 6.00
    expect(colorOf('ok')).toBe(toCanvasColor(theme, 'semi-dark-green'));
  });

  it('is undefined (theme text) when no shade reaches it', () => {
    // yellow on white: at most 2.50
    expect(colorOf('warn')).toBeUndefined();
  });

  it('uses a colour without a name as is when it reaches 4.5:1, otherwise theme text', () => {
    expect(colorOf('ink')).toBe('rgb(51,51,51)');
    expect(colorOf('dim')).toBeUndefined();
  });
});

// uPlot's axis objects after init, as far as addAxisStyling uses them (uPlot 1.6.32).
const fakePlot = () => {
  const ctx = document.createElement('canvas').getContext('2d')!;
  const x = {
    scale: 'x',
    show: true,
    _pos: 200,
    font: ['12px Inter', 12],
    gap: 5,
    stroke: () => 'axis',
    values: (_u: uPlot, splits: number[], ..._rest: number[]) => splits.map((v) => `t${v}`),
    grid: { stroke: () => 'grid', width: 1, filter: (_u: uPlot, splits: number[]) => splits },
    ticks: { stroke: () => 'grid', show: true, size: 4 },
  };
  const y = {
    scale: FIXED_UNIT,
    show: true,
    _pos: 80,
    font: ['12px Inter', 12],
    gap: 16,
    stroke: () => 'axis',
    _splits: [10, 50, 90],
    _values: ['a', 'b', 'c'],
    ticks: { show: false, size: 4 },
    grid: { show: false },
  };
  // the canvas is 150 px high (jsdom's default); the plot ends above it, where the time labels are
  const u = {
    ctx,
    axes: [x, y],
    bbox: { left: 80, top: 5, width: 200, height: 115 },
    data: [
      [0, 1000],
      ['up', 'up'],
      ['up', 'up'],
      ['up', 'up'],
    ],
    valToPos: (v: number) => v,
  } as unknown as uPlot;
  return { u, x, y, ctx };
};

const hooksOf = (builder: UPlotConfigBuilder) => builder.getConfig().hooks as Record<string, Array<(u: uPlot) => void>>;

describe('addAxisStyling', () => {
  const rows = ['a', 'b', 'c'];
  const config: FieldConfig = {
    mappings: [
      {
        type: MappingType.ValueToText,
        options: { up: { color: 'green', index: 0 }, down: { color: 'red', index: 1 } },
      },
    ],
  };
  const frameWith = (fieldConfig: FieldConfigSource = { defaults: {}, overrides: [] }) =>
    processFrame(theme, rows, ['up', 'up'], fieldConfig, config);
  const range: TimeRange = { from: dateTime(0), to: dateTime(5000), raw: { from: 'now-1h', to: 'now' } };
  const style = (styling: TimelineStylingOptions, frame = frameWith()) => {
    const builder = new UPlotConfigBuilder('utc');
    addAxisStyling(builder, frame, theme, styling, 'utc', () => range);
    return hooksOf(builder);
  };

  it('adds no plot hooks with nothing set', () => {
    expect(style({})).toEqual({});
    expect(style({ look: 'pill', valueOverflow: 'hide', dayBoundaries: false })).toEqual({});
  });

  it('Grid line color and Axis text color replace the axes’ stroke functions', () => {
    const { u, x, y } = fakePlot();
    style({ gridColor: 'red', axisTextColor: 'blue' }).init.forEach((hook) => hook(u));
    expect(x.grid.stroke()).toBe(toCanvasColor(theme, 'red'));
    expect(x.ticks.stroke()).toBe(toCanvasColor(theme, 'red'));
    expect(x.stroke()).toBe(toCanvasColor(theme, 'blue'));
    expect(y.stroke()).toBe(toCanvasColor(theme, 'blue'));
  });

  it('Day boundaries: the 00:00 ticks lose uPlot’s label and grid line and are drawn again, bold', () => {
    const { u, x, ctx } = fakePlot();
    const hooks = style({ dayBoundaries: true, dayBoundaryColor: 'orange' });
    hooks.init.forEach((hook) => hook(u));
    const midnight = Date.UTC(2025, 9, 2);
    const splits = [midnight - 3600_000, midnight, midnight + 3600_000];
    const hour = 3600_000;
    expect(x.values(u, splits, 0, 50, hour)).toEqual([`t${splits[0]}`, '', `t${splits[2]}`]);
    expect(x.grid.filter(u, splits)).toEqual([splits[0], null, splits[2]]);
    // every tick a day: nothing set apart
    expect(x.values(u, splits, 0, 50, 24 * hour)).toEqual(splits.map((v) => `t${v}`));

    x.values(u, splits, 0, 50, hour);
    const fillText = jest.spyOn(ctx, 'fillText');
    const fonts: string[] = [];
    fillText.mockImplementation(() => fonts.push(ctx.font));
    const strokes: string[] = [];
    jest.spyOn(ctx, 'stroke').mockImplementation(() => strokes.push(String(ctx.strokeStyle)));
    // the label with the axes, under the boxes
    hooks.drawAxes.forEach((hook) => hook(u));
    expect(fillText).toHaveBeenCalledTimes(1);
    expect(fillText.mock.calls[0][0]).toBe(`t${midnight}`);
    expect(fonts[0]).toMatch(new RegExp(`^${DAY_BOUNDARY_FONT_WEIGHT} `));
    expect(strokes).toEqual([]);
    // the line after the series, over the boxes
    hooks.draw.forEach((hook) => hook(u));
    expect(strokes).toEqual(['#ff780a']); // orange, as the canvas keeps it
    expect(fillText).toHaveBeenCalledTimes(1);
  });

  it('Row name color: an override on row 2 redraws row 2 only', () => {
    const frame = frameWith({
      defaults: {},
      overrides: [
        {
          matcher: { id: FieldMatcherID.byName, options: 'b' },
          properties: [{ id: 'custom.rowNameColor', value: { mode: 'fixed', fixedColor: 'purple' } }],
        },
      ],
    });
    const { u, ctx } = fakePlot();
    const texts: Array<{ text: string; color: string }> = [];
    jest.spyOn(ctx, 'fillText').mockImplementation((text) => texts.push({ text, color: String(ctx.fillStyle) }));
    const clearRect = jest.spyOn(ctx, 'clearRect');
    style({}, frame).drawAxes.forEach((hook) => hook(u));
    expect(texts).toEqual([{ text: 'b', color: '#a352cc' }]);
    // its band reaches halfway to the neighbours' centres (30 and 70), so they keep their pixels
    expect(clearRect).toHaveBeenCalledWith(0, 30, expect.any(Number), 40);
  });

  it('Row name color: the first and last names are cleared within the plot’s height, not into the time labels', () => {
    const frame = frameWith({
      defaults: { custom: { rowNameColor: { mode: 'fixed', fixedColor: 'purple' } } },
      overrides: [],
    });
    const { u, ctx } = fakePlot();
    const clearRect = jest.spyOn(ctx, 'clearRect');
    style({}, frame).drawAxes.forEach((hook) => hook(u));
    // centres 10, 50, 90; the plot from 5 to 120
    expect(clearRect.mock.calls.map(([, top, , height]) => [top, top + height])).toEqual([
      [5, 30],
      [30, 70],
      [70, 120],
    ]);
  });

  it('Row name color "Current state color": reads the plot’s data when drawn (a refresh keeps the config)', () => {
    const frame = frameWith({ defaults: { custom: { rowNameColor: { mode: 'state' } } }, overrides: [] });
    const { u, ctx } = fakePlot();
    const hooks = style({}, frame).drawAxes;
    const colors = () => {
      const texts: string[] = [];
      jest.spyOn(ctx, 'fillText').mockImplementation(() => texts.push(String(ctx.fillStyle)));
      hooks.forEach((hook) => hook(u));
      return texts;
    };
    const readable = (name: string) => getSoftestReadableShadeColor(theme, name, 4.5)!.toLowerCase();
    expect(colors()).toEqual(Array(3).fill(readable('green')));
    // new data for the same plot: row b ends down
    (u.data as unknown[][])[2] = ['up', 'down'];
    expect(colors()).toEqual([readable('green'), readable('red'), readable('green')]);
  });

  it('Row name color "Current state color": the state of the last value in the time range', () => {
    const frame = frameWith({ defaults: { custom: { rowNameColor: { mode: 'state' } } }, overrides: [] });
    const { u, ctx } = fakePlot();
    const texts: Array<{ text: string; color: string }> = [];
    jest.spyOn(ctx, 'fillText').mockImplementation((text) => texts.push({ text, color: String(ctx.fillStyle) }));
    style({}, frame).drawAxes.forEach((hook) => hook(u));
    // green's softest shade with 4.5:1 on white is semi-dark-green
    const semiDarkGreen = theme.visualization.getColorByName('semi-dark-green').toLowerCase();
    expect(texts).toEqual(rows.map((text) => ({ text, color: semiDarkGreen })));
  });
});
