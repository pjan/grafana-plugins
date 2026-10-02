# Stat ++

Grafana's stat panel, as a separate panel plugin. With nothing configured, it looks and behaves like the core **Stat** panel of Grafana 13.2.3: same options, defaults, presets, layouts, colours, sparkline, percent change and data links. It starts from Grafana's own code. One addition, opt-in: [Color mode Custom](#color-mode-custom).

## Using it

- **Convert an existing stat panel:** change the panel's `type` from `stat` to `pjan-stat-panel` in the dashboard JSON (lossless), or pick **Stat ++** in the panel editor (options, field config, overrides and the colour scheme carry over).
- **Go back:** change `type` back to `stat` in the dashboard JSON; options and field config carry over (see `pluginVersion` below). Picking **Stat** in the panel editor is Grafana's own switch to Stat, as from any other panel: it keeps only **Value options** and **Orientation**, and resets a **Classic palette**, **Classic palette (by series name)** or **Shades of a color** scheme to **From thresholds**.
- **`pluginVersion`:** panels saved by this plugin carry its version (`1.0.0`). Grafana's stat migration reads that number as a Grafana version, so for a field with unit **Percent (0-100)** or **Percent (0.0-1.0)** and no **Min**/**Max**, it writes in **Min** 0 and **Max** 100 (or 1) on every upgrade of this plugin, and in core Stat after you change `type` back. That changes the sparkline's range and percentage thresholds. To avoid it when you change `type` back to `stat`, also set `"pluginVersion"` to `"13.2.3"` (the Grafana version). Don't remove `pluginVersion`: without it Grafana assumes 6.1 and runs every legacy migration. Setting **Min** and **Max** on such fields also avoids it.

## Color mode Custom

**Color mode** (in **Stat styles**) has a fifth choice, **Custom**: choose the tile's background, text and sparkline colours yourself, with Grafana's colour names (which follow the theme, light and dark) and colour picker. With the four core modes the panel draws exactly as core's, and nothing new is saved.

With **Custom** and nothing else set, the panel draws like **Value**. Each setting changes only its own part, and **each part you don't set follows core: like Value without a background, like Background Solid with one** (on that tile colour):

- **Background color** (right under Color mode): **None** (no fill, as not set), **Value** (the value's colour, solid), a **shade** of the value's colour, or a **Fixed color**. No gradient: use core's **Background Gradient** for that.
- **Text color**, for the value and the name: **Best contrast**, **Value**, a **shade**, or a **Fixed color**. Each text must be readable on what it is drawn on (the background, or the panel without one): a contrast of 4.5:1, or 3:1 for large text (at least 24 px, or 18.66 px bold), measured at the size the panel draws it. Where it isn't, that text uses best contrast instead. Best contrast is the one of Grafana's two text colours for coloured tiles (near black and near white) that contrasts more. A value with a unit (such as `%`) is checked at the unit's size, which Grafana draws smaller. On a transparent panel, text without a background is checked against the dashboard behind it. Not set: the value in its colour and the name in the panel's text colour; on a background, Grafana's light or dark text for that background, as in Background Solid.
- **Sparkline color**, **Sparkline line opacity**, **Sparkline fill opacity** and **Sparkline line width** (under Graph mode, only with Graph mode **Area**): the line's colour is **Value**, a **shade**, **Same as text** (the value's colour as drawn) or a **Fixed color**; line opacity 0–100 (not set: opaque), fill opacity 0–100 (the line's colour at that opacity), line width 1–5 (not set: 1). Not set, without a background: the line in the value's colour and the fill at 20 % of it (as Value). Not set, on a background: the line in a lighter tile colour and the fill white at 40 % (as Background Solid); the fill stays that white until you set a fill opacity, even with a sparkline colour set.
- **Percent change:** on a background it follows the text colour (as core does on coloured tiles); without one it keeps its own **Percent change color mode**.
- **Shades:** **Softer**, **Soft**, **Base**, **Strong**, **Stronger**: the five shades of the value colour's hue (for example `super-light-green` … `dark-green`), ranked by contrast with the panel background in the active theme, so **Softer** is light in a light theme and dark in a dark one. A shade needs the value's colour to be a Grafana colour name (from thresholds, value mappings, the fixed colour, or the classic palette). A colour without a name (a hex colour, a continuous scheme, a palette of hex colours): a background or sparkline shade uses the value's colour itself, a text shade uses best contrast.
- **One series different:** each setting is also a field option, found only in the overrides menu (add a field override for the series, then the property by its name, in **Stat styles**; their descriptions end with "(Color mode Custom only)"). An override for a series wins over the panel option.
- **Going back to core Stat:** picking **Stat** in the panel editor resets **Color mode** to **Value** and drops these settings (Grafana's own switch). Changing `type` to `stat` in the JSON keeps `colorMode: "custom"`, which core Stat doesn't know: it draws the tiles without a background and the text in the panel's text colour until you pick a core mode.

Example, a status tile: **Background color** Soft, **Text color** Best contrast, **Sparkline color** Same as text, line opacity 45, fill opacity 18.

## Differences from the core panel

- **Color mode Custom** (above) is the plugin's own; core's four modes are unchanged.
- **No panel suggestions** in the visualization picker, so it doesn't show a second set of Stat cards next to core's. The **Panel styles** presets are core's.
- **Labels are in English only.** The plugin ships no translations (the **Text size** labels come from Grafana and are translated).

## Source code

https://github.com/pjan/grafana-plugins (`plugins/pjan-stat-panel`)

## Licence

AGPL-3.0, because it is derived from Grafana's core stat panel. Code copied from Grafana's Apache-2.0 packages (the `BigValue` tile renderer) keeps that licence (`LICENSE_APACHE2`). Notices for bundled third-party packages are in `THIRD_PARTY_NOTICES.txt`.
