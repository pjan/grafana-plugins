import {
  FieldType,
  type PanelOptionsEditorItem,
  PanelOptionsEditorBuilder,
  standardEditorsRegistry,
} from '@grafana/data';
import { ClearableSliderEditor, StylingColorEditor } from '@pjan/grafana-styling';

import { plugin } from '../../plugins/panel/stat/module';

import {
  BACKGROUND_COLOR_MODES,
  CUSTOM_COLOR_MODE,
  SPARKLINE_COLOR_MODES,
  TEXT_COLOR_MODES,
  UNSET_SPARKLINE_FILL_OPACITY,
  UNSET_SPARKLINE_LINE_OPACITY,
  UNSET_SPARKLINE_LINE_WIDTH,
} from './options';

// Grafana fills the editor registry at startup; building the stat options only needs the ids to exist.
const EDITORS = ['boolean', 'radio', 'number', 'select', 'stats-picker'];
standardEditorsRegistry.setInit(() => EDITORS.map((id) => ({ id, name: id, editor: () => null })));

const STYLING_KEYS = [
  'backgroundColor',
  'textColor',
  'sparklineColor',
  'sparklineLineOpacity',
  'sparklineFillOpacity',
  'sparklineLineWidth',
];

const panelItems = (): PanelOptionsEditorItem[] => {
  const builder = new PanelOptionsEditorBuilder();
  plugin.getPanelOptionsSupplier()(builder as never, { data: [] });
  return builder.getItems();
};
const item = (id: string) => panelItems().find((i) => i.id === id)!;

describe('Color mode Custom', () => {
  it('is a fifth choice of core’s Color mode, after core’s four; Value stays the default', () => {
    const colorMode = item('colorMode');
    expect((colorMode.settings as { options: Array<{ value: string }> }).options.map((o) => o.value)).toEqual([
      'none',
      'value',
      'background',
      'background_solid',
      CUSTOM_COLOR_MODE,
    ]);
    expect(colorMode.defaultValue).toBe('value');
  });

  it('the "Stat styles" list is in the plan’s order', () => {
    const stylesIds = panelItems()
      .filter((i) => i.category?.[0] === 'Stat styles')
      .map((i) => i.id);
    expect(stylesIds).toEqual([
      'orientation',
      'textMode',
      'wideLayout',
      'colorMode',
      'styling.backgroundColor',
      'styling.textColor',
      'graphMode',
      'styling.sparklineColor',
      'styling.sparklineLineOpacity',
      'styling.sparklineFillOpacity',
      'styling.sparklineLineWidth',
      'justifyMode',
      'showPercentChange',
      'percentChangeColorMode',
    ]);
  });

  it('the colour options show only with Custom; the sparkline options only with Custom and Graph mode Area', () => {
    const items = panelItems();
    const shown = (options: object) =>
      items
        .filter((i) => i.id.startsWith('styling.'))
        .filter((i) => !i.showIf || i.showIf(options as never, undefined))
        .map((i) => i.id);
    for (const colorMode of ['none', 'value', 'background', 'background_solid']) {
      expect(shown({ colorMode, graphMode: 'area' })).toEqual([]);
    }
    expect(shown({ colorMode: CUSTOM_COLOR_MODE, graphMode: 'none' })).toEqual([
      'styling.backgroundColor',
      'styling.textColor',
    ]);
    expect(shown({ colorMode: CUSTOM_COLOR_MODE, graphMode: 'area' })).toEqual(
      STYLING_KEYS.map((key) => `styling.${key}`)
    );
  });

  it('no styling option has a default value, and each has a clearable editor with what an unset option draws', () => {
    for (const key of STYLING_KEYS) {
      expect(item(`styling.${key}`).defaultValue).toBeUndefined();
    }
    const modesOf = (key: string) => (item(`styling.${key}`).settings as { modes: unknown }).modes;
    expect(item('styling.backgroundColor').editor).toBe(StylingColorEditor);
    expect(modesOf('backgroundColor')).toEqual(BACKGROUND_COLOR_MODES);
    expect(modesOf('textColor')).toEqual(TEXT_COLOR_MODES);
    expect(modesOf('sparklineColor')).toEqual(SPARKLINE_COLOR_MODES);
    expect(BACKGROUND_COLOR_MODES).toEqual(['none', 'value', 'shade', 'fixed']);
    expect(TEXT_COLOR_MODES).toEqual(['automatic', 'value', 'shade', 'fixed']);
    expect(SPARKLINE_COLOR_MODES).toEqual(['value', 'shade', 'text', 'fixed']);
    expect(item('styling.sparklineLineOpacity').editor).toBe(ClearableSliderEditor);
    expect(item('styling.sparklineLineOpacity').settings).toEqual({
      min: 0,
      max: 100,
      step: 1,
      unsetValue: UNSET_SPARKLINE_LINE_OPACITY,
    });
    expect(item('styling.sparklineFillOpacity').settings).toEqual({
      min: 0,
      max: 100,
      step: 1,
      unsetValue: UNSET_SPARKLINE_FILL_OPACITY,
    });
    expect(item('styling.sparklineLineWidth').settings).toEqual({
      min: 1,
      max: 5,
      step: 1,
      unsetValue: UNSET_SPARKLINE_LINE_WIDTH,
    });
  });

  it('each setting is also a field option, only in the overrides menu, for every field but time', () => {
    const ids = plugin.fieldConfigRegistry.list().map((i) => i.id);
    expect(ids.filter((id) => id.startsWith('custom.'))).toEqual(STYLING_KEYS.map((key) => `custom.${key}`));
    for (const key of STYLING_KEYS) {
      const field = plugin.fieldConfigRegistry.get(`custom.${key}`);
      expect(field.hideFromDefaults).toBe(true);
      // the overrides menu doesn't show Color mode: the description says when it applies
      expect(field.description).toMatch(/ \(Color mode Custom only\)$/);
      expect(field.override).toBeDefined();
      expect(field.process).toBeDefined();
      expect(field.defaultValue).toBeUndefined();
      expect(field.category).toEqual(['Stat styles']);
      expect(field.shouldApply({ type: FieldType.time } as never)).toBe(false);
      expect(field.shouldApply({ type: FieldType.number } as never)).toBe(true);
      expect(field.shouldApply({ type: FieldType.string } as never)).toBe(true);
    }
  });

  it('the field option names don’t reuse the time series’ custom keys', () => {
    for (const reserved of ['fillColor', 'lineColor', 'lineWidth', 'fillOpacity']) {
      expect(STYLING_KEYS).not.toContain(reserved);
    }
  });

  it('adds nothing to a new panel’s field config (no custom defaults)', () => {
    expect(plugin.fieldConfigDefaults.defaults.custom ?? {}).toEqual({});
  });
});
