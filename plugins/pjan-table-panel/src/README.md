# Table plus

Grafana's table panel, as a separate panel plugin. With nothing configured, it looks and behaves like the core **Table** panel of Grafana 13.2.3: same options, defaults, migrations, cell types, colours, sorting, filtering, column widths, pagination, footer, cell inspect, data links and actions, tooltips and nested tables. It starts from Grafana's own code. Opt-in additions (readable text on coloured cells, then pill options) are planned; this version has none yet.

## Using it

- **Convert an existing table panel:** change the panel's `type` from `table` to `pjan-table-panel` in the dashboard JSON (in a v2 dashboard, the panel's `vizConfig.group`; lossless), or pick **Table plus** in the panel editor (options, field config, overrides, including those of nested tables, and the colour scheme carry over).
- **Convert only panels in dashboards at schema version 38 or later.** Grafana's dashboard migration from older schemas converts table options (`displayMode` to `cellOptions`) only for panels of type `table`.
- **`pluginVersion`:** like core, the panel migrates old table options when it loads (a legacy footer, hidden fields, the old text-wrapping option). Grafana runs that migration whenever the saved `pluginVersion` differs from the running panel's: for core that is Grafana's version, for Table plus its own (`1.0.0`). A converted panel is migrated once, and keeps the plugin's version after a save.
- **Switching back** from Table plus to core Table is not supported.

## Differences from core Table

- **No suggestions:** Table plus offers no card in the visualization suggestions, so the picker doesn't show a second Table card next to core's. Core Table has no presets.
- **English only:** the panel's option labels and the table's own texts (the filter popup, "Inspect value", "Filter for value", the sparkline's "no data") are in English. Labels from Grafana's shared editors and components stay translated.
- **Feature flags** are read as core reads them: `tableSharedCrosshair` from Grafana's configuration, and the table flags `table.autoColumnWidths` and `table.paginationPageSize` from Grafana's feature flag service (the server's values, or a local override in the browser).
- **Elsewhere in Grafana**, "table" still means the core panel: Explore, "Switch to table" in a panel's error view, and the inspector's data tab.

## Source code

https://github.com/pjan/grafana-plugins (`plugins/pjan-table-panel`)

## Licence

AGPL-3.0, because it is derived from Grafana's core table panel. The table component and other code copied from Grafana's Apache-2.0 packages keep that licence (`LICENSE_APACHE2`). Notices for bundled third-party packages are in `THIRD_PARTY_NOTICES.txt`.
