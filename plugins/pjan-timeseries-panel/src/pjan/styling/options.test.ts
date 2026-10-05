import { type Field, FieldType, identityOverrideProcessor } from '@grafana/data';
import { GraphDrawStyle, GraphGradientMode, GraphThresholdsStyleMode, VisibilityMode } from '@grafana/schema';
import { ClearableSliderEditor, StylingColorEditor } from '@pjan/grafana-styling';

import { plugin } from '../../plugins/panel/timeseries/module';
import { fillEditorRegistry } from '../testdata/editorRegistry';

import { showFillColor, showLineColor, showPointColor, showThresholdLines, unsetThresholdLineWidth } from './options';

fillEditorRegistry();

const registry = () => plugin.fieldConfigRegistry.list();
const item = (id: string) => registry().find((i) => i.id === id)!;
// The id registered right after another one
const after = (id: string) => {
  const ids = registry().map((i) => i.id);
  return ids[ids.indexOf(id) + 1];
};

describe('the colour model’s options', () => {
  it('sit in Graph styles, each right after the core option it refines', () => {
    expect(after('custom.lineWidth')).toBe('custom.styling.lineColor');
    expect(after('custom.gradientMode')).toBe('custom.styling.fillColor');
    expect(after('custom.pointSize')).toBe('custom.styling.pointColor');
    for (const id of ['custom.styling.lineColor', 'custom.styling.fillColor', 'custom.styling.pointColor']) {
      expect(item(id).category).toEqual(['Graph styles']);
      expect(item(id).isCustom).toBe(true);
      expect(item(id).defaultValue).toBeUndefined();
    }
  });

  it('offer their choices, and say what unset draws', () => {
    expect(item('custom.styling.lineColor').settings).toEqual({
      modes: ['shade', 'fixed'],
      placeholder: 'Series color',
      shadeGroup: 'Shade of the series color',
    });
    expect(item('custom.styling.fillColor').settings).toMatchObject({
      modes: ['series', 'shade', 'fixed'],
      placeholder: 'Line color',
    });
    expect(item('custom.styling.pointColor').settings).toMatchObject({
      modes: ['series', 'shade', 'fixed'],
      placeholder: 'Line color',
    });
    for (const id of ['custom.styling.lineColor', 'custom.styling.fillColor', 'custom.styling.pointColor']) {
      expect(item(id).description).toMatch(/Only with colors by series/);
    }
  });

  it('can be set per series by override, on number fields', () => {
    const number = { type: FieldType.number } as Field;
    const time = { type: FieldType.time } as Field;
    for (const id of ['custom.styling.lineColor', 'custom.styling.fillColor', 'custom.styling.pointColor']) {
      const option = item(id);
      expect(option.editor).toBe(StylingColorEditor);
      expect(option.override).toBe(StylingColorEditor);
      expect(option.process).toBe(identityOverrideProcessor);
      expect(option.shouldApply(number)).toBe(true);
      expect(option.shouldApply(time)).toBe(false);
      expect(option.hideFromDefaults).toBeFalsy();
    }
  });

  const line = { drawStyle: GraphDrawStyle.Line, lineWidth: 1, fillOpacity: 0, showPoints: VisibilityMode.Auto };

  it.each([
    ['a line', line, true],
    ['bars (their outline)', { ...line, drawStyle: GraphDrawStyle.Bars }, true],
    ['line width 0', { ...line, lineWidth: 0 }, false],
    ['points', { ...line, drawStyle: GraphDrawStyle.Points }, false],
    ['the Scheme gradient', { ...line, gradientMode: GraphGradientMode.Scheme }, false],
    ['the Hue gradient', { ...line, gradientMode: GraphGradientMode.Hue }, true],
  ])('Line color with %s', (_name, custom, shown) => {
    expect(showLineColor(custom)).toBe(shown);
    expect(item('custom.styling.lineColor').showIf!(custom)).toBe(shown);
  });

  it.each([
    ['no fill', line, false],
    ['a fill', { ...line, fillOpacity: 20 }, true],
    ['a fillBelowTo band (filled at 35 by core)', { ...line, fillBelowTo: 'min' }, true],
    ['a fill with the Opacity gradient', { ...line, fillOpacity: 20, gradientMode: GraphGradientMode.Opacity }, true],
    ['a fill with the Scheme gradient', { ...line, fillOpacity: 20, gradientMode: GraphGradientMode.Scheme }, false],
    ['points', { ...line, fillOpacity: 20, drawStyle: GraphDrawStyle.Points }, false],
  ])('Fill color with %s', (_name, custom, shown) => {
    expect(showFillColor(custom)).toBe(shown);
    expect(item('custom.styling.fillColor').showIf!(custom)).toBe(shown);
  });

  it.each([
    ['points auto', line, true],
    ['points always', { ...line, showPoints: VisibilityMode.Always }, true],
    ['points never', { ...line, showPoints: VisibilityMode.Never }, false],
    [
      'the Points style (points never)',
      { ...line, showPoints: VisibilityMode.Never, drawStyle: GraphDrawStyle.Points },
      true,
    ],
  ])('Point color with %s, as core’s Point size', (_name, custom, shown) => {
    expect(showPointColor(custom)).toBe(shown);
    expect(item('custom.pointSize').showIf!(custom)).toBe(shown);
    expect(item('custom.styling.pointColor').showIf!(custom)).toBe(shown);
  });
});

const THRESHOLD_LINE_IDS = [
  'custom.styling.thresholdLineColor',
  'custom.styling.thresholdLineOpacity',
  'custom.styling.thresholdLineWidth',
];

describe('the threshold line options', () => {
  it('sit right after Show thresholds, in its category, in this order', () => {
    const ids = registry().map((i) => i.id);
    const at = ids.indexOf('custom.thresholdsStyle');
    expect(ids.slice(at + 1, at + 4)).toEqual(THRESHOLD_LINE_IDS);
    for (const id of THRESHOLD_LINE_IDS) {
      expect(item(id).category).toEqual(item('custom.thresholdsStyle').category);
      expect(item(id).category).toEqual(['Thresholds']);
      expect(item(id).isCustom).toBe(true);
      expect(item(id).defaultValue).toBeUndefined();
    }
    expect(item('custom.styling.thresholdLineColor').name).toBe('Threshold line color');
    expect(item('custom.styling.thresholdLineOpacity').name).toBe('Threshold line opacity');
    expect(item('custom.styling.thresholdLineWidth').name).toBe('Threshold line width');
  });

  it('offer their choices, and say what unset draws and which lines they apply to', () => {
    expect(item('custom.styling.thresholdLineColor').settings).toEqual({
      modes: ['shade', 'fixed'],
      placeholder: 'Threshold color',
      shadeGroup: 'Shade of the threshold color',
    });
    expect(item('custom.styling.thresholdLineOpacity').settings).toEqual({
      min: 0,
      max: 100,
      step: 1,
      unsetValue: 70,
      unsetIsExact: false,
    });
    // jsdom's pixel ratio is 1: unset is 2 CSS pixels
    expect(item('custom.styling.thresholdLineWidth').settings).toEqual({
      min: 1,
      max: 5,
      step: 1,
      unsetValue: 2,
      unsetIsExact: false,
    });
    for (const id of THRESHOLD_LINE_IDS) {
      expect(item(id).description).toMatch(
        /those of the first series on each axis that shows thresholds \(hidden series included\)/
      );
      expect(item(id).description).toMatch(/Not set: .*as Grafana/);
    }
  });

  it('show the unset width as Grafana’s 2 canvas pixels in CSS pixels at the pixel ratio', () => {
    expect(unsetThresholdLineWidth(1)).toBe(2);
    expect(unsetThresholdLineWidth(2)).toBe(1);
    expect(unsetThresholdLineWidth(3)).toBe(1);
    expect(unsetThresholdLineWidth(0.25)).toBe(5);
  });

  it('can be set per series by override, on number and enum fields', () => {
    const fields = [FieldType.number, FieldType.enum].map((type) => ({ type }) as Field);
    const time = { type: FieldType.time } as Field;
    for (const id of THRESHOLD_LINE_IDS) {
      const option = item(id);
      const editor = id.endsWith('Color') ? StylingColorEditor : ClearableSliderEditor;
      expect(option.editor).toBe(editor);
      expect(option.override).toBe(editor);
      expect(option.process).toBe(identityOverrideProcessor);
      for (const field of fields) {
        expect(option.shouldApply(field)).toBe(true);
      }
      expect(option.shouldApply(time)).toBe(false);
      expect(option.hideFromDefaults).toBeFalsy();
    }
  });

  it.each([
    [GraphThresholdsStyleMode.Off, false],
    [GraphThresholdsStyleMode.Line, true],
    [GraphThresholdsStyleMode.Dashed, true],
    [GraphThresholdsStyleMode.Area, false],
    [GraphThresholdsStyleMode.LineAndArea, true],
    [GraphThresholdsStyleMode.DashedAndArea, true],
  ])('show with Show thresholds %s: %s', (mode, shown) => {
    const custom = { thresholdsStyle: { mode } };
    expect(showThresholdLines(custom)).toBe(shown);
    for (const id of THRESHOLD_LINE_IDS) {
      expect(item(id).showIf!(custom)).toBe(shown);
    }
  });

  it('are hidden with the JSON-only mode series, and without a mode', () => {
    for (const custom of [
      { thresholdsStyle: { mode: GraphThresholdsStyleMode.Series } },
      {},
      { thresholdsStyle: {} },
    ]) {
      for (const id of THRESHOLD_LINE_IDS) {
        expect(item(id).showIf!(custom)).toBe(false);
      }
    }
  });
});
