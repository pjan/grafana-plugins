# Table plus

Grafana's table panel, as a separate panel plugin. With nothing configured, it looks and behaves like the core **Table** panel of Grafana 13.2.3: same options, defaults, migrations, cell types, colours, sorting, filtering, column widths, pagination, footer, cell inspect, data links and actions, tooltips and nested tables. It starts from Grafana's own code. On top, opt-in options that change nothing until you set them: the text and background colours of coloured cells (below).

## Using it

- **Convert an existing table panel:** change the panel's `type` from `table` to `pjan-table-panel` in the dashboard JSON (in a v2 dashboard, the panel's `vizConfig.group`; lossless), or pick **Table plus** in the panel editor (options, field config, overrides, including those of nested tables, and the colour scheme carry over).
- **Convert only panels in dashboards at schema version 38 or later.** Grafana's dashboard migration from older schemas converts table options (`displayMode` to `cellOptions`) only for panels of type `table`.
- **`pluginVersion`:** like core, the panel migrates old table options when it loads (a legacy footer, hidden fields, the old text-wrapping option). Grafana runs that migration whenever the saved `pluginVersion` differs from the running panel's: for core that is Grafana's version, for Table plus its own (`1.0.0`). A converted panel is migrated once, and keeps the plugin's version after a save.
- **Switching back** from Table plus to core Table is not supported.

## Text color and Background color

Two field options in **Cell options**, right after **Cell type**. Empty, every cell draws as core. They show for every column, whatever its cell type (a table often keeps Cell type Auto in the field defaults and sets cell types by override), and do nothing on cell types they don't apply to.

| Option               | Applies to                                                                          | Choices                                                                              | Empty                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Background color** | Colored background cells, basic and gradient; with **Apply to entire row**, the row | a shade of the value's color: Softer, Soft, Base, Strong, Stronger; or a fixed color | as Grafana: the value's color, solid or as a gradient                                                                                       |
| **Text color**       | Colored background cells (and the row), Pill cells, Colored text cells              | Automatic, Value, a shade of the value's color, or a fixed color                     | Automatic on a Background color; otherwise as Grafana: near-white or near-black by the fill's brightness, the value's color on Colored text |

- **Automatic** is the first shade of the same hue that is readable on what the text is drawn on: 4.5:1 (3:1 for large text: 24 px, or 18.66 px bold), or at least 4.2:1 where a shade reaches that but not 4.5:1, measured at the size the text is drawn in (cells 14 px, pills 12 px). On a fill it starts from the fill; on a **gradient** every step is measured against both of its colors, and the lower contrast counts. Where no shade reaches 4.2:1 on both colors of a gradient, Automatic is the color (the page color or its opposite) with the highest contrast on both, which can be as low as about 3.2:1 (Atlas dark: blue, teal and cyan gradients about 3.2:1, green 3.9:1; on basic fills the same colors reach 4.5:1). On **Colored text** it starts from the value's color, against what the text is drawn on: the table's background, the row's fill on a row colored by Apply to entire row (both colors of a gradient row), or the tooltip's background in **Tooltip from field**.
- **Value, a shade and a fixed color are drawn as chosen**, even where they are hard to read (Value on a fill of the same color is invisible).
- **The unset rule:** where the plugin draws the fill (Background color set), Text color not set is Automatic on that fill. Otherwise an unset Text color is Grafana's own.
- **Shades** are the five shades of the value color's hue, ranked by contrast with the panel background: Stronger stands out most (darker on a light background, lighter on a dark one), Softer least.
- **Colors without a name** (hex colors in thresholds or value mappings, the classic palette of string-hash pills): the shades of the nearest hue of the theme. With no such hue, Background color draws the value's color itself, and a Text color shade is Automatic.
- **Continuous color schemes** (such as Green-Yellow-Red by value): a shade shades each color of the scheme in its own hue and takes the color at the value's position, so the scheme keeps its transition at the chosen lightness. A scheme's panel-background end (Blues, Reds, Greens and Purples start at it) stays the panel's color. A value colored by a value mapping takes the shade of its mapping's color.
- **Gradient cells** (Background display mode Gradient, Grafana's default): a shade keeps Grafana's gradient, built from the shaded color the way Grafana builds it from the value's color. **Fixed applies to basic cells only**: on gradient cells it is ignored, and the cell draws as Grafana's.
- **Where the text must be readable, use Background display mode Basic:** Colored background defaults to Gradient, and text on a gradient can't always reach 4.2:1 (above).
- **Apply to entire row:** the options of the field that colors the row color the row: its Background color fills the row, its Text color is the row's text. Other columns keep their own: a Colored text column with Text color is measured against the row's fill, a Colored background column draws its own fill.
- **Pills:** Text color only. The pill's fill stays Grafana's (from value mappings, a fixed color, or the string hash). A translucent pill is measured as drawn on the table's background, also on a colored row.
- **Links** in colored cells take the text color (Grafana's links there inherit it). The hover buttons for cell inspect and filters keep Grafana's own backdrop and text.
- **Styling from field** still wins: its CSS is applied after these options.
- **Transparent panels:** the table is drawn on the dashboard's background, and Automatic is measured against it.
- **Cells Grafana leaves uncolored stay uncolored:** a value without a color, or a transparent value color on a colored row (the row's fill shows), gets no Background color.
- **A hovered row is not measured again** (Grafana's hover background is lighter or darker than the resting row).
- **After switching the theme live** (without reloading), Grafana keeps drawing the value colors of the previous theme until the data is refreshed, and the colors of a continuous color scheme until the page is reloaded (Grafana builds a scheme's colors once per page load); Table plus applies the options to the colors Grafana draws, with the new theme's shades and contrast, and shades a scheme from the new theme's colors.

**Per field and by override:** set in the field defaults, an option applies to every column of a cell type it applies to; an override sets it for one column. Saved as `custom.styling.backgroundColor` and `custom.styling.textColor` (override properties `custom.styling.backgroundColor` and `custom.styling.textColor`); nothing is saved until you set one, and clearing it removes it. **An override property left without a value clears the option for its columns**, including a value set in the field defaults (as for every Grafana field option): remove the property instead of clearing it to fall back to the defaults.

## Differences from core Table

- **No suggestions:** Table plus offers no card in the visualization suggestions, so the picker doesn't show a second Table card next to core's. Core Table has no presets.
- **English only:** the panel's option labels and the table's own texts (the filter popup, "Inspect value", "Filter for value", the sparkline's "no data") are in English. Labels from Grafana's shared editors and components stay translated.
- **Feature flags** are read as core reads them: `tableSharedCrosshair` from Grafana's configuration, and the table flags `table.autoColumnWidths` and `table.paginationPageSize` from Grafana's feature flag service (the server's values, or a local override in the browser).
- **Elsewhere in Grafana**, "table" still means the core panel: Explore, "Switch to table" in a panel's error view, and the inspector's data tab.

## Source code

https://github.com/pjan/grafana-plugins (`plugins/pjan-table-panel`)

## Licence

AGPL-3.0, because it is derived from Grafana's core table panel. The table component and other code copied from Grafana's Apache-2.0 packages keep that licence (`LICENSE_APACHE2`). Notices for bundled third-party packages are in `THIRD_PARTY_NOTICES.txt`.
