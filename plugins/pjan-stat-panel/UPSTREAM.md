# Upstream: Grafana core stat

This plugin is a port of Grafana's core **stat** panel (`stat`) from [grafana/grafana](https://github.com/grafana/grafana)
at tag **`v13.2.3`** (commit `6193dc0`, "Release: 13.2.3"), with the `BigValue` components of `@grafana/ui` at the same
tag. With nothing configured it is meant to look and behave like the core panel: same options, defaults, presets,
migrations, rendering (layouts, font sizes, colour modes, sparkline, percent change) and interaction (data links, the
links menu, native tooltips). `tests/parity.spec.ts` checks the rendering pixel by pixel against the core panel (see
"Tests"). The plan is `plans/atlas-stat-panel.md` in pjan/atlas.

- Grafana core code (`public/app/...`) is AGPL-3.0, Copyright Grafana Labs, so this plugin is AGPL-3.0 (`LICENSE`).
  Grafana's `NOTICE.md` (v13.2.3) is kept as `NOTICE.md`.
- Code copied from Grafana's npm packages (`packages/grafana-ui`, `packages/grafana-data`) is Apache-2.0, Copyright
  Grafana Labs. Its license text is in `LICENSE_APACHE2` (copied from `packages/grafana-ui/LICENSE_APACHE2` at the same
  tag).
- `dist/` ships `LICENSE`, `LICENSE_APACHE2`, `NOTICE.md`, this file, and `THIRD_PARTY_NOTICES.txt` (generated at build
  time: name, version, licence and licence text of every npm package bundled into the chunks; see "Plugin build
  configuration").
- **Source offer (AGPL-3.0 section 13):** `src/plugin.json` (`info.links`, "Source code") and `src/README.md` point at
  `https://github.com/pjan/grafana-plugins`, the public repository each release is built from.

Every copied file starts with a one-line header:
`// Copied from grafana/grafana v13.2.3: <upstream path>. <license>. Changes: <...>.`
Plugin-authored replacements for package entry points start with `// Plugin stand-in for ...` instead.

## Layout

Copied files mirror their upstream path under `src/`:

- `public/app/<path>` is copied to `src/<path>` (for example `public/app/plugins/panel/stat/StatPanel.tsx` becomes
  `src/plugins/panel/stat/StatPanel.tsx`).
- `packages/grafana-<pkg>/src/<path>` is copied to `src/packages/grafana-<pkg>/src/<path>` (for example
  `packages/grafana-ui/src/components/BigValue/BigValueLayout.tsx` becomes
  `src/packages/grafana-ui/src/components/BigValue/BigValueLayout.tsx`).
- `src/packages/grafana-data/internal.ts` stands in for `@grafana/data/internal`, which a plugin cannot use at runtime
  (see below).
- `src/pjan/` is plugin-authored code (not from grafana/grafana): the panel-change handler (with `fieldConfigRefresh.ts`), Color mode Custom (`styling/`), and the plugin's own tests.
  It gets the scaffold's normal lint rules (see "Plugin build configuration").
- `src/module.ts` is the plugin entry: it initialises `@grafana/i18n` for this plugin and re-exports `plugin` from
  `src/plugins/panel/stat/module.tsx`.
- `src/img/icn-singlestat-panel.svg` is core's `public/app/plugins/panel/stat/img/icn-singlestat-panel.svg` (the panel
  logo).

Non-relative imports such as `packages/grafana-data/internal` resolve from `src/` (scaffold `baseUrl`/`paths` in
`.config/tsconfig.json`, `resolve.modules` in webpack, `modulePaths` in Jest).

## What runs where

Unlike the state timeline, the core stat panel is thin: `StatPanel` computes the display values and hands each one to
`BigValue`, which lays out and colours the tile (HTML with inline styles) and draws the sparkline through
`@grafana/ui`'s `Sparkline` (a uPlot canvas).

- **Copied (this plugin's code runs):** the panel (`module.tsx`, `StatPanel.tsx`, `common.ts`, `StatMigrations.ts`,
  `panelcfg.gen.ts`, `presets.ts`, part of `suggestions.ts`) and the tile renderer (`BigValue.tsx`,
  `BigValueLayout.tsx`, `PercentChange.tsx`, `BigValueTypes.ts`). The copied `StatPanel` renders the copied `BigValue`,
  so later additions hook into code the parity suite has verified.
- **Public imports (Grafana's own copy runs):** `Sparkline`, `VizRepeater`, `DataLinksContextMenu` (and the
  `DataLinksContextMenuApi` type), `FormattedValueDisplay`, `calculateFontSize` (and its shared `measureText` cache),
  `getTextColorForAlphaBackground`, `clearButtonStyles`, `Icon`, `useTheme2`, `commonOptionsBuilder`,
  `sharedSingleStatMigrationHandler` and `sharedSingleStatPanelChangedHandler` from `@grafana/ui`;
  `getFieldDisplayValues`, `getDisplayValueAlignmentFactors` and the rest of the field display from `@grafana/data`.
  All are exported by the 13.2.3 packages' public entry points (checked in `dist/types/index.d.ts`).

## Import rewrites (mechanical, applied to every copied file)

| Upstream import                                              | Plugin import                                                | Why                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'app/<path>'`                                               | `'<path>'`                                                   | Same file, resolved from `src/`.                                                                                                                                                                                              |
| `'@grafana/data/internal'`                                   | `'packages/grafana-data/internal'`                           | `/internal` is not shared with plugins at runtime.                                                                                                                                                                            |
| Relative imports of `@grafana/ui` files that aren't copied   | `'@grafana/ui'` (the same names from the public entry point) | In the copied `BigValue` family: `clearButtonStyles`, `FormattedValueDisplay`, `getTextColorForAlphaBackground`, `calculateFontSize`, `Sparkline`, `Icon`, `Themeable2`. Same implementations, Grafana's own copy at runtime. |
| Relative imports of `@grafana/data` files that aren't copied | `'@grafana/data'`                                            | In the partial copy of `fieldOverrides.ts`: `NullValueMode`, `FieldType`, `DataFrame`, `NumericRange`.                                                                                                                        |

Two non-mechanical import changes, both in `src/plugins/panel/stat/StatPanel.tsx`:

- `BigValue` is imported from the copied `packages/grafana-ui/src/components/BigValue/BigValue` instead of
  `@grafana/ui`, so the panel renders the copied tile renderer (marked `pjan-stat-panel:`, and listed under "Changes
  beyond import rewrites").
- `DataLinksContextMenuApi` (a type) is imported from the public `@grafana/ui` entry point instead of
  `@grafana/ui/internal` (both export the same type).

**Enums:** the panel passes `@grafana/schema`'s `BigValueColorMode`, `BigValueGraphMode`, `BigValueJustifyMode` and
`BigValueTextMode` to `BigValue`, whose props use the enums declared in the copied `BigValueTypes.ts`, as upstream does
with `@grafana/ui`'s. TypeScript accepts this without changes (enums with the same name and members are compatible), so
`BigValueTypes.ts` keeps its own enums. Unlike State timeline plus, no const enum had to be declared as constants.

## Stand-ins for internal entry points

`src/packages/grafana-data/internal.ts` (`@grafana/data/internal`): re-exports `findNumericFieldMinMax` from
`src/packages/grafana-data/src/field/fieldOverrides.ts`, a partial copy (Apache-2.0) of
`packages/grafana-data/src/field/fieldOverrides.ts` with only that function. `StatPanel` uses it for the automatic
min/max of numeric fields (recomputed on each data update, because field overrides are skipped while streaming).

There are no stand-ins for core app modules at runtime. The tests use one partial copy of a core module (see "Tests").

## Changes beyond import rewrites

| File                                                             | Change                                                                                                                                                                                                                                                                                                                                                                                                                                          | Reason                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugins/panel/stat/module.tsx`                                  | `.setSuggestionsSupplier(statSuggestionsSupplier)` and its import left off.                                                                                                                                                                                                                                                                                                                                                                     | Deliberate, see "Pruned and left off".                                                                                                                                                                                                               |
| `plugins/panel/stat/module.tsx`                                  | `.setPanelChangeHandler(panelChangedHandler)` from `src/pjan/panelChangedHandler.ts` instead of `statPanelChangedHandler`; its import replaces `statPanelChangedHandler`'s (plugin-only, marked `pjan-stat-panel:` in the code).                                                                                                                                                                                                                | Switching a core `stat` panel to this plugin in the panel editor keeps every option and the colour mode. Any other previous panel type goes to core's `statPanelChangedHandler` unchanged (`StatMigrations.ts` itself is unmodified). Details below. |
| `plugins/panel/stat/StatPanel.tsx`                               | `BigValue` from the copied `packages/grafana-ui/src/components/BigValue/BigValue` instead of `@grafana/ui` (marked `pjan-stat-panel:`).                                                                                                                                                                                                                                                                                                         | The panel renders the copied tile renderer, so later additions hook into code the parity suite has verified.                                                                                                                                         |
| `plugins/panel/stat/StatPanel.tsx`                               | Takes `onFieldConfigChange` from its props and calls `useApplyFieldConfigChangedInPlace(fieldConfig, onFieldConfigChange)` from `src/pjan/fieldConfigRefresh.ts` (plugin-only, marked).                                                                                                                                                                                                                                                         | After the panel-change handler restored a colour in place, the panel applies its field config again; see "Panel type switch". Does nothing otherwise.                                                                                                |
| `plugins/panel/stat/module.tsx`                                  | Color mode gets a fifth choice, Custom (`getCustomColorModeOption()`); `.addCustomEditor(backgroundColorOption())` and `textColorOption()` chained after Color mode, and the four sparkline options (`sparklineColorOption()` …) after Graph mode, one marked line each, so core's builder calls are unchanged; `useFieldConfig({ useCustomConfig: addStylingFieldConfig })` instead of `useFieldConfig()`; their import (plugin-only, marked). | Color mode Custom, see "Plugin addition: Color mode Custom". With every core mode the new options are hidden and nothing is drawn differently.                                                                                                       |
| `plugins/panel/stat/StatPanel.tsx`                               | Takes `transparent` from its props (also in `renderComponent`'s dependencies) and passes `pjanStyling={getStatTileStyling(theme, value, options.styling, transparent)}` to `BigValue` with Color mode Custom, `undefined` otherwise; its imports (plugin-only, marked).                                                                                                                                                                         | Color mode Custom: the tile's colours.                                                                                                                                                                                                               |
| `packages/grafana-ui/src/components/BigValue/BigValueTypes.ts`   | An optional `pjanStyling` prop (marked).                                                                                                                                                                                                                                                                                                                                                                                                        | Color mode Custom.                                                                                                                                                                                                                                   |
| `packages/grafana-ui/src/components/BigValue/BigValueLayout.tsx` | With `props.pjanStyling` (only set with Custom): the name's colour in `getTitleStyles`, the value's in `getValueStyles`, the tile's background in `getPanelStyles`, percent change's colour on a background in `getPercentChangeStyles` (after its font size is final), and the sparkline's colours and line width in `renderChart` (core's `lineWidth: 1` became a variable); its import (marked).                                             | Color mode Custom. Each element's colour is computed at the font size and weight the layout computed for it.                                                                                                                                         |
| `plugins/panel/stat/suggestions.ts`                              | Partial copy: `MAX_STAT_PREVIEW_SERIES` and `STAT_CARD_OPTIONS` only.                                                                                                                                                                                                                                                                                                                                                                           | `presets.ts` uses them for the preset cards. The suggestions supplier (and its `app/features/panel/suggestions/utils` import, `defaultNumericVizOptions`) is left off.                                                                               |

Nothing else in the copied files differs from upstream: `BigValue.tsx`, `PercentChange.tsx`, `common.ts`,
`StatMigrations.ts`, `panelcfg.gen.ts` and `presets.ts` are upstream's apart from the import lines listed above.

### Panel type switch (`src/pjan/panelChangedHandler.ts`)

In Grafana 13.2.3 (scenes 8.13.5), picking a visualization in the panel editor runs `PanelOptionsPane.onChangePanel`:
it clears `fieldConfig.defaults.custom` and the custom override rules (Stat has neither), then calls
`VizPanel.changePluginType`. That loads the plugin through `_pluginLoaded` with `getPanelOptionsWithDefaults(...,
isAfterPluginChange: true)`, whose `adaptFieldColorMode` resets any colour mode that is neither by value nor Fixed
(classic palette, classic palette by series name, shades) to `thresholds`, because Stat's colour setting has
`preferThresholdsMode`. The result becomes the VizPanel's field config. Then `changePluginType` calls
`onPanelTypeChanged(panel, prevPluginId, prevOptions, prevFieldConfig)` with that field config object as
`panel.fieldConfig`, and applies only the returned options.

For `prevPluginId === 'stat'` the handler returns a copy of `prevOptions` and restores `prevFieldConfig.defaults.color`
on `panel.fieldConfig` in place, or removes the colour when the core panel had none (`adaptFieldColorMode` writes
`thresholds` there too; without a colour Grafana's default applies, and core never saved one). That object is the
VizPanel's own field config, so the restore takes effect. This relies on scenes passing that object by reference: if a
future Grafana passes a copy, the options still carry over and the colour mode is adapted as for any panel type
switch. Every other previous panel type (Angular singlestat, gauge, time series, …) goes to core's
`statPanelChangedHandler`, which keeps only `reduceOptions` and `orientation` (and migrates Angular singlestat).

**When the plugin's module is already loaded** (another Stat plus panel was drawn in the session), `VizPanel._loadPlugin`
loads it synchronously, inside the click on the visualization card. React then renders the panel before
`changePluginType` reaches the handler, `VizPanel.applyFieldConfig` applies the adapted `thresholds` colour, and it
caches the result for as long as the data object stays the same (`_prevData === rawData`). The returned options only
re-render with that cache, so the saved JSON would have the restored colour while the panel drew threshold colours
until the next query. No public API lets the handler clear that cache (it receives a plain object, not the
VizPanel). The panel can: `PanelProps.onFieldConfigChange` (public) is `VizPanel.onFieldConfigChange`, which clears it
and applies the field config again. So the handler marks the field config it changed (`src/pjan/fieldConfigRefresh.ts`,
a `WeakSet`), and the copied `StatPanel` calls `onFieldConfigChange` with that same field config once, after its next
render. The content is unchanged, so the saved JSON is the same. When the module isn't loaded yet, the handler runs
before the first render, and that extra call only applies the same field config again.

Verified in Grafana 13.2.3 by `tests/savedJson.spec.ts`: a core Stat panel with every option away from its default, a
unit, decimals and an override, with the classic palette or with no colour, switched to Stat plus in the editor, with the
plugin's module loaded or not (four tests), saves the same options and field config, and draws the same tiles (the
same inline style declarations and text, so the classic palette's colours). Without the restore, the removal, or the
re-application, the matching tests fail.

**Renaming `type` from `stat` to `pjan-stat-panel` in the dashboard JSON stays the lossless conversion** (and the only
one for library panels and provisioned dashboards). Only this direction is supported (pjan, 2026-10-03): switching a
Stat plus panel back to core Stat is not designed for or tested.

## Plugin addition: Color mode Custom

Opt-in (with every core Color mode nothing changes, and a panel that doesn't pick Custom saves nothing new; user
documentation in `src/README.md`). Design agreed by pjan on 2026-10-02 (`plans/atlas-stat-panel.md`, "Styling
addition"), after the spike `spike/stat-styling`. Code in `src/pjan/styling/`, with the colour helpers shared with
State timeline plus in the workspace package `@pjan/grafana-styling` (`packages/grafana-styling/`, Apache-2.0, bundled
from source; `THIRD_PARTY_NOTICES.txt` lists it).

- **Options** (`options.ts`): Color mode's fifth choice, `colorMode: "custom"`. Only with it do these show (`showIf`),
  in "Stat styles", right under the option they refine: Background color and Text color after Color mode; Sparkline
  color, Sparkline line opacity, Sparkline fill opacity and Sparkline line width after Graph mode, and only with Graph
  mode Area. Panel options under one object, `styling.{backgroundColor, textColor, sparklineColor,
sparklineLineOpacity, sparklineFillOpacity, sparklineLineWidth}`.
  - None has a default value: the colours use the shared `StylingColorEditor` (a clearable `Combobox`, with Grafana's
    `ColorPicker` for a fixed colour) and the numbers the shared `ClearableSliderEditor` (its `unsetValue` shows where
    the panel draws an unset option: 100, 20, 1). A cleared option loses its key.
  - Each is also a field option with the same key under `custom.styling` (`custom.styling.<key>`, override ids the
    same: the field options mirror the panel options, pjan's standard for every plus plugin, 2026-10-03; until then
    they were flat `custom.<key>`, never released), `hideFromDefaults` (only in the overrides menu), with `override`,
    `process` and a `shouldApply` that skips time fields. Only `styling` of core's `custom` namespace is the plugin's.
    A new panel saves no `custom` (no defaults). Nested custom paths in Grafana 13.2.3 (no core panel uses them) are
    described in State timeline plus's `UPSTREAM.md` ("Field-option storage"); here they are override-only, covered by
    `options.test.ts` (Grafana's load and override code) and `tests/stylingEditor.spec.ts` (an override property set
    and cleared in the editor).
- **Per tile** (`tileStyling.ts`, `getStatTileStyling`): the settings are the series' override (`tile.field.custom.styling`)
  over the panel option; an incomplete or out-of-range value counts as unset. The colour name behind the tile's colour
  comes from `getColorNameLookup` on the tile's field (`view.dataFrame.fields[colIndex]`), as the spike showed:
  thresholds (absolute and percentage), value mappings, the fixed colour, classic palette slots (by the series index
  `applyFieldOverrides` set), All values and no value.
- **What Custom draws** (`getTileStyling`):
  - **Unset parts follow core's Value mode without a background, core's Background Solid with one** (pjan, 2026-10-02,
    option A; each unset part on its own). Without a Background color (or with None): text and sparkline line in the
    value colour, the name in the panel's text colour, the fill at 20 % of the line colour; nothing set at all is core's
    Value mode, exactly. With a Background color (Value, a shade, Fixed): unset Text is Automatic on the drawn background
    (below; pjan, 2026-10-03), an unset Sparkline color the drawn background brightened by 40
    (`tinycolor(...).brighten(40)`, the formula core's `renderChart` applies to the tile colour), and an unset Sparkline
    fill opacity core's `rgba(255,255,255,0.4)`, even with a Sparkline color set. In both cases an unset line opacity
    is opaque and an unset line width 1.
  - Background: None (no fill, as not set), Value (solid), a relative shade of the value colour, or a fixed colour.
    No gradient (core's Background Gradient covers it).
  - Text, for the value and the name: Automatic, Value, a shade, or a fixed colour (pjan, 2026-10-03). Value, a shade
    and a fixed colour are drawn as chosen, whatever their contrast. Automatic is the shared `getAutomaticText`: from
    the background's colour (without a background, the value's own colour, pjan 2026-10-03), measured against what the
    text is drawn on (the background, or what is behind the panel without one), 1 % steps towards the theme's
    page colour (`colors.background.canvas`) and `colors.text.maxContrast`, the first colour that reaches
    `getMinTextContrast(fontSize, fontWeight)` (WCAG 2 AA: 3:1 from 24 px, or 18.66 px at weight 700; 4.5:1 otherwise,
    falling back to 4.2:1) at the size the layout computed for the element (value weight 500, name 400, percent change
    500), on whichever side gets there first.
    - The value is measured at the smallest size it is drawn at: `FormattedValueDisplay` (@grafana/ui 13.2.3) draws a
      non-empty unit suffix at 0.9× below 20 px, 0.8× from 20 px and 0.6× from 26 px (`getSmallestValueFontSize`,
      re-implemented from that behaviour). The prefix is drawn at the full size.
    - Behind the panel: the panel background, or for a transparent panel (`PanelProps.transparent`, a marked change in
      `StatPanel.tsx`) the dashboard's canvas (`theme.colors.background.canvas`), which is what Grafana 13.2.3 shows
      there (`tests/styling.spec.ts` checks the pixel). A translucent background is composited over it.
    - A value without a colour is drawn in CSS gray, as core does; as `#808080`, which draws the same and which the
      contrast helpers can read.
  - Percent change: with a background, the resolved text colour at its own size (as core does on coloured backgrounds);
    without one, its own color mode (Same as value follows the value's colour as drawn).
  - Sparkline: Value, a shade, Same as text (the value's colour as drawn), or a fixed
    colour; line opacity, fill opacity (set: the line's colour at that alpha) and line width; unset as above. Grafana's public
    `Sparkline` draws exactly the `lineColor`, `fillColor` and `lineWidth` it is given (spike, and `tests/styling.spec.ts`).
  - Colours without a name (hex colours, continuous schemes, a palette of hex colours such as Atlas's, CSS names) take the shades
    of their nearest theme hue (`getShadeColor`; the rule is in `packages/grafana-styling/README.md`), the value drawn
    gray without a colour included. Without one (or for `text` and `transparent`), a Background or Sparkline shade
    falls back to the value colour, a Text shade to Automatic.
- **Override-only field options** say "(Color mode Custom only)" at the end of their description: the overrides menu
  doesn't show the panel's Color mode.
- **Shared package changes** (same commit series): `getMinTextContrast`, `getTextContrast` compositing a translucent
  text colour (later: `getAutomaticText`, replacing best contrast and the contrast guard, 2026-10-03),
  the `value`, `text` and `none` colour modes, and the slider's `unsetValue`. The slider ignores its unset value while
  the option is unset: Grafana's `Slider` reports its value again when its text input loses focus, so tabbing through
  an unset slider would otherwise save it (100, 20, 1; State timeline plus's Corner radius saved 0 that way). State timeline
  plus takes its 4.5:1 from `getMinTextContrast` (its text is 12 px: no change).

## `pluginVersion` and the single-stat migration

The plugin is versioned `1.0.0` (pjan's decision, 2026-10-01). Panels it saves carry `"pluginVersion": "1.0.0"`.

- `@grafana/scenes` 8.13.5 (`VizPanel._pluginLoaded`) runs a plugin's migration handler whenever the saved
  `pluginVersion` differs from the plugin's version. The migration handler is Grafana's
  `sharedSingleStatMigrationHandler`, unchanged (core's, for parity: panels saved without `pluginVersion`, as Git Sync
  stores them, run the legacy migrations on every load in core too).
- That handler reads the saved version as a Grafana version (`parseFloat(panel.pluginVersion || '6.1')`) and applies
  every legacy migration below it. For a current panel only the `< 8.0` step changes anything: `percent` and
  `percentunit` fields without `min`/`max` get `min: 0` and `max: 100` (or 1) written in, which changes the sparkline's
  y range and percentage thresholds.
- **Effect:** a panel saved by this plugin (`1.0.0`) gets that step on every plugin upgrade (`1.0.0` → `1.0.1`, …).
  Panels that set `min`/`max`, or don't use `percent`/`percentunit`, are not affected. (Switching back to core Stat,
  where core would read `1.0.0` the same way, is not supported: pjan, 2026-10-03.)
- The plan is for the version to track Grafana's later (numbered after the upstream tag it is synced to, never above
  that tag's minor), once more panels are ported; that removes the effect.

## Pruned and left off

| Feature           | Upstream code                                                                       | Status and reason                                                                                                                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel suggestions | `suggestions.ts` (`statSuggestionsSupplier`), `features/panel/suggestions/utils.ts` | Left off deliberately, as in State timeline plus. A plugin could offer them (`"suggestions": true` in `plugin.json` plus a supplier), but this panel would then add a second set of Stat suggestion cards next to core's. `suggestions.test.ts` is not ported. |

Everything else is kept: the options (names, paths, categories, order, defaults, `showIf`, i18n keys and defaults),
the presets in "Panel styles" (core's, unchanged), the load migration, the panel-change migrations from other panels,
the field options (Grafana's standard options; Stat has no custom field config), `setNoPadding()`, the value
calculation (Calculate and All values, limit, fields, automatic min/max, `noValue`, strings, mappings, thresholds,
units, decimals, display names), the four layouts, text modes, wide layout, alignment, text sizes, the four colour
modes, the sparkline, percent change and its colour modes, data links (one link: a link around the tile; several: the
links menu), keyboard focus, and the native `title` tooltips.

## Known upstream behaviour kept as is

- **Graph mode Line:** `BigValueGraphMode.Line` exists in the enum but isn't offered in the editor; a saved
  `graphMode: "line"` draws the same as Area.
- **Tooltips with links:** core passes no `hasLinks` to `BigValue`, so the native `title` tooltip shows on tiles with
  data links too.
- **Percent change with several links:** a tile with two or more data links is a button (the menu), and that branch
  of `BigValue` renders no percent change.
- **Live theme switch:** the tile colours that come from the field display (value colours from thresholds, mappings,
  palettes) are computed when Grafana applies the field config (`VizPanel.applyFieldConfig`), which is cached until
  the data changes. After a live theme switch (Grafana's `c t` / `c r` shortcuts, or changing the theme preference),
  a panel already drawn keeps those colours from the previous theme until its next data update, while the theme's own
  colours (text, panel background) change at once. Core does the same; the parity suite checks both agree after a live
  switch.

## Plugin build configuration

- `tsconfig.json`: `"jsx": "react-jsx"` (upstream code uses the automatic JSX runtime) and `typeRoots` that include the
  workspace root `node_modules/@types` (npm workspaces hoist `@types/*`).
- `webpack.config.ts` extends `.config/webpack/webpack.config.ts` (never edited; `create-plugin update` owns it): the
  automatic JSX runtime on the scaffold's swc-loader rule (`src/pjan/buildConfig.test.ts` fails if the `build`/`dev`
  scripts stop using this file), `LICENSE_APACHE2`, `UPSTREAM.md` and `NOTICE.md` copied into `dist/`,
  `dist/THIRD_PARTY_NOTICES.txt` written by `ThirdPartyNoticesPlugin`, Terser with an explicit licence-comment
  condition, and webpack's size warnings at 150 KiB (module.js is about 71 KiB). Same setup as State timeline plus (see
  its `UPSTREAM.md` for the reasons), including its `ThirdPartyNoticesPlugin` checks: the build fails when a bundled
  file belongs to no package (neither the plugin's own, under `node_modules`, nor a workspace package under
  `packages/`), when a workspace package has no licence, and when one package is bundled from two directories. Stat plus
  bundles the workspace package `@pjan/grafana-styling` (Color mode Custom), which the notices list.
- `jest.config.js`: the scaffold's swc transform with the automatic JSX runtime; `TZ = 'Pacific/Easter'` as in
  grafana/grafana's `jest.config.js`.
- `jest-setup.js`: `jest-canvas-mock` (core's `setupFiles`; the copied `StatPanel.test.tsx` draws a sparkline), and
  core's `MessageChannel` and `ResizeObserver` polyfills from `public/test/jest-setup.ts`; a `URL.canParse` polyfill
  (jsdom 20 lacks it).
- `eslint.config.mjs`: `react/react-in-jsx-scope` off for `src/` (automatic runtime). For the mirrored tree only
  (`src/{core,features,packages,plugins}/**`): `react-hooks/refs`, `react-hooks/set-state-in-effect`,
  `@typescript-eslint/array-type`, `no-redeclare` off and unused disable directives not reported. `src/pjan/**` keeps
  the scaffold's rules. Plugin code imports `@pjan/grafana-styling` through its entry point only (its `src/testdata/`
  is for tests), as in State timeline plus. Two `@typescript-eslint/no-deprecated` warnings remain in the test-only copies
  `NumberInput.tsx` (`onKeyPress`) and `select.tsx` (`Select`), as upstream.
- i18n: `t()` comes from the bundled `@grafana/i18n` (scaffold default). `src/module.ts` calls
  `await initPluginTranslations(pluginJson.id)`. The plugin ships no translations, so every string renders its
  in-source English default; keys and defaults are unchanged from core. Core shows these labels translated in
  non-English UI languages; the plugin does not, except the Text size labels, which come from Grafana's
  `commonOptionsBuilder`.
- Runtime dependencies bundled (not shared by Grafana), pinned to the versions in grafana/grafana v13.2.3's
  `yarn.lock`: `tinycolor2` 1.6.0 (`BigValueLayout`'s gradient and sparkline colours), plus `@grafana/schema` and
  `@grafana/i18n` 13.2.3, and the workspace package `@pjan/grafana-styling` (from source). `lodash` 4.18.1 is a dependency for the types and a shared external at runtime (Grafana's
  copy). Dev dependencies: `@types/lodash` 4.17.20 and `@types/tinycolor2` 1.4.6 (as in grafana/grafana), and `pngjs`
  7.0.0 (in grafana/grafana's `yarn.lock`) with `@types/pngjs` 6.0.5 for the end-to-end pixel comparisons.

## plugin.json

The scaffold's id `pjan-stat-panel`; the name is "Stat plus". From core's `plugin.json`: the `img/icn-singlestat-panel.svg`
logo (the two cards in the visualization picker differ only by name) and the documentation link. Added a "Source code"
link (AGPL source offer, the public repository). Not applicable to an external panel: `"suggestions": true` (left off),
the "Raise issue" link (Grafana's tracker).

`grafanaDependency` is `^13.2.0`, as for State timeline plus: Grafana installs and loads the plugin on any 13.x from
13.2.0, so the range does not stop it from running on a newer minor. The copied code, and the public `@grafana/*` APIs
it relies on, are those of Grafana 13.2.3. **Before the plugin is used on a newer Grafana minor** (13.3, 13.4, …), run
the parity tests against that version (`npm run e2e`, `grafana_version` in `docker-compose.yaml`) and the re-sync check
against the new tag (steps below). That is a manual step: nothing enforces it.

## Tests

Ported (only imports changed unless noted): `stat/{StatPanel,StatMigrations,common,presets}.test`,
`BigValue/{BigValue,BigValueLayout}.test.tsx`, and the helper `plugins/panel/test-utils.ts` (`getPanelProps`, used by
`StatPanel.test.tsx`).

Test adaptations:

- `stat/common.test.ts` initialises the option-editor registry with core's `getAllOptionEditors`
  (`app/core/components/OptionsUI/registry`). The plugin has a **partial copy** of `registry.tsx` with the four editors
  the stat options use (`number`, `radio`, `select`, `stats-picker`, upstream's definitions and order), and copies of
  the editors they need (`OptionsUI/{number,NumberInput,select,stats}.tsx`, imports only). These are test-only: nothing
  in the plugin imports them at runtime (Grafana's own registry builds the editor), so they are not in the bundle.

Not ported: `stat/suggestions.test.ts` (suggestions are left off), the `BigValue` story and docs
(`BigValue.story.tsx`, `BigValue.mdx`), and two files that aren't code: `stat/panelcfg.cue` (the schema
`panelcfg.gen.ts` is generated from; the generated file is copied) and `stat/README.md` (the panel's short
description in grafana/grafana; `src/README.md` replaces it).

Plugin-authored tests (`src/pjan/`): `panelChangedHandler.test.ts` (options from core Stat kept and copied; the colour
mode restored for the classic palette, by name, shades, Fixed and a continuous scheme; the adapted colour removed when
core had none; nothing changed without a previous field config; the panel applying its field config again after a
restore; every other panel type through core's handler, singlestat and gauge), `fieldConfigRefresh.test.ts` (a field
config changed in place is applied again once, others never), `module.test.ts` (the wiring of
the copied `module.tsx`: core's migration handler, the plugin's panel-change handler, no padding, core's presets, no
suggestions) and `buildConfig.test.ts` (JSX runtime regression guard).

Color mode Custom (`src/pjan/styling/`): `options.test.ts` (the fifth choice; the "Stat styles" list in the plan's
order; `showIf` with Custom, and Graph mode Area for the sparkline options; no defaults; the editors and their
settings; the field options hidden from the defaults, with override, process and `shouldApply`; the field options
mirror the panel options under `custom.styling`; no `custom` defaults; Grafana's load and override code on the nested
ids: an override kept on load, the old flat ids dropped, an override on one series, a cleared override property), `tileStyling.test.ts` (resolution order, each mode and its fallbacks,
chosen colours drawn as chosen at every size, Automatic per element size and weight, pjan's black-tile example,
sparkline colours, opacities and width, colour names behind tiles: thresholds, overrides, classic palette slots in
Grafana's and the Atlas theme; shades of colours without a name from their nearest hue), `bigValueLayout.test.tsx` (the copied layout's hooks: nothing set equals Value mode,
each element at its own size, percent change on and off a background, the sparkline config), `statPanel.test.tsx`
(with every core mode, styling options and overrides change nothing; with Custom, panel option and override). The
shared package has its own tests for `getMinTextContrast`, the new modes and the slider's `unsetValue`.

End-to-end (`npm run e2e`, Grafana 13.2.3 OSS dev server from `docker-compose.yaml`):

- `tests/panel.spec.ts` with `provisioning/dashboards/dashboard.json`: one core/plugin pair (two series, defaults);
  values and sparklines, inline styles and text, sparkline pixels, and the panel content's pixels.
- `tests/parity.spec.ts` with `provisioning/dashboards/parity.json` and `parity-swapped.json` (both generated by
  `scripts/generate-parity-dashboard.mjs`): 66 cases, each a core panel and a plugin panel with the same TestData CSV
  query, options and field config, one above the other in the same column with the same width. The cases: defaults;
  each colour mode × graph mode None and Area; each text mode; wide layout off; text alignment centre; 4 and 12 series
  in each orientation; All values with a limit; percent change rising and falling in each colour mode, inverted, same
  as value, and with text mode None; explicit text sizes; thresholds with mappings to words (a status tile, gradient
  background); percentage thresholds; `noValue`; a string value; `unit: percent` without min and max saved without
  `pluginVersion`, with `13.2.3`, and with each panel's own version; one data link, two (the menu), percent change with
  links; text mode Auto with a display name, and on a panel without a title (cases are keyed by panel id); field min
  and max set; a saved `graphMode: "line"`; both sides of the 2.5 width/height ratio; tiles about 26, 40, 80 and 140 px
  tall, wide (12 columns) and narrow (4); a continuous colour scheme; the classic palette; an override on one series;
  percent change on a tile with two links (the button branch, which draws none); a display name template with labels
  (`${__field.labels.host}: ${__field.name}`, on a TestData raw frame with labels); nulls in the sparkline data;
  Grafana's default "No data" (no `noValue`). A separate test checks in the DOM that the two width/height cases use
  the wide (row) and the stacked (column) layout in both panels.
  Every case runs in the light theme, the dark theme, dark after a live switch from light and light after a live
  switch from dark (Grafana's `c r` shortcut: `toggleTheme(true)`, no reload, preference not saved; every panel has
  been drawn before the switch), each at pixel ratio 1 and 2 (`deviceScaleFactor`, its own browser context): 8 tests of
  66 steps, 1,056 core/plugin comparisons. Each compares:
  - an element screenshot of the panel content, decoded (`pngjs`) and compared byte by byte (RGBA, exact);
  - every element of the panel content with all its attributes (sorted `name=value`: `style`, `class`, `role`,
    `aria-*`, `tabindex`, `href`, `title`, the SVG icons' `viewBox`/`width`/`height`, the panel content's `id`, …).
    Nothing is excluded: the emotion class names are the same (the same styles give the same class), and so are the
    React ids, because the two dashboards render in the same order;
  - each sparkline canvas: size and an FNV hash of its RGBA bytes;
  - the native tooltips (`title` attributes).
    Each screenshot must be at least 5 % painted (pixels that differ from the panel background) and each canvas at least
    5 % non-transparent, so empty renders can't pass. Captures wait for `document.fonts.ready` and for every icon (the
    percent change arrow loads asynchronously) and repeat until two in a row are the same, within 60 s per case (each
    capture is four screenshots on two pages; on a busy machine 20 s ran out with nothing different, see the
    Playwright timeouts in `playwright.config.ts`).
  - **Compared at the same place on the page.** Chrome's rasterisation of the same CSS depends on where it is drawn: the
    Background Gradient (`linear-gradient`) is dithered differently at different page positions (two core panels with
    the same configuration in different places differed in about 7,000 of 43,350 pixels, each by one level). So
    `parity-swapped.json` is `parity.json` with core and plugin swapped, and each panel is compared with the panel at
    its position in the other dashboard: core with plugin, twice per case.
  - **Grafana's panel frame is squared off for the screenshots.** The panel frame (`PanelChrome`, `border-radius`
    10 px, `overflow: hidden`; Grafana's chrome, not drawn by the panel) clips the tiles at its rounded bottom corners.
    The anti-aliasing of those corner pixels differed between two loads of the same core panel at the same position: 3
    or 4 pixels at the bottom-left corner (for example `(0,97)`–`(1,99)` of a 425 × 102 panel content, dark theme,
    gradient background), alternating between two states. The test adds
    `[data-viz-panel-key] > div > section { border-radius: 0 }` to both dashboards (and checks it applied); the panel
    content itself is not changed.
  - Negative controls: a one-attribute change in the copied `PercentChange.tsx` (the arrow's `viewBox`) fails every
    percent change case on pixels; an extra attribute on `BigValue`'s tile (`role`, no visible change) fails every
    case on the attribute comparison; without the colour restore, the removal of an adapted colour, or the
    re-application after a restore, the matching editor switch tests fail.
- `tests/styling.spec.ts` with `provisioning/dashboards/styling.json` (generated by
  `scripts/generate-styling-dashboard.mjs`): Color mode Custom, in the light and the dark theme at pixel ratio 1 and 2.
  Four series mapped to words in green, yellow, red and dark blue. Per case and tile: the background (inline style
  and a pixel of the tile's padding in the screenshot), the value's, the name's and percent change's colours at the
  font sizes the layout computed, and the sparkline's stroke, fill and line width as set on its canvas (recorded), all
  against the rules computed in the test with the shared package's contrast and shade helpers. Cases: each
  Background color mode, each Text color mode, each Sparkline color mode with opacities and widths, the Atlas look
  (soft, Automatic, sparkline as text 45/18), pjan's example (black tiles, text in the state colour, dark blue too),
  Automatic per element on white (3:1 for the large value, 4.5:1 for percent change and the name), at a unit's size,
  and against the canvas of a transparent panel, an override on one series, percent change on and off a background, hex
  colours (two take the shades of Grafana's green and red, the third, CSS teal, falls back to the value colour and
  Automatic). Automatic is checked against values worked out by hand (Grafana's luminance
  rounded to 3 digits, 1 % steps between the stock theme's page colour and `maxContrast`) as well as against the
  shared helper. "Nothing set" is compared with core's Value mode pixel by pixel. Negative control: without percent
  change following the text, the matching cases fail.
- `tests/stylingEditor.spec.ts`: the "Stat styles" list in the editor and its `showIf`; selecting Custom saves only
  `colorMode`; a value set is saved and a cleared one loses its key (colour, shade, slider); an override property set in
  the editor is saved as `custom.styling.backgroundColor`, and cleared keeps no value; opening the editor of a Custom
  panel writes nothing (3 seconds).
- `tests/interaction.spec.ts` (on the parity dashboard, core and plugin alike): one data link renders the tile as a
  link to it; two open the links menu on click and close it with Escape; Tab reaches the link and the menu button
  (`:focus-visible`), Enter opens the menu; the plugin's focused tiles have core's outline and box shadow.
- `tests/savedJson.spec.ts` (from the dashboard's save model): a new Stat plus panel saves the same options and field
  config as a new core Stat panel (keys and values, apart from `type`/`pluginVersion`); opening the editor writes
  nothing (checked for 3 seconds); converting by `type` to the plugin keeps options and field config; switching a core Stat
  panel to Stat plus in the panel editor keeps options and colour, and draws the same tiles, with the classic palette or
  no colour, with the plugin's module loaded or not (see "Panel type switch"). It creates its
  dashboards through the HTTP API and deletes them afterwards.

The TestData CSV scenario has no relative time: all timestamps and the dashboard time ranges are fixed UTC values,
written as ISO strings (Grafana 13.2.3 does not parse epoch-millisecond strings as an absolute dashboard time range and
shows "Invalid date").

Negative controls for the explicit colours and Automatic text (2026-10-03): a contrast guard on Text color Value, or
core's text colour for unset text on a background, or Automatic without a background starting from the panel
background instead of the value's colour, fails `tileStyling.test.ts`; the shared rule's controls are listed in
State timeline plus's `UPSTREAM.md`.

Negative controls for the field-option storage and the shades of colours without a name (2026-10-03): the field
options registered flat again (`options.test.ts`, 4 tests); `resolveStyling` reading flat `custom` (4 tests, the
rendered panel's override included); shades by name only (`tileStyling.test.ts`, 3 tests).

## Re-syncing to a newer tag

1. Re-run the dependency closure from `public/app/plugins/panel/stat/{module.tsx,StatPanel.tsx,common.ts,StatMigrations.ts,panelcfg.gen.ts,presets.ts,suggestions.ts}`
   and `packages/grafana-ui/src/components/BigValue/` at the new tag and compare with the tables below (new files,
   removed files, new `app/` or `/internal` imports, names no longer exported publicly).
2. For every file below, copy the upstream file to the plugin path, apply the import rewrites above, prepend the header,
   then re-apply the "Changes beyond import rewrites" (marked `pjan-stat-panel:` in the code where they are not a pure
   removal). `diff` against the previous upstream tag shows what Grafana changed.
3. Check `findNumericFieldMinMax` against the new tag (prefer a public export if one appeared), the partial copies
   (`suggestions.ts`, `fieldOverrides.ts`, the test-only `OptionsUI/registry.tsx`), and the panel-editor flow that
   `src/pjan/panelChangedHandler.ts` relies on (`PanelOptionsPane.onChangePanel`, `VizPanel.changePluginType` and
   `_pluginLoaded` in `@grafana/scenes`, `adaptFieldColorMode` in `getPanelOptionsWithDefaults.ts`). For Color mode
   Custom: re-apply its hooks in `module.tsx`, `StatPanel.tsx`, `BigValueTypes.ts` and `BigValueLayout.tsx` (each
   marked), and check that `FieldDisplay.view`/`colIndex` and the public `Sparkline`'s `config` still work as described
   in "Plugin addition: Color mode Custom".
4. Bump `@grafana/*` and the bundled dependency versions to the new tag's (`package.json` and `yarn.lock` of
   grafana/grafana), set `grafana_version` in `docker-compose.yaml`, then run `npm run typecheck && npm run lint &&
npm test && npm run build` and `npm run e2e` (the parity, interaction, saved-JSON and styling tests).

## Files

### Runtime code (AGPL-3.0, from public/app)

7 files, 812 lines (with headers), and the logo.

| Upstream path                                                | Plugin path                                | Lines | Changes                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------ | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `public/app/plugins/panel/stat/StatMigrations.ts`            | `src/plugins/panel/stat/StatMigrations.ts` |    48 | none                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/stat/StatPanel.tsx`                | `src/plugins/panel/stat/StatPanel.tsx`     |   173 | imports; renders the copied BigValue (marked); Color mode Custom: `pjanStyling` to BigValue (marked); `DataLinksContextMenuApi` from the public `@grafana/ui` export; `onFieldConfigChange` to `useApplyFieldConfigChangedInPlace` from `src/pjan/` (marked)                                                                                           |
| `public/app/plugins/panel/stat/common.ts`                    | `src/plugins/panel/stat/common.ts`         |   132 | none                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/stat/module.tsx`                   | `src/plugins/panel/stat/module.tsx`        |   161 | imports; Color mode Custom (a fifth choice, the styling panel options chained after Color mode and Graph mode, the styling field options; marked); suggestions supplier left off; `setPanelChangeHandler(panelChangedHandler)` from `src/pjan/` (keeps options and the colour mode when switching from core stat, otherwise `statPanelChangedHandler`) |
| `public/app/plugins/panel/stat/panelcfg.gen.ts`              | `src/plugins/panel/stat/panelcfg.gen.ts`   |    34 | none                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/stat/presets.ts`                   | `src/plugins/panel/stat/presets.ts`        |   249 | none                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/stat/suggestions.ts`               | `src/plugins/panel/stat/suggestions.ts`    |    15 | partial copy (`MAX_STAT_PREVIEW_SERIES`, `STAT_CARD_OPTIONS`)                                                                                                                                                                                                                                                                                          |
| `public/app/plugins/panel/stat/img/icn-singlestat-panel.svg` | `src/img/icn-singlestat-panel.svg`         |     – | none (the logo)                                                                                                                                                                                                                                                                                                                                        |

### Helpers from the @grafana packages (Apache-2.0)

5 files, 908 lines (with headers), plus the stand-in `src/packages/grafana-data/internal.ts`.

| Upstream path                                                    | Plugin path                                                          | Lines | Changes                                                                                                                                    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/grafana-data/src/field/fieldOverrides.ts`              | `src/packages/grafana-data/src/field/fieldOverrides.ts`              |    48 | partial copy (`findNumericFieldMinMax`); imports from the public `@grafana/data` API                                                       |
| `packages/grafana-ui/src/components/BigValue/BigValue.tsx`       | `src/packages/grafana-ui/src/components/BigValue/BigValue.tsx`       |    67 | `clearButtonStyles`, `FormattedValueDisplay` from the public `@grafana/ui` exports                                                         |
| `packages/grafana-ui/src/components/BigValue/BigValueLayout.tsx` | `src/packages/grafana-ui/src/components/BigValue/BigValueLayout.tsx` |   677 | `getTextColorForAlphaBackground`, `calculateFontSize`, `Sparkline` from the public `@grafana/ui` exports; Color mode Custom hooks (marked) |
| `packages/grafana-ui/src/components/BigValue/BigValueTypes.ts`   | `src/packages/grafana-ui/src/components/BigValue/BigValueTypes.ts`   |    83 | `Themeable2` from the public `@grafana/ui` export; the `pjanStyling` prop (marked)                                                         |
| `packages/grafana-ui/src/components/BigValue/PercentChange.tsx`  | `src/packages/grafana-ui/src/components/BigValue/PercentChange.tsx`  |    33 | `Icon` from the public `@grafana/ui` export                                                                                                |

### Tests and test helpers

| Upstream path                                                         | Plugin path                                                               | Licence    | Lines | Changes                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------- | ----: | ----------------------------------------------------------------------------- |
| `public/app/core/components/OptionsUI/NumberInput.tsx`                | `src/core/components/OptionsUI/NumberInput.tsx`                           | AGPL-3.0   |   133 | none (test-only)                                                              |
| `public/app/core/components/OptionsUI/number.tsx`                     | `src/core/components/OptionsUI/number.tsx`                                | AGPL-3.0   |    31 | none (test-only)                                                              |
| `public/app/core/components/OptionsUI/registry.tsx`                   | `src/core/components/OptionsUI/registry.tsx`                              | AGPL-3.0   |    44 | partial copy (`number`, `radio`, `select`, `stats-picker` editors; test-only) |
| `public/app/core/components/OptionsUI/select.tsx`                     | `src/core/components/OptionsUI/select.tsx`                                | AGPL-3.0   |    78 | none (test-only)                                                              |
| `public/app/core/components/OptionsUI/stats.tsx`                      | `src/core/components/OptionsUI/stats.tsx`                                 | AGPL-3.0   |    20 | none (test-only)                                                              |
| `public/app/plugins/panel/stat/StatMigrations.test.ts`                | `src/plugins/panel/stat/StatMigrations.test.ts`                           | AGPL-3.0   |   135 | none                                                                          |
| `public/app/plugins/panel/stat/StatPanel.test.tsx`                    | `src/plugins/panel/stat/StatPanel.test.tsx`                               | AGPL-3.0   |   154 | none                                                                          |
| `public/app/plugins/panel/stat/common.test.ts`                        | `src/plugins/panel/stat/common.test.ts`                                   | AGPL-3.0   |   132 | imports only                                                                  |
| `public/app/plugins/panel/stat/presets.test.ts`                       | `src/plugins/panel/stat/presets.test.ts`                                  | AGPL-3.0   |    92 | none                                                                          |
| `public/app/plugins/panel/test-utils.ts`                              | `src/plugins/panel/test-utils.ts`                                         | AGPL-3.0   |    31 | none                                                                          |
| `packages/grafana-ui/src/components/BigValue/BigValue.test.tsx`       | `src/packages/grafana-ui/src/components/BigValue/BigValue.test.tsx`       | Apache-2.0 |    54 | none                                                                          |
| `packages/grafana-ui/src/components/BigValue/BigValueLayout.test.tsx` | `src/packages/grafana-ui/src/components/BigValue/BigValueLayout.test.tsx` | Apache-2.0 |   194 | none                                                                          |
