# Time series plus

Grafana's time series panel, as a separate panel plugin. With nothing configured, it looks and behaves like the core **Time series** panel of Grafana 13.2.3: same options, defaults, presets, drawing, legend, tooltip, annotations, exemplars, crosshair sync and zoom. It starts from Grafana's own code. Opt-in additions (colours for lines, fills and points; threshold lines) are planned.

## Using it

- **Convert an existing time series panel:** change the panel's `type` from `timeseries` to `pjan-timeseries-panel` in the dashboard JSON (in a v2 dashboard, the panel's `vizConfig.group`; lossless), or pick **Time series plus** in the panel editor (options, field config, overrides and the colour scheme carry over).
- **`pluginVersion`:** panels saved by this plugin carry its version (`1.0.0`). Core time series has no migration that reads it, so it changes nothing.

## Differences from the core panel

- **No panel suggestions** in the visualization picker, so it doesn't show a second Time series card next to core's. The **Panel styles** presets are core's.
- **Long data** (a "long" time series frame) shows core's message. In the panel editor (the only place Grafana shows buttons under it), core offers **Transform to wide time series format**, **Switch to table** and **Open visualization suggestions**; Time series plus offers the last two: plugins can't reach the dashboard model the first one changes. Add the **Prepare time series** transformation yourself.
- **No Grafana Assistant button** in the pinned tooltip (Grafana Assistant is not available to plugins).
- **The panel editor's Alert tab** shows only for core Time series panels.
- **Labels are in English only.** The plugin ships no translations (the tooltip, legend, axis and other labels that come from Grafana are translated).

## Source code

https://github.com/pjan/grafana-plugins (`plugins/pjan-timeseries-panel`)

## Licence

AGPL-3.0, because it is derived from Grafana's core time series panel. Code copied from Grafana's Apache-2.0 packages keeps that licence (`LICENSE_APACHE2`). Notices for bundled third-party packages are in `THIRD_PARTY_NOTICES.txt`.
