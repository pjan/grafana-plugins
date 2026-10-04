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
} from '@grafana/data';
import {
  AxisPlacement,
  GraphDrawStyle,
  GraphThresholdsStyleMode,
  GraphTransform,
  LegendDisplayMode,
  SortOrder,
  StackingMode,
  TooltipDisplayMode,
} from '@grafana/schema';

import { graphPanelChangedHandler } from '../plugins/panel/timeseries/migrations';
import { plugin } from '../plugins/panel/timeseries/module';

import { useApplyFieldConfigChangedInPlace } from './fieldConfigRefresh';
import { panelChangedHandler } from './panelChangedHandler';
import { fillEditorRegistry } from './testdata/editorRegistry';

fillEditorRegistry();

// A core Time series panel with options, custom field config and override rules away from the defaults.
const coreOptions = {
  legend: {
    showLegend: true,
    displayMode: LegendDisplayMode.Table,
    placement: 'right',
    calcs: ['lastNotNull', 'max'],
    sortBy: 'Max',
    sortDesc: true,
    width: 300,
  },
  tooltip: { mode: TooltipDisplayMode.Multi, sort: SortOrder.Descending, hideZeros: true, maxHeight: 300 },
  timezone: ['utc', 'Europe/Brussels'],
  annotations: { multiLane: true },
};

const savedCoreFieldConfig = (color?: FieldColor): FieldConfigSource => ({
  defaults: {
    unit: 'Bps',
    ...(color ? { color } : {}),
    custom: {
      drawStyle: GraphDrawStyle.Bars,
      lineWidth: 3,
      fillOpacity: 20,
      axisSoftMin: 0,
      stacking: { mode: StackingMode.Normal, group: 'B' },
      thresholdsStyle: { mode: GraphThresholdsStyleMode.Dashed },
    },
  },
  overrides: [
    {
      // custom and standard properties in one rule
      matcher: { id: FieldMatcherID.byName, options: 'write' },
      properties: [
        { id: 'custom.transform', value: GraphTransform.NegativeY },
        { id: 'unit', value: 'bytes' },
      ],
    },
    {
      // custom properties only
      matcher: { id: FieldMatcherID.byRegexp, options: '.*temp.*' },
      properties: [
        { id: 'custom.axisPlacement', value: AxisPlacement.Right },
        { id: 'custom.hideFrom', value: { legend: true, tooltip: false, viz: false } },
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
  it('keeps every option when switching from the core time series panel', () => {
    const prev = coreFieldConfig({ mode: FieldColorModeId.PaletteClassic });
    const options = panelChangedHandler(editorPanel(prev), 'timeseries', coreOptions, prev);

    expect(options).toEqual(coreOptions);
    expect(options).not.toBe(coreOptions);
    expect(options.legend).not.toBe(coreOptions.legend);
  });

  it('restores the custom field config the editor cleared', () => {
    const prev = coreFieldConfig({ mode: FieldColorModeId.PaletteClassic });
    const panel = editorPanel(prev);
    // the editor's switch reset them to the plugin's defaults
    expect(panel.fieldConfig.defaults.custom).not.toEqual(prev.defaults.custom);

    panelChangedHandler(panel, 'timeseries', coreOptions, prev);

    expect(panel.fieldConfig.defaults.custom).toEqual(prev.defaults.custom);
    expect(panel.fieldConfig.defaults.custom).not.toBe(prev.defaults.custom);
    expect(panel.fieldConfig.defaults.custom.stacking).not.toBe(prev.defaults.custom.stacking);
    expect(panel.fieldConfig.defaults.unit).toBe('Bps');
  });

  it('restores the custom override properties the editor removed', () => {
    const prev = coreFieldConfig({ mode: FieldColorModeId.PaletteClassic });
    const panel = editorPanel(prev);
    expect(panel.fieldConfig.overrides).not.toEqual(prev.overrides);

    panelChangedHandler(panel, 'timeseries', coreOptions, prev);

    expect(panel.fieldConfig.overrides).toEqual(prev.overrides);
    expect(panel.fieldConfig.overrides).not.toBe(prev.overrides);
    expect(panel.fieldConfig.overrides[1].properties[1].value).not.toBe(prev.overrides[1].properties[1].value);
  });

  it.each([
    // by value: adaptFieldColorMode resets these to the classic palette, because Time series supports by series
    { color: { mode: FieldColorModeId.Thresholds }, adapted: true },
    { color: { mode: 'continuous-GrYlRd', seriesBy: 'max' as const }, adapted: true },
    // kept by Grafana as well
    { color: { mode: FieldColorModeId.PaletteClassic }, adapted: false },
    { color: { mode: FieldColorModeId.PaletteClassicByName }, adapted: false },
    { color: { mode: FieldColorModeId.Shades, fixedColor: 'purple' }, adapted: false },
    { color: { mode: FieldColorModeId.Fixed, fixedColor: '#ff7f0e' }, adapted: false },
  ])('restores the colour mode $color.mode on the panel field config', ({ color, adapted }) => {
    const prev = coreFieldConfig(color);
    const panel = editorPanel(prev);
    expect(panel.fieldConfig.defaults.color).toEqual(adapted ? { mode: FieldColorModeId.PaletteClassic } : color);

    panelChangedHandler(panel, 'timeseries', coreOptions, prev);

    expect(panel.fieldConfig.defaults.color).toEqual(color);
    expect(panel.fieldConfig.defaults.color).not.toBe(prev.defaults.color);
    // everything else as core had it
    expect(panel.fieldConfig).toEqual(prev);
  });

  it('keeps Grafana’s default colour when core saved none', () => {
    // Time series' default colour (config.ts) is applied on load, so core's field config has it
    const prev = coreFieldConfig(undefined);
    expect(prev.defaults.color).toEqual({ mode: FieldColorModeId.PaletteClassic });
    const panel = editorPanel(prev);

    panelChangedHandler(panel, 'timeseries', coreOptions, prev);

    expect(panel.fieldConfig).toEqual(prev);
  });

  it('removes the colour when the previous field config has none', () => {
    const prev = { ...coreFieldConfig(undefined) };
    prev.defaults = { ...prev.defaults };
    delete prev.defaults.color;
    const panel = editorPanel(coreFieldConfig({ mode: FieldColorModeId.Thresholds }));

    panelChangedHandler(panel, 'timeseries', coreOptions, prev);

    expect(panel.fieldConfig.defaults).not.toHaveProperty('color');
    expect(panel.fieldConfig).toEqual(prev);
  });

  it('leaves the field config alone when no previous field config is passed', () => {
    const prev = coreFieldConfig({ mode: FieldColorModeId.Thresholds });
    const panel = editorPanel(prev);
    const before = cloneDeep(panel.fieldConfig);
    const onFieldConfigChange = jest.fn();

    // Grafana's type says it is always passed; the handler checks anyway
    const noFieldConfig = undefined as unknown as FieldConfigSource;
    expect(panelChangedHandler(panel, 'timeseries', coreOptions, noFieldConfig)).toEqual(coreOptions);
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

      panelChangedHandler(panel, 'timeseries', coreOptions, prev);
      const { rerender } = renderHook(() => useApplyFieldConfigChangedInPlace(panel.fieldConfig, onFieldConfigChange));
      rerender();

      expect(onFieldConfigChange).toHaveBeenCalledTimes(1);
      expect(onFieldConfigChange).toHaveBeenCalledWith(panel.fieldConfig);
    }
  );

  it('uses the core handler for any other previous panel type', () => {
    // An Angular graph panel (only reachable through core's own auto-migration in Grafana, kept as upstream)
    const angular = { angular: { bars: true, lines: false, legend: { show: true, alignAsTable: true } } };
    const prevFieldConfig: FieldConfigSource = { defaults: {}, overrides: [] };
    const pluginPanel = makePanel();
    const corePanel = makePanel();
    expect(panelChangedHandler(pluginPanel, 'graph', angular, cloneDeep(prevFieldConfig))).toEqual(
      graphPanelChangedHandler(corePanel, 'graph', angular, cloneDeep(prevFieldConfig))
    );
    expect(pluginPanel).toEqual(corePanel);
    expect(pluginPanel.fieldConfig.defaults.custom).toMatchObject({ drawStyle: GraphDrawStyle.Bars });

    // Any other panel: core only renames custom.hideFrom.graph to viz, and returns no options
    const withHideFrom = () =>
      ({
        options: {},
        fieldConfig: {
          defaults: { custom: { hideFrom: { graph: true, legend: false } } },
          overrides: [
            {
              matcher: { id: FieldMatcherID.byName, options: 'a' },
              properties: [{ id: 'custom.hideFrom', value: { graph: true } }],
            },
          ],
        },
      }) as unknown as PanelModel<Record<string, unknown>>;
    const other = withHideFrom();
    const expected = withHideFrom();
    const prev = coreFieldConfig({ mode: FieldColorModeId.Thresholds });
    expect(panelChangedHandler(other, 'trend', { legend: { showLegend: false } }, prev)).toEqual({});
    expect(graphPanelChangedHandler(expected, 'trend', { legend: { showLegend: false } }, prev)).toEqual({});
    expect(other).toEqual(expected);
    expect(other.fieldConfig.defaults.custom).toEqual({ hideFrom: { viz: true, legend: false } });
  });
});
