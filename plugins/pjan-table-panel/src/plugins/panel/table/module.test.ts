// Copied from grafana/grafana v13.2.3: public/app/plugins/panel/table/module.test.ts. AGPL-3.0 (Copyright Grafana Labs). Changes: imports; the panel-change handler is the plugin's (src/pjan/panelChangedHandler.ts, which calls tablePanelChangedHandler for other types); the suggestions supplier test removed (suggestions are left off; src/pjan/module.test.ts checks that), with its imports.
import { PanelPlugin, standardEditorsRegistry } from '@grafana/data'; // pjan-table-panel: createDataFrame, FieldType, getPanelDataSummary removed
import { TableCellDisplayMode } from '@grafana/schema';
import { getAllOptionEditors } from 'core/components/OptionsUI/registry';

import { TablePanel } from './TablePanel';
import { tableMigrationHandler } from './migrations'; // pjan-table-panel: tablePanelChangedHandler removed
import { plugin } from './module';
// pjan-table-panel: the plugin's panel-change handler, instead of the tableSuggestionsSupplier import
import { panelChangedHandler } from '../../../pjan/panelChangedHandler';

// building the plugin's fieldConfigRegistry runs the table useCustomConfig path,
// which resolves the 'stats-picker' standard editor; initialise the registry so
// this file does not depend on another test having done so first
standardEditorsRegistry.setInit(getAllOptionEditors);

function customConfigItem(path: string) {
  const item = plugin.fieldConfigRegistry.list().find((i) => i.path === path);
  if (!item) {
    throw new Error(`no custom field config option registered at path "${path}"`);
  }
  return item;
}

describe('table module', () => {
  it('exports a PanelPlugin rendering TablePanel', () => {
    expect(plugin).toBeInstanceOf(PanelPlugin);
    expect(plugin.panel).toBe(TablePanel);
  });

  it('wires up the migration and panel-change handlers', () => {
    expect(plugin.onPanelMigration).toBe(tableMigrationHandler);
    expect(plugin.onPanelTypeChanged).toBe(panelChangedHandler); // pjan-table-panel: was tablePanelChangedHandler
  });

  // pjan-table-panel: 'wires up the table suggestions supplier' removed (suggestions are left off)

  it('registers the cell-options custom editors', () => {
    const paths = plugin.fieldConfigRegistry.list().map((i) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'footer.reducers',
        'cellOptions',
        'inspect',
        'tooltip.field',
        'tooltip.placement',
        'styleField',
      ])
    );
  });

  describe('"Cell value inspect" visibility', () => {
    const showIf = (type: TableCellDisplayMode) =>
      // showIf receives the custom field config; only cellOptions.type gates this switch
      customConfigItem('inspect').showIf!({ cellOptions: { type } } as never, undefined);

    it.each`
      cellType                                | shown
      ${TableCellDisplayMode.Auto}            | ${true}
      ${TableCellDisplayMode.JSONView}        | ${true}
      ${TableCellDisplayMode.ColorText}       | ${true}
      ${TableCellDisplayMode.ColorBackground} | ${true}
      ${TableCellDisplayMode.Gauge}           | ${false}
      ${TableCellDisplayMode.Image}           | ${false}
      ${TableCellDisplayMode.Sparkline}       | ${false}
    `(
      'is $shown for the $cellType cell type',
      ({ cellType, shown }: { cellType: TableCellDisplayMode; shown: boolean }) => {
        expect(showIf(cellType)).toBe(shown);
      }
    );
  });

  describe('"Tooltip placement" visibility', () => {
    const showIf = (field?: string) =>
      customConfigItem('tooltip.placement').showIf!(
        { tooltip: field === undefined ? {} : { field } } as never,
        undefined
      );

    it('is hidden until a tooltip field is chosen', () => {
      expect(showIf(undefined)).toBe(false);
    });

    it('is shown once a tooltip field is chosen', () => {
      expect(showIf('metric')).toBe(true);
    });
  });
});
