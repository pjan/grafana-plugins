import type uPlot from 'uplot';

import {
  colorManipulator,
  type FieldConfig,
  FieldMatcherID,
  type FieldConfigSource,
  getDefaultTimeRange,
  MappingType,
} from '@grafana/data';
import { VisibilityMode } from '@grafana/schema';

import { getConfig, type TimelineCoreOptions } from '../../core/components/TimelineChart/timeline';
import { TimelineMode } from '../../core/components/TimelineChart/utils';

import { getBestContrastText, toCanvasColor, toFillColor } from './canvasColors';
import { getRelativeShadeColor } from './shades';
import { LIGHT as theme, processFrame } from './testdata/fixtures';
import { getTimelineStyleHooks, MIN_VALUE_ROW_HEIGHT, type TimelineStyleHooks } from './timelineStyle';

const config: FieldConfig = {
  mappings: [{ type: MappingType.ValueToText, options: { up: { color: 'green', index: 0 } } }],
};
const frameWith = (fieldConfig: FieldConfigSource) =>
  processFrame(theme, ['a', 'b', 'c'], ['up', 'up'], fieldConfig, config);
const override = (name: string, id: string, value: unknown): FieldConfigSource => ({
  defaults: {},
  overrides: [{ matcher: { id: FieldMatcherID.byName, options: name }, properties: [{ id: `custom.${id}`, value }] }],
});
const green = theme.visualization.getColorByName('green');
const shade = (name: string, s: Parameters<typeof getRelativeShadeColor>[2]) =>
  toCanvasColor(theme, getRelativeShadeColor(theme, name, s)!);

describe('getTimelineStyleHooks', () => {
  it('is undefined with nothing set, or only the axes styled, so core draws the boxes', () => {
    const frame = frameWith({ defaults: {}, overrides: [] });
    expect(getTimelineStyleHooks(frame, theme)).toBeUndefined();
    expect(getTimelineStyleHooks(frame, theme, { look: 'grafana', valueOverflow: 'truncate' })).toBeUndefined();
    expect(getTimelineStyleHooks(frame, theme, { gridColor: 'red', dayBoundaries: true })).toBeUndefined();
  });

  it('an override on row 2 styles row 2 only', () => {
    const frame = frameWith(override('b', 'fillColor', { mode: 'shade', shade: 'stronger' }));
    expect(frame.fields.map((f) => f.config.custom?.fillColor?.shade)).toEqual([
      undefined,
      undefined,
      'stronger',
      undefined,
    ]);
    const hooks = getTimelineStyleHooks(frame, theme)!;
    // timeline.ts asks with the row's own field index (seriesIdx + 1)
    expect([1, 2, 3].map((i) => hooks.getBoxColors(i, green))).toEqual([
      undefined,
      { fill: toFillColor(shade('green', 'stronger')!), line: undefined },
      undefined,
    ]);
  });

  it('an override on row 3 does not leak to its neighbours (core’s getFieldConfig quirk is not reused)', () => {
    const hooks = getTimelineStyleHooks(frameWith(override('c', 'valueColor', { mode: 'contrast' })), theme)!;
    const stateColor = jest.fn(() => green);
    expect(hooks.getValueTextColor(2, stateColor, green)).toBeUndefined();
    // the state colour is only looked up for rows with a value colour
    expect(stateColor).not.toHaveBeenCalled();
    expect(hooks.getValueTextColor(3, stateColor, green)).toBe('rgb(0,0,0)');
    expect(stateColor).toHaveBeenCalledTimes(1);
    expect(hooks.getBoxColors(3, green)).toEqual({ fill: undefined, line: undefined });
  });

  it('the field default applies to every row, not to the time field', () => {
    const frame = frameWith({
      defaults: { custom: { lineColor: { mode: 'fixed', fixedColor: 'red' } } },
      overrides: [],
    });
    expect(frame.fields.map((f) => f.config.custom?.lineColor?.fixedColor)).toEqual([undefined, 'red', 'red', 'red']);
  });

  it('the Pill look: an opaque fill and a 1 px line on every row, values that don’t fit hidden', () => {
    const hooks = getTimelineStyleHooks(frameWith({ defaults: {}, overrides: [] }), theme, { look: 'pill' })!;
    expect(hooks.lineWidth).toBe(1);
    expect(hooks.getBoxColors(2, green)).toEqual({
      opaqueFill: shade('green', 'softer'),
      line: shade('green', 'base'),
    });
    // a state colour without a name: the state colour itself, opaque
    expect(hooks.getBoxColors(2, '#8e8e8e')).toEqual({ opaqueFill: '#8e8e8e', line: undefined });
    expect(hooks.getValueLabel(ctxMeasuring(10), 'up', 99, { x: 0, w: 10, h: 20 }, 100, 1)).toBeNull();
    // the look's overflow is only a default
    const truncating = getTimelineStyleHooks(frameWith({ defaults: {}, overrides: [] }), theme, {
      look: 'pill',
      valueOverflow: 'truncate',
    })!;
    expect(truncating.getValueLabel(ctxMeasuring(10), 'running', 3, { x: 0, w: 10, h: 20 }, 100, 1)).toBe('run');
  });
});

/** A context whose text is `width` canvas pixels per character, aligned as drawPoints sets it. */
const ctxMeasuring = (width: number, textAlign: CanvasTextAlign = 'left') =>
  ({
    measureText: (text: string) => ({ width: text.length * width }),
    textAlign,
  }) as unknown as CanvasRenderingContext2D;

describe('Value overflow', () => {
  const hide = getTimelineStyleHooks(frameWith({ defaults: {}, overrides: [] }), theme, { valueOverflow: 'hide' })!;
  const label = (hooks: TimelineStyleHooks, box: { x: number; w: number; h: number }, strokeWidth = 0) =>
    hooks.getValueLabel(ctxMeasuring(6), 'running', 3, box, 200, strokeWidth);

  it('truncate is core’s: the first maxChars characters', () => {
    const truncate = getTimelineStyleHooks(
      frameWith(override('a', 'fillColor', { mode: 'shade', shade: 'soft' })),
      theme
    )!;
    expect(label(truncate, { x: 0, w: 10, h: 20 })).toBe('run');
  });

  it('hide: the whole value when it fits with the padding, otherwise none', () => {
    // 'running' is 42 px; timeline.ts leaves line width + 2 px at either end
    expect(label(hide, { x: 0, w: 46, h: 20 })).toBe('running');
    expect(label(hide, { x: 0, w: 45, h: 20 })).toBeNull();
    expect(label(hide, { x: 0, w: 48, h: 20 }, 1)).toBe('running');
    expect(label(hide, { x: 0, w: 47, h: 20 }, 1)).toBeNull();
  });

  it('hide: the text must be inside the plot, and the box less its padding', () => {
    expect(label(hide, { x: -10, w: 56, h: 20 })).toBe('running');
    expect(label(hide, { x: -11, w: 56, h: 20 })).toBeNull();
    // left-aligned 2 px into the box: 'running' ends at the plot's right edge (200)
    expect(label(hide, { x: 156, w: 100, h: 20 })).toBe('running');
    expect(label(hide, { x: 157, w: 100, h: 20 })).toBeNull();
  });

  it('hide, centred or right-aligned: the text where timeline.ts draws it must be inside the plot', () => {
    const at = (textAlign: CanvasTextAlign, box: { x: number; w: number }) =>
      hide.getValueLabel(ctxMeasuring(6, textAlign), 'running', 3, { ...box, h: 20 }, 200, 0);
    // centred on the whole box: at 10 here, so it would start 11 px left of the plot
    expect(at('center', { x: -30, w: 80 })).toBeNull();
    expect(at('left', { x: -30, w: 80 })).toBe('running');
    expect(at('center', { x: 0, w: 80 })).toBe('running');
    expect(at('center', { x: 0, w: 45 })).toBeNull();
    // right-aligned at the box's end, 28 px past the plot here
    expect(at('right', { x: 150, w: 80 })).toBeNull();
    expect(at('right', { x: 100, w: 80 })).toBe('running');
  });

  it(`hide: no values on rows lower than ${MIN_VALUE_ROW_HEIGHT} px`, () => {
    expect(label(hide, { x: 0, w: 100, h: MIN_VALUE_ROW_HEIGHT })).toBe('running');
    expect(label(hide, { x: 0, w: 100, h: MIN_VALUE_ROW_HEIGHT - 1 })).toBeNull();
  });
});

// timeline.ts itself, run on a minimal uPlot instance: what it draws with and without the hooks.
describe('timeline.ts with the styling hooks', () => {
  const draw = (pjanStyle: TimelineStyleHooks | undefined, fillOpacity = 70, width = 0) => {
    const getValueColor = jest.fn(() => green);
    const opts: TimelineCoreOptions = {
      mode: TimelineMode.Changes,
      numSeries: 3,
      rowHeight: 0.9,
      theme,
      showValue: VisibilityMode.Always,
      mergeValues: true,
      isDiscrete: () => true,
      hasMappedNull: () => false,
      hasMappedNaN: () => false,
      getValueColor,
      label: () => '',
      getTimeRange: () => getDefaultTimeRange(),
      formatValue: () => 'up',
      // core's quirk: called with the 0-based series index
      getFieldConfig: () => ({ fillOpacity }),
      hoverMulti: false,
      pjanStyle,
    };
    const { drawClear, drawPaths, drawPoints } = getConfig(opts);
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d')!;
    // time, and three rows of one state each
    const data = [
      [0, 1],
      ['up', 'up'],
      ['up', 'up'],
      ['up', 'up'],
    ];
    const u = {
      ctx,
      bbox: { left: 0, top: 0, width: 400, height: 300 },
      data,
      _data: data,
      series: [{ scale: 'x' }, ...Array.from({ length: 3 }, () => ({ scale: 'y', width }))],
      scales: { x: { ori: 0 }, y: { ori: 1 } },
      valToPosH: (value: number, _scale: unknown, dim: number, offset: number) => offset + value * dim * 0.5,
      valToPosV: () => 50,
    } as unknown as uPlot;
    const fills: string[] = [];
    const strokes: string[] = [];
    const texts: Array<{ text: string; color: string }> = [];
    jest.spyOn(ctx, 'fill').mockImplementation(() => fills.push(String(ctx.fillStyle)));
    jest.spyOn(ctx, 'stroke').mockImplementation(() => strokes.push(String(ctx.strokeStyle)));
    jest.spyOn(ctx, 'fillText').mockImplementation((text) => texts.push({ text, color: String(ctx.fillStyle) }));
    drawClear(u);
    for (const sidx of [1, 2, 3]) {
      drawPaths(u, sidx, 0, 1);
    }
    for (const sidx of [1, 2, 3]) {
      (drawPoints as (u: uPlot, sidx: number, i0: number, i1: number) => void)(u, sidx, 0, 1);
    }
    return { fills, strokes, texts, stateColorLookups: getValueColor.mock.calls.length };
  };

  it('without hooks: core’s fill (state colour at Fill opacity), line and automatic contrast', () => {
    const { fills, strokes, texts } = draw(undefined, 70, 2);
    const coreFill = colorManipulator.alpha(green, 0.7);
    expect(new Set(fills)).toEqual(new Set([normalize(coreFill)]));
    expect(new Set(strokes)).toEqual(new Set([normalize(green)]));
    expect(new Set(texts.map((t) => t.color))).toEqual(new Set([normalize(theme.colors.getContrastText(coreFill, 3))]));
  });

  it('with an override on row 2: only row 2 changes, Fill opacity still applies', () => {
    const hooks = getTimelineStyleHooks(
      frameWith({
        defaults: {},
        overrides: [
          {
            matcher: { id: FieldMatcherID.byName, options: 'b' },
            properties: [
              { id: 'custom.fillColor', value: { mode: 'shade', shade: 'stronger' } },
              { id: 'custom.lineColor', value: { mode: 'fixed', fixedColor: 'red' } },
              { id: 'custom.valueColor', value: { mode: 'contrast' } },
            ],
          },
        ],
      }),
      theme
    );
    const { fills, strokes, texts } = draw(hooks, 70, 2);
    const coreFill = normalize(colorManipulator.alpha(green, 0.7));
    const stronger = theme.visualization.getColorByName('dark-green');
    expect(fills).toEqual([coreFill, normalize(colorManipulator.alpha(stronger, 0.7)), coreFill]);
    expect(strokes).toEqual([normalize(green), normalize(toCanvasColor(theme, 'red')!), normalize(green)]);
    const coreText = normalize(theme.colors.getContrastText(colorManipulator.alpha(green, 0.7), 3));
    // best contrast on the stronger shade at 70 % over white
    const best = normalize(getBestContrastText(theme, colorManipulator.alpha(stronger, 0.7)));
    expect(texts.map((t) => t.color)).toEqual([coreText, best, coreText]);
  });

  it('looks up no more state colours than core when no row has a value colour', () => {
    const hooks = getTimelineStyleHooks(frameWith(override('b', 'fillColor', { mode: 'shade', shade: 'soft' })), theme);
    expect(draw(hooks).stateColorLookups).toBe(draw(undefined).stateColorLookups);
  });

  it('with the Pill look: opaque fills whatever the Fill opacity', () => {
    const hooks = getTimelineStyleHooks(frameWith({ defaults: {}, overrides: [] }), theme, { look: 'pill' });
    const { fills, strokes } = draw(hooks, 30, 1);
    expect(new Set(fills)).toEqual(new Set([normalize(shade('green', 'softer')!)]));
    expect(new Set(strokes)).toEqual(new Set([normalize(shade('green', 'base')!)]));
  });
});

// The canvas mock keeps fillStyle/strokeStyle as normalised CSS colours (#rrggbb, or rgba() with alpha).
const normalize = (color: string) => {
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.fillStyle = color;
  return String(ctx.fillStyle);
};
