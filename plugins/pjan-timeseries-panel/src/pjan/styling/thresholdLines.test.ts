import { createDataFrame, createTheme, FieldType, type ThresholdsConfig, ThresholdsMode } from '@grafana/data';
import { GraphThresholdsStyleMode } from '@grafana/schema';
import { UPlotConfigBuilder } from '@grafana/ui';
import tinycolor from 'tinycolor2';
import uPlot from 'uplot';

import { preparePlotConfigBuilder } from '../../core/components/TimeSeries/utils';
import {
  getThresholdsDrawHook,
  type UPlotThresholdOptions,
} from '../../packages/grafana-ui/src/components/uPlot/config/UPlotThresholds';

import {
  addThresholdLines,
  getThresholdLineColor,
  getThresholdLineStyle,
  type ThresholdLineStyle,
  toCanvasWidth,
} from './thresholdLines';

const LIGHT = createTheme({ colors: { mode: 'light' } });
const DARK = createTheme({ colors: { mode: 'dark' } });

// Grafana 13.2.3's colours (theme.visualization.getColorByName), and the shades ranked by contrast with the panel
// background (white in light, #181b1f in dark): red's Stronger is dark-red #AD0317 (contrast 7.5) in light and
// super-light-red #FFA6B0 (9.3) in dark; blue's dark-blue #1250B0 and super-light-blue #C0D8FF.
const RED = { stronger: '#AD0317', darkStronger: '#FFA6B0' };
const BLUE = { stronger: '#1250B0' };

const steps = (...list: Array<[number, string]>): ThresholdsConfig => ({
  mode: ThresholdsMode.Absolute,
  steps: list.map(([value, color]) => ({ value, color })),
});
// green / red 50 / transparent 70 / blue 90: below the first transparent step (index 2), the lines of steps 1 and 2
// take the previous step's colour: 50 green, 70 red; 90 blue
const TRANSPARENT_MID = steps([-Infinity, 'green'], [50, 'red'], [70, 'transparent'], [90, 'blue']);

// A stand-in for the plot: a 0-100 y scale (whatever its key) over a plot area 200 px tall from y 10.25 (canvas
// pixels), so that the rounding of the line positions shows
const Y = { min: 0, max: 100 };
const plot = (ctx: object, ori = 0) =>
  ({
    ctx,
    bbox: { left: 20, top: 10.25, width: 300, height: 200 },
    scales: new Proxy({ x: { min: 0, max: 1, ori } }, { get: (x, key) => (key === 'x' ? x.x : Y) }),
    series: [{}, { show: true, scale: 'y' }],
    data: [
      [0, 1],
      [20, 80],
    ],
    valToPos: (v: number) => 10.25 + 200 * (1 - v / 100),
  }) as unknown as uPlot;

type DrawHook = (u: uPlot) => void;

/** Runs a draw hook on a canvas context that records what is drawn, in order. */
const record = (hook: DrawHook | undefined, ori = 0) => {
  const log: unknown[] = [];
  const ctx = {
    strokeStyle: '' as unknown,
    fillStyle: '' as unknown,
    lineWidth: 1,
    save: () => log.push('save'),
    restore: () => log.push('restore'),
    beginPath: () => log.push('beginPath'),
    moveTo: (x: number, y: number) => log.push(['moveTo', x, y]),
    lineTo: (x: number, y: number) => log.push(['lineTo', x, y]),
    translate: (x: number, y: number) => log.push(['translate', x, y]),
    setLineDash: (dash: number[]) => log.push(['setLineDash', dash]),
    stroke: () => log.push(['stroke', ctx.strokeStyle, ctx.lineWidth]),
    fillRect: (...args: number[]) => {
      // a scale gradient (Grafana's shared canvas, jest-canvas-mock): its colour stops
      const fill = ctx.fillStyle as string | { addColorStop: jest.Mock };
      log.push(['fillRect', ...args, typeof fill === 'string' ? fill : fill.addColorStop.mock.calls]);
    },
  };
  hook!(plot(ctx, ori));
  return log;
};

const strokes = (log: unknown[]) =>
  log.filter((entry): entry is [string, string, number] => Array.isArray(entry) && entry[0] === 'stroke');

const options = (mode: GraphThresholdsStyleMode, thresholds: ThresholdsConfig, extra = {}): UPlotThresholdOptions => ({
  scaleKey: 'y',
  thresholds,
  config: { mode },
  theme: LIGHT,
  ...extra,
});

const drawClearHooks = (builder: UPlotConfigBuilder) =>
  (builder.getConfig().hooks?.drawClear ?? []).filter((hook): hook is DrawHook => hook !== undefined);

// Grafana's own hook, as its config builder adds it
const coreHook = (opts: UPlotThresholdOptions) => {
  const builder = new UPlotConfigBuilder();
  builder.addThresholds(opts);
  return drawClearHooks(builder)[0]!;
};

describe('the copied threshold hook', () => {
  it.each([
    ['line', options(GraphThresholdsStyleMode.Line, steps([-Infinity, 'green'], [50, 'orange'], [70, 'red']))],
    ['dashed', options(GraphThresholdsStyleMode.Dashed, steps([-Infinity, 'green'], [50, 'orange'], [70, 'red']))],
    ['area', options(GraphThresholdsStyleMode.Area, steps([-Infinity, 'green'], [50, 'orange'], [70, 'red']))],
    [
      'line+area',
      options(GraphThresholdsStyleMode.LineAndArea, steps([-Infinity, 'green'], [50, 'orange'], [70, 'red'])),
    ],
    [
      'percentage, dashed+area',
      options(
        GraphThresholdsStyleMode.DashedAndArea,
        { ...steps([-Infinity, 'green'], [40, 'yellow'], [80, 'red']), mode: ThresholdsMode.Percentage },
        { hardMin: 0, hardMax: 200 }
      ),
    ],
    ['a transparent mid step', options(GraphThresholdsStyleMode.LineAndArea, TRANSPARENT_MID)],
    ['an rgba step', options(GraphThresholdsStyleMode.Line, steps([-Infinity, 'green'], [60, 'rgba(255, 0, 0, 0.4)']))],
  ])('draws as Grafana’s own without options: %s', (_name, opts) => {
    const ours = record(getThresholdsDrawHook(opts));
    expect(ours).toEqual(record(coreHook(opts)));
    expect(ours.some((entry) => Array.isArray(entry) && ['stroke', 'fillRect'].includes(entry[0]))).toBe(true);
  });

  it('draws Grafana’s lines where worked out by hand', () => {
    // y = round(10.25 + 200 × (1 − v / 100)): 110 for 50, 70 for 70, 30 for 90; below the transparent step 50 green
    // and 70 red, 90 blue, each at alpha 0.7; 2 px, solid
    const log = record(getThresholdsDrawHook(options(GraphThresholdsStyleMode.Line, TRANSPARENT_MID)));
    expect(log).toEqual([
      'save',
      ['setLineDash', []],
      ...[
        [110, 'rgba(86, 166, 75, 0.7)'], // green #56A64B
        [70, 'rgba(224, 47, 68, 0.7)'], // red #E02F44
        [30, 'rgba(50, 116, 217, 0.7)'], // blue #3274D9
      ].flatMap(([y, color]) => ['beginPath', ['moveTo', 20, y], ['lineTo', 320, y], ['stroke', color, 2]]),
      'restore',
    ]);
  });

  it('takes the colour and the width from its `lines` option, and leaves out a line it has no colour for', () => {
    const lines: ThresholdLineStyle = {
      color: (color, name) => (name === 'blue' ? undefined : `${name}@${color.getAlpha()}`),
      width: () => 3,
    };
    const log = record(getThresholdsDrawHook({ ...options(GraphThresholdsStyleMode.Line, TRANSPARENT_MID), lines }));
    // the step colour each line was resolved from: green for 50 and red for 70 (below the first transparent step)
    expect(strokes(log)).toEqual([
      ['stroke', 'green@0.7', 3],
      ['stroke', 'red@0.7', 3],
    ]);
    // an odd width is shifted by half a pixel across the line, as uPlot shifts its series
    expect(log).toContainEqual(['translate', 0, 0.5]);
    expect(log.indexOf('beginPath')).toBeGreaterThan(log.findIndex((e) => Array.isArray(e) && e[0] === 'translate'));
    // vertical lines (the x scale vertical): shifted along x
    const vertical = record(
      getThresholdsDrawHook({ ...options(GraphThresholdsStyleMode.Line, TRANSPARENT_MID), lines }),
      1
    );
    expect(vertical).toContainEqual(['translate', 0.5, 0]);
    const even = record(
      getThresholdsDrawHook({
        ...options(GraphThresholdsStyleMode.Line, TRANSPARENT_MID),
        lines: { color: () => '#000', width: () => 4 },
      })
    );
    expect(even.filter((entry) => Array.isArray(entry) && entry[0] === 'translate')).toEqual([]);
    expect(strokes(even).map(([, , width]) => width)).toEqual([4, 4, 4]);
  });

  it('keeps Grafana’s width and dashes when the option gives no width', () => {
    const log = record(
      getThresholdsDrawHook({
        ...options(GraphThresholdsStyleMode.Dashed, TRANSPARENT_MID),
        lines: { color: () => '#000', width: () => undefined },
      })
    );
    expect(log).toContainEqual(['setLineDash', [10, 10]]);
    expect(strokes(log).map(([, , width]) => width)).toEqual([2, 2, 2]);
  });
});

describe('getThresholdLineColor', () => {
  // the colour Grafana draws a line in: the step colour, at alpha 0.7 when it has none of its own
  const drawn = (name: string, theme = LIGHT) => {
    const color = tinycolor(theme.visualization.getColorByName(name));
    return color.getAlpha() === 1 ? color.setAlpha(0.7) : color;
  };
  const fixed = (fixedColor: string) => ({ mode: 'fixed' as const, fixedColor });
  const stronger = { mode: 'shade' as const, shade: 'stronger' as const };

  it('keeps Grafana’s colour with only the opacity set, and replaces its alpha', () => {
    expect(getThresholdLineColor(drawn('red'), 'red', undefined, undefined, LIGHT)).toBe('rgba(224, 47, 68, 0.7)');
    expect(getThresholdLineColor(drawn('red'), 'red', undefined, 40, LIGHT)).toBe('rgba(224, 47, 68, 0.4)');
    // the colour's own alpha is replaced too
    const rgba = 'rgba(255, 0, 0, 0.4)';
    expect(getThresholdLineColor(drawn(rgba), rgba, undefined, 90, LIGHT)).toBe('rgba(255, 0, 0, 0.9)');
  });

  it('draws a fixed colour at 0.7, unless it has an alpha of its own or the opacity is set', () => {
    expect(getThresholdLineColor(drawn('red'), 'red', fixed('#00ff00'), undefined, LIGHT)).toBe('rgba(0, 255, 0, 0.7)');
    expect(getThresholdLineColor(drawn('red'), 'red', fixed('blue'), undefined, LIGHT)).toBe('rgba(50, 116, 217, 0.7)');
    expect(getThresholdLineColor(drawn('red'), 'red', fixed('rgba(0, 0, 255, 0.5)'), undefined, LIGHT)).toBe(
      'rgba(0, 0, 255, 0.5)'
    );
    expect(getThresholdLineColor(drawn('red'), 'red', fixed('#00ff00'), 100, LIGHT)).toBe('#00ff00');
    expect(getThresholdLineColor(drawn('red'), 'red', fixed('#00ff00'), 25, LIGHT)).toBe('rgba(0, 255, 0, 0.25)');
  });

  it('takes the shade of each line’s colour, ranked by contrast with the panel background', () => {
    expect(getThresholdLineColor(drawn('red'), 'red', stronger, undefined, LIGHT)).toBe(
      tinycolor(RED.stronger).setAlpha(0.7).toString()
    );
    expect(getThresholdLineColor(drawn('red', DARK), 'red', stronger, undefined, DARK)).toBe(
      tinycolor(RED.darkStronger).setAlpha(0.7).toString()
    );
    expect(getThresholdLineColor(drawn('blue'), 'blue', stronger, 100, LIGHT)).toBe(BLUE.stronger.toLowerCase());
    expect(getThresholdLineColor(drawn('red'), 'red', { mode: 'shade', shade: 'softer' }, undefined, LIGHT)).toBe(
      'rgba(255, 115, 131, 0.7)'
    ); // super-light-red #FF7383
  });

  it('a shade keeps the line colour’s own alpha; a colour without a name takes the nearest hue’s shades', () => {
    // rgba(224, 47, 68, 0.4) is Grafana's red at 0.4: no name, nearest hue red
    const rgba = 'rgba(224, 47, 68, 0.4)';
    expect(getThresholdLineColor(drawn(rgba), rgba, stronger, undefined, LIGHT)).toBe('rgba(173, 3, 23, 0.4)');
    // gray: no hue in Grafana's stock themes, so the colour itself
    expect(getThresholdLineColor(drawn('#888888'), '#888888', stronger, undefined, LIGHT)).toBe(
      'rgba(136, 136, 136, 0.7)'
    );
  });

  it('never draws a line Grafana draws at alpha 0, whatever the options', () => {
    for (const name of ['transparent', '#ff000000', 'rgba(255, 0, 0, 0)']) {
      for (const option of [undefined, fixed('#00ff00'), stronger]) {
        expect(getThresholdLineColor(drawn(name), name, option, 100, LIGHT)).toBeUndefined();
      }
    }
  });
});

describe('getThresholdLineStyle', () => {
  const line = { thresholdsStyle: { mode: GraphThresholdsStyleMode.Line } };

  it('applies only with an option set and lines drawn', () => {
    expect(getThresholdLineStyle(undefined, LIGHT)).toBeUndefined();
    expect(getThresholdLineStyle(line, LIGHT)).toBeUndefined();
    expect(getThresholdLineStyle({ ...line, styling: {} }, LIGHT)).toBeUndefined();
    // incomplete colours count as unset (the editor saves `{ mode: 'fixed' }` until a colour is picked)
    expect(
      getThresholdLineStyle({ ...line, styling: { thresholdLineColor: { mode: 'fixed' } } }, LIGHT)
    ).toBeUndefined();
    for (const styling of [
      { thresholdLineColor: { mode: 'fixed' as const, fixedColor: 'red' } },
      { thresholdLineOpacity: 0 },
      { thresholdLineWidth: 1 },
    ]) {
      expect(getThresholdLineStyle({ ...line, styling }, LIGHT)).toBeDefined();
      for (const mode of [
        GraphThresholdsStyleMode.Off,
        GraphThresholdsStyleMode.Area,
        GraphThresholdsStyleMode.Series,
      ]) {
        expect(getThresholdLineStyle({ thresholdsStyle: { mode }, styling }, LIGHT)).toBeUndefined();
      }
    }
  });

  it('gives the width in canvas pixels at the pixel ratio when drawing, and no width when unset', () => {
    const style = getThresholdLineStyle({ ...line, styling: { thresholdLineWidth: 3 } }, LIGHT)!;
    const ratio = uPlot.pxRatio;
    try {
      uPlot.pxRatio = 1;
      expect(style.width()).toBe(3);
      uPlot.pxRatio = 2;
      expect(style.width()).toBe(6);
    } finally {
      uPlot.pxRatio = ratio;
    }
    expect(getThresholdLineStyle({ ...line, styling: { thresholdLineOpacity: 50 } }, LIGHT)!.width()).toBeUndefined();
  });

  it('toCanvasWidth rounds as AnnotationsPlugin.tsx does, to at least one pixel', () => {
    expect(toCanvasWidth(1, 1)).toBe(1);
    expect(toCanvasWidth(5, 2)).toBe(10);
    expect(toCanvasWidth(1, 1.5)).toBe(2);
    expect(toCanvasWidth(3, 1.25)).toBe(4);
    expect(toCanvasWidth(1, 0.4)).toBe(1);
  });
});

describe('addThresholdLines: one set of lines per scale', () => {
  const red = steps([-Infinity, 'green'], [50, 'red']);
  const blue = steps([-Infinity, 'green'], [50, 'blue']);
  const setColor = { styling: { thresholdLineColor: { mode: 'fixed' as const, fixedColor: '#000000' } } };
  const line = (extra = {}) => ({ thresholdsStyle: { mode: GraphThresholdsStyleMode.Line }, ...extra });
  const opts = (thresholds: ThresholdsConfig, scaleKey = 'y') => ({
    ...options(GraphThresholdsStyleMode.Line, thresholds),
    scaleKey,
  });
  const hooks = drawClearHooks;
  const colors = (builder: UPlotConfigBuilder) => hooks(builder).map((hook) => strokes(record(hook)).map(([, c]) => c));

  it('set, then unset on the same scale: only the first series’ lines, with its options', () => {
    const builder = new UPlotConfigBuilder();
    addThresholdLines(builder, line(setColor), opts(red));
    addThresholdLines(builder, line(), opts(blue));
    expect(colors(builder)).toEqual([['rgba(0, 0, 0, 0.7)']]);
  });

  it('unset, then set on the same scale: only Grafana’s lines of the first series', () => {
    const builder = new UPlotConfigBuilder();
    addThresholdLines(builder, line(), opts(red));
    addThresholdLines(builder, line(setColor), opts(blue));
    expect(colors(builder)).toEqual([['rgba(224, 47, 68, 0.7)']]);
    expect(record(hooks(builder)[0])).toEqual(record(coreHook(opts(red))));
  });

  it('two scales: a set of lines each', () => {
    const builder = new UPlotConfigBuilder();
    addThresholdLines(builder, line(setColor), opts(red, 'y'));
    addThresholdLines(builder, line(), opts(blue, 'percent'));
    expect(hooks(builder)).toHaveLength(2);
  });

  it('options under Area (no lines): Grafana’s own hook', () => {
    const builder = new UPlotConfigBuilder();
    const area = { ...opts(red), config: { mode: GraphThresholdsStyleMode.Area } };
    addThresholdLines(builder, { thresholdsStyle: { mode: GraphThresholdsStyleMode.Area }, ...setColor }, area);
    expect(record(hooks(builder)[0])).toEqual(record(coreHook(area)));
  });

  // Through the copied TimeSeries/utils.ts: two series on one scale, each with its thresholds by override
  const prepared = (s1: object, s2: object) =>
    preparePlotConfigBuilder({
      frame: createDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1000, 2000] },
          { name: 's1', type: FieldType.number, values: [20, 80], config: { thresholds: red, custom: s1 } },
          { name: 's2', type: FieldType.number, values: [30, 70], config: { thresholds: blue, custom: s2 } },
        ],
      }),
      theme: LIGHT,
      timeZones: ['utc'],
      getTimeRange: () => ({}) as never,
      allFrames: [],
      renderers: [],
    });

  it('in the panel: the first series of the scale wins, hidden or not, and the second adds nothing', () => {
    expect(colors(prepared(line(setColor), line()))).toEqual([['rgba(0, 0, 0, 0.7)']]);
    expect(colors(prepared(line(), line(setColor)))).toEqual([['rgba(224, 47, 68, 0.7)']]);
    // s1 hidden from the plot still claims the scale (as in Grafana)
    expect(colors(prepared(line({ hideFrom: { viz: true }, ...setColor }), line()))).toEqual([['rgba(0, 0, 0, 0.7)']]);
    expect(colors(prepared(line({ hideFrom: { viz: true } }), line(setColor)))).toEqual([['rgba(224, 47, 68, 0.7)']]);
    // s1 Off: s2 claims the scale
    expect(colors(prepared({ thresholdsStyle: { mode: GraphThresholdsStyleMode.Off } }, line(setColor)))).toEqual([
      ['rgba(0, 0, 0, 0.7)'],
    ]);
  });
});
