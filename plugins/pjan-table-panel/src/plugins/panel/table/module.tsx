// Copied from grafana/grafana v13.2.3: public/app/plugins/panel/table/module.tsx. AGPL-3.0 (Copyright Grafana Labs). Changes: imports; setPanelChangeHandler(panelChangedHandler from src/pjan/, which keeps options and field config when switching from core table and otherwise calls tablePanelChangedHandler); panel suggestions (setSuggestionsSupplier/tableSuggestionsSupplier) left off; the field options Background color and Text color (custom.styling.backgroundColor, custom.styling.textColor, src/pjan/styling/) right after Cell type.
import { identityOverrideProcessor, FieldConfigProperty, PanelPlugin, standardEditorsRegistry } from '@grafana/data';
import { t } from '@grafana/i18n';
import {
  TableCellDisplayMode,
  type TableCellOptions,
  TableCellTooltipPlacement,
  defaultTableFieldOptions,
} from '@grafana/schema';
import { addTableCustomConfig } from 'features/panel/table/addTableCustomConfig';
import { addTableCustomPanelOptions } from 'features/panel/table/addTableCustomPanelOptions';

import { TableCellOptionEditor } from './TableCellOptionEditor';
import { TablePanel } from './TablePanel';
import { tableMigrationHandler } from './migrations'; // pjan-table-panel: tablePanelChangedHandler is called by src/pjan/
import { type FieldConfig, type Options } from './panelcfg.gen';
// pjan-table-panel: plugin-only panel-change handler (src/pjan/), wraps tablePanelChangedHandler; it replaces the
// import of tableSuggestionsSupplier (suggestions are left off).
import { panelChangedHandler } from '../../../pjan/panelChangedHandler';
// pjan-table-panel: the plugin's field options (src/pjan/styling/), in "Cell options" after Cell type
import { backgroundColorFieldOption, textColorFieldOption } from '../../../pjan/styling/options';

function getTableNoValuePlaceholder(): string {
  return t('table.no-value-placeholder', 'No rows');
}

export const plugin = new PanelPlugin<Options, FieldConfig>(TablePanel)
  .setPanelChangeHandler(panelChangedHandler) // pjan-table-panel: instead of tablePanelChangedHandler
  .setMigrationHandler(tableMigrationHandler)
  .useFieldConfig({
    standardOptions: {
      [FieldConfigProperty.Actions]: {
        hideFromDefaults: false,
      },
      [FieldConfigProperty.NoValue]: {
        settings: {
          placeholder: getTableNoValuePlaceholder(),
        },
      },
    },
    useCustomConfig: (builder) => {
      addTableCustomConfig(builder, {
        filters: true,
        wrapHeaderText: true,
        hideFields: true,
      });

      const cellCategory = [t('table.category-cell-options', 'Cell options')];

      builder.addCustomEditor({
        id: 'footer.reducers',
        category: [t('table.category-table-footer', 'Table footer')],
        path: 'footer.reducers',
        name: t('table.name-calculation', 'Calculation'),
        description: t('table.description-calculation', 'Choose a reducer function / calculation'),
        editor: standardEditorsRegistry.get('stats-picker').editor,
        override: standardEditorsRegistry.get('stats-picker').editor,
        defaultValue: [],
        process: identityOverrideProcessor,
        shouldApply: () => true,
        settings: {
          allowMultiple: true,
        },
      });

      builder
        .addCustomEditor<void, TableCellOptions>({
          id: 'cellOptions',
          path: 'cellOptions',
          name: t('table.name-cell-type', 'Cell type'),
          editor: TableCellOptionEditor,
          override: TableCellOptionEditor,
          defaultValue: defaultTableFieldOptions.cellOptions,
          process: identityOverrideProcessor,
          category: cellCategory,
          shouldApply: () => true,
        })
        .addCustomEditor(backgroundColorFieldOption(cellCategory)) // pjan-table-panel
        .addCustomEditor(textColorFieldOption(cellCategory)) // pjan-table-panel
        .addBooleanSwitch({
          path: 'inspect',
          name: t('table.name-cell-value-inspect', 'Cell value inspect'),
          description: t('table.description-cell-value-inspect', 'Enable cell value inspection in a modal window'),
          defaultValue: false,
          category: cellCategory,
          showIf: (cfg) => {
            return (
              cfg.cellOptions.type === TableCellDisplayMode.Auto ||
              cfg.cellOptions.type === TableCellDisplayMode.JSONView ||
              cfg.cellOptions.type === TableCellDisplayMode.ColorText ||
              cfg.cellOptions.type === TableCellDisplayMode.ColorBackground
            );
          },
        })
        .addFieldNamePicker({
          path: 'tooltip.field',
          name: t('table.name-tooltip-from-field', 'Tooltip from field'),
          description: t(
            'table.description-tooltip-from-field',
            'Render a cell from a field (hidden or visible) in a tooltip'
          ),
          category: cellCategory,
          settings: {
            isClearable: true,
          },
        })
        .addSelect({
          path: 'tooltip.placement',
          name: t('table.name-tooltip-placement', 'Tooltip placement'),
          category: cellCategory,
          settings: {
            options: [
              {
                label: t('table.tooltip-placement-options.label-auto', 'Auto'),
                value: TableCellTooltipPlacement.Auto,
              },
              {
                label: t('table.tooltip-placement-options.label-top', 'Top'),
                value: TableCellTooltipPlacement.Top,
              },
              {
                label: t('table.tooltip-placement-options.label-right', 'Right'),
                value: TableCellTooltipPlacement.Right,
              },
              {
                label: t('table.tooltip-placement-options.label-bottom', 'Bottom'),
                value: TableCellTooltipPlacement.Bottom,
              },
              {
                label: t('table.tooltip-placement-options.label-left', 'Left'),
                value: TableCellTooltipPlacement.Left,
              },
            ],
          },
          showIf: (cfg) => cfg.tooltip?.field !== undefined,
        })
        .addFieldNamePicker({
          path: 'styleField',
          name: t('table.name-styling-from-field', 'Styling from field'),
          description: t('table.description-styling-from-field', 'A field containing JSON objects with CSS properties'),
          category: cellCategory,
        });
    },
  })
  .setPanelOptions((builder) => {
    addTableCustomPanelOptions(builder);
  });
// pjan-table-panel: .setSuggestionsSupplier(tableSuggestionsSupplier) left off (no second Table card)
