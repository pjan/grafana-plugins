import { cloneDeep } from 'lodash';

import { type FieldConfigSource, type PanelModel } from '@grafana/data';

import { timelinePanelChangedHandler } from '../plugins/panel/state-timeline/migrations';
import { type Options } from '../plugins/panel/state-timeline/panelcfg.gen';

/**
 * Panel-change handler of pjan-statetimeline-panel (plugin-only, not in grafana/grafana).
 *
 * Switching a core `state-timeline` panel to this plugin in the panel editor keeps everything: the two panels have
 * identical options and field config. Every other previous panel type goes to core's handler unchanged.
 *
 * Grafana's panel editor clears `fieldConfig.defaults.custom` and the custom override rules before calling this
 * handler, and only applies the returned options. Grafana 13.2.3 (scenes 8.13.5) passes the VizPanel's own field
 * config object as `panel.fieldConfig`, so the custom config is restored on that object in place. If a future
 * Grafana passes a copy instead, the options still carry over and the custom field config falls back to this
 * panel's defaults, as for any other panel type switch.
 *
 * Renaming `type` in the dashboard JSON stays the lossless conversion.
 */
export const panelChangedHandler = (
  panel: PanelModel<Partial<Options>> | any,
  prevPluginId: string,
  prevOptions: any,
  prevFieldConfig?: FieldConfigSource
) => {
  if (prevPluginId === 'state-timeline') {
    if (prevFieldConfig && panel.fieldConfig) {
      const fieldConfig: FieldConfigSource = panel.fieldConfig;
      fieldConfig.defaults.custom = { ...fieldConfig.defaults.custom, ...cloneDeep(prevFieldConfig.defaults.custom) };
      fieldConfig.overrides = cloneDeep(prevFieldConfig.overrides);
    }

    return cloneDeep(prevOptions);
  }

  return timelinePanelChangedHandler(panel, prevPluginId, prevOptions);
};
