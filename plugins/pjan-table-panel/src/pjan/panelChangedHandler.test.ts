import { renderHook } from '@testing-library/react';
import { cloneDeep } from 'lodash';

import {
  type FieldColor,
  FieldColorModeId,
  type FieldConfigSource,
  FieldMatcherID,
  filterFieldConfigOverrides,
  getPanelOptionsWithDefaults,
  isStandardFieldProp,
  type PanelModel,
  type PanelPlugin,
} from '@grafana/data';
import { BarGaugeValueMode, TableCellDisplayMode, TableCellHeight, TableCellTooltipPlacement } from '@grafana/schema';
import { useApplyFieldConfigChangedInPlace } from '@pjan/grafana-panel-utils';

import { tablePanelChangedHandler } from '../plugins/panel/table/migrations';
import { plugin as tablePlugin } from '../plugins/panel/table/module';

import { panelChangedHandler } from './panelChangedHandler';
import { fillEditorRegistry } from './testdata/editorRegistry';

fillEditorRegistry();

// getPanelOptionsWithDefaults takes a plugin without its option types
const plugin = tablePlugin as unknown as PanelPlugin;

// A core Table panel with options, custom field config and override rules away from the defaults.
const coreOptions = {
  showHeader: false,
  cellHeight: TableCellHeight.Md,
  frozenColumns: { left: 1 },
  enablePagination: true,
  maxRowHeight: 120,
  frameIndex: 1,
  sortBy: [{ displayName: 'Status', desc: true }],
};

const savedCoreFieldConfig = (color?: FieldColor): FieldConfigSource => ({
  defaults: {
    unit: 'bytes',
    ...(color ? { color } : {}),
    custom: {
      align: 'center',
      minWidth: 80,
      filterable: true,
      wrapText: true,
      inspect: true,
      footer: { reducers: ['sum', 'mean'] },
      cellOptions: { type: TableCellDisplayMode.ColorBackground, mode: 'basic', applyToRow: true },
    },
  },
  overrides: [
    {
      // a cell type with a standard property in one rule
      matcher: { id: FieldMatcherID.byName, options: 'Status' },
      properties: [
        { id: 'custom.cellOptions', value: { type: TableCellDisplayMode.Pill } },
        { id: 'unit', value: 'none' },
      ],
    },
    {
      // custom properties only: a width, a hidden field and a tooltip from another field
      matcher: { id: FieldMatcherID.byRegexp, options: '.*id.*' },
      properties: [
        { id: 'custom.width', value: 120 },
        { id: 'custom.hideFrom.viz', value: true },
        { id: 'custom.tooltip.field', value: 'Details' },
        { id: 'custom.tooltip.placement', value: TableCellTooltipPlacement.Top },
      ],
    },
    {
      // a rule for the fields of nested tables (scope: nested), as the column resize saves it there
      matcher: { id: FieldMatcherID.byName, options: 'Container', scope: 'nested' },
      properties: [
        { id: 'custom.width', value: 200 },
        {
          id: 'custom.cellOptions',
          value: { type: TableCellDisplayMode.Gauge, valueDisplayMode: BarGaugeValueMode.Hidden },
        },
      ],
    },
  ],
});

// The field config core's VizPanel holds for the saved panel: Grafana's defaults applied on load (the plugin's
// registry is core's, see module.test.ts).
const coreFieldConfig = (color?: FieldColor) =>
  getPanelOptionsWithDefaults({
    plugin,
    currentOptions: {},
    currentFieldConfig: savedCoreFieldConfig(color),
    isAfterPluginChange: false,
  }).fieldConfig;

// What Grafana 13.2.3 hands the handler after picking this plugin in the panel editor: PanelOptionsPane.onChangePanel
// clears `defaults.custom` and the custom override properties, then VizPanel.changePluginType loads the plugin with
// getPanelOptionsWithDefaults(isAfterPluginChange: true) (custom defaults, adaptFieldColorMode) and passes a panel
// whose fieldConfig is the VizPanel's own object.
const editorPanel = (prev: FieldConfigSource) => {
  const cleared: FieldConfigSource = {
    defaults: { ...cloneDeep(prev.defaults), custom: {} },
    overrides: filterFieldConfigOverrides(cloneDeep(prev.overrides), isStandardFieldProp),
  };
  const { fieldConfig } = getPanelOptionsWithDefaults({
    plugin,
    currentOptions: {},
    currentFieldConfig: cleared,
    isAfterPluginChange: true,
  });
  return { options: {}, fieldConfig };
};

const makePanel = () =>
  ({ options: {}, fieldConfig: { defaults: {}, overrides: [] } }) as unknown as PanelModel<Record<string, unknown>>;

describe('panelChangedHandler', () => {
  it('keeps every option when switching from the core table panel', () => {
    const prev = coreFieldConfig({ mode: FieldColorModeId.Thresholds });
    const options = panelChangedHandler(editorPanel(prev), 'table', coreOptions, prev);

    expect(options).toEqual(coreOptions);
    expect(options).not.toBe(coreOptions);
    expect(options.sortBy).not.toBe(coreOptions.sortBy);
  });

  it('restores the custom field config the editor cleared', () => {
    const prev = coreFieldConfig({ mode: FieldColorModeId.Thresholds });
    const panel = editorPanel(prev);
    // the editor's switch reset them to the plugin's defaults
    expect(panel.fieldConfig.defaults.custom).not.toEqual(prev.defaults.custom);

    panelChangedHandler(panel, 'table', coreOptions, prev);

    expect(panel.fieldConfig.defaults.custom).toEqual(prev.defaults.custom);
    expect(panel.fieldConfig.defaults.custom).not.toBe(prev.defaults.custom);
    expect(panel.fieldConfig.defaults.custom.cellOptions).not.toBe(prev.defaults.custom.cellOptions);
    expect(panel.fieldConfig.defaults.unit).toBe('bytes');
  });

  it('restores the custom override properties the editor removed, nested-scope rules included', () => {
    const prev = coreFieldConfig({ mode: FieldColorModeId.Thresholds });
    const panel = editorPanel(prev);
    // the editor kept only the standard property of the first rule, and the rules without one are empty
    expect(panel.fieldConfig.overrides).not.toEqual(prev.overrides);
    expect(panel.fieldConfig.overrides.map((rule) => rule.properties.map((p) => p.id))).toEqual([['unit'], [], []]);

    panelChangedHandler(panel, 'table', coreOptions, prev);

    expect(panel.fieldConfig.overrides).toEqual(prev.overrides);
    expect(panel.fieldConfig.overrides).not.toBe(prev.overrides);
    expect(panel.fieldConfig.overrides[0].properties[0].value).not.toBe(prev.overrides[0].properties[0].value);
    expect(panel.fieldConfig.overrides[2].matcher).toEqual({
      id: FieldMatcherID.byName,
      options: 'Container',
      scope: 'nested',
    });
  });

  it.each([
    // not by value, or unset: adaptFieldColorMode turns these into Thresholds (Table: by value, thresholds preferred)
    { color: { mode: FieldColorModeId.PaletteClassic }, adapted: true },
    { color: { mode: FieldColorModeId.PaletteClassicByName }, adapted: true },
    { color: { mode: FieldColorModeId.Shades, fixedColor: 'purple' }, adapted: true },
    // kept by Grafana as well
    { color: { mode: FieldColorModeId.Thresholds }, adapted: false },
    { color: { mode: 'continuous-GrYlRd', seriesBy: 'max' as const }, adapted: false },
    { color: { mode: FieldColorModeId.Fixed, fixedColor: '#ff7f0e' }, adapted: false },
  ])('restores the colour mode $color.mode on the panel field config', ({ color, adapted }) => {
    const prev = coreFieldConfig(color);
    const panel = editorPanel(prev);
    expect(panel.fieldConfig.defaults.color).toEqual(adapted ? { mode: FieldColorModeId.Thresholds } : color);

    panelChangedHandler(panel, 'table', coreOptions, prev);

    expect(panel.fieldConfig.defaults.color).toEqual(color);
    expect(panel.fieldConfig.defaults.color).not.toBe(prev.defaults.color);
    // everything else as core had it
    expect(panel.fieldConfig).toEqual(prev);
  });

  it('leaves the colour unset when core had none (Grafana would set Thresholds)', () => {
    // Table has no default colour: a core table saved without one keeps none on load
    const prev = coreFieldConfig(undefined);
    expect(prev.defaults).not.toHaveProperty('color');
    const panel = editorPanel(prev);
    expect(panel.fieldConfig.defaults.color).toEqual({ mode: FieldColorModeId.Thresholds });

    panelChangedHandler(panel, 'table', coreOptions, prev);

    expect(panel.fieldConfig.defaults).not.toHaveProperty('color');
    expect(panel.fieldConfig).toEqual(prev);
  });

  it('leaves the field config alone when no previous field config is passed', () => {
    const prev = coreFieldConfig({ mode: FieldColorModeId.PaletteClassic });
    const panel = editorPanel(prev);
    const before = cloneDeep(panel.fieldConfig);
    const onFieldConfigChange = jest.fn();

    // Grafana's type says it is always passed; the handler checks anyway
    const noFieldConfig = undefined as unknown as FieldConfigSource;
    expect(panelChangedHandler(panel, 'table', coreOptions, noFieldConfig)).toEqual(coreOptions);
    expect(panel.fieldConfig).toEqual(before);
    renderHook(() => useApplyFieldConfigChangedInPlace(panel.fieldConfig, onFieldConfigChange));
    expect(onFieldConfigChange).not.toHaveBeenCalled();
  });

  it.each([{ mode: FieldColorModeId.Thresholds }, undefined])(
    'has the panel apply its field config again after restoring it (colour %o)',
    (color) => {
      const prev = coreFieldConfig(color);
      const panel = editorPanel(prev);
      const onFieldConfigChange = jest.fn();

      panelChangedHandler(panel, 'table', coreOptions, prev);
      const { rerender } = renderHook(() => useApplyFieldConfigChangedInPlace(panel.fieldConfig, onFieldConfigChange));
      rerender();

      expect(onFieldConfigChange).toHaveBeenCalledTimes(1);
      expect(onFieldConfigChange).toHaveBeenCalledWith(panel.fieldConfig);
    }
  );

  it('uses the core handler for the Angular table (table-old)', () => {
    // Only reachable through core's own auto-migration in Grafana; kept as upstream
    const angular = {
      angular: {
        transform: 'timeseries_aggregations',
        columns: [{ value: 'avg', text: 'Avg' }],
        styles: [{ pattern: 'Time', type: 'date', alias: 'When', align: 'right' }],
      },
    };
    const prevFieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };
    const pluginPanel = makePanel();
    const corePanel = makePanel();
    expect(panelChangedHandler(pluginPanel, 'table-old', angular, cloneDeep(prevFieldConfig))).toEqual(
      tablePanelChangedHandler(corePanel, 'table-old', angular)
    );
    expect(pluginPanel).toEqual(corePanel);
    expect(pluginPanel.transformations).toHaveLength(1);
  });

  it('uses the core handler for any other previous panel type', () => {
    const prev = coreFieldConfig({ mode: FieldColorModeId.Thresholds });
    const other = editorPanel(prev);
    const expected = editorPanel(prev);
    expect(panelChangedHandler(other, 'stat', { reduceOptions: { calcs: ['last'] } }, prev)).toEqual({});
    expect(tablePanelChangedHandler(expected as never, 'stat', { reduceOptions: { calcs: ['last'] } })).toEqual({});
    expect(other).toEqual(expected);
  });
});
