import { cloneDeep } from 'lodash';

import { type FieldConfigSource, type PanelModel } from '@grafana/data';
import { type TableOptions } from '@grafana/schema';
import { markFieldConfigChanged } from '@pjan/grafana-panel-utils';

import { tablePanelChangedHandler } from '../plugins/panel/table/migrations';

/**
 * Panel-change handler of pjan-table-panel (plugin-only, not in grafana/grafana).
 *
 * Switching a core `table` panel to this plugin in the panel editor keeps everything: the two panels have identical
 * options and field config. Every other previous panel type (`table-old` included) goes to core's
 * `tablePanelChangedHandler` unchanged.
 *
 * Grafana 13.2.3 (scenes 8.13.5) changes the field config before calling this handler:
 * - the panel editor (`PanelOptionsPane.onChangePanel`) clears `fieldConfig.defaults.custom` and removes the custom
 *   properties (`custom.*`: cell types, column widths, hidden fields, tooltips, also in `scope: nested` rules) from the
 *   override rules;
 * - `VizPanel.changePluginType` loads the plugin with `getPanelOptionsWithDefaults(..., isAfterPluginChange: true)`,
 *   which fills `custom` with this plugin's defaults, and whose `adaptFieldColorMode` (with Table's colour settings:
 *   by value supported, thresholds preferred) turns a colour mode that isn't by value (the classic palette, a single
 *   colour scheme other than Fixed) and an unset one into Thresholds.
 * Core's own handler returns `{}` for every type, so the options would be lost too.
 *
 * Only the returned options are applied afterwards. `panel.fieldConfig` is the VizPanel's own field config object, so
 * `defaults.custom`, the override rules and `defaults.color` are restored on that object in place (the colour is
 * removed if the previous field config has none). The panel then applies that field config again
 * (`fieldConfigRefresh` in `@pjan/grafana-panel-utils`), because when the plugin's module is already loaded Grafana
 * has drawn the panel with the changed field config and cached it. If a future Grafana passes a copy instead, the
 * options still carry over and the field config is reset as for any other panel type switch.
 *
 * Renaming `type` in the dashboard JSON (or `vizConfig.group` in a v2 dashboard) stays the lossless conversion.
 */
export const panelChangedHandler = (
  panel: PanelModel<Partial<TableOptions>> | any,
  prevPluginId: string,
  prevOptions: any,
  // Always passed by Grafana (PanelTypeChangedHandler); checked anyway, as the other plus plugins do.
  prevFieldConfig: FieldConfigSource
) => {
  if (prevPluginId === 'table') {
    if (prevFieldConfig && panel.fieldConfig?.defaults) {
      const fieldConfig: FieldConfigSource = panel.fieldConfig;
      fieldConfig.defaults.custom = { ...fieldConfig.defaults.custom, ...cloneDeep(prevFieldConfig.defaults.custom) };
      fieldConfig.overrides = cloneDeep(prevFieldConfig.overrides);
      const prevColor = prevFieldConfig.defaults.color;
      if (prevColor) {
        fieldConfig.defaults.color = cloneDeep(prevColor);
      } else {
        // No colour in core's field config: none in the plugin's either
        delete fieldConfig.defaults.color;
      }
      markFieldConfigChanged(fieldConfig);
    }

    return cloneDeep(prevOptions);
  }

  return tablePanelChangedHandler(panel, prevPluginId, prevOptions);
};
