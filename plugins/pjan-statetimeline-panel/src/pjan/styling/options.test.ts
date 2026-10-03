import {
  type FieldConfigSource,
  FieldMatcherID,
  FieldType,
  getPanelOptionsWithDefaults,
  PanelOptionsEditorBuilder,
} from '@grafana/data';
import { omit } from 'lodash';
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
import { LIGHT, processFrame } from './testdata/fixtures'; // also fills Grafana's editor registry, which the plugin's options need

const STYLING_FIELD_OPTIONS = [
  'custom.styling.lineColor',
  'custom.styling.fillColor',
  'custom.styling.valueColor',
  'custom.styling.rowNameColor',
];

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
      'custom.styling.lineColor',
      'custom.fillOpacity',
      'custom.styling.fillColor',
      'custom.styling.valueColor',
      'custom.styling.rowNameColor',
    ]);
    for (const id of STYLING_FIELD_OPTIONS) {
      const item = plugin.fieldConfigRegistry.get(id);
      expect(item.path).toBe(id.slice('custom.'.length));
      expect(item.category).toEqual(['State timeline']);
      expect(item.override).toBeDefined();
      expect(item.process).toBeDefined();
      expect(item.shouldApply({ type: FieldType.time } as never)).toBe(false);
      expect(item.shouldApply({ type: FieldType.string } as never)).toBe(true);
    }
  });

  it('each colour field option offers the modes of its constant (the shared editor shows what it is given)', () => {
    const modesOf = (id: string) => (plugin.fieldConfigRegistry.get(id).settings as { modes: unknown }).modes;
    expect(modesOf('custom.styling.lineColor')).toEqual(LINE_COLOR_MODES);
    expect(modesOf('custom.styling.fillColor')).toEqual(FILL_COLOR_MODES);
    expect(modesOf('custom.styling.valueColor')).toEqual(VALUE_COLOR_MODES);
    expect(modesOf('custom.styling.rowNameColor')).toEqual(ROW_NAME_COLOR_MODES);
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
    expect(fieldConfig.defaults.custom).not.toHaveProperty('styling');
    expect(fieldConfig.defaults.custom).not.toHaveProperty('rowAnnotations');
  });
});

// The field options mirror the panel options (`custom.styling.<key>`, `custom.rowAnnotations.<key>`; pjan's decision
// 3, 2026-10-03). No core panel uses nested custom paths, so these run Grafana's own code on them.
describe('field-option storage: custom.styling', () => {
  const load = (fieldConfig: FieldConfigSource) =>
    getPanelOptionsWithDefaults({
      plugin,
      currentOptions: {},
      currentFieldConfig: fieldConfig,
      isAfterPluginChange: false,
    }).fieldConfig;
  const SOFTER = { mode: 'shade', shade: 'softer' };

  it('only adds `styling` and `rowAnnotations` to core’s custom keys', () => {
    const topLevel = new Set(
      plugin.fieldConfigRegistry
        .list()
        .filter((item) => item.isCustom && item.path.includes('.'))
        .map((item) => item.path.split('.')[0])
    );
    expect([...topLevel].sort()).toEqual(['rowAnnotations', 'styling']);
  });

  it('a set value is kept when the panel loads', () => {
    expect(load({ defaults: { custom: { styling: { fillColor: SOFTER } } }, overrides: [] }).defaults.custom).toEqual(
      expect.objectContaining({ styling: { fillColor: SOFTER } })
    );
  });

  it('a cleared value leaves no key and no empty `styling` object', () => {
    // Clearing in the editor: `omit(defaults.custom, path)` (updateDefaultFieldConfigValue in Grafana 13.2.3
    // PanelEditor/utils.ts), which leaves `styling: {}`; the panel then applies the field config with defaults
    const clear = (custom: object) => load({ defaults: { custom: omit(custom, 'styling.fillColor') }, overrides: [] });
    const cleared = clear({ lineWidth: 0, styling: { fillColor: SOFTER } }).defaults.custom;
    expect(cleared).not.toHaveProperty('styling');
    expect(cleared).toHaveProperty('lineWidth', 0);
    // with another key still set, only the cleared one goes
    expect(clear({ styling: { fillColor: SOFTER, lineColor: SOFTER } }).defaults.custom.styling).toEqual({
      lineColor: SOFTER,
    });
  });

  it('drops keys it doesn’t know, and State timeline plus 1.0.0’s flat keys (no migration)', () => {
    const fieldConfig = load({
      defaults: { custom: { fillColor: SOFTER, annotationKey: 'web', styling: { nope: 1 } } },
      overrides: [
        {
          matcher: { id: FieldMatcherID.byName, options: 'a' },
          properties: [
            { id: 'custom.fillColor', value: SOFTER },
            { id: 'custom.annotationKey', value: 'web' },
            { id: 'custom.styling.fillColor', value: SOFTER },
          ],
        },
      ],
    });
    expect(fieldConfig.defaults.custom).not.toHaveProperty('fillColor');
    expect(fieldConfig.defaults.custom).not.toHaveProperty('annotationKey');
    expect(fieldConfig.defaults.custom).not.toHaveProperty('styling');
    expect(fieldConfig.overrides[0].properties).toEqual([{ id: 'custom.styling.fillColor', value: SOFTER }]);
  });

  it('an override styles its row only, over the defaults, and leaves the defaults and other rows alone', () => {
    const defaults = { custom: { styling: { lineColor: SOFTER } } };
    const frame = processFrame(LIGHT, ['a', 'b'], ['up'], {
      defaults,
      overrides: [
        {
          matcher: { id: FieldMatcherID.byName, options: 'b' },
          properties: [{ id: 'custom.styling.fillColor', value: { mode: 'fixed', fixedColor: 'red' } }],
        },
      ],
    });
    const [time, a, b] = frame.fields.map((field) => field.config.custom?.styling);
    expect(time).toBeUndefined(); // shouldApply skips the time field
    expect(a).toEqual({ lineColor: SOFTER });
    expect(b).toEqual({ lineColor: SOFTER, fillColor: { mode: 'fixed', fixedColor: 'red' } });
    expect(a).not.toBe(b);
    expect(defaults).toEqual({ custom: { styling: { lineColor: SOFTER } } });
  });

  it('an override property without a value (cleared in the editor) removes the default from its row, as in core', () => {
    const frame = processFrame(LIGHT, ['a'], ['up'], {
      defaults: { custom: { styling: { fillColor: SOFTER } } },
      overrides: [
        {
          matcher: { id: FieldMatcherID.byName, options: 'a' },
          properties: [{ id: 'custom.styling.fillColor' }, { id: 'custom.styling.lineColor' }],
        },
      ],
    });
    expect(frame.fields[1].config.custom?.styling).toEqual({});
  });
});
