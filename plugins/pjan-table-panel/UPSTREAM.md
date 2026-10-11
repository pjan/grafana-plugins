# Upstream: Grafana core table

This plugin is a port of Grafana's core **table** panel (`table`) from
[grafana/grafana](https://github.com/grafana/grafana) at tag **`v13.2.3`** (commit `6193dc0`, "Release: 13.2.3"),
together with the `TableNG` component it renders (`packages/grafana-ui/src/components/Table/`, which core imports from
`@grafana/ui/unstable`). With nothing configured it is meant to look and behave like the core panel: same options,
defaults, load migration, panel-change migrations, cell types, colours, sorting, filtering, column widths, pagination,
footer, cell inspect, data links and actions, tooltips from fields, styling from fields, nested tables and the frame
picker. `tests/parity.spec.ts` compares it with the core panel (see "Tests"). The plan is `plans/atlas-table-panel.md` in
pjan/atlas (route A: copy the panel and `TableNG`).

- Grafana core code (`public/app/...`) is AGPL-3.0, Copyright Grafana Labs, so this plugin is AGPL-3.0 (`LICENSE`,
  grafana/grafana's `LICENSE` at v13.2.3). Grafana's `NOTICE.md` (v13.2.3) is kept as `NOTICE.md`.
- Code copied from Grafana's npm packages (`packages/grafana-*`: the whole `TableNG` component, `ActionButton`, a test
  helper) is Apache-2.0, Copyright Grafana Labs. Its license text is in `LICENSE_APACHE2` (copied from
  `packages/grafana-ui/LICENSE_APACHE2` at the same tag).
- `dist/` ships `LICENSE`, `LICENSE_APACHE2`, `NOTICE.md`, this file, and `THIRD_PARTY_NOTICES.txt` (generated at build
  time: name, version, licence and licence text of every npm package bundled into the chunks; see "Plugin build
  configuration").
- **Source offer (AGPL-3.0 section 13):** `src/plugin.json` (`info.links`, "Source code") and `src/README.md` point at
  `https://github.com/pjan/grafana-plugins`, the public repository each release is built from.

Every copied file starts with a one-line header:
`// Copied from grafana/grafana v13.2.3: <upstream path>. <license>. Changes: <...>.`
Plugin-authored replacements for core modules start with `// Plugin stand-in for ...` instead. Every change beyond the
import rewrites is marked `pjan-table-panel:` in the code (also removals in files listed under "Copies with marked
changes", see there).

**What is copied** (counted from the headers, `Files` below): 27 AGPL-3.0 runtime files (2,730 lines: the panel, its two
helper directories, the shared copies and a partial copy) and 42 Apache-2.0 runtime files (8,696 lines: `TableNG`, the
shared `Table/` files, `ActionButton`, the type-only `cellUtils.ts` and `TableRT/styles.ts`); the tests: 17 AGPL-3.0
files (2,660 lines), 28 Apache-2.0 files (11,169 lines, with `__mocks__/uwrap.ts` and the test helper `jsdom.ts`) and 3
Jest snapshots (251 lines). 40 stand-ins: 29 relative-path re-exports, 8 for entry points and core modules, 3 for
tests.

## Layout

Copied files mirror their upstream path under `src/`:

- `public/app/<path>` is copied to `src/<path>`.
- `packages/grafana-<pkg>/src/<path>` is copied to `src/packages/grafana-<pkg>/src/<path>`.
- `src/pjan/` is plugin-authored code (not from grafana/grafana): the panel-change handler, the plugin's own tests and
  test helpers (`src/pjan/testdata/`). It gets the scaffold's normal lint rules (see "Plugin build configuration").
  Code shared with the other plugins of the repository is in the workspace packages `@pjan/grafana-styling` (not
  imported yet; for the additions) and `@pjan/grafana-panel-utils` (`fieldConfigRefresh`, used by the panel-change
  handler), both under `packages/`, Apache-2.0, bundled from source.
- `src/module.ts` is the plugin entry: it initialises `@grafana/i18n` and the feature-flag client (see "Feature flags")
  for this plugin (the flags only for a signed-in user, as core: `src/pjan/initFeatureFlags.ts`) and re-exports `plugin`
  from `src/plugins/panel/table/module.tsx`.
- `src/img/icn-table-panel.svg` is core's `public/app/plugins/panel/table/img/icn-table-panel.svg` (the panel logo),
  unchanged.

Non-relative imports such as `features/table/hooks` resolve from `src/` (scaffold `baseUrl`/`paths` in
`.config/tsconfig.json`, `resolve.modules` in webpack, `modulePaths` in Jest).

## Import rewrites (mechanical, applied to every copied file)

The same rewrites as the other plugins, which `scripts/resync-upstream.mjs` applies when it re-syncs:

| Upstream import                                  | Plugin import                         | Why                                                                                  |
| ------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------ |
| `'app/<path>'`                                   | `'<path>'`                            | Same file, resolved from `src/`.                                                     |
| `'@grafana/ui/internal'`                         | `'packages/grafana-ui/internal'`      | `/internal` is not shared with plugins at runtime.                                   |
| `'@grafana/data/internal'`                       | `'packages/grafana-data/internal'`    | Same.                                                                                |
| `'@grafana/runtime/internal'`                    | `'packages/grafana-runtime/internal'` | Same.                                                                                |
| `'@grafana/ui/unstable'`                         | `'packages/grafana-ui/unstable'`      | Core's `TablePanel.tsx` imports `TableNG` from it; the stand-in re-exports the copy. |
| `'@grafana/e2e-selectors'` (non-test files only) | `'packages/grafana-e2e-selectors'`    | Avoids bundling the package for a few `data-testid` strings; tests keep it.          |

**Relative imports need no rewrite** (plan decision 8 a): the copied `Table/` files import other `@grafana/ui` modules by
relative path, and those paths resolve to the stand-ins under "Relative-path stand-ins".

**Guard** (plan "Architecture"): the plugin's externals (`/^@grafana\/ui/i`, `.config/bundler/externals.ts`) would turn
a stray `@grafana/ui/unstable` import into Grafana's own `TableNG` at runtime (and a core-vs-plugin comparison would
still pass), and an `/internal` one into a module Grafana doesn't share with plugins. So:

- `eslint.config.mjs` bans `@grafana/ui/unstable` and `@grafana/{ui,data,runtime}/internal` (`no-restricted-imports`,
  with a message naming the rewrite) everywhere in `src/`: plugin code, tests and the mirrored tree;
- `src/pjan/buildConfig.test.ts` checks the AMD dependency list of the built `dist/module.js`: `@grafana/ui` is there,
  no `@grafana/ui/unstable` and no `/internal` entry. It also catches imports from bundled packages, which the lint rule
  doesn't see. It needs a build: the repository's checks (and CI) run Jest before `npm run build`, so in `npm test` on a
  fresh checkout this one test is skipped, and its name says "(no dist/module.js)". After the build, `npm run test:dist`
  (root, all workspaces with that script; this plugin's runs only this test, with `PJAN_REQUIRE_DIST=1`) runs it and
  fails if `dist/module.js` is missing. CI runs `npm run test:dist` after `npm run build` (`.github/workflows/ci.yml`,
  "Check the built bundles"), and the release workflow runs the plugin's `test:dist` after its build, before packaging
  (pjan, 2026-10-05, review finding m2).

Negative controls (2026-10-05): a plugin file importing `@grafana/ui/unstable` and `@grafana/runtime/internal`, a test
importing `@grafana/data/internal`, and a mirrored-tree stand-in re-exporting from `@grafana/ui/unstable` gave four lint
errors (`moment` and the `@pjan/grafana-styling/*` pattern still failed too, so the rule kept the earlier restrictions).
The same plugin file, bundled through `src/module.ts`, built without error (the risk itself: `module.js` asked Grafana
for `@grafana/ui/unstable` and `@grafana/runtime/internal`), and the `buildConfig.test.ts` check failed on both. All
restored. With `test:dist` (2026-10-05): `src/module.ts` importing `TableNG` from `@grafana/ui/unstable` built without
error, and `npm run test:dist` exited 1 (the AMD list had `"@grafana/ui/unstable"`); with `dist/` moved away it exited
1 too ("(no dist/module.js)" failed, not skipped), while plain Jest skipped the test; restored, it exited 0.

## Stand-ins for internal entry points

`@grafana/{ui,data,runtime}/internal` and `@grafana/ui/unstable` are not for plugins (see "Import rewrites"), and
`@grafana/e2e-selectors` is not bundled. Each stand-in provides only the names the copied code uses:

| Stand-in (`src/packages/...`)    | Provides                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `grafana-ui/unstable.ts`         | `TableNG`, re-exported from the copy (`TablePanel.tsx` imports it from `@grafana/ui/unstable`). `src/pjan/standIns.test.ts` checks it is the copy.                                                                                                                                                                                                                                                     |
| `grafana-ui/internal.ts`         | `TableSortByFieldState` (re-exported from the public `@grafana/ui`, the same type) and `defaultSparklineCellConfig` (`SparklineCellOptionsEditor.tsx`): `/internal` exports the constant of the older TableRT sparkline cell (`Table/Cells/SparklineCell.tsx`), not the copied TableNG cell's private constant; both have the same values, which the stand-in repeats (checked in `standIns.test.ts`). |
| `grafana-data/internal.ts`       | The type `ReduceTransformerOptions` (`migrations.ts`, for the Angular table's transforms), from `transformations/transformers/reduce.ts`; its `mode` is typed by the values of `ReduceTransformerMode`, which isn't public.                                                                                                                                                                            |
| `grafana-runtime/internal.ts`    | The two table feature flags, read as core reads them (see "Feature flags"). From the scaffold, unchanged.                                                                                                                                                                                                                                                                                              |
| `grafana-e2e-selectors/index.ts` | The `data-testid` values the copied runtime code uses (`Panels.Visualization.TableNG.*`, `DataLinksActionsTooltip.tooltipWrapper`, `DataLinksContextMenu.singleLink`, `PanelEditor.OptionsPane.fieldLabel`), as `@grafana/e2e-selectors` 13.2.3 resolves them; `standIns.test.ts` compares them with the package. Bundling the package would add it and `semver` for a few strings.                    |

## Stand-ins and partial copies for core app modules

| Upstream module                                       | Plugin file                                  | What it does instead                                                                                                                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `public/app/core/config.ts`                           | `src/core/config.ts`                         | New. `getConfig()` returns the public `config` of `@grafana/runtime` (core's boot config, which upstream can replace with `updateConfig`; plugins can't). `features/table/hooks.ts` reads `disableSanitizeHtml` from it. |
| `public/app/core/app_events.ts`                       | `src/core/app_events.ts`                     | State timeline plus's stand-in (shared): `appEvents.emit(event, payload)` as `getAppEvents().publish(...)` on the bus core shares with plugins (action toasts).                                                          |
| `public/app/features/dashboard/services/TimeSrv.ts`   | `src/features/dashboard/services/TimeSrv.ts` | State timeline plus's stand-in (shared): `getTimeSrv().timeRange()` from `${__from}`/`${__to}` (Infinity proxy actions).                                                                                                 |
| `public/app/features/query/state/PanelQueryRunner.ts` | same path                                    | State timeline plus's partial copy (shared): `getNextRequestId()` only.                                                                                                                                                  |

### Test stand-ins

`@grafana/test-utils` is a private Grafana workspace package (not on npm), and `@openfeature/react-sdk` is not a
dependency of this plugin. `jest.config.js` (`moduleNameMapper`) and `tsconfig.json` (`paths`) map them for the ported
tests; nothing here is bundled.

| Import in the ported tests                                                  | Plugin file                                   | What it is                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@grafana/test-utils` (`mockComboboxRect`)                                  | `src/packages/grafana-test-utils/index.ts`    | Stand-in re-exporting `mockBoundingClientRect` and `mockComboboxRect` from the Apache-2.0 copy of `packages/grafana-test-utils/src/jsdom.ts` (`TableCellOptionEditor.test.tsx`, `SparklineCellOptionsEditor.test.tsx`).                                                                                                                                                                                                               |
| `@grafana/test-utils/unstable` (`getTestFeatureFlagClient`, `setTestFlags`) | `src/packages/grafana-test-utils/unstable.ts` | Stand-in: upstream's code (`src/utilities/featureFlags.ts`), with the in-memory OpenFeature provider set on the plugin's flag domain instead of core's, because the plugin's hooks read that one. So `features/table/hooks.test.tsx` keeps its flag-on test ("passes pageSize through when the pagination-page-size flag is on").                                                                                                     |
| `@openfeature/react-sdk` (`OpenFeatureProvider`)                            | `src/pjan/testdata/openFeatureReactSdk.tsx`   | Renders its children: core's flag hooks read their client from this React provider, the plugin's hooks read the plugin's domain directly.                                                                                                                                                                                                                                                                                             |
| `core/components/OptionsUI/registry` (`getAllOptionEditors`)                | `src/core/components/OptionsUI/registry.ts`   | Stand-in re-exporting `getAllOptionEditors` from the plugin's test helper `src/pjan/testdata/editorRegistry.tsx` (as Time series plus's helper; Stat plus's partial copy of `registry.tsx` is not widened): the editor ids Grafana registers, with core's inline boolean switch and radio group (the editors the sparkline editor test renders) and no editor for the others; plus `fillEditorRegistry()` for the plugin's own tests. |
| `react-inlinesvg` (Grafana's `Icon`)                                        | `src/pjan/testdata/reactInlineSvg.tsx`        | grafana/grafana's own Jest mock (`public/test/mocks/react-inlinesvg.tsx`, AGPL-3.0, unchanged) instead of the scaffold's: it passes the icon's props through, and the copied tests find icons by Grafana's `icon-<name>` test ids.                                                                                                                                                                                                    |

## Relative-path stand-ins

Plan decision 8 (a). The copied `TableNG` files import other `@grafana/ui` modules by relative path
(`'../../../themes/ThemeContext'`, `'../../PanelChrome'`, …). Each such module has a stand-in at its mirrored path under
`src/packages/grafana-ui/src/` that re-exports the same names from the public `@grafana/ui`, so they resolve to Grafana's
runtime instances (a bundled `usePanelContext` would lose the panel context), and the copies and their tests stay
verbatim. Each file is two comment lines and one export. A name that Grafana drops from the public API fails the
typecheck; a new upstream relative import without a stand-in fails it too.

Derived from the v13.2.3 source (the scaffold's TypeScript-parser scan of the files the port copies: the 39 `Table/` runtime files of
the plan's closure, `Table/cellUtils.ts`, `Table/TableRT/styles.ts` and `components/Actions/ActionButton.tsx`, plus the 26
portable tests and `TableNG/__mocks__/uwrap.ts`): 23 runtime files reach 30 modules outside `Table/` (the plan's "22 of
41 files reach 28 modules", plus `ActionButton.tsx`'s own `ConfirmModal` and `VariablesInputModal`); `ActionButton` is
internal and is a copy, so 29 stand-ins. With the port, the typecheck confirms the set: every relative import of the copies resolves, and no stand-in is missing. The tests add one name (`PanelContextProvider`). Every name was checked
against `node_modules/@grafana/ui/dist/types/index.d.ts` (13.2.3): exported there from the same module (the two
`VizTooltip` names through `components/VizTooltip/index.tsx`), as a value or, where marked, as a type.

| Stand-in (`src/packages/grafana-ui/src/…`)                   | Re-exports from `@grafana/ui`                                                                             | Imported by (upstream)                                                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `components/Actions/VariablesInputModal.tsx`                 | `VariablesInputModal`                                                                                     | `Actions/ActionButton.tsx` (step 6 copy)                                                                                   |
| `components/BarGauge/BarGauge.tsx`                           | `BarGauge`                                                                                                | `Cells/BarGaugeCell.tsx`                                                                                                   |
| `components/Button/Button.tsx`                               | `Button`, type `ButtonProps`                                                                              | `Filter/FilterPopup.tsx`, `ActionButton.tsx`                                                                               |
| `components/ClipboardButton/ClipboardButton.tsx`             | `ClipboardButton`                                                                                         | `TableCellInspector.tsx`                                                                                                   |
| `components/ConfirmModal/ConfirmModal.tsx`                   | `ConfirmModal`                                                                                            | `ActionButton.tsx`                                                                                                         |
| `components/Drawer/Drawer.tsx`                               | `Drawer`                                                                                                  | `TableCellInspector.tsx`                                                                                                   |
| `components/Dropdown/ButtonSelect.tsx`                       | `ButtonSelect`                                                                                            | `Filter/FilterPopup.tsx`                                                                                                   |
| `components/FilterInput/FilterInput.tsx`                     | `FilterInput`                                                                                             | `Filter/FilterPopup.tsx`                                                                                                   |
| `components/FormattedValueDisplay/FormattedValueDisplay.tsx` | `FormattedValueDisplay`                                                                                   | `Cells/SparklineCell.tsx`                                                                                                  |
| `components/Forms/Checkbox.tsx`                              | `Checkbox`                                                                                                | `Filter/FilterList.tsx`                                                                                                    |
| `components/Forms/Label.tsx`                                 | `Label`                                                                                                   | `Filter/FilterPopup.tsx`, `Filter/FilterList.tsx`                                                                          |
| `components/Icon/Icon.tsx`                                   | `Icon`                                                                                                    | `HeaderCell.tsx`, `Filter/Filter.tsx`, `RowExpander.tsx`                                                                   |
| `components/IconButton/IconButton.tsx`                       | `IconButton`                                                                                              | `TableCellActions.tsx`                                                                                                     |
| `components/Layout/Stack/Stack.tsx`                          | `Stack`                                                                                                   | `TableCellInspector.tsx`, `HeaderCell.tsx`, `FilterPopup.tsx`, `FilterList.tsx`                                            |
| `components/Monaco/CodeEditor.tsx`                           | `CodeEditor`                                                                                              | `TableCellInspector.tsx`                                                                                                   |
| `components/Pagination/Pagination.tsx`                       | `Pagination`                                                                                              | `TableDataGrid.tsx`                                                                                                        |
| `components/PanelChrome/index.ts`                            | type `PanelContext`, `PanelContextProvider` (tests), `usePanelContext`                                    | `TableNested.tsx`, `render-hooks.tsx`, `TableFlat.tsx`; tests `TableNG.test.tsx`, `render-hooks.test.tsx`                  |
| `components/Portal/Portal.tsx`                               | `Portal`                                                                                                  | `DataLinksActionsTooltip.tsx`                                                                                              |
| `components/Sparkline/Sparkline.tsx`                         | `Sparkline`                                                                                               | `Cells/SparklineCell.tsx`                                                                                                  |
| `components/Tabs/Tab.tsx`                                    | `Tab`                                                                                                     | `TableCellInspector.tsx`                                                                                                   |
| `components/Tabs/TabsBar.tsx`                                | `TabsBar`                                                                                                 | `TableCellInspector.tsx`                                                                                                   |
| `components/Tooltip/Popover.tsx`                             | `Popover`                                                                                                 | `TableCellTooltip.tsx`, `Filter/Filter.tsx`                                                                                |
| `components/VizTooltip/VizTooltipFooter.tsx`                 | `VizTooltipFooter`                                                                                        | `DataLinksActionsTooltip.tsx`                                                                                              |
| `components/VizTooltip/VizTooltipWrapper.tsx`                | `VizTooltipWrapper`                                                                                       | `DataLinksActionsTooltip.tsx`                                                                                              |
| `themes/ThemeContext.tsx`                                    | `useStyles2`, `useTheme2`                                                                                 | 14 `Table/` files and `ActionButton.tsx`                                                                                   |
| `types/icon.ts`                                              | `getFieldTypeIcon`                                                                                        | `HeaderCell.tsx`                                                                                                           |
| `utils/colors.ts`                                            | `getTextColorForAlphaBackground`, `getTextColorForBackground`                                             | `TableNested.tsx`, `TableFlat.tsx`, `TableNG/utils.ts`, `cellUtils.ts`; tests `render-hooks.test.tsx`, `PillCell.test.tsx` |
| `utils/floating.ts`                                          | `getPositioningMiddleware` = `floatingUtils.getPositioningMiddleware` (public only through the namespace) | `DataLinksActionsTooltip.tsx`                                                                                              |
| `utils/measureText.ts`                                       | `measureText`                                                                                             | `Cells/SparklineCell.tsx`                                                                                                  |

No other plugin has a stand-in or copy at these paths, so the copy check compares them with nothing yet.

## Changes beyond import rewrites

| File                                       | Change                                                                                                                                                                                                                       | Reason                                                                                                                                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugins/panel/table/module.tsx`           | `.setPanelChangeHandler(panelChangedHandler)` from `src/pjan/panelChangedHandler.ts` instead of `tablePanelChangedHandler`; its import replaces those of `tablePanelChangedHandler` and `tableSuggestionsSupplier` (marked). | Switching a core `table` panel to this plugin in the panel editor keeps everything; every other previous panel type goes to core's `tablePanelChangedHandler` unchanged. See "Panel type switch". |
| `plugins/panel/table/module.tsx`           | `.setSuggestionsSupplier(tableSuggestionsSupplier)` left off (a marked line where it was). `suggestions.ts` is still copied unchanged; nothing imports it.                                                                   | Deliberate, see "Pruned and left off".                                                                                                                                                            |
| `plugins/panel/table/TablePanel.tsx`       | Calls `useApplyFieldConfigChangedInPlace(fieldConfig, props.onFieldConfigChange)` from `@pjan/grafana-panel-utils` first thing (marked, with its import).                                                                    | After the panel-change handler restored the field config in place, the panel applies it again; see "Panel type switch". Does nothing otherwise.                                                   |
| `plugins/panel/table/module.test.ts`       | The handler test expects the plugin's handler; the test "wires up the table suggestions supplier" removed, with its imports (marked lines).                                                                                  | The two marked changes of `module.tsx`. `src/pjan/module.test.ts` checks that no suggestions are offered.                                                                                         |
| `features/actions/utils.test.ts`           | State timeline plus's and Time series plus's adaptation (a `jest.mock` for the TimeSrv stand-in, `./analytics` mocked with `jest.mock`), re-marked with this plugin's id.                                                    | Shared copy; the check compares it outside the marked hunks.                                                                                                                                      |
| `features/query/state/PanelQueryRunner.ts` | State timeline plus's partial copy (`getNextRequestId` only), shared byte for byte.                                                                                                                                          | See "Stand-ins and partial copies for core app modules".                                                                                                                                          |
| `plugins/panel/table/module.tsx`           | The field options Background color and Text color (`.addCustomEditor`, marked, with their import) right after Cell type.                                                                                                     | Plugin addition: Text color and Background color (below).                                                                                                                                         |
| Four `TableNG/` files                      | `utils.ts`, `render-hooks.tsx`, `TableFlat.tsx`, `TableNested.tsx`: the Text color and Background color hooks (marked), listed in "Plugin addition: Text color and Background color".                                        | The opt-in options; with nothing set the copied code returns core's own objects.                                                                                                                  |

Nothing else in the copied files differs from upstream: every other copy (the panel, its helpers and editors, the rest
of `TableNG`, the shared `Table/` files, `ActionButton`, `cellUtils.ts`, `TableRT/styles.ts`, the ported tests, the three
snapshots, `__mocks__/uwrap.ts`, `jsdom.ts`) is upstream's apart from the import lines ("imports only" or "none" in its
header). The shared copies (`features/actions/{utils,analytics}.ts`, `alerting/unified/utils/url.ts`,
`canvas/panelcfg.gen.ts`, `timeseries/config.ts` with its four editors and `NullsThresholdInput.tsx`, and their tests) are
byte-identical to State timeline plus's copies (Time series plus's `config.ts` is its hooked copy; the check compares it
outside its marked hunks). `addTableCustomPanelOptions.ts` deep-imports
`@grafana/schema/dist/esm/raw/composable/table/panelcfg/x/TablePanelCfg_types.gen`, which the package's `exports` map
allows: no rewrite.

### Panel type switch (`src/pjan/panelChangedHandler.ts`)

In Grafana 13.2.3 (scenes 8.13.5), picking a visualization in the panel editor runs `PanelOptionsPane.onChangePanel`:
it clears `fieldConfig.defaults.custom` and removes the custom properties (`custom.*`) from the override rules
(`filterFieldConfigOverrides(..., isStandardFieldProp)`), then calls `VizPanel.changePluginType`. That loads the plugin
with `getPanelOptionsWithDefaults(..., isAfterPluginChange: true)`, which fills `custom` with the plugin's defaults and
whose `adaptFieldColorMode`, with Table's colour settings (by value supported, thresholds preferred), turns a colour mode
that isn't by value (the classic palettes, a single colour scheme other than Fixed) and an unset one into Thresholds.
Then `changePluginType` calls `onPanelTypeChanged(panel, prevPluginId, prevOptions, prevFieldConfig)` with the VizPanel's
own field config object as `panel.fieldConfig`, and applies only the returned options (and only when they aren't
empty). Core's own handler returns `{}` for every type (for the Angular `table-old` it changes the panel in place
instead): options, `custom`, the custom overrides (cell types, widths, hidden fields, tooltips, `scope: nested` rules)
and a colour mode that isn't by value would be lost.

For `prevPluginId === 'table'` the handler returns a copy of `prevOptions`, and restores on `panel.fieldConfig` in place:
`defaults.custom` (merged over the plugin's defaults), the override rules (a copy of core's, which brings the custom
properties back, nested-scope rules included), and `defaults.color` (removed when core's field config has none: Table
has no default colour, so a core table saved without one keeps none). It then marks the field config for
`fieldConfigRefresh` (the workspace package `@pjan/grafana-panel-utils`, shared with the other plus plugins): when the
plugin's module is already loaded, scenes renders the panel before the handler runs and caches the field config the
editor left; the copied `TablePanel` hands the restored one to `onFieldConfigChange` after its next render. This relies on
scenes passing the field config object by reference: if a future Grafana passes a copy, the options still carry over and
the field config is reset as for any panel type switch. Every other previous panel type goes to core's
`tablePanelChangedHandler` unchanged.

Checked by `src/pjan/panelChangedHandler.test.ts` (Grafana's own `getPanelOptionsWithDefaults` on the plugin's
registry) and end to end by `tests/savedJson.spec.ts` (six switches: classic palette, thresholds, fixed and no colour
mode, with the module loaded and not loaded): the same options and field config are saved, and the editor's preview
draws the same table (its elements) before and after the switch. Without each restore, the matching tests fail (see
"Negative controls").

**Renaming `type` from `table` to `pjan-table-panel` in the dashboard JSON (in a v2 dashboard, `vizConfig.group`) stays
the lossless conversion**, and the only one for library panels and provisioned dashboards. Only this direction is
supported: switching back to core is not designed for or tested.

### The load migration and `pluginVersion`

`tableMigrationHandler` (copied unchanged) runs when scenes loads a panel whose saved `pluginVersion` differs from the
running plugin's (`VizPanel._pluginLoaded`: `currentVersion !== pluginVersion`), as for core: core's version is
Grafana's, this plugin's is its package version (`1.0.0`). Its three steps (`cellOptions.wrapText` → `custom.wrapText`,
`custom.hidden` → `custom.hideFrom.viz`, the legacy `options.footer` → `custom.footer.reducers`) compare no versions.
`tests/savedJson.spec.ts` checks it with a panel saved with each of: no `pluginVersion` (every classic dashboard; both
panels migrate to the same model), `13.2.3` (core doesn't migrate, the plugin does) and `1.0.0` (core migrates, the
plugin doesn't). A panel left unmigrated keeps the legacy footer in its options and loses `custom.hidden` (Grafana drops
an override property the table registers no option for), in core as in the plugin. So a panel with legacy options must
be converted before it is saved with the plugin's version, which a saved plus panel can't have: the plugin migrates when
it loads it. (The plan expected "the same model in both panels" for all three versions; that holds only without a
`pluginVersion`, because scenes decides per panel plugin.)

## Copies with marked changes

The copies with lines marked `pjan-table-panel`. `scripts/check-upstream-copies.mjs` (repository root, run in CI;
`scripts/README.md`) reads this list: another plugin's copy of the same upstream file may differ from one listed here
only in hunks with a marked line; every other copy that another plugin also has must be identical to it, apart from the
header's `Changes:` text. Every copy with a marked line is listed, and only those.

- `src/plugins/panel/table/module.tsx`
- `src/plugins/panel/table/TablePanel.tsx`
- `src/plugins/panel/table/module.test.ts`
- `src/features/actions/utils.test.ts`
- `src/packages/grafana-ui/src/components/Table/TableNG/utils.ts`
- `src/packages/grafana-ui/src/components/Table/TableNG/render-hooks.tsx`
- `src/packages/grafana-ui/src/components/Table/TableNG/TableFlat.tsx`
- `src/packages/grafana-ui/src/components/Table/TableNG/TableNested.tsx`

## Stand-ins of its own

The stand-ins (files starting `// Plugin stand-in for ...`) that another plugin also has at the same path, but with
different content. `scripts/check-upstream-copies.mjs` reads this list: a stand-in at a path another plugin also has
must be byte-identical to the other plugins' unlisted stand-ins there, unless it is listed here; a stand-in is listed
here exactly when no other plugin's stand-in at that path has the same content.

- `src/packages/grafana-data/internal.ts`
- `src/packages/grafana-e2e-selectors/index.ts`
- `src/packages/grafana-runtime/internal.ts`
- `src/packages/grafana-ui/internal.ts`

Each provides the names this plugin's copied code needs, which differ from the other plugins' ("Stand-ins for internal
entry points"). State timeline plus and Time series plus share one version of `packages/grafana-runtime/internal.ts`
(the `grafana.filterablePanels` flag, always its default); this plugin's provides the two table flags, read as core
reads them ("Feature flags"). The shared stand-ins (`core/app_events.ts`, `features/dashboard/services/TimeSrv.ts`) are
byte-identical to the other plugins'. `core/config.ts`, `grafana-ui/unstable.ts`, the test stand-ins and the
relative-path stand-ins are at paths no other plugin has; `core/components/OptionsUI/registry.ts` is next to Stat plus's
partial copy `registry.tsx`, a different file.

## Plugin addition: Text color and Background color

Step 7, build 1 of `plans/atlas-table-panel.md` (branch `feature/text-color`, 2026-10-10), built from the spike on
`spike/text-color` (reference only, not merged): the spike's shared-package commits taken as they were (`alsoOn`,
`schemes.ts`), the rest re-done for this build only (no other addition's options, no review-only switch, no copied
`BarGauge` or `Sparkline`, no `TableNG` prop or React context: the hooks reach what they need through the arguments the
copied code already passes around). Opt-in: with both options unset nothing changes, and a table that doesn't use them
saves nothing new. Code in `src/pjan/styling/` (`options.ts`, `cellColors.ts`); the colour rules, the editor, Automatic
and the scheme shading come from `@pjan/grafana-styling` (`packages/grafana-styling/README.md`).

### The options (`options.ts`)

Field options in "Cell options" right after Cell type (`module.tsx`, two chained `.addCustomEditor`, marked), Stat plus's
keys and meanings:

- **Background color** at `custom.styling.backgroundColor`: a shade (the five, grouped "Shade of the value color") or
  Fixed. Value is core's own fill (so: unset); None isn't needed.
- **Text color** at `custom.styling.textColor`: Automatic, Value, a shade or Fixed.
- Both: the shared `StylingColorEditor` (clearable), placeholder "As Grafana", no default value (a cleared value leaves no
  key and no `styling: {}`), `override` the same editor, `process` `identityOverrideProcessor`, `shouldApply: () => true`
  (core's own for its cell options: a time column can be a coloured cell; a recorded deviation from principle 3's "skips
  time fields"), **no `showIf` on the cell type** (plan, review M3); override ids `custom.styling.<key>`; i18n keys
  `pjan.table-styling.*`; the descriptions say which cell types they apply to and end with "Not set: …".
  `getFieldStyling` returns one frozen empty object while nothing is set (State timeline plus's pattern).

### What they draw (`cellColors.ts`)

- **Nothing set = core:** the hook returns core's styles object itself, and pill columns get core's own text function.
- **Background color: Colored background cells only** (basic and gradient, and the row of Apply to entire row: the
  row-colouring field's setting fills the row). Not pills (Pill fill color is a later build, plan decision 10), not
  Colored text. A shade of the value's colour (of its name's hue, or its nearest hue; **without a hue, the value's colour
  itself**, Stat plus's rule; from a continuous scheme, the scheme's stops shaded and interpolated at the value's
  position) or a fixed colour.
  - Basic cells: the shade or the fixed colour, solid.
  - **Gradient cells, variant B (pjan, 2026-10-10):** a shade keeps core's gradient, built from the shaded colour by core's
    own rule (`gradientBg` of the copied factory, passed in: darkened by 10 in dark, lightened by 7 in light, 5° hue
    spin), `linear-gradient(120deg, <start>, <shade>)` as core writes it. **Fixed doesn't apply to gradient cells:** they
    draw as core (fill and, with Text color unset, text); the description says so (the editor can't see a column's cell
    type, so it can't hide Fixed).
- **Text color** on Colored background (and the row), Pill and Colored text cells; nothing on other cell types. Value, a
  shade and Fixed are drawn as chosen, also where that is unreadable (Value on a fill of the same colour is invisible, as
  in Stat plus). A shade of a colour without a hue is Automatic.
- **The unset rule (Stat plus's):** each unset part follows core, part by part, **except that where the plugin draws the
  fill (Background color), an unset Text color is Automatic on that fill**. One path for cells, rows and pills
  (`getTextOnFill`, with a `Fill` that says whether the plugin draws it), so Pill fill color (a later build) gets the same
  rule by passing its fill.
- **Automatic** (plan decision 9) is `getAutomaticText` at the text's font (`getTextFont`, the one place size and weight
  come from: cells 14 px, pills `bodySmall` 12 px, the theme's regular weight; Text weight, a later build, sets the
  weight there):
  - on a fill, from the fill, against the fill as drawn: on a **gradient** (core's, or the plugin's variant B) both stops,
    every step measured against both and the lower contrast counting (the shared option `alsoOn`); translucent fills
    composited over the table background;
  - on **Colored text**, from the value's colour against what the text is drawn on: **the row's fill as drawn** on a row
    coloured by Apply to entire row (core's basic or gradient fill, or the plugin's: render-hooks passes the row's
    `background`, which `getFillStops` reads, a gradient as both stops), **the tooltip's background** in Tooltip from field
    (or the row's fill there, which core gives the tooltip's content too), otherwise **the table background**
    (`getGridBackground`: `getGridStyles`' `--rdg-background-color`, by `transparent` and `visualDesignRefresh`).
- **Pills:** Text color on the pill's fill, at the pill's font. The pill's colour has a name when it comes from the
  field's mappings, thresholds or fixed colour (the field PillCell gets: for a pill column with mappings, render-hooks has
  replaced its colour config with Fixed but kept the mappings, so the mapping colour's name is found); a string-hash
  pill's colour (Grafana's classic hex colours) takes its nearest hue. A translucent pill is composited over the table
  background, also on a coloured row (PillCell hands its text function only the pill's colour, not its row).
- **Caching, keyed on the theme:** the factory (and its cache) is made per theme and table background, the pill functions
  per column build (rebuilt with the theme), `getAutomaticText` and `shadeColorScheme` cache per theme object; core's
  text memo (`getTextColorForBackground`, keyed by colour only) is still what pills use when unset.
- **Styling from field still wins:** the hook changes the colour styles, which the cell applies before the JSON of
  Styling from field.
- **Links** in cells that can be coloured take the cell's text colour: core's `getLinkStyles` gives them `color:
inherit` whenever the cell can be coloured. **The hover cell-action buttons** (inspect, filter) keep core's own backdrop
  and theme text. Both checked against the copied `styles.ts` in `cellColors.test.ts`.
- **Live theme switch:** core keeps the value colours of the theme the data was processed in until the next data refresh
  (scenes 8.13.5 caches the processed data by `rawData` identity, with no theme in the key; seen in core and plugin
  alike in `styling.spec.ts`), and a continuous scheme's colours until the page is reloaded: `@grafana/data` builds a
  scheme's interpolator once per page load, from the stops of the first theme it is asked for, on the colour mode
  object in Grafana's registry (`FieldColorSchemeMode.getInterpolator`, `fieldColor.ts`; the Atlas theme plugin resets
  it on a switch). The hook's caches follow the new theme, so the options apply the new theme's shades and contrast to
  the colours core draws, and a scheme is shaded from the new theme's stops (`getColors(theme)`).
- **Writes to Grafana's shared scheme object:** `getColorScheme` (shared package) calls `mode.getColors(theme)` on that
  registry object, which stores the stops it resolves (`colorCache`, `colorCacheTheme`). It doesn't change what core
  draws: the plugin calls it only with the theme the panel was processed in, after core's display processor has drawn
  the cell's value colour (so after core built its interpolator, which is the only reader of that cache). Checked in
  the browser too (UPSTREAM "Test runs", 2026-10-11).

### Hooks (all marked `pjan-table-panel:`)

| Copied file                                        | Hook                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugins/panel/table/module.tsx`                   | `.addCustomEditor(backgroundColorFieldOption(cellCategory))` and `.addCustomEditor(textColorFieldOption(cellCategory))` right after Cell type, with their import                                                                                                                                                                                                                                                                            |
| `TableNG/utils.ts`                                 | `getCellColorInlineStylesFactory(theme, pjanGridBackground?)`; its styles function takes `(cellOptions, displayValue, hasApplyToRow, pjanField?, pjanDrawnOn?)` and, only with a field, returns `getCellColorsFactory`'s result for core's `result` (core's object itself when the field sets neither option), with core's `gradientBg` and the display value's `percent`. `getApplyToRowBgFn` passes the row's field                       |
| `TableNG/render-hooks.tsx`                         | `ColumnBuildConfig.pjanGridBackground`; the cell passes `field` and the row's fill (`getRowFill(style)`: the row's styles are already in the cell's); Tooltip from field passes `tooltipField` and the row's fill or the tooltip's background; each column (and a tooltip's field) hands its cells `getPillTextColorFn(getTextColorForBackground, field, theme, background)` instead of core's function (core's function itself when unset) |
| `TableNG/TableFlat.tsx`, `TableNG/TableNested.tsx` | the table background (`getGridBackground(theme, transparent)`) to the factory, which is now rebuilt when `transparent` changes too, and to the column config                                                                                                                                                                                                                                                                                |

`PillCell.tsx` is not changed: its only text decision is the `getTextColorForBackground(bgColor)` it is handed, and only
PillCell calls it.

### Decisions

1. **A changed signature, not a parallel function:** two optional trailing parameters on the factory and on its styles
   function, so its three call sites (cell, Tooltip from field, Apply to entire row) each pass one or two more arguments,
   core's body stays as it is, and the copied tests (which call it with three) are unchanged. The field carries its
   styling (`field.config.custom.styling`); the table background comes from where `transparent` is known
   (`TableFlat`/`TableNested`). The factory reads nothing from the theme until a field sets an option (the copied
   `utils.test.ts` builds the factory with a partial theme); the column builder reads `background.primary` when its
   config has no table background (the copied tests).
2. **No `TableNG` prop or context** (the spike's later `pjan` prop served panel options and other builds): build 1 needs
   only the field, the table background and what a cell is drawn on, which the copied code already passes or knows.
3. **Pills through the text function each column hands its cells** (no change to `PillCell.tsx`), which reaches cell and
   tooltip pills.
4. **Apply to entire row: the field that colours the row decides the row's fill and text.** Other fields' options apply
   only to their own coloured cells: a Colored background cell in a coloured row draws its own fill and text, an Auto cell
   keeps the row's text, and a Colored text cell with Text color is measured against the row's fill as drawn.
5. **Gradients: both stops** (`alsoOn`). Where no colour reaches 4.2:1 on both stops, the extreme (page colour or
   `maxContrast`) with the higher lower contrast is used. Accepted by pjan (2026-10-06 and 2026-10-10) on Grafana's
   stock themes: Grafana dark blue 3.73:1, a Soft green variant-B gradient 4.04:1, Grafana light Stronger green
   3.89:1. **In the Atlas theme it goes lower** (the build 1 review, M1; re-computed independently with job tmp
   `table-plan/build1/oracle_atlas.py`, Grafana's 3-digit luminance): core's gradient with Text color Automatic in Atlas
   dark, blue 3.24:1, teal 3.18:1, cyan 3.18:1, green 3.86:1; variant B in Atlas light, teal Stronger 3.89:1, yellow
   Stronger 4.12:1; in Atlas dark, Base indigo 3.63:1, lime 3.59:1, violet 4.04:1. The same hues on basic fills reach
   4.50–4.56:1. The descriptions and the README say so and steer readability-critical columns to Basic mode (CONVENTIONS
   uses basic state cells). **For pjan to re-decide** (the measurement is unchanged in this build).
6. **Variant B on gradient cells, Fixed ignored there** (pjan, 2026-10-10).
7. **Continuous schemes: one resolver** (`getValueShadeColor`, pjan 2026-10-10): the scheme's stops shaded and
   interpolated at the display value's `percent`, which is what Grafana's calculator interpolates at. A value coloured by
   a mapping has no `percent` and takes the shade of its mapping colour's name. Viridis-type schemes are shaded from
   Grafana's nine samples (accepted).
8. **Value kept** as a Text color mode (accepted): drawn as chosen, even where invisible.
9. **Cells core leaves uncoloured stay uncoloured** (accepted): Background color doesn't fill a cell whose value colour
   is transparent on a coloured row (core leaves it to the row before the hook runs), nor a cell without a value colour.

### Depends on (check at each re-sync)

- `getCellColorInlineStylesFactory`: its signature, its body (the `result` object it returns, `gradientBg`,
  `isTransparent`) and its three call sites; the `linear-gradient(120deg, <start>, <colour>)` string `getFillStops` reads
  (tested against the copy) and the darkening rule variant B reuses.
- `render-hooks.tsx` copying the row's styles (`rowCellStyle`) into each cell and into Tooltip from field's style before the
  cell's own colours, and applying Styling from field after them; its mapped-pill replacement keeping `mappings` and
  `custom`.
- `getGridStyles`' background rule, `getTooltipStyles`' wrapper background, `getLinkStyles`' `color: inherit` and
  `getCellActionStyles`' backdrop (`cellColors.test.ts` compares them with the copies).
- That only PillCell uses `getTextColorForBackground` and calls it with each pill's fill; PillCell's `bodySmall` font and
  the cells' body font.
- The display value's `percent` (`@grafana/data` `displayProcessor`) and the continuous schemes' `getColors`
  (`schemes.ts`, `@grafana/data` `fieldColor.ts`): Grafana's interpolation is re-implemented there and tested equal.
- `FieldColorSchemeMode` in `@grafana/data` `fieldColor.ts`: `getColors(theme)` caching its stops on the registry's mode
  object, and the interpolator built once from that cache on first use (see "Live theme switch"); the special names
  `panel-bg`, `transparent` and `text` the "from background" schemes use (kept unshaded by `shadeColorScheme`).
- Core's key list: `fieldOptionKeys.test.ts` fails if `TableFieldOptions` gains a `styling` key.

### Tests

- **Jest** (`src/pjan/styling/`, 97): `options.test.ts` (25: both options as registered: place after Cell type and
  before Cell value inspect, override ids, modes, placeholders, no defaults, no cell-type `showIf`, `shouldApply`,
  descriptions; and as saved: no `styling` on a new panel, a cleared value leaves no key and no `styling: {}`, unknown
  keys dropped, an override kept as `custom.styling.<key>` and styling only its field, the override-cleared caveat;
  `getFieldStyling`), `cellColors.test.ts` (61: the resolver with hand-computed colours for every mode on basic and
  gradient fills, variant B, Fixed on gradients, applied rows, Colored text on the table, row and tooltip backgrounds,
  transparent panels, colours without a name (hex, gray), Green-Yellow-Red at 0, 0.25, 0.5, 0.75 and 1 in Soft and
  Stronger, light and dark, pills (mapped, string hash, transparent), the theme-keyed caches, and core's styles they rely
  on), `tableColors.test.tsx` (16: the copied `TableNG` rendered in jsdom: cells, pills, Background color, Styling from
  field, a transparent table, a theme switch, coloured rows (core's and the plugin's, basic and gradient), nested tables
  (flat and transparent), transparent pills, Tooltip from field (Colored text on the tooltip's background and on a row's
  fill, pills)). Hand-computed values: job tmp `table-plan/build1/oracle.py`, `oracle_b1.py`, `oracle6.py` (Grafana's
  3-digit luminance, 1 % sRGB steps, tinycolor's darken and spin, d3's B-spline), separate from the shared package.
- **End to end:** `tests/styling.spec.ts` and `tests/stylingEditor.spec.ts` ("End to end").

### Negative controls

Jest (2026-10-10, `src/pjan/styling/` and `fieldOptionKeys.test.ts`, 102 tests; with the shared package's 140 where its
code was broken), each broken on purpose by a script (job tmp `table-plan/build1/controls/run.py`), then restored:

| Broken on purpose                                                                      | Result (Jest)                      |
| -------------------------------------------------------------------------------------- | ---------------------------------- |
| module.tsx: Background color not registered                                            | 9 failed                           |
| module.tsx: Text color before Background color                                         | 1 failed                           |
| utils.ts: the styles function returns core's result (hook off)                         | 42 failed                          |
| utils.ts: the value's scheme position not passed                                       | 6 failed                           |
| utils.ts: core's gradient start not passed (identity)                                  | 10 failed                          |
| utils.ts getApplyToRowBgFn: the row's field not passed                                 | 5 failed                           |
| utils.ts: the table background not passed to the factory                               | 5 failed                           |
| render-hooks: the cell's field not passed                                              | 11 failed                          |
| render-hooks: the row's fill not passed at the cell                                    | 4 failed                           |
| render-hooks: the tooltip's field not passed                                           | 2 failed                           |
| render-hooks: what tooltip Colored text is drawn on not passed                         | 2 failed                           |
| render-hooks: pill cells given core's text function                                    | 6 failed                           |
| render-hooks: tooltip pills given core's text function                                 | 1 failed                           |
| render-hooks: pills measured on the panel background, not the table's                  | 2 failed                           |
| TableFlat: the table background ignores transparent                                    | 2 failed                           |
| TableNested: the table background ignores transparent                                  | 1 failed                           |
| TableFlat: the table background not in the column config                               | 1 failed                           |
| TableNested: the table background not in the column config                             | 1 failed                           |
| cellColors: unset text on a plugin fill is core's (no unset rule)                      | 18 failed                          |
| cellColors: a shade on gradient cells drawn solid (variant A)                          | 9 failed                           |
| cellColors: Fixed applied to gradient cells                                            | 1 failed                           |
| cellColors: a gradient measured on one stop only (no alsoOn)                           | 7 failed                           |
| cellColors: Colored text Automatic not from the value colour                           | 15 failed                          |
| options: getFieldStyling not one frozen object                                         | 1 failed                           |
| cellColors: the pill text cache shared across themes (keyed by colour only, as core's) | 5 failed                           |
| render-hooks: the plugin's styles applied after Styling from field                     | 1 failed                           |
| shared canvasColors: alsoOn ignored in the contrast                                    | 7 failed; shared package: 1 failed |
| shared schemes: getValueShadeColor without the scheme branch                           | 6 failed; shared package: 4 failed |
| options: shouldApply skips time fields                                                 | 3 failed                           |
| options: a default value                                                               | 8 failed                           |

After the build 1 review (2026-10-11, the same script, `run_review.py`):

| Broken on purpose                                                                            | Result (Jest)                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shared `schemes.ts` (m1): `panel-bg`, `transparent` and `text` stops shaded like other stops | shared package: 3 fail (Blues in Atlas light and dark, the `text`/`transparent` stops); the plugin's pass, as expected (Grafana's stock themes have no gray hue, so the rule changes nothing there) |
| `cellColors.ts` (m6): the scheme left out of the cache key                                   | 1 fails (two columns, two schemes, one factory)                                                                                                                                                     |
| `cellColors.ts`: an infinite position counts as no position                                  | 1 fails (an infinite value)                                                                                                                                                                         |
| shared `schemes.ts`: an infinite position counts as no position                              | plugin 1 fails, shared package 1 fails                                                                                                                                                              |
| `options.ts` (m3): Text color's placeholder "As Grafana"                                     | 1 fails                                                                                                                                                                                             |

End to end (2026-10-10, each broken, the plugin rebuilt, the named tests run with `--workers=1`, then restored and
rebuilt; job tmp `table-plan/build1/controls/run_e2e.py`):

| Broken on purpose                                                                        | Run                                                | Result                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `render-hooks.tsx`: the cell's field not passed                                          | `styling.spec.ts`, light, pixel ratio 1 (26 tests) | 20 fail: every case with a coloured cell; the pill cases and the tooltip hover test pass, as expected (pills and tooltips have their own hooks)                   |
| `TableFlat.tsx`: the table background ignores `transparent`                              | the transparent and tooltip cases (light, 1)       | both transparent cases fail ("colored text, transparent panel", "tooltip from field" on the table)                                                                |
| `render-hooks.tsx`: Tooltip from field's Colored text not given the tooltip's background | the tooltip tests (light, 1)                       | the hover test fails; the table case passes, as expected                                                                                                          |
| `module.tsx`: Text color registered before Background color                              | `stylingEditor.spec.ts`, `optionsEditor.spec.ts`   | 3 fail: placement, the overrides menu, and the comparison with core's editor                                                                                      |
| `cellColors.ts`: a shade on gradient cells drawn solid (variant A)                       | the gradient and nested cases (light, 1)           | the 3 gradient cases with a shade fail ("background soft, gradient", the gradient row, the scheme on gradient); the nested case (basic cells) passes, as expected |
| `cellColors.ts`: a colour drawn with nothing set                                         | three cases (light, 1)                             | all 3 fail on "nothing set: the same elements as core"                                                                                                            |

## Pruned and left off

| Feature                             | Upstream code                                         | Status and reason                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel suggestions                   | `setSuggestionsSupplier(tableSuggestionsSupplier)`    | Left off deliberately, as in the other plugins: the picker would show a second Table card next to core's. `suggestions.ts` is copied unchanged, so a re-sync keeps it current. Core Table has no presets.                                                                                                            |
| `TableRT` (the older table)         | `Table/TableRT/*`, `Table/Cells/*`, `Table/Table.tsx` | Not copied: the panel never renders it. Only `TableRT/styles.ts` is copied, for the `TableStyles` type `Table/types.ts` names; `defaultSparklineCellConfig`, which `/internal` takes from TableRT's sparkline cell, is in the `grafana-ui/internal.ts` stand-in.                                                     |
| `TableNG/components/FooterCell.tsx` | not imported by the panel's closure                   | Not copied (core's footer is `SummaryCell.tsx`).                                                                                                                                                                                                                                                                     |
| Translations                        | Grafana's locale files                                | The bundled `@grafana/i18n` has no translations for this plugin: the panel's option labels and the copied table's strings (`grafana-ui.table.*`: the filter popup, "Inspect value", "Filter for value", the sparkline's "no data") are English. Labels from Grafana's shared editors and components stay translated. |

Everything else is kept: every panel and field option with its default and `showIf` (the flag-gated Page size
included), the load migration and the panel-change migrations of `migrations.ts` (also the Angular `table-old` branch,
unreachable in a plugin), the `parentRowIndex` data migration, every cell type (geo cells with OpenLayers, loaded lazily
from the plugin's own chunk), colours, sorting, column filters and ad hoc filters, column resize, frozen columns,
pagination, footer reducers, cell inspect, data links and actions, tooltips and styling from fields, nested tables, the
frame picker, shared crosshair (with `tableSharedCrosshair`), keyboard navigation and the no-data view.

## Feature flags

Core's table reads three flags (plan "What core Table is"); this plugin reads them the same way (plan decision 5):

- `tableSharedCrosshair` (legacy toggle): from the public `config.featureToggles`, as core does. Nothing to stand in.
- `table.autoColumnWidths` and `table.paginationPageSize` (OpenFeature): core reads them from
  `@grafana/runtime/internal` (`useFlagTableAutoColumnWidths`, `useFlagTablePaginationPageSize` in
  `features/table/hooks.ts`; `FlagKeys` and `getFeatureFlagClient()` in `features/panel/table/addTableCustomPanelOptions.ts`).
  The stand-in `src/packages/grafana-runtime/internal.ts` provides those four names, plus `initOpenFeature()` and
  `OPEN_FEATURE_DOMAIN`.

**How core reads them** (`packages/grafana-runtime/src/internal/openFeature/index.ts`, `public/app/app.ts`,
`public/app/AppWrapper.tsx`): `app.ts` awaits `initOpenFeature()` before it renders (signed-in users only). That sets,
on the domain `internal-grafana-core` (reserved for core), a `MultiProvider` of Grafana's localStorage provider (prefix
`grafana.openfeature.`) and its OFREP web provider (the server's flags, fetched once at start), in that order, first
match wins, with the evaluation context `{ targetingKey: config.namespace, ...config.openFeatureContext }`. React reads
them with `useFlag` of `@openfeature/react-sdk` under `<OpenFeatureProvider client={getFeatureFlagClient()}>` (default
options: no suspense; re-evaluate on Ready, ContextChanged and ConfigurationChanged for that key).

**How the plugin reads them:** `@grafana/runtime` 13.2.3 gives plugins read-only proxies of those two provider instances
(`createOpenFeatureLocalStorageProvider()`, `createOpenFeatureOFREPWebProvider()`, public in `utils/openfeature.ts`).
`initOpenFeature()` sets a `MultiProvider` of the two proxies, in core's order and with core's context, on the domain
`pjan-table-panel`; `src/module.ts` awaits it (as `app.ts` awaits core's) before it exports the plugin, logging a failure
as core does. `getFeatureFlagClient()` is that domain's client. The two hooks evaluate on it and re-render on the same
three events as core's `useFlag`; they are plain React hooks, so the plugin bundles no `@openfeature/react-sdk` and needs
no React provider. Every flag defaults to `false` (both flags' default in core), also while the domain has no provider
(in Jest, nothing sets one).

**`@openfeature/web-sdk` bundled, and Grafana's copy.** The plugin bundles `@openfeature/web-sdk` **1.9.0** and
`@openfeature/core` **1.11.0** (Apache-2.0), the versions grafana/grafana v13.2.3's `yarn.lock` resolves `@grafana/runtime`'s
ranges (`^1.8.0`, `^1.10.0`) to, which is what Grafana 13.2.3 runs. (The repository's hoisted copies, 1.10.0 and 1.12.0,
come from `@grafana/runtime`'s ranges in npm and are not bundled; in the `MultiProvider`, 1.9.0 and 1.10.0 differ only in
passing the domain to a child provider's `initialize`, which the proxies don't have.) The web SDK keeps its API object on
`globalThis[Symbol.for('@openfeature/web-sdk/api')]` and creates it only when that is empty. Grafana creates it first
(at start), so the plugin's `OpenFeature` **is Grafana's API object**: `setProviderAndWait` registers the plugin's
provider under its own domain next to core's, `getClient` comes from Grafana's code, and core's handler that warns when
the default domain's provider changes sees a domain and stays quiet. What runs from the plugin's bundle is the
`MultiProvider`, its first-match strategy and status tracking (`@openfeature/core`), from the same package versions
as core's.
The proxies don't own the providers: they forward evaluations and events, never initialise or close them.

**Server values (OFREP), how 13.2.3 feeds them** (read in `pkg/setting/setting_feature_toggles.go`,
`setting_openfeature.go`, `pkg/services/featuremgmt/openfeature.go`, `static_provider.go`,
`pkg/registry/apis/ofrep/`): with the default `[feature_toggles.openfeature] provider = static`, the OFREP endpoint
(`/apis/features.grafana.app/v0alpha1/namespaces/<ns>/ofrep/v1/evaluate/flags`) evaluates an in-memory provider built
from the registry defaults (`registry.go`: both table flags `false`) overlaid with every key of `[feature_toggles]`. A
flag is turned on in `grafana.ini` (`[feature_toggles]` `table.paginationPageSize = true`) or with an environment
variable named after the key as is: `GF_FEATURE_TOGGLES_table.paginationPageSize=true` (13.2.3 reads every
`GF_FEATURE_TOGGLES_<key>` variable verbatim, dots included). For signed-in users the bulk evaluation returns every flag
unless `features.bulkFlagEvalFiltering` is on.

### Spike: the plugin's values equal core's (2026-10-05, scaffold)

The scaffold showed the plugin's values in a readout of its placeholder panel (`FeatureFlagsReadout.tsx`, removed with
the port) and compared them with core's three ways. Results, on the dev server (Grafana OSS 13.2.3):

| Case                                                                                                                                                           | Plugin (hooks, client, first render) and core                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Nothing set                                                                                                                                                    | both `false`; 5 rows on one page; no Page size                                    |
| localStorage `grafana.openfeature.table.paginationPageSize` = `true`, reload; then that removed and `…table.autoColumnWidths` = `true`; then both removed      | equal at every step; Page size shown only in the first; 2 rows per page only then |
| Server value `table.paginationPageSize: true` through OFREP (`@grafana/plugin-e2e`'s `openFeature` option, answered 3 s late)                                  | both `true`, already at the plugin's first render; Page size shown                |
| The same, plus localStorage `false`                                                                                                                            | both `false` (localStorage first)                                                 |
| Server started with `GF_FEATURE_TOGGLES_table.paginationPageSize=true` (a compose override outside the repository; the OFREP endpoint then reported it `true`) | both `true`; Page size shown; the "nothing set" tests failed, as they should      |

**With the port** (step 6), `tests/featureFlags.spec.ts` and `tests/featureFlagsServer.spec.ts` check the same cases on
the real panels (`provisioning/dashboards/feature-flags.json`: the same two tables in core and in the plugin): the
pagination table draws 2 rows per page only with `table.paginationPageSize`, in core and in the plugin; the table with a
long text column has content-aware column widths only with `table.autoColumnWidths`, and the plugin's widths equal
core's; both editors show Page size only with the flag; core's own client has the expected values.

**Only for a signed-in user, as core** (`src/pjan/initFeatureFlags.ts`, review of 2026-10-05): core's `app.ts` calls
`initOpenFeature()` only when `contextSrv.user.isSignedIn`, which `context_srv.ts` copies from the boot data; the plugin
checks the same value in the public `config.bootData.user.isSignedIn`. Without a signed-in user (anonymous viewers,
public dashboards) neither core's domain nor the plugin's has a provider, so every flag is `false` in both, also with a
localStorage override (before this check, the plugin's localStorage proxy still read an override there, where core
read `false`). Jest: `initFeatureFlags.test.ts` (signed in: set up; signed out or no user boot data: not set up; a
failure logged); with the check removed, the two signed-out tests fail. Not run end to end (the dev server's
anonymous access is not set up for the tests).

**Ready before the first render:** yes. Core blocks its start-up on its own initialisation, so Grafana's providers are
ready before any plugin loads; the plugin's `MultiProvider` has nothing to wait for (the proxies have no `initialize`),
and `module.ts` awaits it, so the first render already has the values (the scaffold's first-render readout matched in
every case, also with the server answer 3 s late). **A late provider re-renders correctly:** Jest renders the hooks
before `initOpenFeature()` and after it (Ready), and again after the OFREP provider reports new flags
(ConfigurationChanged).

Negative controls (2026-10-05, in the scaffold, against its readout; each restored):

| Broken on purpose                                               | Failed                                                                                                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A: `module.ts` doesn't call `initOpenFeature()`                 | the localStorage test and the server test (plugin `false`, core `true`)                                                                   |
| B: provider set 5 s after load, not awaited                     | the same two (plugin `false` when read); read after 7 s: hooks and client right, first-render values `false`                              |
| C: providers swapped (OFREP first)                              | Jest "reads the localStorage provider first"; e2e localStorage test (the server's `false` won) and "localStorage before the server value" |
| No Ready handler in the hooks / no ConfigurationChanged handler | Jest "re-renders the hooks when the provider becomes ready …"                                                                             |
| `config.openFeatureContext` not in the context                  | Jest "sets core's evaluation context on the plugin's own domain"                                                                          |

## Plugin build configuration

As in Time series plus:

- `tsconfig.json`: `"jsx": "react-jsx"` (upstream code uses the automatic JSX runtime), `typeRoots` that include the
  workspace root `node_modules/@types` (npm workspaces hoist `@types/*`), `isolatedModules` (as grafana/grafana's, for
  ts-jest), and `paths` for the test stand-ins (with `.config/tsconfig.json`'s `"*"`, which `paths` here replaces).
- `webpack.config.ts` extends `.config/webpack/webpack.config.ts` (never edited; `create-plugin update` owns it):
  - sets `jsc.transform.react.runtime = 'automatic'` on the scaffold's swc-loader rule. `package.json` `build`/`dev`
    scripts must use this file; `src/pjan/buildConfig.test.ts` fails if they don't;
  - copies `LICENSE_APACHE2`, `UPSTREAM.md` and `NOTICE.md` into `dist/` (the scaffold already copies `LICENSE`);
  - writes `dist/THIRD_PARTY_NOTICES.txt` (`ThirdPartyNoticesPlugin`: every npm package and workspace package with code
    in the chunks; the build fails on a package bundled from two directories);
  - replaces the scaffold's Terser instance with the same settings plus an explicit licence-comment condition
    (`/^\**!|@preserve|@license|@cc_on/i`), extracted to `<asset>.LICENSE.txt`;
  - performance-warning limits of 360 KiB, about 10 % above the measured `module.js` (below).
- `jest.config.js`: `ts-jest` (Grafana's transform; see "Tests", "Test adaptations"), `@grafana/react-data-grid` among the
  ES modules to transform, the test stand-ins and Grafana's `react-inlinesvg` mock in `moduleNameMapper`;
  `TZ = 'Pacific/Easter'` as in grafana/grafana's `jest.config.js` (the copied tests assert times in that zone). The
  scaffold's `\.(css|scss|sass)$` → `identity-obj-proxy` mapper covers `@grafana/react-data-grid/lib/styles.css`.
- `jest-setup.js`: `jest-canvas-mock` (core's `setupFiles`), core's `MessageChannel`, `IntersectionObserver` and
  `ResizeObserver` polyfills from `public/test/jest-setup.ts` (the `ResizeObserver` one with `contentBoxSize`, which
  react-data-grid measures), a `URL.canParse` polyfill (jsdom 20 lacks it), and the console methods put back after each
  test (as Grafana's `jest-fail-on-console` does).
- `eslint.config.mjs`: `react/react-in-jsx-scope` off for `src/`; the shared packages imported through their entry
  points only (tests may import their `src/testdata/`); the `/unstable` and `/internal` guard (see "Import rewrites");
  `@openfeature/react-sdk` banned outside tests (`tsconfig.json` maps it to a test stand-in);
  for the mirrored tree only (`src/{core,features,packages,plugins}/**`): `react-hooks/refs`,
  `react-hooks/set-state-in-effect`, the React Compiler rules `react-hooks/immutability`,
  `react-hooks/preserve-manual-memoization` and `react-hooks/void-use-memo` (Grafana's lint setup doesn't run them),
  `@typescript-eslint/array-type`, `no-redeclare`, `react/no-children-prop` and `react/display-name` (two copied tests)
  off, unused disable directives not reported, and the rule names of `eslint-plugin-jsx-a11y` and
  `eslint-plugin-testing-library` that upstream disable comments name declared as rules that check nothing (ESLint
  reports a directive for an unknown rule as an error; those plugins are not loaded here).
- `docker-compose.yaml`: Grafana OSS 13.2.3 (the image and version Atlas runs), session tokens rotated every 2 hours
  (`GF_AUTH_TOKEN_ROTATION_INTERVAL_MINUTES: 120`), port 3000 (one dev server at a time). `playwright.config.ts`: 60 s per
  test, 10 s per assertion, one worker; run the suite as `npx playwright test --workers=1`.
- i18n: `src/module.ts` calls `await initPluginTranslations(pluginJson.id)` for the bundled `@grafana/i18n`. The plugin
  ships no translations.
- Runtime dependencies bundled (not shared by Grafana), pinned to the versions grafana/grafana v13.2.3's `yarn.lock`
  resolves: `@grafana/react-data-grid` 7.0.0-beta.57 (MIT; its `lib/styles.css` is injected by the style loader:
  Grafana loads its own copy too: harmless by construction, as both are the same version with the same class names,
  `…-0-0-beta-57`; on a page with both, both copies apply to both panels, so the suite can't tell them apart), `uwrap` 0.1.2, `react-window` 1.8.11, `micro-memoize` 4.2.0, `clsx` 2.1.1,
  `tinycolor2` 1.6.0, `@floating-ui/react` 0.27.20 (as the other plugins) (all MIT), `ol` 10.7.0
  (BSD-2-Clause; not the 10.10.0 the repository hoists, so npm installs it in this plugin's `node_modules`),
  `@grafana/i18n` and `@grafana/schema` 13.2.3, `@openfeature/web-sdk` 1.9.0 and `@openfeature/core` 1.11.0 (see
  "Feature flags"), and the workspace package `@pjan/grafana-panel-utils`. `lodash` (4.18.1 in `package.json`, for the copied code's types and Jest) is not bundled: Grafana shares it with plugins (the scaffold's externals; it is in `module.js`'s AMD dependency list, not in `THIRD_PARTY_NOTICES.txt`). Dev dependencies: `@types/react-window` 1.8.8
  and `@types/react-table` 7.7.20 (Grafana's pins; `Table/types.ts` imports `react-table`'s types, nothing of it is
  bundled), `ts-jest` 29.4.0, `@testing-library/user-event`, `react-select-event`, `@types/lodash`, `@types/tinycolor2`
  (the other plugins' pins), `pngjs` 7.0.0 and `@types/pngjs` (the parity screenshots, as Stat plus).
- **Bundle (2026-10-05, production build):** `module.js` 330,305 bytes (323 KiB; 91,829 gzipped): the grid, the table code
  and its helpers, i18n and the OpenFeature SDK. Lazy chunks: OpenLayers' WKT writer and geometries 52,459 bytes (13,917
  gzipped), loaded only when a table has geometry fields (`LazyOpenLayersProvider`, unchanged; the e2e geo test checks it
  is fetched from `public/plugins/pjan-table-panel/`), `i18next-pseudo` 1,922 bytes and a 489-byte chunk. The scaffold's
  placeholder build was 54 KiB.

## plugin.json

The scaffold's id; the name is "Table plus". From core's `plugin.json`: the `img/icn-table-panel.svg` logo and the
documentation link. Added a "Source code" link (AGPL source offer). Not applicable to an external panel:
`"suggestions": true` (suggestions stay off, as in the other plugins), the "Raise issue" link (Grafana's tracker).

`grafanaDependency` is `^13.2.0`: the code is that of Grafana 13.2.3. **Every Grafana minor upgrade** needs the
parity tests against that version and a re-sync check against the new tag before `grafanaDependency` is widened.

## Tests

### Jest

Every portable upstream test is ported (plan decision 7), with imports only unless listed under "Changes beyond import
rewrites": the `TableNG` tests (`TableNG.test.tsx`, `TableNG.safari.test.tsx`, `TableDataGrid.test.tsx`, `utils.test.ts`
with its snapshot, `hooks.test.ts`, `render-hooks.test.tsx`, the cell tests `PillCell`, `renderers`, `ImageCell`,
`DataLinksCell`, the seven `components/*` tests, `FilterList`, `FilterPopup`, `Filter/utils.test.ts` with its snapshot),
the shared `Table/` tests (`cellUtils`, `DataLinksActionsTooltip`, `TableCellInspector`, `filterExpression`,
`geo/context`, `geo/utils`), the panel's (`migrations.test.ts` with its snapshot, `module.test.ts`,
`TableCellOptionEditor.test.tsx`, the five cell-editor tests), `features/table/{hooks,utils}` tests, and the tests of the
shared copies (as in the other plugins). `TableNG/__mocks__/uwrap.ts` is copied: Jest uses a `__mocks__` file under its
roots for the node module of that name automatically, as in Grafana's run (the row-height expectations depend on it).

Not portable, not copied:

| Upstream test                                                           | Why                                                                                                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `TableNG/Cells/SparklineCell.canvas.test.tsx` and its 750-line snapshot | needs `@grafana/test-utils/canvas` (Grafana's private canvas recorder); the sparkline canvases are compared end to end instead |
| `Table/Table.test.tsx`, `Table/utils.test.ts`, `TableRT/*.test.tsx`     | test `TableRT`, which is not copied                                                                                            |
| `TableNG/components/FooterCell.test.tsx`                                | tests `FooterCell.tsx`, which is not in the panel's closure                                                                    |
| `plugins/panel/table/suggestions.test.ts`                               | suggestions are left off                                                                                                       |
| `Table/Table.story.tsx`, `Table.mdx`                                    | Storybook, not tests                                                                                                           |

**Test adaptations** (configuration and test stand-ins, no change to the copied tests):

- **ts-jest, as grafana/grafana:** `jest.config.js` transforms with `ts-jest` 29.4.0 (Grafana's version and transform;
  `tsconfig.json` sets `isolatedModules`, as Grafana's does, so it transpiles without type-checking) instead of the
  scaffold's swc. `TableNG/utils.ts`, `Cells/renderers.tsx` and the cells form an import cycle; the PillCell, ImageCell
  and DataLinksCell tests enter it at the cell. TypeScript's CommonJS output reads a binding of a module still being
  evaluated as `undefined`, as in Grafana's run; swc's throws ("Cannot access 'getStyles' before initialization"), and the
  three suites failed to load. The build still uses swc (webpack's ES modules handle the cycle, entered from `TableNG`).
- `transformIgnorePatterns` adds `@grafana/react-data-grid` (an ES module; Grafana's `jest.config.js` lists it too).
- `jest-setup.js` puts the console methods back after each test, as `jest-fail-on-console` (Grafana's
  `public/test/setupTests.ts`, on CI) does: `TableNG/utils.test.ts` "only calls console.error once for a given malformed
  style" counts calls on a `jest.spyOn(console, 'error')` that must not outlive the previous test.
- Grafana's `react-inlinesvg` mock and the test stand-ins of "Test stand-ins" (`@grafana/test-utils`,
  `@grafana/test-utils/unstable`, `@openfeature/react-sdk`, `core/components/OptionsUI/registry`).

Own tests (`src/pjan/`):

- `panelChangedHandler.test.ts` (15): options kept; `custom`, the custom override properties (cell types, widths, hidden
  fields, tooltips, a `scope: nested` rule) and the colour mode restored (classic palette, by name, shades, thresholds, a
  continuous scheme, fixed, unset); nothing changed without a previous field config; the field config marked and applied
  again; `table-old` and other types through core's handler.
- `module.test.ts` (6): the copied `TablePanel`, core's migration handler with no version check of its own, the plugin's
  panel-change handler, no suggestions, no presets, padding and data support as a fresh panel plugin.
- `fieldOptionKeys.test.ts` (5): the custom field option ids are core's 13 (frozen for v13.2.3 and checked against the
  copied module) and the plugin's own, all under `styling`; no plugin option reuses a key of `TableFieldOptions` (read from `@grafana/schema` 13.2.3 with the
  TypeScript compiler); a control that such an option would be caught.
- `initFeatureFlags.test.ts` (4): the flag provider is set up only for a signed-in user, and a failure is logged, as in
  core's `app.ts`.
- `standIns.test.ts` (4): `@grafana/ui/unstable` gives the copied `TableNG`; `core/config` gives the public `config`
  (`disableSanitizeHtml`); `defaultSparklineCellConfig` has core's values; the e2e selector values equal
  `@grafana/e2e-selectors`'.
- `styling/options.test.ts`, `styling/cellColors.test.ts`, `styling/tableColors.test.tsx` (97): Text color and Background
  color ("Plugin addition: Text color and Background color").
- `featureFlags.test.tsx` (the scaffold's) and `buildConfig.test.ts` (the build, and the built `module.js` asks Grafana for
  no `/unstable` or `/internal` entry point).

### End to end (`tests/`, against the dev server, `npx playwright test --workers=1`)

- **`parity.spec.ts`** (helpers in `parity.ts`), on `provisioning/dashboards/parity.json` and its swapped twin
  `parity-swapped.json`, both generated by `scripts/generate-parity-dashboard.mjs` (core above the plugin in the first,
  the other way round in the second; same query, transformations, options and field config; panels looked up by title,
  never by id). 74 cases: defaults (a small frame, wider than the panel, 200 rows, scrolled to the bottom); every cell type
  with its options (coloured text, background basic and gradient, applied to the row, data links, gauge basic, gradient
  and lcd with the value as colour, text and hidden, sparklines from per-row frames and number arrays, JSON view, pills from
  mappings, a fixed colour and the string hash, several per cell with a transparent mapping, markdown sanitised and with
  dynamic height, images from `data:` URIs, actions, geo points and a line built by the spatial transformation); colours
  (text and transparent base steps, value, range, regex and special mappings, a continuous scheme, hex colours, the
  community form, hex fills for the hand-computed values); layout (cell heights, max row height, wrapped text and header,
  alignment, widths, hidden column, hidden header, type icons, one and two frozen columns, a thin space in display names);
  footer (one reducer, per field, count of all rows, a legacy footer migrated on load, a known sum and mean); pagination;
  tooltip from field in each placement; styling from field; cell inspect; column filter; nested frames collapsed and all
  expanded with nested-scope overrides, and from `parentRowIndex` frames; the frame picker on frame 1 and 2; sorting
  (string, number, two columns); no value, no rows, no data, a not-sortable field from the data; a transparent panel;
  20 columns × 2,000 rows; the same table at two widths. No case depends on "now" (fixed UTC times, no time-relative
  units). Per case, theme (light, dark, and each after a live switch) and pixel ratio (1 and 2): every element of both
  panels with its sorted attributes and text, with the ids React generates (`_r_<n>_`, in any attribute: ids, the
  attributes that refer to them, a drag-and-drop context id) mapped to placeholders by first occurrence, other values
  compared as they are (compared at the same page position on the twin, and core with plugin on the same
  dashboard, where React's ids certainly differ); byte-compared element screenshots at the same page position (panel
  frames squared off); sparkline canvases by size and FNV hash; at least 5 % painted in CSS pixels (the no-rows and
  no-data cases on their message, which the case must show); a row drawn; pointer off and focus cleared before each
  capture; fonts, icons and images awaited and captures repeated until two in a row agree. `PARITY_CASES=<regex>` runs a
  subset; `PARITY_KEEP_IDS=1` compares ids unmapped (the negative control).
- **`interaction.spec.ts`** (15): sorting by clicks and a second column with the multi-sort key (rows and saved
  `sortBy`); column resize saving the same width override, and in a nested table with `scope: nested`; the filter popup
  (its HTML, search, a value, select all, clear); pagination (page and rows); cell inspect (text and code tabs, Monaco
  loaded); data links (one link's `href` and target, the menu of two and its HTML) and action buttons; ad hoc filters
  ("Filter for value" and "Filter out value" on a field the data marks filterable: the same `var-` URL state); nested rows
  by click and keyboard; tooltip from field in each placement (the tooltip's HTML) and pinning; a dashboard refresh keeping
  sort, filter and expanded rows; the frame picker saving `frameIndex: 1`; arrow keys and the focus style; the grid
  re-flowing alike when the page narrows; geo cells' WKT text with OpenLayers loaded from the plugin's lazy chunk under
  `public/plugins/pjan-table-panel/`. Popups are compared with their placement styles (`top`, `left`, `transform`, …) left
  out.
- **`handComputed.spec.ts`** (3), values computed by hand from Grafana's rules, in both panels: on `#fade2a` the text is
  `rgb(32, 34, 38)` (brightness 209.852 > 180; contrast 11.79:1), on `#1f60c4` `rgb(247, 248, 250)` (87.965; 5.60:1); the
  gradients `linear-gradient(120deg, rgb(24, 64, 152), …)` (dark) and `rgb(41, 97, 221)` (light) for `#1f60c4`, and
  `rgb(235, 224, 6)` / `rgb(251, 242, 77)` for `#fade2a` (tinycolor darken 10 × 1 or × −0.7, spin 5°); the footer of
  10, 20, 30 and 41 ms: Total "101 ms", Mean "25.3 ms".
- **`savedJson.spec.ts`** (13): a new Table plus panel saves what a new core Table panel saves; opening the editor writes
  nothing (3 s); converting by `type` keeps three cases' settings, and in a v2 dashboard by `vizConfig.group` (with a
  nested-scope override); the load migration with no `pluginVersion`, `13.2.3` and the plugin's own (see "The load
  migration and `pluginVersion`"); the editor switch (see "Panel type switch"). Dashboards created through the API are
  deleted afterwards.
- **`featureFlags.spec.ts`, `featureFlagsServer.spec.ts`** (helpers in `featureFlags.ts`, dashboard
  `feature-flags.json`): the two table flags, now against the real panel: with nothing set, with localStorage overrides,
  with a server value answered 3 s late, and localStorage before the server, core and plugin alike in their drawing
  (page size 2 only with `table.paginationPageSize`; content-aware column widths only with `table.autoColumnWidths`,
  the plugin's widths equal to core's), in their editors ("Page size" shown only with the flag) and in core's own client.
- **`styling.spec.ts`** (157 with its setup: 26 tests × light, dark and dark after a live switch from light × pixel ratio
  1 and 2), on `provisioning/dashboards/styling.json` (generated by `scripts/generate-styling-dashboard.mjs`): 25 cases,
  each core's table, Table plus with nothing set and Table plus with the case's styling side by side (same data and
  field config; Atlas's pattern: cell types by override, the styling once in the field defaults; `minWidth` 70 so every
  column fits). Cases: Text color Automatic, Value, Stronger and Fixed on Colored background basic and gradient;
  Background color Soft and Fixed on basic, Soft (variant B) and Fixed (ignored) on gradient, Softer with Text Stronger;
  Apply to entire row with Text color, and with Background color on a gradient row (the unset rule) and Colored text on
  it; pills (mapped, Automatic and Stronger; string hash); Colored text Automatic and Stronger, and on a transparent
  panel; hex colours (two near a hue, one near none); Green-Yellow-Red by value (Soft basic and gradient, Stronger
  Colored text); a nested table with nested-scope overrides; Tooltip from field; an override on one column. Per case:
  nothing set has core's elements (every attribute, inline styles included, React's ids mapped) and core's pixel at
  every non-gradient cell; each set cell's (and pill's) inline colours are what the rules give for core's colour of the
  same cell, worked out in the spec with `@pjan/grafana-styling` from the column's cell type and styling as saved, at the
  cell's drawn font size and weight (14 px, pills 12 px); a basic fill also in the screenshot's pixel; some cells also
  against hand-computed colours (job tmp `table-plan/build1/oracle_e2e.py`, without a live switch: core keeps the first
  theme's value colours until a refresh); set differs from core where the option applies (Fixed on gradient cells:
  equal); on a transparent panel the grid's background pixel is the canvas. One more test hovers Tooltip from field on
  a transparent panel: the tooltip's Colored text is measured against the tooltip's background.
- **`stylingEditor.spec.ts`** (6): Background color and Text color right after Cell type and before Cell value inspect,
  in the field defaults with Cell type Auto, with "As Grafana"; in the "Add override property" menu after Cell type; a
  value set in the field defaults saved and drawn, cleared to no key and no `styling`; an override saved as
  `custom.styling.textColor` and cleared to a property without a value; opening the editor of a styled panel writes
  nothing (3 s); defaults and an override survive saving the dashboard (the editor's Save) and loading it again.
- **`optionsEditor.spec.ts`** (2): core's and the plugin's panel editors on a case without options: the same option
  groups in the same order, and in them the same options (panel, table, cell and standard options; the plugin's own two
  right after Cell type, then core's), each with the same elements (labels, descriptions, editors; React's ids mapped) and input values (the defaults); the Cell type editor's
  choices. Waits for the preview's data first (a unit set in the data adds a "pre-configured" note to Unit). With a
  label changed in the copied `addTableCustomPanelOptions.ts` ("Frozen columns"), the first test fails.
- **`panel.spec.ts`**: the scaffold's smoke tests, for the ported panel.

### Test runs

What has passed, on Grafana 13.2.3 OSS (the dev server of `docker-compose.yaml`), with one browser
(`npx playwright test --workers=1`), on a loaded machine (load average about 100 to 130):

- **2026-10-11, commit `048ead5` (the build 1 review's fixes): `styling.spec.ts`, `stylingEditor.spec.ts`,
  `optionsEditor.spec.ts` and `parity.spec.ts`, 173 of 173 tests passed** in 28.3 minutes at the first run (157 styling
  with the login setup, 6 editor, 2 options-editor, 9 parity: the full matrix with nothing set). Root checks on the same
  code: typecheck, lint (no errors), build, copy check (OK), `test:scripts` 47 of 47, `test:dist` passed, `npm test`
  passed in every workspace (this plugin 965 passed, 13 skipped, 1 todo; `@pjan/grafana-styling` 146). In the browser (a
  one-off probe, 2026-10-11): after a live switch from light to dark and a dashboard refresh, core's Green-Yellow-Red
  column still draws light's colours (green `rgb(86, 166, 75)` at 0), the same with the styled Table plus panels on the
  page and with the core panel alone (`viewPanel`): the plugin's `getColors` calls don't change what core draws; the
  styled panel shades from dark's stops.
- **2026-10-10, commit `c8dfa2c` (Text color and Background color; the docs commit after it changes only Markdown): the
  full suite, 210 of 210 tests passed** in 30.7 minutes, at the first run, without reruns (load average about 120 falling
  to 30): the 48 of the port (parity with nothing set, interaction, hand-computed, saved JSON, feature flags, the
  options editor with the two new options, smoke tests, the login setup) plus 156 `styling.spec.ts` tests and 6
  `stylingEditor.spec.ts` tests. Before it, on the way: `styling.spec.ts` alone, 145 of 157 at the first full run, the 12
  failures all in "dark, switched live from light" on the hand-computed colours (core keeps the first theme's value
  colours until a refresh, so those colours don't apply there; the spec now checks them only without a live switch),
  then 53 of 53 for that theme state. Root checks on the same code: `npm run typecheck`, `npm run lint` (no errors) and
  `npm run build` passed; `npm run check:upstream-copies` OK (334 copies); `npm run test:scripts` 47 of 47;
  `npm run test:dist` passed; `npm test` passed in every workspace at the first run (this plugin 53 suites, 961 passed,
  13 skipped, 1 todo; `@pjan/grafana-styling` 140).
- **2026-10-05, commit `8f31808` (the tests and code of the port; the docs commit after it changes only Markdown): the
  full suite, 46 of 46 tests passed** in 27.1 minutes, at the first run, without reruns: 8 parity tests (74 cases each:
  light, dark and both live switches, at pixel ratio 1 and 2; 592 case comparisons), 15 interaction tests, 3
  hand-computed tests, 13 saved-JSON tests, 4 feature-flag tests, 2 smoke tests and the login setup.
- **2026-10-05, commit `705f0fb` (the review fixes; the commit after it changes only this file): the full suite, 48 of
  48 tests passed** in 32.0 minutes, at the first run, without reruns (load average about 120 to 150): the 46 above plus
  the 2 options-editor tests. Root checks on the same commit: `npm run typecheck`, `npm run lint` (no errors) and
  `npm run build` passed; `npm run test:dist` passed; `npm run check:upstream-copies` OK (334 copies);
  `npm run test:scripts` 47 of 47; `npm test` passed in every workspace (this plugin 864 passed, 13 skipped, 1 todo). A
  first `npm test` on the review fixes, at load average about 190, failed only on timeouts in the copied
  `AnnotationsPlugin.test.tsx` of State timeline plus (1 test) and Time series plus (5 tests); each file alone then
  passed (86 of 86 + 2 todo), and the rerun of the whole `npm test` passed.
- Before it, on the way (same day): the parity matrix on the first 72 cases passed in full (9 of 9, 21.1 minutes); the
  interaction, saved-JSON and flag specs were brought to pass one by one (test fixes only: waits for re-renders, Monaco
  and icons, the tooltip's fade-out, the pagination label at the panel's width, `field.config.filterable` from the data
  for the ad hoc filter buttons, the expectations of the load migration per `pluginVersion`).
- Root checks on the same code: `npm run typecheck`, `npm run lint` (no errors; 21 deprecation warnings in this plugin)
  and `npm run build` passed; `npm run check:upstream-copies` OK (4 plugins, 334 copies); `npm run test:scripts` 47 of
  47; `npm test`: this plugin 49 suites, 860 passed, 13 skipped (upstream's `describe.skip` performance benchmarks of
  `renderers.test.tsx`), 1 todo; the shared packages, Stat plus and Time series plus passed; State timeline plus 578 of
  579 (+ 3 todo): its copied `AnnotationsPlugin.test.tsx` "editing & deleting › edit" hit Jest's timeout under that load,
  and the file alone then passed (86 of 86 + 2 todo).
- Verified along the way (the plan's "Not verified" list): Emotion and grid class names are the same in core and the
  plugin (every case's elements compare equal); Grafana's copy of the grid CSS (in its app stylesheet) and the plugin's
  (an inline style tag) are both loaded on a dashboard with both panels (harmless by construction: the same version and
  class names; both copies apply to both panels, so the suite can't tell them apart); OpenLayers loads lazily from
  the plugin's chunk under `public/plugins/pjan-table-panel/`, and the plugin's bundled `ol` 10.7.0 formats geometries
  built by core's `ol` (the spatial transformation's points and line: same WKT text); the "Spatial operations"
  transformation works from dashboard JSON on Grafana OSS 13.2.3 without a feature toggle; TestData raw frames give
  nested frames through the "Group to nested tables" transformation and `parentRowIndex` frames; the two OpenFeature
  flags change core's and the plugin's drawing and editor alike when on. Not run: public dashboards, rendering cost
  beyond the 20 × 2,000 case drawing alike, the shared crosshair (`tableSharedCrosshair`, copied, off by default and not
  covered by a test), anonymous viewers.

### Negative controls

Each behaviour below was broken on purpose and the named tests failed; then the code was restored (and the plugin
rebuilt) and they passed (2026-10-05, `npx playwright test --workers=1` on the named tests):

| Broken on purpose                                                                                                                 | Run                                                                                              | Result                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Copied `Cells/PillCell.tsx` styles: the pill padding `theme.spacing(0.25, 0.75)` → `(0.25, 1)`                                    | `parity.spec.ts`, light, pixel ratio 1, `PARITY_CASES=pill`                                      | all 4 pill cases fail (about 2,000 to 3,300 pixels differ, and the pill's Emotion class)                                                                                                                                                                                                                                                                                                         |
| Copied `TableNG/utils.ts`: `CELL_COLOR_DARKENING_MULTIPLIER` 10 → 11                                                              | `parity.spec.ts` (light, ratio 1) on the 8 coloured-background cases, and `handComputed.spec.ts` | the 4 cases with gradient cells fail (gradient, gradient applied to the row, the community form, the hex fills); the 4 basic ones pass, as expected; both hand-computed colour tests fail on the plugin (`rgb(251, 242, 80)` for the computed `rgb(251, 242, 77)` in light mode, `rgb(230, 219, 5)` for `rgb(235, 224, 6)` in dark) after core passed them                                       |
| Copied `components/HeaderCell.tsx`: an extra attribute on the header's button (`data-negative-control=""`)                        | `parity.spec.ts`, light, pixel ratio 1, all 74 cases                                             | 73 cases fail on the elements; only "no data: no frames" passes, because it draws no grid (so no header button). "layout: header hidden" fails too: with Show table header off, the grid still renders its header cells                                                                                                                                                                          |
| The id mapping off (`PARITY_KEEP_IDS=1`; only the panel content element's own id, which Grafana's panel frame sets, still mapped) | `parity.spec.ts`, light, pixel ratio 1, all 74 cases                                             | exactly 5 cases fail, on the comparison of core with plugin on the same dashboard: the three nested-frame cases (`TableNested`'s `useId`: `aria-controls="_r_l0_-nested-table-0"` against `_r_l1_`) and the two frame-picker cases (Grafana's Combobox). With the panel content's id unmapped too, all 74 fail. The comparison at the same position on the twin passed even unmapped (see below) |

`src/pjan/panelChangedHandler.ts`, each restore removed (Jest: `panelChangedHandler.test.ts`; end to end:
`savedJson.spec.ts -g switching`, the 6 editor switches):

| Removed                                     | Jest (15 tests)                                                                                          | End to end (6 tests)                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaults.custom` restore                   | 8 fail ("restores the custom field config …" and the 7 colour tests: field config not core's)            | 6 of 6 fail                                                                                                                                    |
| the override rules restore                  | 8 fail ("restores the custom override properties …, nested-scope rules included" and the 7 colour tests) | 6 of 6 fail                                                                                                                                    |
| `defaults.color` set from core's            | 3 fail (classic palette, by name, shades: the modes Grafana adapts)                                      | the 2 classic palette switches fail                                                                                                            |
| `defaults.color` removed when core has none | 1 fails ("leaves the colour unset when core had none")                                                   | the 2 "no colour mode" switches fail (a first run also timed out in 2 others on a machine at load average 129; the rerun failed exactly the 2) |
| `markFieldConfigChanged`                    | 2 fail (both "has the panel apply its field config again …")                                             | the 3 switches with the module already loaded fail; the 3 others pass, as expected                                                             |
| the options returned (`{}`)                 | 2 fail ("keeps every option …", "leaves the field config alone …")                                       | 6 of 6 fail                                                                                                                                    |

`fieldOptionKeys.test.ts` carries its own control ("would catch one that does": a `custom.sortable` option is reported,
`custom.styling.*` isn't).

More controls (2026-10-05, after the review):

| Broken on purpose                                                                                     | Run                                            | Result                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/interaction.spec.ts`, "refresh keeps …": the click on the refresh button left out              | that test                                      | fails: no panel gets a new request                                                                                                                                           |
| Copied `addTableCustomPanelOptions.ts`: the label "Frozen columns" → "Frozen columnz"                 | `optionsEditor.spec.ts`                        | the options test fails; the Cell type choices test passes, as expected                                                                                                       |
| `src/pjan/initFeatureFlags.ts`: the signed-in check removed                                           | `initFeatureFlags.test.ts`                     | the two signed-out tests fail                                                                                                                                                |
| `parity.json` (both dashboards): one image of "cell type image from data URIs" a broken `data:` image | `parity.spec.ts`, light, ratio 1, that case    | passes: the copied `ImageCell` shows the alt text instead of a failed image (`onError`), so no broken `<img>` is left to catch. The `naturalWidth` check guards other images |
| The id mapping off (`PARITY_KEEP_IDS=1`), with only React's `_r_<n>_` ids mapped (since the review)   | `parity.spec.ts`, light, ratio 1, all 74 cases | the same 5 cases as before fail (3 nested, 2 frame picker)                                                                                                                   |

**What the id control showed:** React's `useId` (the nested tables' row ids, Grafana's Combobox) differs between two
panels on the same dashboard, but at the same position on the twin dashboard it was the same in every case (the ids
follow the order in which the panels mount, which is the same on both dashboards). So the suite compares the HTML of core
and plugin on the same dashboard as well, where the ids certainly differ, and that is the comparison the mapping is
needed for (review 1, M2).

## Re-syncing to a newer tag

`scripts/resync-upstream.mjs` (repository root, `scripts/README.md`) re-syncs the copies of every plugin at once: it
re-copies those that differ from upstream only by the import rewrites, and merges the upstream changes into the others
(a 3-way merge), which then need a review. Per plugin, by hand: re-run the dependency closure from
`public/app/plugins/panel/table/module.tsx` at the new tag, entering `TableNG` through `@grafana/ui/unstable`; re-derive
the relative imports out of `Table/` and update the stand-ins under "Relative-path stand-ins" (names checked against the
new `@grafana/ui` `index.d.ts`); check the names imported from `packages/grafana-*/internal`, the table flags in
`openfeature.gen.ts` and how core initialises OpenFeature (`internal/openFeature/index.ts`), and the
`@openfeature/web-sdk` and `@openfeature/core` versions in the new `yarn.lock`; check the upstream tests that are not portable (the table under "Tests") and new ones; check that `ts-jest`, the
`jest-fail-on-console` behaviour and the `react-inlinesvg` mock still match grafana/grafana's Jest setup; bump `@grafana/*`
and the bundled dependency versions (`package.json`, from the new `yarn.lock`: the grid, `ol` and the rest) and
`grafana_version` in `docker-compose.yaml`; regenerate the parity dashboards if cases change
(`node scripts/generate-parity-dashboard.mjs`); then run `npm run check:upstream-copies`, the four checks and
`npx playwright test --workers=1`.

**`pluginVersion`:** core Table has a load migration handler (`tableMigrationHandler`) that runs whenever the saved
`pluginVersion` differs from the running one; in 13.2.3 its steps are idempotent and compare no versions. At each
re-sync, **re-check that the load migration still compares no versions** (`migrations.ts`, `tableMigrationHandler` and
its steps) and that scenes still runs it only when the versions differ (`VizPanel._pluginLoaded`): with a version
comparison, a saved `1.x` would read as an old Grafana version. `tests/savedJson.spec.ts` covers the three cases.

## Files

Every copy, by its plugin path (the upstream path is the same path under `public/app/` or `packages/`), with the
`Changes:` text of its header. Generated from the headers; `npm run check:upstream-copies` reads the same files.

### Runtime code (AGPL-3.0, from public/app) — 27 files, 2730 lines

| File                                                                 | Changes                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/actions/analytics.ts`                                  | imports only.                                                                                                                                                                                                                                                       |
| `src/features/actions/utils.ts`                                      | imports only.                                                                                                                                                                                                                                                       |
| `src/features/alerting/unified/utils/url.ts`                         | imports only.                                                                                                                                                                                                                                                       |
| `src/features/panel/table/addTableCustomConfig.ts`                   | none.                                                                                                                                                                                                                                                               |
| `src/features/panel/table/addTableCustomPanelOptions.ts`             | imports only.                                                                                                                                                                                                                                                       |
| `src/features/panel/table/PaginationEditor.tsx`                      | imports only.                                                                                                                                                                                                                                                       |
| `src/features/query/state/PanelQueryRunner.ts`                       | partial copy (getNextRequestId only; the request id counter is per bundle, so ids restart at Q100 in this plugin).                                                                                                                                                  |
| `src/features/table/hooks.ts`                                        | imports only.                                                                                                                                                                                                                                                       |
| `src/features/table/utils.ts`                                        | imports only.                                                                                                                                                                                                                                                       |
| `src/plugins/panel/canvas/panelcfg.gen.ts`                           | imports only.                                                                                                                                                                                                                                                       |
| `src/plugins/panel/table/cells/BarGaugeCellOptionsEditor.tsx`        | none.                                                                                                                                                                                                                                                               |
| `src/plugins/panel/table/cells/ColorBackgroundCellOptionsEditor.tsx` | imports only.                                                                                                                                                                                                                                                       |
| `src/plugins/panel/table/cells/ImageCellOptionsEditor.tsx`           | none.                                                                                                                                                                                                                                                               |
| `src/plugins/panel/table/cells/MarkdownCellOptionsEditor.tsx`        | none.                                                                                                                                                                                                                                                               |
| `src/plugins/panel/table/cells/SparklineCellOptionsEditor.tsx`       | imports only.                                                                                                                                                                                                                                                       |
| `src/plugins/panel/table/migrations.ts`                              | imports only.                                                                                                                                                                                                                                                       |
| `src/plugins/panel/table/module.tsx`                                 | imports; setPanelChangeHandler(panelChangedHandler from src/pjan/, which keeps options and field config when switching from core table and otherwise calls tablePanelChangedHandler); panel suggestions (setSuggestionsSupplier/tableSuggestionsSupplier) left off. |
| `src/plugins/panel/table/panelcfg.gen.ts`                            | none.                                                                                                                                                                                                                                                               |
| `src/plugins/panel/table/suggestions.ts`                             | none.                                                                                                                                                                                                                                                               |
| `src/plugins/panel/table/TableCellOptionEditor.tsx`                  | none.                                                                                                                                                                                                                                                               |
| `src/plugins/panel/table/TablePanel.tsx`                             | imports; onFieldConfigChange to useApplyFieldConfigChangedInPlace from @pjan/grafana-panel-utils (applies the field config again after the panel-change handler restored it in place).                                                                              |
| `src/plugins/panel/timeseries/config.ts`                             | imports only.                                                                                                                                                                                                                                                       |
| `src/plugins/panel/timeseries/InsertNullsEditor.tsx`                 | imports only.                                                                                                                                                                                                                                                       |
| `src/plugins/panel/timeseries/LineStyleEditor.tsx`                   | imports only.                                                                                                                                                                                                                                                       |
| `src/plugins/panel/timeseries/NullsThresholdInput.tsx`               | imports only.                                                                                                                                                                                                                                                       |
| `src/plugins/panel/timeseries/SpanNullsEditor.tsx`                   | imports only.                                                                                                                                                                                                                                                       |
| `src/plugins/panel/timeseries/ThresholdsStyleEditor.tsx`             | imports only.                                                                                                                                                                                                                                                       |

### Runtime code (Apache-2.0, from packages/grafana-ui) — 42 files, 8696 lines

| File                                                                                        | Changes       |
| ------------------------------------------------------------------------------------------- | ------------- |
| `src/packages/grafana-ui/src/components/Actions/ActionButton.tsx`                           | none.         |
| `src/packages/grafana-ui/src/components/Table/cellUtils.ts`                                 | none.         |
| `src/packages/grafana-ui/src/components/Table/DataLinksActionsTooltip.tsx`                  | imports only. |
| `src/packages/grafana-ui/src/components/Table/filterExpression.ts`                          | none.         |
| `src/packages/grafana-ui/src/components/Table/geo/index.ts`                                 | none.         |
| `src/packages/grafana-ui/src/components/Table/geo/OpenLayersContext.ts`                     | none.         |
| `src/packages/grafana-ui/src/components/Table/geo/OpenLayersProvider.tsx`                   | none.         |
| `src/packages/grafana-ui/src/components/Table/geo/utils.ts`                                 | none.         |
| `src/packages/grafana-ui/src/components/Table/TableCellInspector.tsx`                       | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/Cells/ActionsCell.tsx`                | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/Cells/AutoCell.tsx`                   | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/Cells/BarGaugeCell.tsx`               | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/Cells/DataLinksCell.tsx`              | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/Cells/GeoCell.tsx`                    | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/Cells/ImageCell.tsx`                  | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/Cells/MarkdownCell.tsx`               | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/Cells/PillCell.tsx`                   | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/Cells/renderers.tsx`                  | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/Cells/SparklineCell.tsx`              | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/components/EmptyTablePlaceholder.tsx` | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/components/HeaderCell.tsx`            | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/components/MaybeWrapWithLink.tsx`     | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/components/RowExpander.tsx`           | imports only. |
| `src/packages/grafana-ui/src/components/Table/TableNG/components/SummaryCell.tsx`           | imports only. |
| `src/packages/grafana-ui/src/components/Table/TableNG/components/TableCellActions.tsx`      | imports only. |
| `src/packages/grafana-ui/src/components/Table/TableNG/components/TableCellTooltip.tsx`      | imports only. |
| `src/packages/grafana-ui/src/components/Table/TableNG/constants.ts`                         | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/Filter/Filter.tsx`                    | imports only. |
| `src/packages/grafana-ui/src/components/Table/TableNG/Filter/FilterList.tsx`                | imports only. |
| `src/packages/grafana-ui/src/components/Table/TableNG/Filter/FilterPopup.tsx`               | imports only. |
| `src/packages/grafana-ui/src/components/Table/TableNG/Filter/utils.ts`                      | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/hooks.ts`                             | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/render-hooks.tsx`                     | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/styles.ts`                            | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/TableDataGrid.tsx`                    | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/TableFlat.tsx`                        | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/TableNested.tsx`                      | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/TableNG.tsx`                          | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/types.ts`                             | none.         |
| `src/packages/grafana-ui/src/components/Table/TableNG/utils.ts`                             | none.         |
| `src/packages/grafana-ui/src/components/Table/TableRT/styles.ts`                            | none.         |
| `src/packages/grafana-ui/src/components/Table/types.ts`                                     | none.         |

### Tests (AGPL-3.0) — 17 files, 2660 lines

| File                                                                      | Changes                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/actions/utils.test.ts`                                      | imports; jest.mock for the TimeSrv stand-in; ./analytics mocked with jest.mock instead of jest.spyOn.                                                                                                                                                               |
| `src/features/alerting/unified/utils/url.test.ts`                         | imports only.                                                                                                                                                                                                                                                       |
| `src/features/table/hooks.test.tsx`                                       | imports only.                                                                                                                                                                                                                                                       |
| `src/features/table/utils.test.ts`                                        | imports only.                                                                                                                                                                                                                                                       |
| `src/plugins/panel/table/cells/BarGaugeCellOptionsEditor.test.tsx`        | none.                                                                                                                                                                                                                                                               |
| `src/plugins/panel/table/cells/ColorBackgroundCellOptionsEditor.test.tsx` | none.                                                                                                                                                                                                                                                               |
| `src/plugins/panel/table/cells/ImageCellOptionsEditor.test.tsx`           | none.                                                                                                                                                                                                                                                               |
| `src/plugins/panel/table/cells/MarkdownCellOptionsEditor.test.tsx`        | none.                                                                                                                                                                                                                                                               |
| `src/plugins/panel/table/cells/SparklineCellOptionsEditor.test.tsx`       | imports only.                                                                                                                                                                                                                                                       |
| `src/plugins/panel/table/migrations.test.ts`                              | none.                                                                                                                                                                                                                                                               |
| `src/plugins/panel/table/module.test.ts`                                  | imports; the panel-change handler is the plugin's (src/pjan/panelChangedHandler.ts, which calls tablePanelChangedHandler for other types); the suggestions supplier test removed (suggestions are left off; src/pjan/module.test.ts checks that), with its imports. |
| `src/plugins/panel/table/TableCellOptionEditor.test.tsx`                  | none.                                                                                                                                                                                                                                                               |
| `src/plugins/panel/timeseries/InsertNullsEditor.test.tsx`                 | imports only.                                                                                                                                                                                                                                                       |
| `src/plugins/panel/timeseries/LineStyleEditor.test.tsx`                   | imports only.                                                                                                                                                                                                                                                       |
| `src/plugins/panel/timeseries/NullsThresholdInput.test.tsx`               | imports only.                                                                                                                                                                                                                                                       |
| `src/plugins/panel/timeseries/SpanNullsEditor.test.tsx`                   | imports only.                                                                                                                                                                                                                                                       |
| `src/plugins/panel/timeseries/ThresholdsStyleEditor.test.tsx`             | none.                                                                                                                                                                                                                                                               |

### Tests and test helpers (Apache-2.0) — 28 files, 11169 lines

| File                                                                                             | Changes |
| ------------------------------------------------------------------------------------------------ | ------- |
| `src/packages/grafana-test-utils/src/jsdom.ts`                                                   | none.   |
| `src/packages/grafana-ui/src/components/Table/cellUtils.test.ts`                                 | none.   |
| `src/packages/grafana-ui/src/components/Table/DataLinksActionsTooltip.test.tsx`                  | none.   |
| `src/packages/grafana-ui/src/components/Table/filterExpression.test.ts`                          | none.   |
| `src/packages/grafana-ui/src/components/Table/geo/context.test.tsx`                              | none.   |
| `src/packages/grafana-ui/src/components/Table/geo/utils.test.ts`                                 | none.   |
| `src/packages/grafana-ui/src/components/Table/TableCellInspector.test.tsx`                       | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/__mocks__/uwrap.ts`                        | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/Cells/DataLinksCell.test.tsx`              | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/Cells/ImageCell.test.tsx`                  | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/Cells/PillCell.test.tsx`                   | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/Cells/renderers.test.tsx`                  | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/components/EmptyTablePlaceholder.test.tsx` | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/components/HeaderCell.test.tsx`            | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/components/MaybeWrapWithLink.test.tsx`     | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/components/RowExpander.test.tsx`           | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/components/SummaryCell.test.tsx`           | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/components/TableCellActions.test.tsx`      | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/components/TableCellTooltip.test.tsx`      | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/Filter/FilterList.test.tsx`                | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/Filter/FilterPopup.test.tsx`               | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/Filter/utils.test.ts`                      | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/hooks.test.ts`                             | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/render-hooks.test.tsx`                     | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/TableDataGrid.test.tsx`                    | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/TableNG.safari.test.tsx`                   | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/TableNG.test.tsx`                          | none.   |
| `src/packages/grafana-ui/src/components/Table/TableNG/utils.test.ts`                             | none.   |

### Jest snapshots (verbatim) — 3 files, 251 lines

| File                                                                                           | Changes                  |
| ---------------------------------------------------------------------------------------------- | ------------------------ |
| `src/packages/grafana-ui/src/components/Table/TableNG/__snapshots__/utils.test.ts.snap`        | verbatim (Jest snapshot) |
| `src/packages/grafana-ui/src/components/Table/TableNG/Filter/__snapshots__/utils.test.ts.snap` | verbatim (Jest snapshot) |
| `src/plugins/panel/table/__snapshots__/migrations.test.ts.snap`                                | verbatim (Jest snapshot) |
