import { type Field, FieldType, identityOverrideProcessor } from '@grafana/data';
import { GraphDrawStyle, GraphGradientMode, VisibilityMode } from '@grafana/schema';
import { StylingColorEditor } from '@pjan/grafana-styling';

import { plugin } from '../../plugins/panel/timeseries/module';
import { fillEditorRegistry } from '../testdata/editorRegistry';

import { showFillColor, showLineColor, showPointColor } from './options';

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
