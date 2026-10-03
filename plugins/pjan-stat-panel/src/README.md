# Stat plus

Grafana's stat panel, as a separate panel plugin. With nothing configured, it looks and behaves like the core **Stat** panel of Grafana 13.2.3: same options, defaults, presets, layouts, colours, sparkline, percent change and data links. It starts from Grafana's own code. One addition, opt-in: [Color mode Custom](#color-mode-custom).

## Using it

- **Convert an existing stat panel:** change the panel's `type` from `stat` to `pjan-stat-panel` in the dashboard JSON (lossless), or pick **Stat plus** in the panel editor (options, field config, overrides and the colour scheme carry over).
- **`pluginVersion`:** panels saved by this plugin carry its version (`1.0.0`). Grafana's stat migration reads that number as a Grafana version, so for a field with unit **Percent (0-100)** or **Percent (0.0-1.0)** and no **Min**/**Max**, it writes in **Min** 0 and **Max** 100 (or 1) on every upgrade of this plugin. That changes the sparkline's range and percentage thresholds. Setting **Min** and **Max** on such fields avoids it.

## Color mode Custom

**Color mode** (in **Stat styles**) has a fifth choice, **Custom**: choose the tile's background, text and sparkline colours yourself, with Grafana's colour names (which follow the theme, light and dark) and colour picker. With the four core modes the panel draws exactly as core's, and nothing new is saved.

With **Custom** and nothing else set, the panel draws like **Value**. Each setting changes only its own part, and **each part you don't set follows core: like Value without a background, like Background Solid with one** (on that tile colour):

- **Background color** (right under Color mode): **None** (no fill, as not set), **Value** (the value's colour, solid), a **shade** of the value's colour, or a **Fixed color**. No gradient: use core's **Background Gradient** for that.
- **Text color**, for the value and the name: **Automatic**, **Value**, a **shade**, or a **Fixed color**. **Value**, a shade and a fixed colour are drawn as chosen, whatever their contrast. **Automatic** is the first shade of the background's hue (without a background, of the value's own colour) that is readable on what the text is drawn on (the background, or the panel without one): from that colour it moves towards the theme's page colour and towards its strongest text colour (`text.maxContrast`), and takes the first colour with a contrast of 4.5:1, or 3:1 for large text (at least 24 px, or 18.66 px bold), on whichever side gets there first; at least 4.2:1 when nothing reaches 4.5:1. Each text is measured at the size the panel draws it, so the value and the name can get different shades; a value with a unit (such as `%`) at the unit's size, which Grafana draws smaller. On a transparent panel, text without a background is measured against the dashboard behind it. Not set: **Automatic** on a background; without one, the value in its colour and the name in the panel's text colour.
- **Sparkline color**, **Sparkline line opacity**, **Sparkline fill opacity** and **Sparkline line width** (under Graph mode, only with Graph mode **Area**): the line's colour is **Value**, a **shade**, **Same as text** (the value's colour as drawn) or a **Fixed color**; line opacity 0–100 (not set: opaque), fill opacity 0–100 (the line's colour at that opacity), line width 1–5 (not set: 1). Not set, without a background: the line in the value's colour and the fill at 20 % of it (as Value). Not set, on a background: the line in a lighter tile colour and the fill white at 40 % (as Background Solid); the fill stays that white until you set a fill opacity, even with a sparkline colour set.
- **Percent change:** on a background it follows the text colour (as core does on coloured tiles); without one it keeps its own **Percent change color mode**.
- **Shades:** **Softer**, **Soft**, **Base**, **Strong**, **Stronger**: the five shades of the value colour's hue (for example `super-light-green` … `dark-green`), ranked by contrast with the panel background in the active theme, so **Softer** is light in a light theme and dark in a dark one. A value colour that isn't a Grafana colour name (a hex colour, a continuous scheme, a palette of hex colours such as the Atlas theme's, a CSS colour name such as `lime` in a theme without a lime hue) takes the shades of its nearest hue in the theme, the hues of Grafana's colour picker; **Base** is that hue's base shade, not the value's colour. The nearest hue is measured in OKLCH: a colour within 15° of a hue's shades, and at least 5° closer to it than to any other hue, takes that hue; a gray colour (chroma below 0.04, such as a value without a colour) takes the theme's gray hue if it has one (Grafana's own themes don't). Without a hue (and for `text` and `transparent`), a background or sparkline shade uses the value's colour itself, a text shade uses **Automatic**.
- **One series different:** each setting is also a field option, found only in the overrides menu (add a field override for the series, then the property by its name, in **Stat styles**; their descriptions end with "(Color mode Custom only)"). An override for a series wins over the panel option. It is saved under the same key as the panel option: `custom.styling.backgroundColor` for `styling.backgroundColor`, and so on.

Example, a status tile: **Background color** Soft, **Text color** not set (Automatic on the background), **Sparkline color** Same as text, line opacity 45, fill opacity 18.

## Differences from the core panel

- **Color mode Custom** (above) is the plugin's own; core's four modes are unchanged.
- **No panel suggestions** in the visualization picker, so it doesn't show a second set of Stat cards next to core's. The **Panel styles** presets are core's.
- **Labels are in English only.** The plugin ships no translations (the **Text size** labels come from Grafana and are translated).

## Source code

https://github.com/pjan/grafana-plugins (`plugins/pjan-stat-panel`)

## Licence

AGPL-3.0, because it is derived from Grafana's core stat panel. Code copied from Grafana's Apache-2.0 packages (the `BigValue` tile renderer) keeps that licence (`LICENSE_APACHE2`). Notices for bundled third-party packages are in `THIRD_PARTY_NOTICES.txt`.
