# Upstream: Grafana core time series

This plugin is a port of Grafana's core **time series** panel (`timeseries`) from
[grafana/grafana](https://github.com/grafana/grafana) at tag **`v13.2.3`** (commit `6193dc0`, "Release: 13.2.3").
With nothing configured it is meant to look and behave like the core panel: same options, defaults, panel-change
migrations, presets, rendering, legend, tooltip, overlays (annotations, exemplars, the outside-range banner),
crosshair sync, drag to zoom and keyboard control. `tests/parity.spec.ts` compares it with the core panel (see
"Tests"). The plan is `plans/atlas-timeseries-panel.md` in pjan/atlas.

- Grafana core code (`public/app/...`) is AGPL-3.0, Copyright Grafana Labs, so this plugin is AGPL-3.0 (`LICENSE`).
  Grafana's `NOTICE.md` (v13.2.3) is kept as `NOTICE.md`.
- Code copied from Grafana's npm packages (`packages/grafana-*`) is Apache-2.0, Copyright Grafana Labs. Its license text
  is in `LICENSE_APACHE2` (copied from `packages/grafana-ui/LICENSE_APACHE2` at the same tag).
- `dist/` ships `LICENSE`, `LICENSE_APACHE2`, `NOTICE.md`, this file, and `THIRD_PARTY_NOTICES.txt` (generated at build
  time: name, version, licence and licence text of every npm package bundled into the chunks; see "Plugin build
  configuration").
- **Source offer (AGPL-3.0 section 13):** `src/plugin.json` (`info.links`, "Source code") and `src/README.md` point at
  `https://github.com/pjan/grafana-plugins`, the public repository each release is built from.

Every copied file starts with a one-line header:
`// Copied from grafana/grafana v13.2.3: <upstream path>. <license>. Changes: <...>.`
Plugin-authored replacements for core modules start with `// Plugin stand-in for ...` instead. Every change beyond the
import rewrites is marked `pjan-timeseries-panel:` in the code, except the changes shared unmarked with State timeline
plus's identical copies (the last row of "Changes beyond import rewrites": `TimeSeriesTooltip.tsx` without the Grafana
Assistant button, `TimeSeries/utils.ts` and `AnnotationEditor.tsx` without their lint comments,
`CanvasControlsSwitchEditor.tsx`'s import, and the shared partial copies), which State timeline plus made unmarked and
`scripts/check-upstream-copies.mjs` requires to stay identical. Removals in a copy listed under "Copies with marked
changes" leave a marked line where they were. Partial copies (only some declarations of a file) say so in their header
and are not marked.

## Layout

Copied files mirror their upstream path under `src/`:

- `public/app/<path>` is copied to `src/<path>`.
- `packages/grafana-<pkg>/src/<path>` is copied to `src/packages/grafana-<pkg>/src/<path>`.
- `src/packages/grafana-{ui,data,runtime}/internal.ts` and `src/packages/grafana-e2e-selectors/index.ts` stand in for
  package entry points that a plugin cannot use at runtime (see below).
- `src/pjan/` is plugin-authored code (not from grafana/grafana): the panel-change handler (`panelChangedHandler.ts`,
  with `fieldConfigRefresh.ts`) and the plugin's own tests. It gets the scaffold's normal lint rules (see "Plugin build
  configuration"). The colour helpers shared with the other plugins of the repository are in the workspace package
  `@pjan/grafana-styling` (`packages/grafana-styling/`, Apache-2.0, bundled from source); this version doesn't use them
  yet (the opt-in additions will).
- `src/module.ts` is the plugin entry: it initialises `@grafana/i18n` for this plugin and re-exports `plugin` from
  `src/plugins/panel/timeseries/module.tsx`.
- `src/img/icn-timeseries-panel.svg` is core's `public/app/plugins/panel/timeseries/img/icn-timeseries-panel.svg` (the
  panel logo).

Non-relative imports such as `core/components/...` resolve from `src/` (scaffold `baseUrl`/`paths` in
`.config/tsconfig.json`, `resolve.modules` in webpack, `modulePaths` in Jest).

## Import rewrites (mechanical, applied to every copied file)

The same rewrites as State timeline plus, which `scripts/resync-upstream.mjs` applies when it re-syncs:

| Upstream import                                  | Plugin import                         | Why                                                                                                                            |
| ------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `'app/<path>'`                                   | `'<path>'`                            | Same file, resolved from `src/`.                                                                                               |
| `'@grafana/ui/internal'`                         | `'packages/grafana-ui/internal'`      | `/internal` is not shared with plugins at runtime.                                                                             |
| `'@grafana/data/internal'`                       | `'packages/grafana-data/internal'`    | Same.                                                                                                                          |
| `'@grafana/runtime/internal'`                    | `'packages/grafana-runtime/internal'` | Same.                                                                                                                          |
| `'@grafana/e2e-selectors'` (non-test files only) | `'packages/grafana-e2e-selectors'`    | Avoids bundling the package and `semver` for four `data-testid` strings. Tests keep the real package, which cross-checks them. |

One non-mechanical import change, as in State timeline plus: `src/features/panel/options/builder/CanvasControlsSwitchEditor.tsx`
imports `AnnotationDisplayOptions`/`VizAnnotations` from `'@grafana/schema'` instead of
`'@grafana/schema/dist/esm/common/common.gen'` (the deep path is not in the package's `exports` map; same types).

## Stand-ins for internal entry points

`src/packages/grafana-ui/internal.ts` (`@grafana/ui/internal`): State timeline plus's stand-in, and three more names.

- Re-exported from public `@grafana/ui` (same implementation as the internal export): `UPlotChart`,
  `UPlotConfigBuilder`, `UPlotConfigPrepFn`, and `PlotLegend` (new).
- Types derived from public signatures: `AxisProps`, `ScaleProps`, `Renderers`.
- Copied (Apache-2.0): `TimeRange2`, `TooltipHoverMode` (literal constants `{ xOne: 0, xAll: 1, xyOne: 2 }`, see State
  timeline plus), `FILTER_FOR_OPERATOR`/`FILTER_OUT_OPERATOR`, `buildScaleKey`, `pluginLog`/`preparePlotData2`/
  `getStackingGroups`, `getScaleGradientFn`, and (new) `hasVisibleLegendSeries` (partial copy of
  `components/uPlot/PlotLegend.tsx`) and `optsWithHideZeros` (partial copy of `options/builder/tooltip.tsx`).

`src/packages/grafana-data/internal.ts` (`@grafana/data/internal`): the same names as State timeline plus's
(`nullToUndefThreshold`, `NULL_REMOVE`/`NULL_RETAIN`/`NULL_EXPAND`/`maybeSortFrame` from the partial copy of
`joinDataFrames.ts`, and `convertFieldType` over the public `ensureTimeField`), with this plugin's id in the error
message of `convertFieldType` for conversions other than to time (which the copied code never asks for).

`src/packages/grafana-runtime/internal.ts` (`@grafana/runtime/internal`): State timeline plus's stand-in, unchanged
(`FlagKeys`, `getFeatureFlagClient()` returning each flag's default). Time series calls `getFilterByGroupedLabels` with
`checkFilterablePanelsFlag: false`, so the flag isn't even read: the tooltip's group-by filter buttons behave exactly as
in core.

`src/packages/grafana-e2e-selectors/index.ts`: the resolved v13.2.3 strings of `selectors.pages.Dashboard.Annotations`
(`tooltip`, `marker`, `clusterTooltip`) and `selectors.components.DataSource.Prometheus.exemplarMarker`
(`data-testid Exemplar marker`, new).

## Stand-ins and partial copies for core app modules

| Upstream module                                          | Plugin file                                       | What it does instead                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/app/core/app_events.ts`                          | `src/core/app_events.ts`                          | State timeline plus's stand-in: `appEvents.emit(event, payload)` as `getAppEvents().publish(...)` on the bus core shares with plugins (action toasts).                                                                                                                                                                                                |
| `public/app/features/dashboard/services/TimeSrv.ts`      | `src/features/dashboard/services/TimeSrv.ts`      | State timeline plus's stand-in: `getTimeSrv().timeRange()` from `${__from}`/`${__to}` (Infinity proxy actions).                                                                                                                                                                                                                                       |
| `public/app/features/dashboard/services/DashboardSrv.ts` | `src/features/dashboard/services/DashboardSrv.ts` | New. `getDashboardSrv().getCurrent()` always returns `undefined`: core's current `DashboardModel` is not available to plugins. Only `suggestions.ts` `getPrepareTimeseriesSuggestion` uses it, so long data shows core's message ("Long data must be converted to wide") without the "Transform to wide time series format" button (plan decision 5). |
| `public/app/features/annotations/api.ts`                 | same path                                         | State timeline plus's partial copy: `annotationServer().tags()` only (the annotation editor's tag picker).                                                                                                                                                                                                                                            |
| `public/app/features/query/state/PanelQueryRunner.ts`    | same path                                         | State timeline plus's partial copy: `getNextRequestId()` only.                                                                                                                                                                                                                                                                                        |
| `public/app/features/panel/suggestions/utils.ts`         | same path                                         | New partial copy: `SUGGESTIONS_LEGEND_OPTIONS` only (the preset cards' legend).                                                                                                                                                                                                                                                                       |
| `public/app/core/utils/timeRegions.ts`                   | same path                                         | New partial copy: the `TimeRegionMode` and `TimeRegionConfig` types only (`migrations.ts` and the grafana data source types); the time region calculation and its `croner` import are left off.                                                                                                                                                       |
| `public/app/plugins/datasource/grafana/types.ts`         | same path                                         | New partial copy: `GrafanaQueryType`, `GrafanaQuery` and `GrafanaQueryFile`, which `migrations.ts` uses to convert the Graph panel's time regions; `GrafanaQuery`'s `search` and `searchNext` fields are left off (marked): their `SearchQuery` type (`app/features/search/service/types.ts`) needs Grafana's private `@grafana/api-clients`.         |
| `public/app/plugins/panel/timeseries/suggestions.ts`     | same path                                         | Partial copy: `TIMESERIES_CARD_OPTIONS` (with `MAX_PREVIEW_SERIES`), which `presets.ts` uses, and `getPrepareTimeseriesSuggestion` (with the `DashboardSrv` stand-in). The suggestions supplier is left off.                                                                                                                                          |

## Changes beyond import rewrites

| File                                                                                                                                                                                                                                                                                                                                                    | Change                                                                                                                                                                                                                                        | Reason                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugins/panel/timeseries/module.tsx`                                                                                                                                                                                                                                                                                                                   | `.setPanelChangeHandler(panelChangedHandler)` from `src/pjan/panelChangedHandler.ts` instead of `graphPanelChangedHandler`; its import replaces those of `graphPanelChangedHandler` and `timeseriesSuggestionsSupplier` (marked).             | Switching a core `timeseries` panel to this plugin in the panel editor keeps everything; any other previous panel type goes to core's `graphPanelChangedHandler` unchanged. See "Panel type switch".                                                                                                                                                                                                      |
| `plugins/panel/timeseries/module.tsx`                                                                                                                                                                                                                                                                                                                   | `.setSuggestionsSupplier(timeseriesSuggestionsSupplier)` left off (a marked line where it was).                                                                                                                                               | Deliberate, see "Pruned and left off".                                                                                                                                                                                                                                                                                                                                                                    |
| `plugins/panel/timeseries/TimeSeriesPanel.tsx`                                                                                                                                                                                                                                                                                                          | Takes `onFieldConfigChange` from its props and calls `useApplyFieldConfigChangedInPlace(fieldConfig, onFieldConfigChange)` from `src/pjan/fieldConfigRefresh.ts` (marked).                                                                    | After the panel-change handler restored the field config in place, the panel applies it again; see "Panel type switch". Does nothing otherwise.                                                                                                                                                                                                                                                           |
| `plugins/panel/timeseries/TimeSeriesPanel.tsx`                                                                                                                                                                                                                                                                                                          | The `assistantContext` prop of `TimeSeriesTooltip`, the `getAssistantTooltipContext` import and the `title` prop (only the Assistant context used it) removed (marked lines where they were).                                                 | Grafana Assistant button pruned, as State timeline plus did in `TimeSeriesTooltip.tsx` (which this plugin shares unchanged).                                                                                                                                                                                                                                                                              |
| `plugins/panel/timeseries/migrations.ts`                                                                                                                                                                                                                                                                                                                | `addAnnotationsToDashboard` does nothing (marked); the imports only it used (`DashboardSrv`, `TimeSrv`, `DashboardAnnotationsDataLayer`, `DashboardScene`, `dashboardSceneGraph`) and its `dashboardRefreshDebouncer` removed (marked lines). | Plan decision 6. Upstream adds a Graph panel's time regions to the current dashboard as annotation layers, through scenes or `DashboardSrv`, which plugins can't reach. The branch that calls it (an Angular `graph` panel) is unreachable in a plugin: Grafana auto-migrates old graph panels to core `timeseries`, never to a plugin. The conversion itself (`graphToTimeseriesOptions`) is upstream's. |
| `plugins/datasource/grafana/types.ts`                                                                                                                                                                                                                                                                                                                   | Partial copy; `GrafanaQuery`'s `search` and `searchNext` fields left off (marked).                                                                                                                                                            | See "Stand-ins and partial copies for core app modules".                                                                                                                                                                                                                                                                                                                                                  |
| `plugins/panel/timeseries/suggestions.ts`, `features/panel/suggestions/utils.ts`, `core/utils/timeRegions.ts`, `packages/grafana-ui/src/components/uPlot/PlotLegend.tsx`, `packages/grafana-ui/src/options/builder/tooltip.tsx`                                                                                                                         | Partial copies (headers say which declarations); the two package copies import from the public `@grafana/*` APIs.                                                                                                                             | Copy only what is used.                                                                                                                                                                                                                                                                                                                                                                                   |
| `packages/grafana-ui/src/components/uPlot/utils.ts`                                                                                                                                                                                                                                                                                                     | State timeline plus's partial copy, with its `StackDirection` constants marked with this plugin's id (`scripts/README.md`: a change every plugin needs in a shared file is marked in each).                                                   | As in State timeline plus.                                                                                                                                                                                                                                                                                                                                                                                |
| The other shared copies (`TimeSeries/utils.ts` and `AnnotationEditor.tsx` without two lint comments, `CanvasControlsSwitchEditor.tsx`'s import, `TimeSeriesTooltip.tsx` without the Assistant button, the partial copies `annotations/api.ts`, `PanelQueryRunner.ts`, `joinDataFrames.ts`, `gradientFills.ts` and `uPlot/internal.ts`'s public imports) | Identical to State timeline plus's copies (checked by `scripts/check-upstream-copies.mjs`); see the "Changes" column in "Files".                                                                                                              | Shared code (plan decision 2, option C).                                                                                                                                                                                                                                                                                                                                                                  |

Nothing else in the copied files differs from upstream: the other new copies (`TimeSeries.tsx`, `presets.ts`,
`panelcfg.gen.ts`, `TimezonesEditor.tsx`, `ExemplarsPlugin.tsx`, `ExemplarMarker.tsx`, `ExemplarTooltip.tsx`,
`CloseButton.tsx`) are upstream's apart from the import lines.

### Panel type switch (`src/pjan/panelChangedHandler.ts`)

In Grafana 13.2.3 (scenes 8.13.5), picking a visualization in the panel editor runs `PanelOptionsPane.onChangePanel`:
it clears `fieldConfig.defaults.custom` and removes the custom properties (`custom.*`) from the override rules
(`filterFieldConfigOverrides(..., isStandardFieldProp)`), then calls `VizPanel.changePluginType`. That loads the plugin
through `_pluginLoaded` with `getPanelOptionsWithDefaults(..., isAfterPluginChange: true)`, which fills `custom` with the
plugin's defaults and whose `adaptFieldColorMode` resets a by-value colour mode (thresholds, a continuous scheme) to the
classic palette, because Time series supports colours by series. Then `changePluginType` calls
`onPanelTypeChanged(panel, prevPluginId, prevOptions, prevFieldConfig)` with the VizPanel's own field config object as
`panel.fieldConfig`, and applies only the returned options (and only when they aren't empty). Core's own handler,
switching from core Time series, returns `{}`: options, `custom`, the custom overrides and a by-value colour mode would
be lost.

For `prevPluginId === 'timeseries'` the handler returns a copy of `prevOptions`, and restores on `panel.fieldConfig` in
place: `defaults.custom` (merged over the plugin's defaults, as State timeline plus does), the override rules (a copy of
core's, which brings the custom properties back), and `defaults.color` (Stat plus's restore; removed if core's field
config has none, which doesn't happen in practice: Grafana applies Time series' default, the classic palette, on load).
This relies on scenes passing that object by reference: if a future Grafana passes a copy, the options still carry over
and the field config is reset as for any panel type switch. Every other previous panel type goes to core's
`graphPanelChangedHandler` unchanged (the Angular `graph` conversion, and the `hideFrom.graph` → `viz` rename).

**When the plugin's module is already loaded** (another Time series plus panel was drawn in the session),
`VizPanel._loadPlugin` loads it synchronously, inside the click on the visualization card, so React renders the panel
before the handler runs, and `VizPanel.applyFieldConfig` caches the field config the editor left (as long as the data
object stays the same). The handler therefore marks the field config it changed (`src/pjan/fieldConfigRefresh.ts`, a
`WeakSet`, the same mechanism as Stat plus's), and the copied `TimeSeriesPanel` calls `onFieldConfigChange` (public
`PanelProps`, `VizPanel.onFieldConfigChange`, which clears that cache) with that same field config once after its next
render. The content is unchanged, so the saved JSON is the same.

Checked in Grafana 13.2.3 by `tests/savedJson.spec.ts` (results under "Test runs"): a core panel with options away
from the defaults (table legend on the right with calcs and a sort, multi tooltip sorted with hidden zeros), custom
field config (line width, fill, gradient, points, soft min, dashed thresholds, stacking), a unit, thresholds, and
overrides mixing standard and custom properties (display name and right axis, negative-Y), with the thresholds colour
mode or a continuous scheme, switched with the plugin's module loaded or not (four tests): the same options and field
config are saved, and the editor's preview draws the same canvas bytes before and after the switch. Without each restore or the re-application,
the matching tests fail (see "Negative controls").

**Renaming `type` from `timeseries` to `pjan-timeseries-panel` in the dashboard JSON (in a v2 dashboard,
`vizConfig.group`) stays the lossless conversion** (and the only one for library panels and provisioned dashboards).
Only this direction is supported (pjan, 2026-10-03): switching a Time series plus panel back to core is not designed for
or tested.

## Copies with marked changes

The copies with lines marked `pjan-timeseries-panel`. `scripts/check-upstream-copies.mjs` (repository root, run in CI;
`scripts/README.md`) reads this list: another plugin's copy of the same upstream file may differ from one listed here
only in hunks with a marked line; every other copy that another plugin also has must be identical to it, apart from the
header's `Changes:` text. Every copy with a marked line is listed, and only those.

- `src/features/actions/utils.test.ts`
- `src/packages/grafana-ui/src/components/uPlot/utils.ts`
- `src/plugins/datasource/grafana/types.ts`
- `src/plugins/panel/timeseries/TimeSeriesPanel.tsx`
- `src/plugins/panel/timeseries/migrations.test.ts`
- `src/plugins/panel/timeseries/migrations.ts`
- `src/plugins/panel/timeseries/module.tsx`

The first two are State timeline plus's marked changes, marked again with this plugin's id (the code is identical).

## Stand-ins of its own

The stand-ins (files starting `// Plugin stand-in for ...`) that another plugin also has at the same path, but with
different content. `scripts/check-upstream-copies.mjs` reads this list: a stand-in at a path another plugin also has
must be byte-identical to the other plugins' unlisted stand-ins there, unless it is listed here; a stand-in is listed
here exactly when no other plugin's stand-in at that path has the same content.

- `src/packages/grafana-data/internal.ts`: the same names as State timeline plus's, with this plugin's id in the
  error message of `convertFieldType`.
- `src/packages/grafana-e2e-selectors/index.ts`: State timeline plus's three annotation strings and the exemplar
  marker's.
- `src/packages/grafana-ui/internal.ts`: State timeline plus's names, and `PlotLegend`, `hasVisibleLegendSeries` and
  `optsWithHideZeros`.

`src/core/app_events.ts`, `src/features/dashboard/services/TimeSrv.ts` and `src/packages/grafana-runtime/internal.ts`
are byte-identical to State timeline plus's (shared, not listed). State timeline plus lists its `grafana-ui/internal.ts`
and `grafana-e2e-selectors/index.ts` too, since they now differ from these.

## Pruned and left off

| Feature                                           | Upstream code                                           | Status and reason                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grafana Assistant tooltip button                  | `core/components/AssistantTooltip/*`                    | Pruned, as in State timeline plus. Needs app chrome (`ExtensionSidebar`, `FullscreenWorkspace`, `@grafana/runtime/internal`); core renders it only when Grafana Assistant is available (`useAssistant().isAvailable`), which the OSS dev server isn't (not verified on an instance with Assistant). |
| Panel suggestions                                 | `setSuggestionsSupplier(timeseriesSuggestionsSupplier)` | Left off deliberately, as in the other plugins: the picker would show a second Time series card next to core's.                                                                                                                                                                                     |
| "Transform to wide time series format" button     | `getPrepareTimeseriesSuggestion` (`DashboardSrv`)       | Not shown (plan decision 5): the long-data view shows core's message, without the button that adds a "Prepare time series" transformation to the panel.                                                                                                                                             |
| Graph time regions as dashboard annotation layers | `addAnnotationsToDashboard` in `migrations.ts`          | No-op stand-in (plan decision 6). Unreachable in a plugin, see "Changes beyond import rewrites".                                                                                                                                                                                                    |
| Grouped-label tooltip filters' flag               | `features/panel/filters/adhoc.ts`                       | Kept; time series doesn't read the flag (`checkFilterablePanelsFlag: false`), so the buttons behave as in core.                                                                                                                                                                                     |
| k8s annotations client for the tag list           | `features/annotations/api.ts`                           | Not ported, as in State timeline plus; the tag list uses the legacy REST endpoint.                                                                                                                                                                                                                  |
| `overrides/colorSeriesConfigFactory.ts`           | dead code in core (only its test imports it)            | Not copied. The legend's colour picker and series toggles go through scenes, which work for any panel plugin.                                                                                                                                                                                       |

Everything else is kept: every option and default (tooltip, legend with Series visibility, time zones, annotations,
the field options of `config.ts`), the view-panel options (fan-out, quick toggles), data support (annotations, alert
states), presets, frame preparation, all draw styles, fills, gradients, points, show values, stacking, transforms,
axes and scales, thresholds, colour modes, overrides, the legend (list, table, sort, colour picker, isolate and toggle,
faceted filter and pinning), the tooltip (modes, sort, hide zeros, sizes, pinning, data links, actions, filters,
annotate), annotations (markers, regions, multi-lane, clustering, adding, editing, deleting), exemplars, the
outside-range banner, crosshair sync, drag to zoom, keyboard control, time comparison alignment, and the panel-change
migrations of `migrations.ts`.

## Plugin build configuration

As in State timeline plus and Stat plus:

- `tsconfig.json`: `"jsx": "react-jsx"` (upstream code uses the automatic JSX runtime) and `typeRoots` that include the
  workspace root `node_modules/@types` (npm workspaces hoist `@types/*`).
- `webpack.config.ts` extends `.config/webpack/webpack.config.ts` (never edited; `create-plugin update` owns it):
  - sets `jsc.transform.react.runtime = 'automatic'` on the scaffold's swc-loader rule. `package.json` `build`/`dev`
    scripts must use this file; `src/pjan/buildConfig.test.ts` fails if they don't;
  - copies `LICENSE_APACHE2`, `UPSTREAM.md` and `NOTICE.md` into `dist/` (the scaffold already copies `LICENSE`);
  - writes `dist/THIRD_PARTY_NOTICES.txt` (`ThirdPartyNoticesPlugin`: every npm package and workspace package with code
    in the chunks; the build fails on a package bundled from two directories);
  - replaces the scaffold's Terser instance with the same settings plus an explicit licence-comment condition
    (`/^\**!|@preserve|@license|@cc_on/i`), extracted to `<asset>.LICENSE.txt`.
- `jest.config.js`: the scaffold's swc transform with the automatic JSX runtime; `TZ = 'Pacific/Easter'` as in
  grafana/grafana's `jest.config.js` (the copied tests assert times in that zone).
- `jest-setup.js`: `jest-canvas-mock` (core's `setupFiles`), core's `MessageChannel`, `ResizeObserver` and (new here)
  `IntersectionObserver` mocks from `public/test/jest-setup.ts`, and a `URL.canParse` polyfill (jsdom 20 lacks it). The
  `IntersectionObserver` mock is for `@grafana/ui`'s `ScrollIndicators` in the `Select` menus that
  `TimezonesEditor.test.tsx` and `ThresholdsStyleEditor.test.tsx` open.
- `eslint.config.mjs`: `react/react-in-jsx-scope` off for `src/`; `@pjan/grafana-styling` imported through its entry
  point only (tests may import its `src/testdata/`); for the mirrored tree only
  (`src/{core,features,packages,plugins}/**`): `react-hooks/refs`, `react-hooks/set-state-in-effect`,
  `@typescript-eslint/array-type`, `no-redeclare` off and unused disable directives not reported; and (new here) for
  the copied `TimezonesEditor.tsx` only, `react-hooks/immutability` off (it reassigns its `value` prop, as upstream
  does).
- `docker-compose.yaml`: Grafana OSS 13.2.3 (the image and version Atlas runs), session tokens rotated every 2 hours
  (`GF_AUTH_TOKEN_ROTATION_INTERVAL_MINUTES: 120`), and State timeline plus's `dist/` mounted (and allowed unsigned),
  for the crosshair check between the two plugins. `playwright.config.ts`: 60 s per test, 10 s per assertion, 4
  workers.
- i18n: `t()`/`<Trans>` come from the bundled `@grafana/i18n`. `src/module.ts` calls
  `await initPluginTranslations(pluginJson.id)`. The plugin ships no translations, so every string renders its
  in-source English default; keys and defaults are unchanged from core. Core shows the panel's own labels translated in
  non-English UI languages; the plugin does not (the tooltip, legend, axis, stacking and series labels come from
  `@grafana/ui`'s builders and stay translated).
- Runtime dependencies bundled (not shared by Grafana), pinned to the versions in grafana/grafana v13.2.3's `yarn.lock`,
  the same set and versions as State timeline plus: `uplot` 1.6.32, `@floating-ui/react` 0.27.20 and
  `@floating-ui/dom` 1.8.0 (annotation and exemplar tooltips), `react-hook-form` 7.62.0, `react-select` 5.10.2,
  `tinycolor2` 1.6.0, `micro-memoize` 4.2.0, `react-use` 17.6.1, `@grafana/schema` and `@grafana/i18n` 13.2.3. `lodash`
  4.18.1 is a shared external at runtime. `@pjan/grafana-styling` is a dependency for the planned additions; nothing
  imports it yet, so it isn't bundled. Dev dependencies for the tests: `react-select-event` 5.5.1
  (`TimezonesEditor.test.tsx`, `ThresholdsStyleEditor.test.tsx`), `pngjs` 7.0.0 (decoding screenshots in the parity
  tests, as Stat plus).

## plugin.json

The scaffold's id; the name is "Time series plus". From core's `plugin.json`: the `img/icn-timeseries-panel.svg` logo
and the documentation link. Added a "Source code" link (AGPL source offer). Not applicable to an external panel:
`"suggestions": true` (suggestions stay off, as in the other plugins), the "Raise issue" link (Grafana's tracker).

`grafanaDependency` is `^13.2.0`: the copied code, and the public `@grafana/*` APIs it relies on, are those of Grafana
13.2.3. **Every Grafana minor upgrade** (13.3, 13.4, …) needs, before the plugin is used on it: the parity tests
(`npm run e2e` against that version, `grafana_version` in `docker-compose.yaml`) and a re-sync check against the new
tag (steps below); widen `grafanaDependency` only after both pass.

## Tests

Ported, shared with State timeline plus (identical copies, only imports changed unless noted; see "Files"):
`GraphNG/utils.test.ts` (+ snapshot), `TimeSeries/utils.test.ts`, `features/actions/utils.test.ts`,
`features/alerting/unified/utils/url.test.ts`,
`timeseries/{InsertNullsEditor,LineStyleEditor,NullsThresholdInput,SpanNullsEditor,TimeSeriesTooltip}.test.tsx`,
`timeseries/utils.test.ts`, `timeseries/plugins/{AnnotationPlugin,AnnotationsPlugin,OutsideRangePlugin,utils}.test`,
`annotations/{AnnotationAvatar,AnnotationEditor,getAnnotationTooltip}.test.tsx`, and the helpers
`plugins/panel/test-utils.ts` and `timeseries/plugins/mocks/mockAnnotationFrames.ts`.

Ported, new here: `TimeSeriesPanel.test.tsx`, `migrations.test.ts` (+ snapshot), `presets.test.ts`,
`TimezonesEditor.test.tsx`, `ThresholdsStyleEditor.test.tsx` (State timeline plus left it off for want of
`react-select-event`), `plugins/ExemplarsPlugin.test.tsx`, `plugins/ExemplarsPlugin.integration.test.tsx`. Snapshots
(`__snapshots__/*.snap`) carry no provenance header (Jest requires its own on line 1).

Test adaptations:

- `features/actions/utils.test.ts`: State timeline plus's (`jest.mock` for the TimeSrv stand-in, `./analytics` mocked
  with `jest.mock`), marked with this plugin's id.
- `timeseries/migrations.test.ts`: the `DashboardModel` fixture of `beforeEach` (`createDashboardModelFixture`, set as
  `getDashboardSrv()`'s current dashboard) removed (marked); nothing but the time region tests read it. In
  `describe('time regions')`, "should migrate" keeps converting the Graph panel with time regions and matching
  upstream's snapshot of the converted panel; only its three assertions on the fixture's panels and annotation layers
  (what `addAnnotationsToDashboard` adds, a no-op here) and the line adding the panel to the fixture are removed
  (marked). "should migrate in scenes dashboard" is pruned (marked): it only differs in building a `DashboardScene`
  from the fixture to read those layers. The imports only these parts used are removed (marked). The snapshot file
  loses the scenes test's entry (Jest fails a run with obsolete snapshots); every other test and snapshot entry,
  including "time regions should migrate 1", is upstream's.
- `jest-setup.js` gains core's `IntersectionObserver` mock (see "Plugin build configuration").

Not ported: the five `TimeSeriesPanel.*.canvas.test.tsx` and `TimeSeriesPanel.canvasTestUtils.tsx` (they need
`@grafana/test-utils`, a private grafana/grafana workspace package), `suggestions.test.ts` (suggestions are left off),
`overrides/colorSeriesConfigFactory.test.ts` (dead code, not copied), and State timeline plus's tests of files this
plugin doesn't ship (`TimelineChart`, `state-timeline`, `barchart`).

Plugin-authored tests (`src/pjan/`):

- `panelChangedHandler.test.ts`: runs Grafana's own editor-switch steps (`filterFieldConfigOverrides(...,
isStandardFieldProp)`, `getPanelOptionsWithDefaults(..., isAfterPluginChange: true)`, both public) on a core panel's
  field config (as loaded by `getPanelOptionsWithDefaults`) and checks: options kept and copied; `custom` and the custom
  override properties restored; the colour mode restored for thresholds and a continuous scheme (which Grafana resets)
  and for the classic palette, by name, shades and fixed; Grafana's default colour kept, and a missing one removed;
  nothing changed without a previous field config; the panel applying its field config again after a restore; every
  other type through core's handler (an Angular `graph` panel, and another type with `hideFrom.graph`). The test
  registers the `unit` and `color` standard field options as core defines them (`testdata/editorRegistry.ts`),
  because Grafana fills that registry at startup.
- `fieldConfigRefresh.test.ts` (Stat plus's): a field config changed in place is applied again once, others never.
- `module.test.ts`: the wiring of the copied `module.tsx`, against upstream's values: no migration handler, the
  plugin's panel-change handler, padding, core's presets, no suggestions, the view-panel options and data support.
- `fieldOptionKeys.test.ts`: reads `GraphFieldConfig`'s keys from `@grafana/schema` 13.2.3's type declarations with the
  TypeScript compiler (including `lineColor`, `fillColor`, `pointColor`, `pointSymbol`, `barMaxWidth`, which core
  registers no editor for), and fails if a custom field option of the plugin uses one of them as its first path segment,
  other than the 28 custom field options core Time series registers in v13.2.3, which the test lists literally (so the
  plugin isn't compared with its own copy of `config.ts`). A second test checks that literal list against the copied
  `config.ts` (and its header's tag), so a re-sync that changes core's options fails until the list is updated
  deliberately; a third shows the check catches `custom.lineColor` and allows `custom.styling.*`.
- `buildConfig.test.ts`: JSX runtime regression guard.

End-to-end (`npm run e2e`, Grafana 13.2.3 OSS dev server from `docker-compose.yaml`):

- `tests/parity.spec.ts` (with `tests/parity.ts`) on `provisioning/dashboards/parity.json` and `parity-swapped.json`,
  generated by `scripts/generate-parity-dashboard.mjs`: 97 cases, each a core and a plugin panel with the same TestData
  query, options and field config, one above the other at the same width. The cases (plan, "Comparison dashboards"):
  1. defaults, one and three series;
  2. line with each interpolation; bars with each alignment at width factor 0.3 and 1; points of size 3 and 11;
  3. line width 0, 1, 3; dashes and dots; fill opacity 0, 20, 80;
  4. gradient opacity, hue, scheme with the thresholds colour mode, scheme with a continuous scheme;
  5. show points auto (with gaps), always, never; show values on lines, and on bars on both sides of the 30 px rule;
  6. `spanNulls` false, true and 20 minutes; `insertNulls` 10 minutes;
  7. stacking normal, percent, two groups; negative-Y by regex override with and without stacking;
     the Constant transform; `fillBelowTo`;
  8. axis placement left, right, hidden; two units on two axes; label and width; grid off; border on; axis
     colour mode series, also with a scheme and thresholds; soft min 0; hard min 0 and max 1 with `percentunit`;
     centred zero; log 2 and 10; symlog with a linear threshold; the IEC unit `bytes`; an enum field;
  9. thresholds as line, dashed, area, line and area, dashed and area; percentage thresholds; a transparent base step
     with yellow and red;
  10. colour modes classic palette, by name, fixed, shades, thresholds, a continuous scheme; hex and named fixed colours
      by override;
  11. `hideFrom` viz, legend, tooltip by override; bars and a line by override; right axis by override;
  12. legend list, table, hidden; table on the right with a width; `lastNotNull, max` sorted by max descending; limit
      and overflow; Series visibility;
  13. tooltip single, all sorted, all with hidden zeros, all with a max height, hidden (as saved; hovered in the
      interaction tests); a data link and an action;
  14. two time zones;
  15. exemplars (TestData's Exemplars scenario, seeded by the time range; `maxDataPoints` fixes the interval; the
      series has a label, see below);
  16. data entirely before the time range (the banner);
  17. long data (a `timeseries-long` frame): core's message, no button;
  18. 50 series × 2,000 points.

  The plan's case 15 (annotations) is in `tests/parityAnnotations.spec.ts`, so from the exemplars on, the numbers
  above are one lower than the plan's. The suite compares Time series plus with core Time series, case by case; it
  doesn't replay any particular dashboard's panels (pjan, 2026-10-04: the plan's case 19, Atlas replays, is dropped, and
  the case modelled on one Atlas panel, thresholds per series on one shared scale, was removed).

  Every case runs in the light theme, the dark theme, dark after a live switch from light and light after a live
  switch from dark (Grafana's `c r`, after every panel has drawn), each at pixel ratio 1 and 2 (its own browser
  context): 8 tests of 97 steps. Each step compares the core and the plugin panel, each with the panel at its position in
  the other dashboard (core with plugin, twice):
  - the canvas: size and an FNV hash of its RGBA bytes;
  - every element of the panel content (the legend, uPlot's overlay, markers, banners, the error view) with all its
    attributes, sorted;
  - a screenshot of the panel content, decoded and compared byte by byte.

  Each canvas and screenshot must be at least 5 % painted, so two empty renders can't pass. The share is counted in CSS
  pixels: at pixel ratio 2 a CSS pixel is a block of 2 × 2 device pixels, painted when any of them is (differs from the
  panel background, or isn't transparent on a canvas). Counted in device pixels, a 1 px CSS line covers about half the
  share at ratio 2 that it covers at ratio 1, and the first full run failed 33 of 98 ratio-2 cases on this rule alone
  (4.2–5.0 % painted; no difference between core and plugin), cases that pass it at ratio 1. Counting CSS pixels keeps
  the rule the same "something was drawn" guard at both ratios (an empty render still counts 0 %), without lowering the
  threshold or changing the cases. Some cases were changed earlier so that they pass the 5 % rule (filled, thicker
  lines, more series, or a smaller panel for the long-data message): their first runs were identical but under 5 %.

  Captures wait for the fonts and the icons, and repeat (every 0.5 s, up to 90 s) until two captures in a row are the
  same for all four panels of the case; that stable capture is compared once, so a difference that shows only for a
  moment fails instead of being captured again. Grafana's panel frame is squared off for the screenshots
  (`border-radius: 0`, checked as applied), as in Stat plus. After a live theme switch, every panel must have redrawn
  in the new theme before the comparison starts: its frame on the new background, and a different plot canvas (axis
  labels and grid are drawn in theme colours) or, for the long-data case, a different message colour.

  Exemplars: TestData's CSV gives a field labels only from `{...}` in the header (`csv_data.go`), and core's
  `ExemplarsPlugin` (`getVisibleLabels`, `showExemplarMarker`) shows every marker only when every series of the panel
  has labels; with a label-less series it shows none. The exemplars case's series is therefore `value{job=parity}`, and
  its two panels must each show exactly the `exemplarCount` (12) markers (`data-testid Exemplar marker`) its TestData
  query asks for (read from the dashboard JSON). One element is left out of the element comparison: an empty exemplars
  events canvas (`xy-canvas` without children). `TimeSeriesPanel` renders it whenever the panel has `data.annotations`,
  and Grafana 13.2.3 hands the dashboard's annotation and alert state answers (even empty ones) only to some panels of a
  long dashboard, depending on when each was scrolled into view, so the same core panel had it in one load and not in
  the next; it draws nothing. Only that element is left out, only when it has no children, and the exemplars case fails
  if it is left out there.

- `tests/parityAnnotations.spec.ts` on `parity-annotations.json` and its swapped twin: point and region annotations
  (the dashboard's, created through the HTTP API on each dashboard), multi-lane (with a second annotation query by tag,
  for organisation annotations the test creates), clustering on; compared as above in the same 8 theme and pixel ratio
  states, one after the other (the annotations are created once and deleted afterwards). Grafana passes the two
  annotation queries' frames in the order they answer, which sets the order of the markers and of the drawing; core and
  plugin on one page always get the same order, and the test reloads the two pages until they have the same order too.
- `tests/interaction.spec.ts`, core and plugin alike on the parity dashboards (where the result depends on the place
  on the page, each panel on top of its dashboard, at the same position):
  - hover at row 12 of the tooltip cases: the tooltip's elements, attributes and text the same in single and all
    modes, sorted, with hidden zeros, and with a max height; "hideFrom tooltip by override" hovered at five heights
    (s2 never in the tooltip, s1 and s3 are); "tooltip hidden": the plot follows the cursor, and no tooltip shows;
  - a click pins the tooltip (close button, stays open), its data link and action render the same, and the link opens;
  - drag to zoom: the same time range;
  - long data in the panel editor (the only place Grafana's `PanelDataErrorView` shows actions:
    `context.app === CoreApp.PanelEditor`): the same message; core offers "Transform to wide time series format",
    "Switch to table" and "Open visualization suggestions", the plugin the last two (plan decision 5);
  - keyboard: the plot takes focus with Tab, the cursor starts in the middle, the arrow keys move it;
  - legend: a click isolates a series and Ctrl/Cmd-click toggles one (the same overrides saved), the colour picker
    writes the same override, a column click the same `legend.sortBy`, the Series visibility filter the same override,
    and its pin `legend.facetedFilterPinned`;
  - on dashboards created through the API: crosshair sync both ways between core and plugin (`graphTooltip: 1`), and
    with core's state timeline and State timeline plus; Cmd/Ctrl-click on the plot opens the annotation editor and saves
    an annotation at the same time in both.
  - Worked out by hand (not by the code under test): the tooltip text of a CSV point with its unit (row 12:
    `62.7 req/s`, `54.4 req/s`, `46.8 req/s`, sorted, at `2025-10-01 21:15:00`); the legend's last value and max of the
    top-N case (two decimals, as in the CSV); where the threshold lines of a fixed 0–100 scale are drawn (within 2
    device pixels of `(top + height × (1 − v/100)) × pixel ratio`, across most of the plot's width); the zoomed range
    and the added annotation's time (a quarter to a half, and 60 %, of the 6 h range, within a minute).
- `tests/savedJson.spec.ts` (from the dashboard's save model, classic or v2): a new Time series plus panel saves the
  same options and field config as a new core panel (core saves its full `custom` block); opening the editor writes
  nothing (3 s); converting by `type` keeps options and field config, and in a v2 dashboard (created through the
  `dashboard.grafana.app/v2` API) by `vizConfig.group`; switching a core panel to Time series plus in the panel editor
  (see "Panel type switch"). It creates its dashboards through the HTTP API and deletes them afterwards.

The TestData CSV scenario has no relative time: all timestamps and the dashboard time ranges are fixed UTC values,
written as ISO strings (Grafana 13.2.3 does not parse epoch-millisecond strings as an absolute dashboard time range and
shows "Invalid date").

### Test runs

What has passed, on Grafana 13.2.3 OSS (the dev server of `docker-compose.yaml`), with one browser
(`npx playwright test --workers=1`):

- **2026-10-04, commit `21b35a5` (after the review fixes, with 98 cases then): the full suite, 45 of 45 tests passed** in 34.6 minutes, at
  the first run, without reruns: 8 parity tests (98 cases each: light, dark and both live switches, at pixel ratio 1 and
  2; 784 case comparisons), 8 annotation parity tests (3 cases each), 20 interaction tests, 8 saved-JSON tests, and the
  login setup. Jest, typecheck, lint, build and the copy check passed on the same commit.
- Before the review fixes (same day): the four pixel-ratio-1 parity tests passed, "light, pixel ratio 2" failed 33 of
  98 cases on the 5 % painted rule alone (counted in device pixels then; no difference between core and plugin), and the
  run was stopped; the annotation, interaction and saved-JSON specs passed (34 of 34). In that state the exemplars case
  drew no exemplars and "show points auto, with gaps" no points, in either panel (see "Negative controls").

- Afterwards the case "thresholds by override on one shared scale" was removed and the Atlas wording dropped (one
  case renamed: "thresholds dashed, transparent base step"). Rerun on the 97 cases: the parity tests "light, pixel ratio
  1" and "light, switched live from dark, pixel ratio 2", and the 7 legend and threshold-line interaction tests: 9 of 9
  passed (plus the login setup). The full suite was not rerun.

Not covered: the plan's "Not verified" list (Assistant button, view-panel fan-out
and quick toggles, public dashboards, time comparison behind its feature toggle, rendering cost) is unchanged.

### Negative controls

Each behaviour below was broken on purpose and the named tests failed; then the code was restored and they passed
(2026-10-04):

| Broken on purpose (`src/pjan/panelChangedHandler.ts`)    | Failing tests (`panelChangedHandler.test.ts`)                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `defaults.custom` not restored                           | "restores the custom field config the editor cleared", and the 8 colour tests (field config not core's) |
| the override rules not restored                          | "restores the custom override properties the editor removed", and the 8 colour tests                    |
| `defaults.color` not restored                            | "restores the colour mode thresholds …", "… continuous-GrYlRd …"                                        |
| the colour not removed when core's field config has none | "removes the colour when the previous field config has none"                                            |
| the field config not marked for `fieldConfigRefresh`     | both "has the panel apply its field config again after restoring it" tests                              |

`fieldOptionKeys.test.ts` carries its own control ("would catch one that does": a `custom.lineColor` option is
reported, `custom.styling.*` isn't). With `custom.pointSize` taken out of its frozen list of core's ids, three of its
four tests fail ("no field option of the plugin reuses a GraphFieldConfig key", "would catch one that does", "the
frozen list is the custom field options of the copied config.ts").

End to end (2026-10-04, `npx playwright test --workers=1` on the named tests, each control restored and the plugin
rebuilt before the next):

| Broken on purpose                                                                                                                                                                                                                                 | Run                                                        | Result                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copied `TimeSeries/utils.ts`: `pointSize: customConfig.pointSize! + 1` (the plan's "default point size in `TimeSeries/utils.ts`": that file has no default, `config.ts` has it; this is the one point size value `TimeSeries/utils.ts` passes on) | `parity.spec.ts`, light, pixel ratio 1, all 98 cases       | 16 cases fail, all on pixels or canvas bytes: the four line interpolations, points of size 3 and 11, show points always, show values on lines, bars and a line by override, the enum field, data link and action, and the five tooltip cases (24 rows: auto draws points at that density). The other 82 draw no points and pass. "show points auto, with gaps" passed too: it drew no points (see below). |
| The same, after "show points auto, with gaps" was given single values between gaps                                                                                                                                                                | `parity.spec.ts`, light, pixel ratio 1, that case          | fails (535 pixels differ)                                                                                                                                                                                                                                                                                                                                                                                 |
| Copied `TimeSeriesTooltip.tsx`: an extra class on `VizTooltipWrapper` (`className="pjan-negative-control"`)                                                                                                                                       | `interaction.spec.ts -g tooltip` (8 tests)                 | the 6 tooltip comparisons fail (four modes, hideFrom tooltip, the pinned tooltip with data link and action); the text worked out by hand and "tooltip hidden" pass, as expected (no tooltip element compared)                                                                                                                                                                                             |
| `panelChangedHandler.ts`: `defaults.custom` not restored                                                                                                                                                                                          | `savedJson.spec.ts -g switching` (4 tests)                 | all 4 fail (saved field config)                                                                                                                                                                                                                                                                                                                                                                           |
| `panelChangedHandler.ts`: the override rules not restored                                                                                                                                                                                         | same                                                       | all 4 fail                                                                                                                                                                                                                                                                                                                                                                                                |
| `panelChangedHandler.ts`: `defaults.color` not restored                                                                                                                                                                                           | same                                                       | all 4 fail                                                                                                                                                                                                                                                                                                                                                                                                |
| `panelChangedHandler.ts`: the field config not marked for `fieldConfigRefresh`                                                                                                                                                                    | same                                                       | the 2 "plugin already loaded" tests fail (canvas drawn before the restore); the other 2 pass, as expected                                                                                                                                                                                                                                                                                                 |
| `panelChangedHandler.ts`: the options not returned (`{}`)                                                                                                                                                                                         | same                                                       | all 4 fail                                                                                                                                                                                                                                                                                                                                                                                                |
| Copied `ExemplarsPlugin.tsx`: no marker rendered (`if (true)` for `if (!showMarker)`)                                                                                                                                                             | `parity.spec.ts`, light, pixel ratio 1, the exemplars case | fails: the plugin panel shows 0 of 12 markers, and its pixels differ                                                                                                                                                                                                                                                                                                                                      |
| The exemplars case's series without its label (`value`, as before the review), so neither panel draws a marker                                                                                                                                    | same                                                       | fails only on the marker count (0 of 12 in all four panels); core and plugin are otherwise identical, which the earlier suite passed unnoticed                                                                                                                                                                                                                                                            |

"show points auto, with gaps" drew no points before: at its density showPoints auto draws only what the point filter in
`TimeSeries/utils.ts` keeps (a single value between two gaps, for example), and its gaps left no such value. The first
control showed it; the case now has single values between gaps.

## Re-syncing to a newer tag

1. Re-run the dependency closure from `public/app/plugins/panel/timeseries/module.tsx` at the new tag, cut at the
   prune and stand-in points above (`core/components/AssistantTooltip/`, `features/dashboard-scene/`,
   `features/dashboard/services/`, `features/panel/suggestions/`, `features/query/state/PanelQueryRunner`,
   `features/annotations/api`, `plugins/datasource/grafana/`; the plan's job scripts `closure.py` and `pruned.py` do
   this), and compare with the tables below (new files, removed files, new `app/` or `/internal` imports, names no
   longer exported publicly).
2. `scripts/resync-upstream.mjs` (repository root, `scripts/README.md`) re-syncs every plugin at once: it re-copies the
   copies that differ from upstream only by the import rewrites, and merges the upstream changes into the others (a
   3-way merge), which then need a review: the marked changes in `module.tsx`, `TimeSeriesPanel.tsx`, `migrations.ts`
   (and `migrations.test.ts` with its snapshot), `grafana/types.ts`, and the partial copies. Re-check the time region
   tests: "should migrate" keeps upstream's snapshot entry, the scenes variant's entry stays removed (Jest fails on
   obsolete snapshots).
3. Check each name imported from `packages/grafana-*/internal` against the new tag: prefer a public export if one
   appeared; otherwise re-copy the Apache helper (`hasVisibleLegendSeries`, `optsWithHideZeros` and State timeline
   plus's). Re-check the stand-ins (`DashboardSrv.getCurrent()?.getPanelById` in `suggestions.ts`, `TimeSrv`,
   `app_events`), the e2e-selector strings, and the panel-editor flow that `src/pjan/panelChangedHandler.ts` relies on
   (`PanelOptionsPane.onChangePanel`, `VizPanel.changePluginType`, `_loadPlugin` and `applyFieldConfig` in
   `@grafana/scenes`, `adaptFieldColorMode` in `getPanelOptionsWithDefaults.ts`). `src/pjan/fieldOptionKeys.test.ts`
   checks `GraphFieldConfig`'s keys of the new `@grafana/schema`.
4. **`pluginVersion`:** core time series has no load migration handler in 13.2.3, so a saved plugin version of 1.x
   triggers nothing on load (`src/pjan/module.test.ts`). At each re-sync, check whether Grafana added a time series
   migration handler (`setMigrationHandler` in `module.tsx`) that compares versions: a saved 1.x would then read as an
   old Grafana version.
5. Bump `@grafana/*` and the bundled dependency versions to the new tag's (`package.json` and `yarn.lock` of
   grafana/grafana), set `grafana_version` in `docker-compose.yaml`, then run `npm run check:upstream-copies`,
   `npm run typecheck && npm run lint && npm test && npm run build` and `npm run e2e` (the parity, interaction and
   saved-JSON tests).

## Files

### Runtime code (AGPL-3.0, from public/app)

61 files, 8057 lines (with headers); 46 of them are State timeline plus's copies, identical (checked by `scripts/check-upstream-copies.mjs`).

| Upstream path                                                                                  | Plugin path                                                                             | Lines | Changes                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/app/core/components/CloseButton/CloseButton.tsx`                                       | `src/core/components/CloseButton/CloseButton.tsx`                                       |    35 | none                                                                                                                                                                                                                                                                                                                                                           |
| `public/app/core/components/Form/Form.tsx`                                                     | `src/core/components/Form/Form.tsx`                                                     |    64 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/core/components/GraphNG/GraphNG.tsx`                                               | `src/core/components/GraphNG/GraphNG.tsx`                                               |   288 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/core/components/GraphNG/types.ts`                                                  | `src/core/components/GraphNG/types.ts`                                                  |    16 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/core/components/GraphNG/utils.ts`                                                  | `src/core/components/GraphNG/utils.ts`                                                  |   177 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/core/components/TagFilter/TagBadge.tsx`                                            | `src/core/components/TagFilter/TagBadge.tsx`                                            |    53 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/core/components/TagFilter/TagFilter.tsx`                                           | `src/core/components/TagFilter/TagFilter.tsx`                                           |   209 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/core/components/TagFilter/TagOption.tsx`                                           | `src/core/components/TagFilter/TagOption.tsx`                                           |    62 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/core/components/TimeSeries/TimeSeries.tsx`                                         | `src/core/components/TimeSeries/TimeSeries.tsx`                                         |    59 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/core/components/TimeSeries/utils.ts`                                               | `src/core/components/TimeSeries/utils.ts`                                               |   794 | imports; dropped one `eslint-disable-next-line import/order` comment (the plugin's ESLint has no import plugin)                                                                                                                                                                                                                                                |
| `public/app/core/utils/timeRegions.ts`                                                         | `src/core/utils/timeRegions.ts`                                                         |    16 | partial copy (the TimeRegionMode and TimeRegionConfig types only, which migrations.ts and the partial copy of plugins/datasource/grafana/types.ts use; the time region calculation and its croner import are left off)                                                                                                                                         |
| `public/app/features/actions/analytics.ts`                                                     | `src/features/actions/analytics.ts`                                                     |    14 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/features/actions/utils.ts`                                                         | `src/features/actions/utils.ts`                                                         |   321 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/features/alerting/state/alertDef.ts`                                               | `src/features/alerting/state/alertDef.ts`                                               |   264 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/features/alerting/state/query_part.ts`                                             | `src/features/alerting/state/query_part.ts`                                             |    84 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/features/alerting/unified/utils/url.ts`                                            | `src/features/alerting/unified/utils/url.ts`                                            |    43 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/features/annotations/api.ts`                                                       | `src/features/annotations/api.ts`                                                       |    48 | partial copy; `annotationServer()` only provides `tags()`, the LegacyAnnotationServer implementation (the k8s client behind `grafana.kubernetesAnnotationsClient`, default off, is not ported); AnnotationTagsResponse from public/app/features/annotations/types.ts inlined                                                                                   |
| `public/app/features/panel/filters/adhoc.ts`                                                   | `src/features/panel/filters/adhoc.ts`                                                   |    69 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/features/panel/options/builder/CanvasControlsSwitchEditor.tsx`                     | `src/features/panel/options/builder/CanvasControlsSwitchEditor.tsx`                     |    39 | imports; AnnotationDisplayOptions/VizAnnotations from '@grafana/schema' instead of the deep path '@grafana/schema/dist/esm/common/common.gen' (not in the package's exports map)                                                                                                                                                                               |
| `public/app/features/panel/options/builder/ClusteringSwitchEditor.tsx`                         | `src/features/panel/options/builder/ClusteringSwitchEditor.tsx`                         |    20 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/features/panel/options/builder/annotations.ts`                                     | `src/features/panel/options/builder/annotations.ts`                                     |    57 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/features/panel/suggestions/utils.ts`                                               | `src/features/panel/suggestions/utils.ts`                                               |    13 | partial copy (SUGGESTIONS_LEGEND_OPTIONS only, which TIMESERIES_CARD_OPTIONS in suggestions.ts uses for the preset cards)                                                                                                                                                                                                                                      |
| `public/app/features/query/state/PanelQueryRunner.ts`                                          | `src/features/query/state/PanelQueryRunner.ts`                                          |     6 | partial copy (getNextRequestId only; the request id counter is per bundle, so ids restart at Q100 in this plugin)                                                                                                                                                                                                                                              |
| `public/app/features/visualization/data-hover/ExemplarTooltip.tsx`                             | `src/features/visualization/data-hover/ExemplarTooltip.tsx`                             |    40 | none                                                                                                                                                                                                                                                                                                                                                           |
| `public/app/plugins/datasource/grafana/types.ts`                                               | `src/plugins/datasource/grafana/types.ts`                                               |    45 | imports; partial copy (GrafanaQueryType, GrafanaQuery and GrafanaQueryFile, which migrations.ts uses for the Graph panel's time regions; defaultQuery and the annotation types are left off); GrafanaQuery's search and searchNext fields left off (marked: their SearchQuery type, app/features/search/service/types.ts, needs Grafana's private API clients) |
| `public/app/plugins/panel/canvas/panelcfg.gen.ts`                                              | `src/plugins/panel/canvas/panelcfg.gen.ts`                                              |   168 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/status-history/utils.ts`                                             | `src/plugins/panel/status-history/utils.ts`                                             |    39 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/InsertNullsEditor.tsx`                                    | `src/plugins/panel/timeseries/InsertNullsEditor.tsx`                                    |    37 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/LineStyleEditor.tsx`                                      | `src/plugins/panel/timeseries/LineStyleEditor.tsx`                                      |   148 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/NullsThresholdInput.tsx`                                  | `src/plugins/panel/timeseries/NullsThresholdInput.tsx`                                  |    71 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/SpanNullsEditor.tsx`                                      | `src/plugins/panel/timeseries/SpanNullsEditor.tsx`                                      |    41 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/ThresholdsStyleEditor.tsx`                                | `src/plugins/panel/timeseries/ThresholdsStyleEditor.tsx`                                |    23 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/TimeSeriesPanel.tsx`                                      | `src/plugins/panel/timeseries/TimeSeriesPanel.tsx`                                      |   260 | imports; Grafana Assistant tooltip button pruned (the assistantContext prop, its getAssistantTooltipContext import and the `title` prop only it used); onFieldConfigChange to useApplyFieldConfigChangedInPlace from src/pjan/ (applies the field config again after the panel-change handler restored it in place)                                            |
| `public/app/plugins/panel/timeseries/TimeSeriesTooltip.tsx`                                    | `src/plugins/panel/timeseries/TimeSeriesTooltip.tsx`                                    |   142 | imports; Grafana Assistant tooltip button (assistantContext prop, AssistantTooltipButton) pruned                                                                                                                                                                                                                                                               |
| `public/app/plugins/panel/timeseries/TimezonesEditor.tsx`                                      | `src/plugins/panel/timeseries/TimezonesEditor.tsx`                                      |    77 | none                                                                                                                                                                                                                                                                                                                                                           |
| `public/app/plugins/panel/timeseries/config.ts`                                                | `src/plugins/panel/timeseries/config.ts`                                                |   286 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/migrations.ts`                                            | `src/plugins/panel/timeseries/migrations.ts`                                            |   765 | imports; addAnnotationsToDashboard is a stand-in that does nothing (marked; it added the Graph panel's time regions to the dashboard through DashboardScene or DashboardSrv), its imports (DashboardSrv, TimeSrv, dashboard-scene) and the dashboardRefreshDebouncer only it used removed                                                                      |
| `public/app/plugins/panel/timeseries/module.tsx`                                               | `src/plugins/panel/timeseries/module.tsx`                                               |    57 | imports; setPanelChangeHandler(panelChangedHandler from src/pjan/, which keeps options and field config when switching from core timeseries and otherwise calls graphPanelChangedHandler); panel suggestions (setSuggestionsSupplier/timeseriesSuggestionsSupplier) left off                                                                                   |
| `public/app/plugins/panel/timeseries/panelcfg.gen.ts`                                          | `src/plugins/panel/timeseries/panelcfg.gen.ts`                                          |    34 | none                                                                                                                                                                                                                                                                                                                                                           |
| `public/app/plugins/panel/timeseries/plugins/AnnotationsPlugin.tsx`                            | `src/plugins/panel/timeseries/plugins/AnnotationsPlugin.tsx`                            |   377 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/plugins/ExemplarMarker.tsx`                               | `src/plugins/panel/timeseries/plugins/ExemplarMarker.tsx`                               |   259 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/plugins/ExemplarsPlugin.tsx`                              | `src/plugins/panel/timeseries/plugins/ExemplarsPlugin.tsx`                              |   209 | none                                                                                                                                                                                                                                                                                                                                                           |
| `public/app/plugins/panel/timeseries/plugins/OutsideRangePlugin.tsx`                           | `src/plugins/panel/timeseries/plugins/OutsideRangePlugin.tsx`                           |   108 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationAlertState.tsx`             | `src/plugins/panel/timeseries/plugins/annotations/AnnotationAlertState.tsx`             |    31 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationAvatar.tsx`                 | `src/plugins/panel/timeseries/plugins/annotations/AnnotationAvatar.tsx`                 |    25 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationEditor.tsx`                 | `src/plugins/panel/timeseries/plugins/annotations/AnnotationEditor.tsx`                 |   197 | imports; dropped two `eslint-disable-next-line @grafana/require-no-margin` comments (rule of Grafana's internal ESLint plugin, unknown to the plugin's ESLint)                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationMarker.tsx`                 | `src/plugins/panel/timeseries/plugins/annotations/AnnotationMarker.tsx`                 |   223 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationTooltip.tsx`                | `src/plugins/panel/timeseries/plugins/annotations/AnnotationTooltip.tsx`                |    82 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationTooltipBody.tsx`            | `src/plugins/panel/timeseries/plugins/annotations/AnnotationTooltipBody.tsx`            |    52 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationTooltipCluster.tsx`         | `src/plugins/panel/timeseries/plugins/annotations/AnnotationTooltipCluster.tsx`         |   150 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationTooltipHeader.tsx`          | `src/plugins/panel/timeseries/plugins/annotations/AnnotationTooltipHeader.tsx`          |   158 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationTooltipHeaderCloseIcon.tsx` | `src/plugins/panel/timeseries/plugins/annotations/AnnotationTooltipHeaderCloseIcon.tsx` |    21 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/plugins/annotations/constants.ts`                         | `src/plugins/panel/timeseries/plugins/annotations/constants.ts`                         |     3 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/plugins/annotations/getAnnotationTooltip.tsx`             | `src/plugins/panel/timeseries/plugins/annotations/getAnnotationTooltip.tsx`             |    62 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/plugins/annotations/types.ts`                             | `src/plugins/panel/timeseries/plugins/annotations/types.ts`                             |    40 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/plugins/annotations/useAnnotationClustering.tsx`          | `src/plugins/panel/timeseries/plugins/annotations/useAnnotationClustering.tsx`          |   244 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/plugins/annotations/useAnnotations.tsx`                   | `src/plugins/panel/timeseries/plugins/annotations/useAnnotations.tsx`                   |    63 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/plugins/utils.ts`                                         | `src/plugins/panel/timeseries/plugins/utils.ts`                                         |    53 | imports only                                                                                                                                                                                                                                                                                                                                                   |
| `public/app/plugins/panel/timeseries/presets.ts`                                               | `src/plugins/panel/timeseries/presets.ts`                                               |   316 | none                                                                                                                                                                                                                                                                                                                                                           |
| `public/app/plugins/panel/timeseries/suggestions.ts`                                           | `src/plugins/panel/timeseries/suggestions.ts`                                           |    46 | imports; partial copy (TIMESERIES_CARD_OPTIONS with MAX_PREVIEW_SERIES, which presets.ts uses, and getPrepareTimeseriesSuggestion, which TimeSeriesPanel.tsx uses; the suggestions supplier is left off); getDashboardSrv is the plugin's stand-in, whose getCurrent() is always undefined, so getPrepareTimeseriesSuggestion returns undefined                |
| `public/app/plugins/panel/timeseries/utils.ts`                                                 | `src/plugins/panel/timeseries/utils.ts`                                                 |   354 | imports only                                                                                                                                                                                                                                                                                                                                                   |

### Helpers from the @grafana packages (Apache-2.0)

8 files, 801 lines (with headers); 6 of them are State timeline plus's copies.

| Upstream path                                                                          | Plugin path                                                                                | Lines | Changes                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/grafana-data/src/transformations/transformers/joinDataFrames.ts`             | `src/packages/grafana-data/src/transformations/transformers/joinDataFrames.ts`             |    60 | partial copy (maybeSortFrame, NULL_REMOVE, NULL_RETAIN, NULL_EXPAND, isLikelyAscendingVector); imports from the public @grafana/data API                                                                                                                                                                                                                                                                                    |
| `packages/grafana-data/src/transformations/transformers/nulls/nullToUndefThreshold.ts` | `src/packages/grafana-data/src/transformations/transformers/nulls/nullToUndefThreshold.ts` |    31 | none                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `packages/grafana-ui/src/components/uPlot/PlotLegend.tsx`                              | `src/packages/grafana-ui/src/components/uPlot/PlotLegend.tsx`                              |    26 | partial copy (hasVisibleLegendSeries only, exported from @grafana/ui/internal; PlotLegend itself is public in @grafana/ui); imports from the public @grafana/* APIs                                                                                                                                                                                                                                                         |
| `packages/grafana-ui/src/components/uPlot/config/gradientFills.ts`                     | `src/packages/grafana-ui/src/components/uPlot/config/gradientFills.ts`                     |   292 | getCanvasContext imported from the public @grafana/ui export                                                                                                                                                                                                                                                                                                                                                                |
| `packages/grafana-ui/src/components/uPlot/internal.ts`                                 | `src/packages/grafana-ui/src/components/uPlot/internal.ts`                                 |    41 | FIXED_UNIT imported from the public @grafana/ui export                                                                                                                                                                                                                                                                                                                                                                      |
| `packages/grafana-ui/src/components/uPlot/utils.ts`                                    | `src/packages/grafana-ui/src/components/uPlot/utils.ts`                                    |   295 | partial copy (StackMeta, StackingGroup, StackDirection, getStackingGroups, preparePlotData2, getStackDirection, hasNegSample, pluginLog); imports from the public @grafana/* APIs; StackDirection const enum declared as literal constants; attachDebugger('graphng', ...) call dropped (in Grafana it registers window._debug.graphng to toggle Grafana's own copy of this logger, and production builds never install it) |
| `packages/grafana-ui/src/options/builder/tooltip.tsx`                                  | `src/packages/grafana-ui/src/options/builder/tooltip.tsx`                                  |    11 | partial copy (optsWithHideZeros only, exported from @grafana/ui/internal; addTooltipOptions is public as commonOptionsBuilder.addTooltipOptions)                                                                                                                                                                                                                                                                            |
| `packages/grafana-ui/src/utils/logger.ts`                                              | `src/packages/grafana-ui/src/utils/logger.ts`                                              |    45 | none                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Tests and test helpers (AGPL-3.0)

28 files, 9512 lines (with headers); 20 of them are State timeline plus's copies.

| Upstream path                                                                           | Plugin path                                                                      | Lines | Changes                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/app/core/components/GraphNG/__snapshots__/utils.test.ts.snap`                   | `src/core/components/GraphNG/__snapshots__/utils.test.ts.snap`                   |   241 | none (verbatim)                                                                                                                                                                                                                                       |
| `public/app/core/components/GraphNG/utils.test.ts`                                      | `src/core/components/GraphNG/utils.test.ts`                                      |   801 | imports only                                                                                                                                                                                                                                          |
| `public/app/core/components/TimeSeries/utils.test.ts`                                   | `src/core/components/TimeSeries/utils.test.ts`                                   |   654 | imports only                                                                                                                                                                                                                                          |
| `public/app/features/actions/utils.test.ts`                                             | `src/features/actions/utils.test.ts`                                             |   529 | imports; jest.mock for the TimeSrv stand-in; ./analytics mocked with jest.mock instead of jest.spyOn                                                                                                                                                  |
| `public/app/features/alerting/unified/utils/url.test.ts`                                | `src/features/alerting/unified/utils/url.test.ts`                                |    89 | imports only                                                                                                                                                                                                                                          |
| `public/app/plugins/panel/test-utils.ts`                                                | `src/plugins/panel/test-utils.ts`                                                |    31 | imports only                                                                                                                                                                                                                                          |
| `public/app/plugins/panel/timeseries/InsertNullsEditor.test.tsx`                        | `src/plugins/panel/timeseries/InsertNullsEditor.test.tsx`                        |    69 | imports only                                                                                                                                                                                                                                          |
| `public/app/plugins/panel/timeseries/LineStyleEditor.test.tsx`                          | `src/plugins/panel/timeseries/LineStyleEditor.test.tsx`                          |   161 | imports only                                                                                                                                                                                                                                          |
| `public/app/plugins/panel/timeseries/NullsThresholdInput.test.tsx`                      | `src/plugins/panel/timeseries/NullsThresholdInput.test.tsx`                      |    91 | imports only                                                                                                                                                                                                                                          |
| `public/app/plugins/panel/timeseries/SpanNullsEditor.test.tsx`                          | `src/plugins/panel/timeseries/SpanNullsEditor.test.tsx`                          |    80 | imports only                                                                                                                                                                                                                                          |
| `public/app/plugins/panel/timeseries/ThresholdsStyleEditor.test.tsx`                    | `src/plugins/panel/timeseries/ThresholdsStyleEditor.test.tsx`                    |    39 | none                                                                                                                                                                                                                                                  |
| `public/app/plugins/panel/timeseries/TimeSeriesPanel.test.tsx`                          | `src/plugins/panel/timeseries/TimeSeriesPanel.test.tsx`                          |   233 | none                                                                                                                                                                                                                                                  |
| `public/app/plugins/panel/timeseries/TimeSeriesTooltip.test.tsx`                        | `src/plugins/panel/timeseries/TimeSeriesTooltip.test.tsx`                        |   121 | imports only                                                                                                                                                                                                                                          |
| `public/app/plugins/panel/timeseries/TimezonesEditor.test.tsx`                          | `src/plugins/panel/timeseries/TimezonesEditor.test.tsx`                          |    96 | none                                                                                                                                                                                                                                                  |
| `public/app/plugins/panel/timeseries/__snapshots__/migrations.test.ts.snap`             | `src/plugins/panel/timeseries/__snapshots__/migrations.test.ts.snap`             |   719 | one obsolete entry removed (the pruned scenes variant of the time region test)                                                                                                                                                                        |
| `public/app/plugins/panel/timeseries/migrations.test.ts`                                | `src/plugins/panel/timeseries/migrations.test.ts`                                |  1306 | imports; the DashboardModel fixture (beforeEach) removed; in the time region tests, the assertions on the dashboard's annotation layers (added by addAnnotationsToDashboard, a no-op stand-in here) and the scenes variant pruned, with their imports |
| `public/app/plugins/panel/timeseries/plugins/AnnotationPlugin.test.tsx`                 | `src/plugins/panel/timeseries/plugins/AnnotationPlugin.test.tsx`                 |    36 | imports only                                                                                                                                                                                                                                          |
| `public/app/plugins/panel/timeseries/plugins/AnnotationsPlugin.test.tsx`                | `src/plugins/panel/timeseries/plugins/AnnotationsPlugin.test.tsx`                |  1134 | imports only                                                                                                                                                                                                                                          |
| `public/app/plugins/panel/timeseries/plugins/ExemplarsPlugin.integration.test.tsx`      | `src/plugins/panel/timeseries/plugins/ExemplarsPlugin.integration.test.tsx`      |   397 | none                                                                                                                                                                                                                                                  |
| `public/app/plugins/panel/timeseries/plugins/ExemplarsPlugin.test.tsx`                  | `src/plugins/panel/timeseries/plugins/ExemplarsPlugin.test.tsx`                  |   105 | none                                                                                                                                                                                                                                                  |
| `public/app/plugins/panel/timeseries/plugins/OutsideRangePlugin.test.tsx`               | `src/plugins/panel/timeseries/plugins/OutsideRangePlugin.test.tsx`               |   200 | imports only                                                                                                                                                                                                                                          |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationAvatar.test.tsx`     | `src/plugins/panel/timeseries/plugins/annotations/AnnotationAvatar.test.tsx`     |    32 | imports only                                                                                                                                                                                                                                          |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationEditor.test.tsx`     | `src/plugins/panel/timeseries/plugins/annotations/AnnotationEditor.test.tsx`     |    82 | imports only                                                                                                                                                                                                                                          |
| `public/app/plugins/panel/timeseries/plugins/annotations/getAnnotationTooltip.test.tsx` | `src/plugins/panel/timeseries/plugins/annotations/getAnnotationTooltip.test.tsx` |    74 | imports only                                                                                                                                                                                                                                          |
| `public/app/plugins/panel/timeseries/plugins/mocks/mockAnnotationFrames.ts`             | `src/plugins/panel/timeseries/plugins/mocks/mockAnnotationFrames.ts`             |  1031 | imports only                                                                                                                                                                                                                                          |
| `public/app/plugins/panel/timeseries/plugins/utils.test.ts`                             | `src/plugins/panel/timeseries/plugins/utils.test.ts`                             |   216 | imports only                                                                                                                                                                                                                                          |
| `public/app/plugins/panel/timeseries/presets.test.ts`                                   | `src/plugins/panel/timeseries/presets.test.ts`                                   |   146 | none                                                                                                                                                                                                                                                  |
| `public/app/plugins/panel/timeseries/utils.test.ts`                                     | `src/plugins/panel/timeseries/utils.test.ts`                                     |   799 | imports only                                                                                                                                                                                                                                          |

Stand-ins (plugin-authored, see above): `src/core/app_events.ts`, `src/features/dashboard/services/DashboardSrv.ts`, `src/features/dashboard/services/TimeSrv.ts`, `src/packages/grafana-data/internal.ts`, `src/packages/grafana-e2e-selectors/index.ts`, `src/packages/grafana-runtime/internal.ts`, `src/packages/grafana-ui/internal.ts`.
