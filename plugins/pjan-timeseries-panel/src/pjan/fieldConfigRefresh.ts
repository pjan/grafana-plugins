import { useEffect } from 'react';

import { type FieldConfigSource } from '@grafana/data';

/**
 * Applies a field config again after the panel-change handler changed it in place (plugin-only, not in
 * grafana/grafana; the same mechanism as Stat plus's `fieldConfigRefresh.ts`).
 *
 * `panelChangedHandler` restores the custom field config, the custom override properties and the colour of a core
 * Time series panel switched to this plugin in the panel editor, on the VizPanel's own field config object. When this
 * plugin's module is already loaded (another Time series plus panel was drawn in the session), scenes 8.13.5 loads it
 * synchronously (`VizPanel._loadPlugin`), so React renders the panel once before `changePluginType` calls the handler.
 * That render applies the field config the editor left (custom options at this plugin's defaults, no custom override
 * properties, a by-value colour mode reset to the classic palette), and `VizPanel.applyFieldConfig` caches the result
 * until the data changes, so the panel would keep drawing that while the saved JSON has the restored field config.
 *
 * The handler marks the field config it changed; on its next render the panel hands it to `onFieldConfigChange`
 * (public `PanelProps`), which clears that cache (`VizPanel.onFieldConfigChange`) and applies it again. The content
 * is unchanged, so the saved JSON is the same.
 */
const changedInPlace = new WeakSet<object>();

export function markFieldConfigChanged(fieldConfig: FieldConfigSource) {
  changedInPlace.add(fieldConfig);
}

export function useApplyFieldConfigChangedInPlace(
  fieldConfig: FieldConfigSource,
  onFieldConfigChange: (config: FieldConfigSource) => void
) {
  // After every render: the handler changes the object in place, so its identity (and any dependency list) stays the
  // same.
  useEffect(() => {
    if (changedInPlace.has(fieldConfig)) {
      changedInPlace.delete(fieldConfig);
      onFieldConfigChange(fieldConfig);
    }
  });
}
