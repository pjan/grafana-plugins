import { cloneDeep } from 'lodash';

import { type FieldConfigSource, type PanelModel } from '@grafana/data';
import { markFieldConfigChanged } from '@pjan/grafana-panel-utils';

import { graphPanelChangedHandler } from '../plugins/panel/timeseries/migrations';
import { type Options } from '../plugins/panel/timeseries/panelcfg.gen';

/**
 * Panel-change handler of pjan-timeseries-panel (plugin-only, not in grafana/grafana).
 *
 * Switching a core `timeseries` panel to this plugin in the panel editor keeps everything: the two panels have
 * identical options and field config. Every other previous panel type goes to core's `graphPanelChangedHandler`
 * unchanged.
 *
 * Grafana 13.2.3 (scenes 8.13.5) changes the field config before calling this handler:
 * - the panel editor (`PanelOptionsPane.onChangePanel`) clears `fieldConfig.defaults.custom` and removes the custom
 *   properties (`custom.*`) from the override rules;
 * - `VizPanel.changePluginType` loads the plugin with `getPanelOptionsWithDefaults(..., isAfterPluginChange: true)`,
 *   which fills `custom` with this plugin's defaults, and whose `adaptFieldColorMode` resets a by-value colour mode
 *   (thresholds, a continuous scheme) to the classic palette, because Time series supports colours by series.
 *
 * Only the returned options are applied afterwards. `panel.fieldConfig` is the VizPanel's own field config object, so
 * `defaults.custom`, the override rules and `defaults.color` are restored on that object in place (the colour is
 * removed if the previous field config has none; Grafana normally applies Time series' default, the classic
 * palette, on load, so core's always has one). The panel then applies that field config again
 * (`fieldConfigRefresh` in `@pjan/grafana-panel-utils`), because when the plugin's module is already loaded Grafana
 * has drawn the panel with the changed field config and cached it. If a future Grafana passes a copy instead, the
 * options still carry over and the field config is reset as for any other panel type switch.
 *
 * Renaming `type` in the dashboard JSON stays the lossless conversion.
 */
export const panelChangedHandler = (
  panel: PanelModel<Partial<Options>> | any,
  prevPluginId: string,
  prevOptions: any,
  // Always passed by Grafana (PanelTypeChangedHandler); checked anyway, as the other plus plugins do.
  prevFieldConfig: FieldConfigSource
) => {
  if (prevPluginId === 'timeseries') {
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

  return graphPanelChangedHandler(panel, prevPluginId, prevOptions, prevFieldConfig);
};
