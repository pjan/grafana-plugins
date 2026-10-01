import { createDataFrame, FieldType, getPanelDataSummary } from '@grafana/data';
import { sharedSingleStatMigrationHandler } from '@grafana/ui';

import { plugin } from '../plugins/panel/stat/module';
import { statPresetsSupplier } from '../plugins/panel/stat/presets';

import { panelChangedHandler } from './panelChangedHandler';

// The wiring of the copied module.tsx: core's, apart from the panel-change handler and the suggestions (left off).
describe('plugin module', () => {
  const dataSummary = getPanelDataSummary([
    createDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1, 2, 3] },
        { name: 'value', type: FieldType.number, values: [10, 20, 30] },
      ],
    }),
  ]);

  it("loads saved panels with Grafana's single-stat migration handler", () => {
    expect(plugin.onPanelMigration).toBe(sharedSingleStatMigrationHandler);
  });

  it('switches panel types with the plugin handler', () => {
    expect(plugin.onPanelTypeChanged).toBe(panelChangedHandler);
  });

  it('draws without panel padding, as core', () => {
    expect(plugin.noPadding).toBe(true);
  });

  it("offers core's presets", () => {
    const presets = plugin.getPresets({ dataSummary });

    expect(presets?.map((p) => p.name)).toEqual(statPresetsSupplier({ dataSummary })?.map((p) => p.name));
    expect(presets?.map((p) => p.name)).toEqual([
      'Threshold value',
      'Threshold value with sparkline',
      'Threshold background',
      'Threshold background with sparkline',
      'Wide list',
      'List',
    ]);
  });

  it('offers no suggestions, so the picker shows no second Stat card', () => {
    expect(plugin.getSuggestions(dataSummary)).toBeUndefined();
  });
});
