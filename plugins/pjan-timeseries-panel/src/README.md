# Time series plus

Grafana's time series panel, as a separate panel plugin. With nothing configured, it looks and behaves like the core **Time series** panel of Grafana 13.2.3: same options, defaults, presets, drawing, legend, tooltip, annotations, exemplars, crosshair sync and zoom. It starts from Grafana's own code. On top, opt-in options that change nothing until you set them: colours for lines, fills and points, and the colour, opacity and width of threshold lines (below).

## Using it

- **Convert an existing time series panel:** change the panel's `type` from `timeseries` to `pjan-timeseries-panel` in the dashboard JSON (in a v2 dashboard, the panel's `vizConfig.group`; lossless), or pick **Time series plus** in the panel editor (options, field config, overrides and the colour scheme carry over).
- **`pluginVersion`:** panels saved by this plugin carry its version (`1.0.0`). Core time series has no migration that reads it, so it changes nothing.

## Colors for lines, fills and points

Three options in **Graph styles**, each right under the core option it refines. Empty, they draw as core: the line, the fill and the points all in the series colour. Like the other Graph styles options, they can be set for one series with an override.

| Option                               | Shown                                                                         | Choices                                                                             | Empty            |
| ------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------- |
| **Line color** (after Line width)    | with a line (Style not Points, Line width above 0)                            | a shade of the series color: Softer, Soft, Base, Strong, Stronger; or a fixed color | the series color |
| **Fill color** (after Gradient mode) | with a fill (Style not Points, Fill opacity above 0, or a Fill below to band) | Series color, a shade of the series color, or a fixed color                         | the line color   |
| **Point color** (after Point size)   | with points (as Point size)                                                   | Series color, a shade of the series color, or a fixed color                         | the line color   |

- **Shades** are the five shades of the series colour's hue, ranked by contrast with the panel background: Stronger stands out most (darker on a light background, lighter on a dark one), Softer least. A colour without a Grafana name (such as a hex colour of the classic palette) takes the shades of the nearest hue of the theme; with no such hue, the colour itself is drawn.
- **Fill opacity** and the **Opacity** and **Hue** gradients apply to the fill color as they do to the series colour.
- **The legend, the tooltip and an axis** with the axis color mode **Series** show the line color. With the Points style, the legend keeps the series color (Line color is hidden there).
- **A color picked in the legend** is drawn as picked: for a series with a Line color, the picker also sets that series' Line color to the picked color (in the same override).
- **Where Grafana draws the colours itself, the options do nothing:** with a by-value color scheme (From thresholds, the continuous schemes), and, for Line color and Fill color, with the **Scheme** gradient. The editor hides Line color and Fill color with the Scheme gradient (even with a single fixed color, where Grafana would draw them plain); it can't hide them for a by-value color scheme, which is chosen under Standard options, so their descriptions say so.

## Threshold lines

Three options in **Thresholds**, right under **Show thresholds**, shown when it draws lines (As lines, As lines (dashed), and the two with filled regions and lines). Empty, the lines are drawn as core draws them. Like the other options, they can be set for one series with an override.

| Option                     | Choices                                                                                     | Empty                                              |
| -------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Threshold line color**   | a shade of each threshold's color: Softer, Soft, Base, Strong, Stronger; or one fixed color | each threshold's color                             |
| **Threshold line opacity** | 0–100; replaces the color's own opacity too                                                 | 70, or the color's own opacity (such as rgba)      |
| **Threshold line width**   | 1–5 pixels, as Line width                                                                   | 2 device pixels (1 pixel on a high-density screen) |

- **Which lines:** Grafana draws one set of threshold lines per axis: those of the first series on that axis whose Show thresholds isn't Off, hidden series included. The options apply to those lines, so they are read from that series (its own settings and overrides); set on a later series of the same axis, they do nothing.
- **Shades** are those of the color the line is drawn in, as for Line color: of its name's hue, ranked by contrast with the panel background; a color without a name takes the shades of the nearest hue of the theme; with no such hue, the color itself. Below a transparent threshold, Grafana draws each line in the previous threshold's color, and the shade is of that color.
- **Fixed** is drawn at opacity 70, unless the color has an opacity of its own, or Threshold line opacity is set.
- **Transparent:** a line Grafana draws fully transparent (a later transparent threshold, or a color with opacity 0) stays hidden, whatever the options.
- **Width and dashes:** the dashes keep Grafana's length of 10 device pixels (5 pixels on a high-density screen), so at width 5 on such a screen a dashed line looks dotted, in squares. Set widths are drawn crisp.
- The filled regions (As filled regions) are not changed.

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
