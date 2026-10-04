import { createDataFrame, FieldType, getPanelDataSummary } from '@grafana/data';

import { plugin } from '../plugins/panel/timeseries/module';
import { timeseriesPresetsSupplier } from '../plugins/panel/timeseries/presets';

import { panelChangedHandler } from './panelChangedHandler';

// The wiring of the copied module.tsx: core's (grafana/grafana v13.2.3 public/app/plugins/panel/timeseries/module.tsx),
// apart from the panel-change handler and the suggestions (left off). Expected values are read from that file.
describe('plugin module', () => {
  const dataSummary = getPanelDataSummary([
    createDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2, 3] },
        { name: 'value', type: FieldType.number, values: [10, 20, 30] },
      ],
    }),
  ]);

  it('has no migration handler, as core (a saved pluginVersion changes nothing on load)', () => {
    expect(plugin.onPanelMigration).toBeUndefined();
    expect(plugin.shouldMigrate).toBeUndefined();
  });

  it('switches panel types with the plugin handler', () => {
    expect(plugin.onPanelTypeChanged).toBe(panelChangedHandler);
  });

  it('draws with panel padding, as core', () => {
    expect(plugin.noPadding).toBeFalsy();
  });

  it("offers core's presets", () => {
    const presets = plugin.getPresets({ dataSummary });

    expect(presets?.map((p) => p.name)).toEqual(timeseriesPresetsSupplier({ dataSummary })?.map((p) => p.name));
    expect(presets?.map((p) => p.name)).toEqual([
      'Single fill',
      'Smooth scheme',
      'Dashed threshold',
      'Step fill',
      'Bars',
      'Bars scheme',
    ]);
  });

  it('offers no suggestions, so the picker shows no second Time series card', () => {
    expect(plugin.getSuggestions(dataSummary)).toBeUndefined();
  });

  it("has core's view-panel options and data support", () => {
    expect(plugin.viewPanelOptions).toEqual({
      fanout: { enabled: true },
      quickToggles: {
        optionProperties: ['legend.showLegend', 'legend.placement'],
        fieldConfigProperties: ['custom.stacking', 'custom.scaleDistribution'],
      },
    });
    expect(plugin.dataSupport).toEqual({ annotations: true, alertStates: true });
  });
});
