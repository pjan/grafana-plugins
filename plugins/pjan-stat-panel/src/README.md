# Stat ++

Grafana's stat panel, as a separate panel plugin. With nothing configured, it looks and behaves like the core **Stat** panel of Grafana 13.2.3: same options, defaults, presets, layouts, colours, sparkline, percent change and data links. It starts from Grafana's own code. Additions will be opt-in (off by default).

## Using it

- **Convert an existing stat panel:** change the panel's `type` from `stat` to `pjan-stat-panel` in the dashboard JSON (lossless), or pick **Stat ++** in the panel editor (options, field config, overrides and the colour scheme carry over).
- **Go back:** change `type` back to `stat` in the dashboard JSON; options and field config carry over (see `pluginVersion` below). Picking **Stat** in the panel editor is Grafana's own switch to Stat, as from any other panel: it keeps only **Value options** and **Orientation**, and resets a **Classic palette**, **Classic palette (by series name)** or **Shades of a color** scheme to **From thresholds**.
- **`pluginVersion`:** panels saved by this plugin carry its version (`1.0.0`). Grafana's stat migration reads that number as a Grafana version, so for a field with unit **Percent (0-100)** or **Percent (0.0-1.0)** and no **Min**/**Max**, it writes in **Min** 0 and **Max** 100 (or 1) on every upgrade of this plugin, and in core Stat after you change `type` back. That changes the sparkline's range and percentage thresholds. To avoid it when you change `type` back to `stat`, also set `"pluginVersion"` to `"13.2.3"` (the Grafana version). Don't remove `pluginVersion`: without it Grafana assumes 6.1 and runs every legacy migration. Setting **Min** and **Max** on such fields also avoids it.

## Differences from the core panel

- **No panel suggestions** in the visualization picker, so it doesn't show a second set of Stat cards next to core's. The **Panel styles** presets are core's.
- **Labels are in English only.** The plugin ships no translations (the **Text size** labels come from Grafana and are translated).

## Source code

https://github.com/pjan/grafana-plugins (`plugins/pjan-stat-panel`)

## Licence

AGPL-3.0, because it is derived from Grafana's core stat panel. Code copied from Grafana's Apache-2.0 packages (the `BigValue` tile renderer) keeps that licence (`LICENSE_APACHE2`). Notices for bundled third-party packages are in `THIRD_PARTY_NOTICES.txt`.
