# State timeline (pjan)

Grafana's state timeline, as a separate panel plugin. With nothing configured, it looks and behaves like the core **State timeline** panel of Grafana 13.2.3: same options, defaults, rendering, tooltip, legend, annotations, shared crosshair, and drag to zoom. It starts from Grafana's own code. Opt-in additions (settings that are off by default) are planned; this version has none yet.

## Using it

- **Convert an existing state timeline:** change the panel's `type` from `state-timeline` to `pjan-statetimeline-panel` in the dashboard JSON (lossless), or pick **State timeline (pjan)** in the panel editor (options, field config and overrides carry over).
- **Go back:** change `type` back to `state-timeline`.
- **Annotations:** shown as in the core panel. Users who may add annotations can Ctrl/Cmd-click or Ctrl/Cmd-drag on empty plot space to add one, and edit or delete it from its tooltip.

## Differences from the core panel

- **No Grafana Assistant button** in the tooltip (not available to plugins).
- **No panel suggestions** in the visualization picker, so it doesn't show a second card next to the core state timeline.
- **Labels are in English only.** The plugin ships no translations.
- **No grouped-label filter buttons in the tooltip.** Core shows them only with Grafana's `grafana.filterablePanels` feature flag (off by default); this plugin doesn't read that flag, so they stay off.

## Source code

https://github.com/pjan/grafana-plugins (`plugins/pjan-statetimeline-panel`)

## Licence

AGPL-3.0, because it is derived from Grafana's core state-timeline panel. Code copied from Grafana's Apache-2.0 packages keeps that licence (`LICENSE_APACHE2`). Notices for bundled third-party packages are in `THIRD_PARTY_NOTICES.txt`.
