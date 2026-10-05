import { createDataFrame, FieldType, getPanelDataSummary, PanelPlugin } from '@grafana/data';

import { tableMigrationHandler } from '../plugins/panel/table/migrations';
import { plugin } from '../plugins/panel/table/module';
import { TablePanel } from '../plugins/panel/table/TablePanel';

import { panelChangedHandler } from './panelChangedHandler';
import { fillEditorRegistry } from './testdata/editorRegistry';

fillEditorRegistry();

// The wiring of the copied module.tsx: core's (grafana/grafana v13.2.3 public/app/plugins/panel/table/module.tsx),
// apart from the panel-change handler and the suggestions (left off). The copied module.test.ts checks the rest.
describe('plugin module', () => {
  const dataSummary = getPanelDataSummary([
    createDataFrame({
      fields: [
        { name: 'name', type: FieldType.string, values: ['a', 'b', 'c'] },
        { name: 'value', type: FieldType.number, values: [10, 20, 30] },
      ],
    }),
  ]);

  it('renders the copied TablePanel', () => {
    expect(plugin.panel).toBe(TablePanel);
  });

  it("migrates on load with core's handler, with no version check of its own (as core)", () => {
    expect(plugin.onPanelMigration).toBe(tableMigrationHandler);
    expect(plugin.shouldMigrate).toBeUndefined();
  });

  it('switches panel types with the plugin handler', () => {
    expect(plugin.onPanelTypeChanged).toBe(panelChangedHandler);
  });

  it('offers no suggestions, so the picker shows no second Table card', () => {
    expect(plugin.getSuggestions(dataSummary)).toBeUndefined();
  });

  it('offers no presets, as core', () => {
    expect(plugin.getPresets({ dataSummary })).toBeUndefined();
  });

  it("draws with panel padding and has a panel's default data support, as core", () => {
    const fresh = new PanelPlugin(() => null);
    expect(plugin.noPadding).toBeFalsy();
    expect(plugin.dataSupport).toEqual(fresh.dataSupport);
  });
});
