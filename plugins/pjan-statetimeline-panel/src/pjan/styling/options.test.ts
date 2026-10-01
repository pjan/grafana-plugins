import { FieldType, getPanelOptionsWithDefaults, PanelOptionsEditorBuilder } from '@grafana/data';
import { ClearableSliderEditor } from '@pjan/grafana-styling';

import { plugin } from '../../plugins/panel/state-timeline/module';

import { RowAnnotationsComboboxEditor } from '../rowAnnotations/RowAnnotationsComboboxEditor';

import {
  FILL_COLOR_MODES,
  getStylingOptions,
  LINE_COLOR_MODES,
  ROW_NAME_COLOR_MODES,
  VALUE_COLOR_MODES,
} from './options';
import './testdata/fixtures'; // fills Grafana's editor registry, which the plugin's options need

const STYLING_FIELD_OPTIONS = ['custom.lineColor', 'custom.fillColor', 'custom.valueColor', 'custom.rowNameColor'];

describe('the styling options of the plugin', () => {
  const fieldOptions = () => plugin.fieldConfigRegistry.list().map((item) => item.id);
  const panelOptions = () => {
    const builder = new PanelOptionsEditorBuilder();
    plugin.getPanelOptionsSupplier()(builder as never, { data: [] });
    return builder.getItems().map((item) => item.id);
  };

  it('field options sit next to their core counterparts in the State timeline group', () => {
    const ids = fieldOptions();
    expect(ids.slice(ids.indexOf('custom.lineWidth'), ids.indexOf('custom.spanNulls'))).toEqual([
      'custom.lineWidth',
      'custom.lineColor',
      'custom.fillOpacity',
      'custom.fillColor',
      'custom.valueColor',
      'custom.rowNameColor',
    ]);
    for (const id of STYLING_FIELD_OPTIONS) {
      const item = plugin.fieldConfigRegistry.get(id);
      expect(item.category).toEqual(['State timeline']);
      expect(item.override).toBeDefined();
      expect(item.shouldApply({ type: FieldType.time } as never)).toBe(false);
      expect(item.shouldApply({ type: FieldType.string } as never)).toBe(true);
    }
  });

  it('each colour field option offers the modes of its constant (the shared editor shows what it is given)', () => {
    const modesOf = (id: string) => (plugin.fieldConfigRegistry.get(id).settings as { modes: unknown }).modes;
    expect(modesOf('custom.lineColor')).toEqual(LINE_COLOR_MODES);
    expect(modesOf('custom.fillColor')).toEqual(FILL_COLOR_MODES);
    expect(modesOf('custom.valueColor')).toEqual(VALUE_COLOR_MODES);
    expect(modesOf('custom.rowNameColor')).toEqual(ROW_NAME_COLOR_MODES);
  });

  it('panel options: Value overflow after Show values, the rest after Page size', () => {
    const ids = panelOptions();
    expect(ids.slice(ids.indexOf('showValue'), ids.indexOf('showValue') + 2)).toEqual([
      'showValue',
      'styling.valueOverflow',
    ]);
    expect(ids.slice(ids.indexOf('perPage'), ids.indexOf('perPage') + 7)).toEqual([
      'perPage',
      'styling.look',
      'styling.cornerRadius',
      'styling.gridColor',
      'styling.axisTextColor',
      'styling.dayBoundaries',
      'styling.dayBoundaryColor',
    ]);
  });

  it('Value overflow is a clearable select (unset follows the look)', () => {
    const builder = new PanelOptionsEditorBuilder();
    plugin.getPanelOptionsSupplier()(builder as never, { data: [] });
    const item = builder.getItems().find((i) => i.id === 'styling.valueOverflow')!;
    expect(item.editor).toBe(RowAnnotationsComboboxEditor);
    expect(item.defaultValue).toBeUndefined();
  });

  it('Corner radius is a clearable slider from 0 to 12 px, with no default', () => {
    const builder = new PanelOptionsEditorBuilder();
    plugin.getPanelOptionsSupplier()(builder as never, { data: [] });
    const item = builder.getItems().find((i) => i.id === 'styling.cornerRadius')!;
    expect(item.editor).toBe(ClearableSliderEditor);
    expect(item.settings).toEqual({ min: 0, max: 12, step: 1 });
    expect(item.defaultValue).toBeUndefined();
  });

  it('the panel’s styling options are the same object while unset, so memos keep their value', () => {
    expect(getStylingOptions({})).toBe(getStylingOptions({ legend: {} }));
    const styling = { look: 'pill' as const };
    expect(getStylingOptions({ styling })).toBe(styling);
  });

  it('have no default values, so a panel saves none until they are used', () => {
    const { options, fieldConfig } = getPanelOptionsWithDefaults({
      plugin,
      currentOptions: {},
      currentFieldConfig: { defaults: {}, overrides: [] },
      isAfterPluginChange: true,
    });
    expect(options).not.toHaveProperty('styling');
    for (const id of STYLING_FIELD_OPTIONS) {
      expect(fieldConfig.defaults.custom).not.toHaveProperty(id.slice('custom.'.length));
    }
  });
});
