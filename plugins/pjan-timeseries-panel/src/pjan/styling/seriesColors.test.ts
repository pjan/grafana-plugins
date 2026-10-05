import {
  createTheme,
  type Field,
  FieldColorModeId,
  FieldType,
  getFieldSeriesColor,
  type GrafanaTheme2,
} from '@grafana/data';
import { GraphDrawStyle, GraphGradientMode, VisibilityMode } from '@grafana/schema';
import { getCanvasContext, UPlotConfigBuilder } from '@grafana/ui';
import type uPlot from 'uplot';

import { applyFillAndPointColors, getFill, getSeriesColors } from './seriesColors';

const LIGHT = createTheme({ colors: { mode: 'light' } });
const DARK = createTheme({ colors: { mode: 'dark' } });

// A number field as the panel gets it: classic palette, first series (green), drawn as a line
const field = (custom: Record<string, unknown>, config: Partial<Field['config']> = {}, seriesIndex = 0): Field => ({
  name: 'value',
  type: FieldType.number,
  values: [1, 2, 3],
  config: {
    color: { mode: FieldColorModeId.PaletteClassic },
    ...config,
    custom: {
      drawStyle: GraphDrawStyle.Line,
      lineWidth: 1,
      fillOpacity: 0,
      showPoints: VisibilityMode.Auto,
      ...custom,
    },
  },
  state: { seriesIndex },
});

const color = (theme: GrafanaTheme2, name: string) => theme.visualization.getColorByName(name);
const STRONGER_LINE = { styling: { lineColor: { mode: 'shade', shade: 'stronger' } } };

describe('getSeriesColors', () => {
  it('draws as core with nothing set', () => {
    expect(getSeriesColors(field({}), LIGHT)).toBeUndefined();
    expect(getSeriesColors(field({ styling: {} }), LIGHT)).toBeUndefined();
    // incomplete values count as unset (the editor saves `{ mode: 'fixed' }` until a colour is picked)
    expect(getSeriesColors(field({ styling: { lineColor: { mode: 'fixed' } } }), LIGHT)).toBeUndefined();
    // Series color is not a Line color choice (unset already is the series colour)
    expect(getSeriesColors(field({ styling: { lineColor: { mode: 'series' } } }), LIGHT)).toBeUndefined();
  });

  it('takes a shade of the series colour, ranked by contrast with the panel background', () => {
    // the first classic palette colour is green: Stronger is its darkest shade on white, its lightest on dark gray
    expect(getSeriesColors(field(STRONGER_LINE), LIGHT)).toEqual({ line: color(LIGHT, 'dark-green') });
    expect(getSeriesColors(field(STRONGER_LINE), DARK)).toEqual({ line: color(DARK, 'super-light-green') });
    expect(getSeriesColors(field({ styling: { lineColor: { mode: 'shade', shade: 'softer' } } }), LIGHT)).toEqual({
      line: color(LIGHT, 'super-light-green'),
    });
  });

  it('takes the shades of the nearest theme hue for a colour without a name, else the colour itself', () => {
    // #7EB26D: a green without a Grafana name (Grafana's old palette)
    const green = field(STRONGER_LINE, { color: { mode: FieldColorModeId.Fixed, fixedColor: '#7EB26D' } });
    expect(getSeriesColors(green, LIGHT)).toEqual({ line: color(LIGHT, 'dark-green') });
    // gray: Grafana's stock themes have no gray hue, so the series colour itself
    const gray = field(STRONGER_LINE, { color: { mode: FieldColorModeId.Fixed, fixedColor: '#888888' } });
    expect(getSeriesColors(gray, LIGHT)).toEqual({ line: '#888888' });
  });

  it('resolves fixed colours as Grafana does, and Series color to the series colour', () => {
    const styled = field({
      fillOpacity: 30,
      showPoints: VisibilityMode.Always,
      styling: {
        lineColor: { mode: 'fixed', fixedColor: 'blue' },
        fillColor: { mode: 'series' },
        pointColor: { mode: 'fixed', fixedColor: '#ff0000' },
      },
    });
    expect(getSeriesColors(styled, LIGHT)).toEqual({
      line: color(LIGHT, 'blue'),
      fill: color(LIGHT, 'green'),
      point: '#ff0000',
    });
    // the second series: the palette's second colour, as Grafana gives it to that series
    const second = field({ fillOpacity: 30, styling: { fillColor: { mode: 'series' } } }, {}, 1);
    expect(getSeriesColors(second, LIGHT)).toEqual({ fill: getFieldSeriesColor(second, LIGHT).color });
    expect(getFieldSeriesColor(second, LIGHT).color).not.toBe(color(LIGHT, 'green'));
  });

  it.each([
    ['the thresholds colour mode', { color: { mode: FieldColorModeId.Thresholds } }],
    ['a continuous scheme', { color: { mode: 'continuous-GrYlRd' } }],
  ])('ignores the options with %s (colours by value)', (_name, config) => {
    const styled = field(
      {
        fillOpacity: 30,
        styling: {
          lineColor: { mode: 'fixed', fixedColor: 'red' },
          fillColor: { mode: 'fixed', fixedColor: 'red' },
          pointColor: { mode: 'fixed', fixedColor: 'red' },
        },
      },
      config as Partial<Field['config']>
    );
    expect(getSeriesColors(styled, LIGHT)).toBeUndefined();
  });

  it('ignores what the editor hides: no line, no fill, no points, the Scheme gradient', () => {
    const all = {
      lineColor: { mode: 'fixed', fixedColor: 'red' },
      fillColor: { mode: 'fixed', fixedColor: 'blue' },
      pointColor: { mode: 'fixed', fixedColor: 'purple' },
    };
    const red = color(LIGHT, 'red');
    const blue = color(LIGHT, 'blue');
    const purple = color(LIGHT, 'purple');
    expect(getSeriesColors(field({ fillOpacity: 20, styling: all }), LIGHT)).toEqual({
      line: red,
      fill: blue,
      point: purple,
    });
    expect(getSeriesColors(field({ lineWidth: 0, fillOpacity: 20, styling: all }), LIGHT)).toEqual({
      fill: blue,
      point: purple,
    });
    expect(getSeriesColors(field({ fillOpacity: 0, styling: all }), LIGHT)).toEqual({ line: red, point: purple });
    expect(getSeriesColors(field({ showPoints: VisibilityMode.Never, styling: all }), LIGHT)).toEqual({ line: red });
    expect(getSeriesColors(field({ drawStyle: GraphDrawStyle.Points, fillOpacity: 20, styling: all }), LIGHT)).toEqual({
      point: purple,
    });
    expect(
      getSeriesColors(field({ gradientMode: GraphGradientMode.Scheme, fillOpacity: 20, styling: all }), LIGHT)
    ).toEqual({ point: purple });
  });

  it('uses the opacity the series is drawn with (core fills a fillBelowTo band at 35 when it is 0)', () => {
    const styled = field({ fillOpacity: 0, styling: { fillColor: { mode: 'fixed', fixedColor: 'blue' } } });
    expect(getSeriesColors(styled, LIGHT)).toBeUndefined();
    expect(getSeriesColors(styled, LIGHT, 35)).toEqual({ fill: color(LIGHT, 'blue') });
    // with fillBelowTo the option shows (and applies) at Fill opacity 0
    const band = field({
      fillOpacity: 0,
      fillBelowTo: 'min',
      styling: { fillColor: { mode: 'fixed', fixedColor: 'blue' } },
    });
    expect(getSeriesColors(band, LIGHT, 35)).toEqual({ fill: color(LIGHT, 'blue') });
  });

  it('applies to enum fields too (core draws them as series), and leaves other fields alone', () => {
    const enumField: Field = { ...field(STRONGER_LINE), type: FieldType.enum };
    expect(getSeriesColors(enumField, LIGHT)).toEqual({ line: color(LIGHT, 'dark-green') });
    const time: Field = { ...field(STRONGER_LINE), type: FieldType.time };
    expect(getSeriesColors(time, LIGHT)).toBeUndefined();
    const text: Field = { ...field(STRONGER_LINE), type: FieldType.string };
    expect(getSeriesColors(text, LIGHT)).toBeUndefined();
  });
});

// Grafana's own series config for a line colour, with no fill colour: the oracle for getFill
const grafanaSeries = (lineColor: string, gradientMode: GraphGradientMode, fillOpacity: number, theme = LIGHT) => {
  const builder = new UPlotConfigBuilder();
  builder.addSeries({
    scaleKey: 'y',
    lineColor,
    fillOpacity,
    gradientMode,
    theme,
    drawStyle: GraphDrawStyle.Line,
    showPoints: VisibilityMode.Auto,
  });
  return builder.getConfig().series[1];
};

// Calls a canvas gradient function and records what it asks of the canvas (Grafana's gradients draw on a shared canvas
// context): the gradient's coordinates and its colour stops
const record = (fill: uPlot.Series.Fill | undefined) => {
  if (typeof fill !== 'function') {
    return fill;
  }
  const calls: unknown[] = [];
  const linear = jest.spyOn(getCanvasContext(), 'createLinearGradient').mockImplementation((...args: number[]) => {
    calls.push(['linear', ...args]);
    return { addColorStop: (offset: number, c: string) => calls.push(['stop', offset, c]) } as CanvasGradient;
  });
  const plot = {
    bbox: { left: 10, top: 20, width: 300, height: 100 },
    series: [{}, { scale: 'y' }],
    scales: { x: { ori: 0 }, y: { min: 0, max: 100 } },
  } as unknown as uPlot;
  (fill as (u: uPlot, i: number) => unknown)(plot, 1);
  linear.mockRestore();
  return calls;
};

describe('getFill', () => {
  it.each([
    [GraphGradientMode.None, 40],
    [GraphGradientMode.None, 0],
    [GraphGradientMode.Opacity, 60],
    [GraphGradientMode.Hue, 25],
  ])('builds the fill of a colour as Grafana builds it from the line colour (%s, %i %%)', (mode, opacity) => {
    const blue = color(LIGHT, 'blue');
    const ours = record(getFill(blue, mode, opacity, LIGHT));
    expect(ours).toEqual(record(grafanaSeries(blue, mode, opacity).fill));
    // a gradient: one linear gradient and its two colour stops; otherwise the colour at the opacity, or no fill
    if (mode === GraphGradientMode.None) {
      expect(ours).toBe(opacity > 0 ? '#3274D966' : undefined);
    } else {
      expect(ours).toHaveLength(3);
    }
  });
});

// The config without its functions (paths, value: new ones per build), and its keys
const plain = (config: object) => [Object.keys(config).sort(), JSON.parse(JSON.stringify(config))];

// UPlotConfigBuilder caches its config once built: each test builds a fresh one
const builderWithSeries = () => {
  const builder = new UPlotConfigBuilder();
  builder.addSeries({
    scaleKey: 'y',
    lineColor: '#00ff00',
    fillOpacity: 50,
    theme: LIGHT,
    drawStyle: GraphDrawStyle.Line,
    showPoints: VisibilityMode.Always,
    pointSize: 6,
  });
  return builder;
};

describe('applyFillAndPointColors', () => {
  it('replaces the fill and the points’ colours of the last series, and nothing else', () => {
    const before = builderWithSeries().getConfig().series[1];
    const builder = builderWithSeries();
    applyFillAndPointColors(builder, { fill: '#0000ff', point: '#ff0000' }, GraphGradientMode.None, 50, LIGHT);
    const after = builder.getConfig().series[1];
    expect(before.fill).toBe('#00ff0080');
    expect(after.fill).toBe('#0000ff80');
    expect(after.points).toEqual({ ...before.points, stroke: '#ff0000', fill: '#ff0000' });
    expect(plain({ ...after, fill: before.fill, points: before.points })).toEqual(plain(before));
  });

  it('gives an Opacity or Hue gradient fill in the fill colour', () => {
    for (const mode of [GraphGradientMode.Opacity, GraphGradientMode.Hue]) {
      const builder = builderWithSeries();
      applyFillAndPointColors(builder, { fill: '#0000ff' }, mode, 50, LIGHT);
      const fill = builder.getConfig().series[1].fill;
      expect(typeof fill).toBe('function');
      expect(record(fill)).toEqual(record(getFill('#0000ff', mode, 50, LIGHT)));
    }
  });

  it('keeps Grafana’s config without a fill or point colour', () => {
    const before = builderWithSeries().getConfig().series[1];
    const builder = builderWithSeries();
    applyFillAndPointColors(builder, { line: '#ff0000' }, GraphGradientMode.None, 50, LIGHT);
    expect(plain(builder.getConfig().series[1])).toEqual(plain(before));
  });
});
