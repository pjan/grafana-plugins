import { cloneDeep } from 'lodash';

import { type FieldConfigSource, type PanelModel } from '@grafana/data';

import { statPanelChangedHandler } from '../plugins/panel/stat/StatMigrations';
import { type Options } from '../plugins/panel/stat/panelcfg.gen';

import { markFieldConfigChanged } from './fieldConfigRefresh';

/**
 * Panel-change handler of pjan-stat-panel (plugin-only, not in grafana/grafana).
 *
 * Switching a core `stat` panel to this plugin in the panel editor keeps everything: the two panels have identical
 * options and field config. Every other previous panel type goes to core's `statPanelChangedHandler` unchanged.
 *
 * Before calling this handler, Grafana 13.2.3 (scenes 8.13.5, `VizPanel.changePluginType`) loads the plugin with
 * `getPanelOptionsWithDefaults(..., isAfterPluginChange: true)`, whose `adaptFieldColorMode` resets a colour mode that is
 * neither by value nor Fixed (classic palette, by series name, shades) to `thresholds`, because Stat's colour setting
 * prefers thresholds. Only the returned options are applied afterwards. `panel.fieldConfig` is the VizPanel's own
 * field config object, so the colour is restored on that object in place (or removed, when core had none: Grafana's
 * default applies, and core never saved `thresholds`). The panel then applies that field config again
 * (`fieldConfigRefresh.ts`), because when the plugin's module is already loaded Grafana has drawn the panel with the
 * adapted colour and cached it. If a future Grafana passes a copy instead, the options still carry over and the colour
 * mode is adapted as for any other panel type switch.
 *
 * Renaming `type` in the dashboard JSON stays the lossless conversion.
 */
export const panelChangedHandler = (
  panel: PanelModel<Partial<Options>> | any,
  prevPluginId: string,
  prevOptions: any,
  prevFieldConfig?: FieldConfigSource
) => {
  if (prevPluginId === 'stat') {
    if (prevFieldConfig && panel.fieldConfig?.defaults) {
      const fieldConfig: FieldConfigSource = panel.fieldConfig;
      const prevColor = prevFieldConfig.defaults.color;
      if (prevColor) {
        fieldConfig.defaults.color = cloneDeep(prevColor);
      } else {
        // Core saved no colour (Grafana's default applies); adaptFieldColorMode wrote `thresholds`.
        delete fieldConfig.defaults.color;
      }
      markFieldConfigChanged(fieldConfig);
    }

    return cloneDeep(prevOptions);
  }

  return statPanelChangedHandler(panel, prevPluginId, prevOptions);
};
