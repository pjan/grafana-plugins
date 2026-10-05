import { useEffect } from 'react';

import { type FieldConfigSource } from '@grafana/data';

/**
 * Applies a panel's field config again after its panel-change handler changed it in place (plugin-authored, not in
 * grafana/grafana).
 *
 * A plus plugin's `panelChangedHandler` restores what the core panel had (its custom field config, custom override
 * properties or colour mode) when a core panel is switched to the plugin in the panel editor. Grafana 13.2.3 (scenes
 * 8.13.5, `PanelOptionsPane.onChangePanel` and `VizPanel.changePluginType`) clears or adapts those before calling the
 * handler, and passes the VizPanel's own field config object, so the handler restores them on that object in place.
 *
 * When the plugin's module is already loaded (another panel of the same plugin was drawn in the session), scenes loads
 * it synchronously (`VizPanel._loadPlugin`), so React renders the panel once before `changePluginType` calls the
 * handler. That render applies the field config the editor left, and `VizPanel.applyFieldConfig` caches the result
 * until the data changes, so the panel would keep drawing that while the saved JSON has the restored field config.
 *
 * The handler marks the field config it changed (`markFieldConfigChanged`). On its next render the panel
 * (`useApplyFieldConfigChangedInPlace`) hands that field config to `onFieldConfigChange` (public `PanelProps`), which
 * clears the cache (`VizPanel.onFieldConfigChange`) and applies it again. With the module already loaded, that next
 * render comes from the options the handler returns: scenes applies them (`onOptionsChange`) only when they are not
 * empty, so a handler that marks the field config must return options, or nothing re-renders and the mark waits for
 * an unrelated render. When the module isn't loaded yet, the handler runs before the first render, which consumes the
 * mark.
 *
 * `VizPanel.onFieldConfigChange` also re-normalises the field config against the plugin's field config registry
 * (`getPanelOptionsWithDefaults`: defaults merged in, unknown properties and override properties dropped). That leaves
 * the restored content unchanged, so the saved JSON is the same, as long as the plugin's registry contains every
 * option of the core panel's.
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
