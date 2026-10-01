# Upstream: Grafana core state timeline

This plugin is a port of Grafana's core **state timeline** panel (`state-timeline`) from
[grafana/grafana](https://github.com/grafana/grafana) at tag **`v13.2.3`** (commit `6193dc0`, "Release: 13.2.3").
With nothing configured it is meant to look and behave like the core panel: same options, defaults, panel-change
migrations, rendering, tooltip, legend, annotations (including adding and editing them), shared crosshair, and drag to
zoom. `tests/parity.spec.ts` checks the rendering pixel by pixel against the core panel (see "Tests").

- Grafana core code (`public/app/...`) is AGPL-3.0, Copyright Grafana Labs, so this plugin is AGPL-3.0 (`LICENSE`).
  Grafana's `NOTICE.md` (v13.2.3) is kept as `NOTICE.md`.
- Helpers copied from Grafana's npm packages (`packages/grafana-ui`, `packages/grafana-data`,
  `packages/grafana-e2e-selectors`) are Apache-2.0, Copyright Grafana Labs. Their license text is in
  `LICENSE_APACHE2` (copied from `packages/grafana-ui/LICENSE_APACHE2` at the same tag).
- `dist/` ships `LICENSE`, `LICENSE_APACHE2`, `NOTICE.md`, this file, and `THIRD_PARTY_NOTICES.txt` (generated at build
  time: name, version, licence and licence text of every npm package bundled into the chunks; see "Plugin build
  configuration").
- **Source offer (AGPL-3.0 section 13):** `src/plugin.json` (`info.links`, "Source code") and `src/README.md` point at
  `https://github.com/pjan/grafana-plugins`. **TODO:** that URL is a placeholder. It must be the real public
  repository before the plugin is shared with anyone.

Every copied file starts with a one-line header:
`// Copied from grafana/grafana v13.2.3: <upstream path>. <license>. Changes: <...>.`
Plugin-authored replacements for core modules start with `// Plugin stand-in for ...` instead.

## Layout

Copied files mirror their upstream path under `src/`:

- `public/app/<path>` is copied to `src/<path>` (for example `public/app/core/components/TimelineChart/timeline.ts`
  becomes `src/core/components/TimelineChart/timeline.ts`).
- `packages/grafana-<pkg>/src/<path>` is copied to `src/packages/grafana-<pkg>/src/<path>`.
- `src/packages/grafana-{ui,data,runtime}/internal.ts` and `src/packages/grafana-e2e-selectors/index.ts` stand in
  for package entry points that a plugin cannot use at runtime (see below).
- `src/pjan/` is plugin-authored code (not from grafana/grafana): the panel-change handler, and the planned opt-in
  additions. It gets the scaffold's normal lint rules (see "Plugin build configuration").
- `src/module.ts` is the plugin entry: it initialises `@grafana/i18n` for this plugin and re-exports `plugin` from
  `src/plugins/panel/state-timeline/module.tsx`.
- `src/img/timeline.svg` is core's `public/app/plugins/panel/state-timeline/img/timeline.svg` (the panel logo).

Non-relative imports such as `core/components/...` resolve from `src/` (scaffold `baseUrl`/`paths` in
`.config/tsconfig.json`, `resolve.modules` in webpack, `modulePaths` in Jest).

## Import rewrites (mechanical, applied to every copied file)

| Upstream import                                  | Plugin import                         | Why                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `'app/<path>'`                                   | `'<path>'`                            | Same file, resolved from `src/`.                                                                                                                             |
| `'@grafana/ui/internal'`                         | `'packages/grafana-ui/internal'`      | `/internal` is not shared with plugins at runtime.                                                                                                           |
| `'@grafana/data/internal'`                       | `'packages/grafana-data/internal'`    | Same.                                                                                                                                                        |
| `'@grafana/runtime/internal'`                    | `'packages/grafana-runtime/internal'` | Same.                                                                                                                                                        |
| `'@grafana/e2e-selectors'` (non-test files only) | `'packages/grafana-e2e-selectors'`    | Avoids bundling the package and `semver` (~330 KiB unminified) for three `data-testid` strings. Tests keep the real package, which cross-checks the strings. |

One non-mechanical import change: `src/features/panel/options/builder/CanvasControlsSwitchEditor.tsx` imports
`AnnotationDisplayOptions`/`VizAnnotations` from `'@grafana/schema'` instead of
`'@grafana/schema/dist/esm/common/common.gen'` (the deep path is not in the package's `exports` map; same types).

## Stand-ins for internal entry points

`src/packages/grafana-ui/internal.ts` (`@grafana/ui/internal`)

- Re-exported from public `@grafana/ui` (same implementation as the internal export): `UPlotChart`,
  `UPlotConfigBuilder`, `UPlotConfigPrepFn`.
- Types derived from public signatures: `AxisProps = Parameters<UPlotConfigBuilder['addAxis']>[0]`,
  `ScaleProps = Parameters<UPlotConfigBuilder['addScale']>[0]`,
  `Renderers = NonNullable<Parameters<UPlotConfigPrepFn>[0]['renderers']>`.
- Copied (Apache-2.0): `TimeRange2` (TooltipPlugin2.tsx), `FILTER_FOR_OPERATOR`/`FILTER_OUT_OPERATOR`
  (`components/Table/types.ts`), `TooltipHoverMode` (TooltipPlugin2.tsx; upstream is a `const enum`, declared here as
  literal constants `{ xOne: 0, xAll: 1, xyOne: 2 }` so the values stay assignable to TooltipPlugin2's prop type),
  `buildScaleKey` (`components/uPlot/internal.ts`, whole file; @grafana/ui only exports it publicly from its deprecated
  `graveyard/GraphNG/utils.ts`), `pluginLog`/`preparePlotData2`/`getStackingGroups` (`components/uPlot/utils.ts`,
  partial copy), `getScaleGradientFn` (`components/uPlot/config/gradientFills.ts`, whole file), `createLogger`
  (`utils/logger.ts`, whole file).

`src/packages/grafana-data/internal.ts` (`@grafana/data/internal`)

- Copied (Apache-2.0): `nullToUndefThreshold` (whole file), `NULL_REMOVE`/`NULL_RETAIN`/`NULL_EXPAND`/`maybeSortFrame`
  (+ `isLikelyAscendingVector`) from `transformations/transformers/joinDataFrames.ts` (partial copy).
- `convertFieldType`: the copied code only calls `convertFieldType(field, { destinationType: FieldType.time })`, which
  upstream resolves to `ensureTimeFieldWithTimeZone(field, undefined, undefined)`; the stand-in calls the public
  `ensureTimeField(field, dateFormat)` (the same function without a time zone) and throws for any other conversion.

`src/packages/grafana-runtime/internal.ts` (`@grafana/runtime/internal`)

- `FlagKeys` / `getFeatureFlagClient()`: returns each flag's default value. The only flag the copied code reads is
  `grafana.filterablePanels` (default `false`; it gates the grouped-label filter buttons in the tooltip), so the
  plugin behaves like core with that flag at its default. Reading the real value would be possible through
  `@grafana/runtime`'s public OpenFeature providers (`createOpenFeatureOFREPWebProvider`), but it is not wired: the flag
  is off by default in Grafana, and wiring it would bundle `@openfeature/web-sdk`. If an instance turns the flag on,
  core shows the "filter for/out grouped labels" tooltip buttons and this plugin does not.

`src/packages/grafana-e2e-selectors/index.ts`: the three resolved v13.2.3 strings of
`selectors.pages.Dashboard.Annotations` (`tooltip`, `marker`, `clusterTooltip`).

## Stand-ins and partial copies for core app modules

| Upstream module                                       | Plugin file                                  | What it does instead                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/app/core/app_events.ts`                       | `src/core/app_events.ts`                     | Upstream creates core's app event bus. The stand-in provides `appEvents.emit(event, payload)` as `getAppEvents().publish({ type: event.name, payload })` on the bus core shares with plugins (identical to `EventBusSrv.emit`). Used for the action success/error toasts.                                                                                                                                                                                                                                                                                                                                                                                 |
| `public/app/features/annotations/api.ts`              | same path                                    | Partial copy: `annotationServer().tags()` only, the `LegacyAnnotationServer` request (`GET /api/annotations/tags?limit=1000`, mapped from `result.tags` to `{ term, count }`), used by the annotation editor's tag picker. Upstream switches to the k8s annotations client when the `grafana.kubernetesAnnotationsClient` flag (default off) is on and the API group is registered; that path is not ported. Saving, updating and deleting go through the public panel context (`onAnnotationCreate`/`onAnnotationUpdate`/`onAnnotationDelete`), which Grafana implements with its own `annotationServer()`, so those follow the flag exactly as in core. |
| `public/app/features/dashboard/services/TimeSrv.ts`   | `src/features/dashboard/services/TimeSrv.ts` | `getTimeSrv().timeRange()` built from `getTemplateSrv().replace('${__from}')` / `'${__to}'`. Only used for Infinity proxy actions (behind the `vizActionsAuth` feature toggle).                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `public/app/features/query/state/PanelQueryRunner.ts` | same path                                    | Partial copy: `getNextRequestId()` only. The counter is per bundle, so ids restart at `Q100` (only used in the Infinity request URL).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Changes beyond import rewrites

| File                                                                                               | Change                                                                                                                                                           | Reason                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugins/panel/state-timeline/module.tsx`                                                          | `.setSuggestionsSupplier(showDefaultSuggestion(...))` left off.                                                                                                  | Deliberate, see "Left off".                                                                                                                                                                                                                                                                                                                                                                             |
| `plugins/panel/state-timeline/module.tsx`                                                          | `.setPanelChangeHandler(panelChangedHandler)` from `src/pjan/panelChangedHandler.ts` instead of `timelinePanelChangedHandler` (plugin-only, marked in the code). | Switching a core `state-timeline` panel to this plugin in the panel editor keeps every option, the custom field config and the custom override rules. Any other previous panel type goes to core's `timelinePanelChangedHandler` unchanged (`migrations.ts` itself is unmodified). Details below.                                                                                                       |
| `plugins/panel/timeseries/TimeSeriesTooltip.tsx`                                                   | Removed `AssistantTooltipButton`, the `assistantContext` prop and `additionalContent`.                                                                           | Grafana Assistant button needs app chrome (pruned). The state timeline only uses this file's `TimeSeriesTooltipProps` type.                                                                                                                                                                                                                                                                             |
| `plugins/panel/timeseries/plugins/annotations/AnnotationEditor.tsx`                                | Dropped two `{/* eslint-disable-next-line @grafana/require-no-margin */}` comments.                                                                              | The rule is from Grafana's internal ESLint plugin; naming an unknown rule is a lint error.                                                                                                                                                                                                                                                                                                              |
| `core/components/TimeSeries/utils.ts`                                                              | Dropped one `// eslint-disable-next-line import/order` comment.                                                                                                  | The scaffold's ESLint has no `import` plugin, so naming the rule is a lint error.                                                                                                                                                                                                                                                                                                                       |
| `packages/grafana-ui/src/components/uPlot/utils.ts`                                                | Partial copy; `StackDirection` const enum declared as literal constants; `attachDebugger('graphng', ...)` call dropped.                                          | Copy only what is used; keep `StackingGroup` assignable to the public `UPlotConfigBuilder` typings (enums are nominal). In Grafana, `attachDebugger` registers `window._debug.graphng` to toggle Grafana's own copy of this logger, and production builds never install it; the plugin's copy of the logger is off unless `grafana.debug` is set in localStorage and the plugin is a development build. |
| `packages/grafana-ui/src/components/uPlot/config/gradientFills.ts`, `components/uPlot/internal.ts` | `getCanvasContext` / `FIXED_UNIT` from public `@grafana/ui`.                                                                                                     | Same values, public exports.                                                                                                                                                                                                                                                                                                                                                                            |

### Panel type switch (`src/pjan/panelChangedHandler.ts`)

In Grafana 13.2.3 (scenes 8.13.5) the panel editor's visualization picker clears `fieldConfig.defaults.custom` and the
custom override rules (`PanelOptionsPane`), then calls `onPanelTypeChanged(panel, prevPluginId, prevOptions,
prevFieldConfig)` and applies only the returned options (`VizPanel.changePluginType`). For
`prevPluginId === 'state-timeline'` the handler returns a copy of `prevOptions` and restores `prevFieldConfig`'s
`defaults.custom` and `overrides` on `panel.fieldConfig`. That object is the VizPanel's own field config, so the
restore takes effect. This relies on scenes passing that object by reference: if a future Grafana passes a copy, the
options still carry over and the custom field config falls back to this plugin's defaults, as for any panel type switch.
Verified in Grafana 13.2.3: merge, row height, show/align values, page size, legend (table, right, calcs), tooltip
(multi, sort), custom field config, custom overrides and mappings all survive the switch.

**Renaming `type` from `state-timeline` to `pjan-statetimeline-panel` in the dashboard JSON stays the lossless
conversion** (and the only one for library panels and provisioned dashboards).

## Pruned and left off

| Feature                                                              | Upstream code                                                   | Status and reason                                                                                                                                                                                           |
| -------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grafana Assistant tooltip button                                     | `core/components/AssistantTooltip/*`                            | Pruned. Needs app chrome: `ExtensionSidebar`, `FullscreenWorkspace`, `@grafana/runtime/internal`. Not used by the core state timeline either (only timeseries passes `assistantContext`).                   |
| Panel suggestions                                                    | `features/panel/suggestions/utils.ts`, `setSuggestionsSupplier` | Left off deliberately. A plugin could offer them (`"suggestions": true` in `plugin.json` plus a supplier), but this panel would then add a second, identical suggestion card next to core's state timeline. |
| Grouped-label tooltip filters while `grafana.filterablePanels` is on | `features/panel/filters/adhoc.ts`                               | Kept in code, flag not wired (see `grafana-runtime/internal.ts`): always off, which is Grafana's default.                                                                                                   |
| k8s annotations client for the tag list                              | `features/annotations/api.ts`                                   | Not ported; the tag list always uses the legacy REST endpoint (see above).                                                                                                                                  |

Everything else is kept: rendering (values, alignment, merge, row height, fill opacity, line width, colors, mappings,
thresholds), tooltip (single/multi/hidden, sort, duration, data links, field actions incl. toasts and analytics),
legend, annotations (lines, regions, markers, clustering, multi-lane, tooltips, adding with Ctrl/Cmd-click or
Ctrl/Cmd-drag and the "Add annotation" tooltip button, editing, deleting), shared crosshair (`EventBusPlugin`), drag to
zoom (`XAxisInteractionAreaPlugin`), outside-range banner, pagination, axis placement/width,
`spanNulls`/`insertNulls`, `hideFrom`, field color modes, and the panel-change migration from `natel-discrete-panel`
(`migrations.ts`; core has no `setMigrationHandler` for this panel).

Note for annotation adding (core behaviour): TooltipPlugin2 only accepts the Ctrl/Cmd-click when it lands on the plot
overlay itself (`e.target === u.over`). On a state timeline the hovered state box is its own element, so the click has
to land on empty plot space (between rows or outside the data). On macOS, Ctrl-click is a context-menu click; use Cmd.

## Known upstream behaviour kept as is

`TimelineChart/utils.ts` passes `getFieldConfig: (seriesIdx) => frame.fields[seriesIdx].config.custom`, but
`timeline.ts` calls it with the 0-based series index, so row N reads the custom config (fill opacity) of field N, which
is the previous row (row 1 reads the time field). With per-field overrides of `fillOpacity` the shading is shifted by
one row in core as well. Not fixed here (drop-in parity).

## Plugin build configuration

- `tsconfig.json`: `"jsx": "react-jsx"` (upstream code uses the automatic JSX runtime) and `typeRoots` that include the
  workspace root `node_modules/@types` (npm workspaces hoist `@types/*`).
- `webpack.config.ts` extends `.config/webpack/webpack.config.ts` (never edited; `create-plugin update` owns it):
  - sets `jsc.transform.react.runtime = 'automatic'` on the scaffold's swc-loader rule (`react/jsx-runtime` is already
    a shared external). `package.json` `build`/`dev` scripts must use this file; `src/pjan/buildConfig.test.ts` fails if
    they don't (a `create-plugin update` rewrites them, and the panel would then fail in the browser with
    `React is not defined`);
  - copies `LICENSE_APACHE2`, `UPSTREAM.md` and `NOTICE.md` into `dist/` (the scaffold already copies `LICENSE`);
  - writes `dist/THIRD_PARTY_NOTICES.txt` with a small plugin (`ThirdPartyNoticesPlugin`) that walks every chunk's
    modules, including the ones webpack concatenates. `license-webpack-plugin` 4.0.2 was tried first and only saw 7 of
    the 20 bundled packages (it reads only the root module of a concatenated module);
  - replaces the scaffold's Terser instance with the same settings plus an explicit licence-comment condition
    (`/^\**!|@preserve|@license|@cc_on/i`), extracted to `<asset>.LICENSE.txt`. None of the bundled code has such a
    comment today (uPlot's header is a plain `/** */` block), so no `.LICENSE.txt` file is emitted; its MIT notice is
    in `THIRD_PARTY_NOTICES.txt`.
- `jest.config.js`: the scaffold's swc transform (picked by its key, `^.+\.(t|j)sx?$`) with the automatic JSX runtime;
  `TZ = 'Pacific/Easter'` as in grafana/grafana's `jest.config.js` (the copied tests assert times in that zone).
- `jest-setup.js`: loads `jest-canvas-mock` (core's `setupFiles`), and copies core's `MessageChannel` and
  `ResizeObserver` polyfills from `public/test/jest-setup.ts`; adds a `URL.canParse` polyfill (jsdom 20 lacks it).
- `eslint.config.mjs`: `react/react-in-jsx-scope` off for `src/` (automatic runtime). For the mirrored tree only
  (`src/{core,features,packages,plugins}/**`): `react-hooks/refs`, `react-hooks/set-state-in-effect`,
  `@typescript-eslint/array-type`, `no-redeclare` off and unused disable directives not reported. Upstream code is not
  rewritten to satisfy newer rules. `src/pjan/**` keeps the scaffold's rules.
- i18n: `t()`/`<Trans>` come from the bundled `@grafana/i18n` (scaffold default). `src/module.ts` calls
  `await initPluginTranslations(pluginJson.id)`. The plugin ships no translations, so every string renders its
  in-source English default; keys and defaults are unchanged from core. Core shows these labels translated in
  non-English UI languages; the plugin does not.
- Runtime dependencies bundled (not shared by Grafana), pinned to the versions in grafana/grafana v13.2.3's `yarn.lock`:
  `uplot` 1.6.32 (static helpers `uPlot.orient`, `uPlot.pxRatio`, `uPlot.paths`; plot instances are still created by
  Grafana's own copy through `UPlotChart`), `@floating-ui/react` 0.27.20 + `@floating-ui/dom` 1.8.0 (annotation tooltip
  positioning), `react-hook-form` 7.62.0 (annotation editor form), `react-select` 5.10.2 (tag picker components passed
  to `@grafana/ui`'s `MultiSelect`), `tinycolor2` 1.6.0, `micro-memoize` 4.2.0, `react-use` 17.6.1, plus
  `@grafana/schema` and `@grafana/i18n` 13.2.3. `lodash` 4.18.1 is a shared external at runtime.

## plugin.json

Kept the scaffold's id and name; the description says opt-in additions are planned. From core's `plugin.json`: the
`img/timeline.svg` logo and the documentation link. Added a "Source code" link (AGPL source offer; placeholder URL, see
the TODO above). Not applicable to an external panel: `"suggestions": true` (left off), the "Raise issue" link
(Grafana's tracker). Core has no `skipDataQuery`, `keywords` or `hideFromList`.

`grafanaDependency` is `^13.2.0`: the copied code, and the public `@grafana/*` APIs it relies on, are those of Grafana
13.2.3. **Every Grafana minor upgrade** (13.3, 13.4, …) needs, before the plugin is used on it: the parity tests
(`npm run e2e` against that version, `GRAFANA_VERSION` in `docker-compose.yaml`) and a re-sync check against the new
tag (steps below); widen `grafanaDependency` only after both pass.

## Tests

Ported (only imports changed unless noted): `TimelineChart/{timeline,utils}.test.ts`, `GraphNG/utils.test.ts` (+
snapshot), `TimeSeries/utils.test.ts`, `state-timeline/{hooks,migrations,StateTimelinePanel,StateTimelineTooltip}.test`
(+ migrations snapshot), `timeseries/{InsertNullsEditor,LineStyleEditor,NullsThresholdInput,SpanNullsEditor,TimeSeriesTooltip}.test.tsx`,
`timeseries/utils.test.ts`, `timeseries/plugins/{AnnotationPlugin,AnnotationsPlugin,OutsideRangePlugin,utils}.test`,
`annotations/{AnnotationAvatar,AnnotationEditor,getAnnotationTooltip}.test.tsx`, `barchart/{distribute,quadtree}.test.ts`,
`features/actions/utils.test.ts`, `features/alerting/unified/utils/url.test.ts`, plus helpers
`plugins/panel/test-utils.ts` and `timeseries/plugins/mocks/mockAnnotationFrames.ts`. Snapshots (`__snapshots__/*.snap`)
are verbatim (Jest requires its header on line 1, so they carry no provenance header).

Test adaptations:

- `features/actions/utils.test.ts`: `jest.mock` for the TimeSrv stand-in (it reads `getTemplateSrv()`, unset in unit
  tests); `./analytics` mocked with `jest.mock` instead of `jest.spyOn` (`@swc/jest` emits non-configurable ES exports;
  core uses ts-jest).
- `state-timeline/migrations.test.ts`: `PanelModel` type from `@grafana/data` instead of core's dashboard class.
- `state-timeline/StateTimelinePanel.test.tsx`: the test frame's fields get `config.custom = {}`. Grafana always
  supplies the panel's custom defaults; without them `getFieldConfig()` returns `undefined` and drawing throws in a
  microtask. Core's jest environment does not surface that error; this one does.

Not ported:

- `TimelineChart/TimelineChart.canvas.test.tsx`, `features/panel/filters/adhoc.test.ts`: need `@grafana/test-utils`,
  a private grafana/grafana workspace package that is not published to npm.
- `timeseries/ThresholdsStyleEditor.test.tsx`: needs `react-select-event`, not a dependency here (the editor is unused by
  the state timeline; it is only reachable through `timeseries/config.ts`).

Plugin-authored tests (`src/pjan/`): `panelChangedHandler.test.ts` (panel type switch) and `buildConfig.test.ts` (JSX
runtime regression guard).

End-to-end (`npm run e2e`, Grafana 13.2.3 OSS dev server from `docker-compose.yaml`):

- `tests/panel.spec.ts` with `provisioning/dashboards/dashboard.json`: one core/plugin pair; canvas, legend and pixels.
- `tests/parity.spec.ts` with `provisioning/dashboards/parity.json` (generated by
  `scripts/generate-parity-dashboard.mjs`): 11 cases (defaults; thresholds; special value mappings; nulls by default;
  `spanNulls`; `insertNulls` 30m; pagination at 3 per page; legend table on the right with a multi tooltip; axis
  hidden, centred values shown always, fill opacity 40, line width 2, row height 0.6; overrides incl. `hideFrom.legend`;
  50 rows × 2160 points), each in the light and the dark theme. Every case compares the canvas bytes (size and an FNV
  hash of the RGBA data) of the core and the plugin panel, and requires at least 5% of the canvas to be painted, so two
  charts without boxes cannot pass as identical. The TestData CSV scenario has no relative time: all timestamps and the
  dashboard time range are fixed UTC values, written as ISO strings (Grafana 13.2.3 does not parse epoch-millisecond
  strings as an absolute dashboard time range and shows "Invalid date").

## Re-syncing to a newer tag

1. Re-run the dependency closure from `public/app/plugins/panel/state-timeline/{module.tsx,StateTimelinePanel.tsx,StateTimelineTooltip.tsx,hooks.tsx,migrations.ts,panelcfg.gen.ts,styles.ts}`
   at the new tag and compare with the tables below (new files, removed files, new `app/` or `/internal` imports).
2. For every file below, copy the upstream file to the plugin path, apply the import rewrites above, prepend the header,
   then re-apply the "Changes beyond import rewrites" (each is a few lines, marked `pjan-statetimeline-panel:` in the
   code where it is not a pure removal). `diff` against the previous upstream tag shows what Grafana changed.
3. Check each name the copied code imports from `packages/grafana-*/internal` against the new tag: prefer a public
   export if one appeared; otherwise re-copy the Apache helper. Re-check the partial copies (`features/annotations/api.ts`,
   `PanelQueryRunner.ts`, `uPlot/utils.ts`, `joinDataFrames.ts`) and the panel-editor flow that
   `src/pjan/panelChangedHandler.ts` relies on (`PanelOptionsPane`, `VizPanel.changePluginType` in `@grafana/scenes`).
4. Bump `@grafana/*` and the bundled dependency versions to the new tag's (`package.json` and `yarn.lock` of
   grafana/grafana), set `grafana_version` in `docker-compose.yaml`, then run `npm run typecheck && npm run lint &&
npm test && npm run build` and `npm run e2e` (the parity tests).

## Files

### Runtime code (AGPL-3.0, from public/app)

59 files, 8209 lines.

| Upstream path                                                                                  | Plugin path                                                                             | Lines | Changes                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/app/core/components/Form/Form.tsx`                                                     | `src/core/components/Form/Form.tsx`                                                     |    63 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/core/components/GraphNG/GraphNG.tsx`                                               | `src/core/components/GraphNG/GraphNG.tsx`                                               |   287 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/core/components/GraphNG/types.ts`                                                  | `src/core/components/GraphNG/types.ts`                                                  |    15 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/core/components/GraphNG/utils.ts`                                                  | `src/core/components/GraphNG/utils.ts`                                                  |   176 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/core/components/TagFilter/TagBadge.tsx`                                            | `src/core/components/TagFilter/TagBadge.tsx`                                            |    52 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/core/components/TagFilter/TagFilter.tsx`                                           | `src/core/components/TagFilter/TagFilter.tsx`                                           |   208 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/core/components/TagFilter/TagOption.tsx`                                           | `src/core/components/TagFilter/TagOption.tsx`                                           |    61 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/core/components/TimeSeries/utils.ts`                                               | `src/core/components/TimeSeries/utils.ts`                                               |   793 | imports; dropped one `eslint-disable-next-line import/order` comment (the plugin's ESLint has no import plugin)                                                                                                                                                              |
| `public/app/core/components/TimelineChart/TimelineChart.tsx`                                   | `src/core/components/TimelineChart/TimelineChart.tsx`                                   |   120 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/core/components/TimelineChart/timeline.ts`                                         | `src/core/components/TimelineChart/timeline.ts`                                         |   565 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/core/components/TimelineChart/utils.ts`                                            | `src/core/components/TimelineChart/utils.ts`                                            |   758 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/features/actions/analytics.ts`                                                     | `src/features/actions/analytics.ts`                                                     |    13 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/features/actions/utils.ts`                                                         | `src/features/actions/utils.ts`                                                         |   320 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/features/alerting/state/alertDef.ts`                                               | `src/features/alerting/state/alertDef.ts`                                               |   263 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/features/alerting/state/query_part.ts`                                             | `src/features/alerting/state/query_part.ts`                                             |    83 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/features/alerting/unified/utils/url.ts`                                            | `src/features/alerting/unified/utils/url.ts`                                            |    42 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/features/annotations/api.ts`                                                       | `src/features/annotations/api.ts`                                                       |    47 | partial copy; `annotationServer()` only provides `tags()`, the LegacyAnnotationServer implementation (the k8s client behind `grafana.kubernetesAnnotationsClient`, default off, is not ported); AnnotationTagsResponse from public/app/features/annotations/types.ts inlined |
| `public/app/features/panel/filters/adhoc.ts`                                                   | `src/features/panel/filters/adhoc.ts`                                                   |    68 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/features/panel/options/builder/CanvasControlsSwitchEditor.tsx`                     | `src/features/panel/options/builder/CanvasControlsSwitchEditor.tsx`                     |    38 | imports; AnnotationDisplayOptions/VizAnnotations from '@grafana/schema' instead of the deep path '@grafana/schema/dist/esm/common/common.gen' (not in the package's exports map)                                                                                             |
| `public/app/features/panel/options/builder/ClusteringSwitchEditor.tsx`                         | `src/features/panel/options/builder/ClusteringSwitchEditor.tsx`                         |    19 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/features/panel/options/builder/annotations.ts`                                     | `src/features/panel/options/builder/annotations.ts`                                     |    56 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/features/query/state/PanelQueryRunner.ts`                                          | `src/features/query/state/PanelQueryRunner.ts`                                          |     5 | partial copy (getNextRequestId only; the request id counter is per bundle, so ids restart at Q100 in this plugin)                                                                                                                                                            |
| `public/app/plugins/panel/barchart/distribute.ts`                                              | `src/plugins/panel/barchart/distribute.ts`                                              |    47 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/barchart/quadtree.ts`                                                | `src/plugins/panel/barchart/quadtree.ts`                                                |   148 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/canvas/panelcfg.gen.ts`                                              | `src/plugins/panel/canvas/panelcfg.gen.ts`                                              |   167 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/state-timeline/StateTimelinePanel.tsx`                               | `src/plugins/panel/state-timeline/StateTimelinePanel.tsx`                               |   190 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/state-timeline/StateTimelineTooltip.tsx`                             | `src/plugins/panel/state-timeline/StateTimelineTooltip.tsx`                             |   115 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/state-timeline/hooks.tsx`                                            | `src/plugins/panel/state-timeline/hooks.tsx`                                            |    71 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/state-timeline/migrations.ts`                                        | `src/plugins/panel/state-timeline/migrations.ts`                                        |   144 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/state-timeline/module.tsx`                                           | `src/plugins/panel/state-timeline/module.tsx`                                           |   162 | imports; panel suggestions (setSuggestionsSupplier/showDefaultSuggestion) left off; setPanelChangeHandler(panelChangedHandler from src/pjan/, which keeps options when switching from core state-timeline and otherwise calls timelinePanelChangedHandler)                   |
| `public/app/plugins/panel/state-timeline/panelcfg.gen.ts`                                      | `src/plugins/panel/state-timeline/panelcfg.gen.ts`                                      |    54 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/state-timeline/styles.ts`                                            | `src/plugins/panel/state-timeline/styles.ts`                                            |     6 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/status-history/panelcfg.gen.ts`                                      | `src/plugins/panel/status-history/panelcfg.gen.ts`                                      |    49 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/status-history/utils.ts`                                             | `src/plugins/panel/status-history/utils.ts`                                             |    38 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/InsertNullsEditor.tsx`                                    | `src/plugins/panel/timeseries/InsertNullsEditor.tsx`                                    |    36 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/LineStyleEditor.tsx`                                      | `src/plugins/panel/timeseries/LineStyleEditor.tsx`                                      |   147 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/NullsThresholdInput.tsx`                                  | `src/plugins/panel/timeseries/NullsThresholdInput.tsx`                                  |    70 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/SpanNullsEditor.tsx`                                      | `src/plugins/panel/timeseries/SpanNullsEditor.tsx`                                      |    40 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/ThresholdsStyleEditor.tsx`                                | `src/plugins/panel/timeseries/ThresholdsStyleEditor.tsx`                                |    22 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/TimeSeriesTooltip.tsx`                                    | `src/plugins/panel/timeseries/TimeSeriesTooltip.tsx`                                    |   141 | imports; Grafana Assistant tooltip button (assistantContext prop, AssistantTooltipButton) pruned                                                                                                                                                                             |
| `public/app/plugins/panel/timeseries/config.ts`                                                | `src/plugins/panel/timeseries/config.ts`                                                |   285 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/AnnotationsPlugin.tsx`                            | `src/plugins/panel/timeseries/plugins/AnnotationsPlugin.tsx`                            |   376 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/OutsideRangePlugin.tsx`                           | `src/plugins/panel/timeseries/plugins/OutsideRangePlugin.tsx`                           |   107 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationAlertState.tsx`             | `src/plugins/panel/timeseries/plugins/annotations/AnnotationAlertState.tsx`             |    30 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationAvatar.tsx`                 | `src/plugins/panel/timeseries/plugins/annotations/AnnotationAvatar.tsx`                 |    24 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationEditor.tsx`                 | `src/plugins/panel/timeseries/plugins/annotations/AnnotationEditor.tsx`                 |   196 | imports; dropped two `eslint-disable-next-line @grafana/require-no-margin` comments (rule of Grafana's internal ESLint plugin, unknown to the plugin's ESLint)                                                                                                               |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationMarker.tsx`                 | `src/plugins/panel/timeseries/plugins/annotations/AnnotationMarker.tsx`                 |   222 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationTooltip.tsx`                | `src/plugins/panel/timeseries/plugins/annotations/AnnotationTooltip.tsx`                |    81 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationTooltipBody.tsx`            | `src/plugins/panel/timeseries/plugins/annotations/AnnotationTooltipBody.tsx`            |    51 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationTooltipCluster.tsx`         | `src/plugins/panel/timeseries/plugins/annotations/AnnotationTooltipCluster.tsx`         |   149 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationTooltipHeader.tsx`          | `src/plugins/panel/timeseries/plugins/annotations/AnnotationTooltipHeader.tsx`          |   157 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationTooltipHeaderCloseIcon.tsx` | `src/plugins/panel/timeseries/plugins/annotations/AnnotationTooltipHeaderCloseIcon.tsx` |    20 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/annotations/constants.ts`                         | `src/plugins/panel/timeseries/plugins/annotations/constants.ts`                         |     2 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/annotations/getAnnotationTooltip.tsx`             | `src/plugins/panel/timeseries/plugins/annotations/getAnnotationTooltip.tsx`             |    61 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/annotations/types.ts`                             | `src/plugins/panel/timeseries/plugins/annotations/types.ts`                             |    39 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/annotations/useAnnotationClustering.tsx`          | `src/plugins/panel/timeseries/plugins/annotations/useAnnotationClustering.tsx`          |   243 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/annotations/useAnnotations.tsx`                   | `src/plugins/panel/timeseries/plugins/annotations/useAnnotations.tsx`                   |    62 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/plugins/utils.ts`                                         | `src/plugins/panel/timeseries/plugins/utils.ts`                                         |    52 | imports only                                                                                                                                                                                                                                                                 |
| `public/app/plugins/panel/timeseries/utils.ts`                                                 | `src/plugins/panel/timeseries/utils.ts`                                                 |   353 | imports only                                                                                                                                                                                                                                                                 |

### Helpers from the @grafana packages (Apache-2.0)

6 files, 758 lines.

| Upstream path                                                                          | Plugin path                                                                                | Lines | Changes                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/grafana-data/src/transformations/transformers/joinDataFrames.ts`             | `src/packages/grafana-data/src/transformations/transformers/joinDataFrames.ts`             |    59 | partial copy (maybeSortFrame, NULL_REMOVE, NULL_RETAIN, NULL_EXPAND, isLikelyAscendingVector); imports from the public @grafana/data API                                                                                                                                                                                                                                                                                    |
| `packages/grafana-data/src/transformations/transformers/nulls/nullToUndefThreshold.ts` | `src/packages/grafana-data/src/transformations/transformers/nulls/nullToUndefThreshold.ts` |    30 | none                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `packages/grafana-ui/src/components/uPlot/config/gradientFills.ts`                     | `src/packages/grafana-ui/src/components/uPlot/config/gradientFills.ts`                     |   291 | getCanvasContext imported from the public @grafana/ui export                                                                                                                                                                                                                                                                                                                                                                |
| `packages/grafana-ui/src/components/uPlot/internal.ts`                                 | `src/packages/grafana-ui/src/components/uPlot/internal.ts`                                 |    40 | FIXED_UNIT imported from the public @grafana/ui export                                                                                                                                                                                                                                                                                                                                                                      |
| `packages/grafana-ui/src/components/uPlot/utils.ts`                                    | `src/packages/grafana-ui/src/components/uPlot/utils.ts`                                    |   294 | partial copy (StackMeta, StackingGroup, StackDirection, getStackingGroups, preparePlotData2, getStackDirection, hasNegSample, pluginLog); imports from the public @grafana/* APIs; StackDirection const enum declared as literal constants; attachDebugger('graphng', ...) call dropped (in Grafana it registers window._debug.graphng to toggle Grafana's own copy of this logger, and production builds never install it) |
| `packages/grafana-ui/src/utils/logger.ts`                                              | `src/packages/grafana-ui/src/utils/logger.ts`                                              |    44 | none                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Tests and test helpers (AGPL-3.0)

27 files, 8060 lines.

| Upstream path                                                                           | Plugin path                                                                      | Lines | Changes                                                                                              |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----: | ---------------------------------------------------------------------------------------------------- |
| `public/app/core/components/GraphNG/utils.test.ts`                                      | `src/core/components/GraphNG/utils.test.ts`                                      |   800 | imports only                                                                                         |
| `public/app/core/components/TimeSeries/utils.test.ts`                                   | `src/core/components/TimeSeries/utils.test.ts`                                   |   653 | imports only                                                                                         |
| `public/app/core/components/TimelineChart/timeline.test.ts`                             | `src/core/components/TimelineChart/timeline.test.ts`                             |   287 | imports only                                                                                         |
| `public/app/core/components/TimelineChart/utils.test.ts`                                | `src/core/components/TimelineChart/utils.test.ts`                                |   642 | imports only                                                                                         |
| `public/app/features/actions/utils.test.ts`                                             | `src/features/actions/utils.test.ts`                                             |   528 | imports; jest.mock for the TimeSrv stand-in; ./analytics mocked with jest.mock instead of jest.spyOn |
| `public/app/features/alerting/unified/utils/url.test.ts`                                | `src/features/alerting/unified/utils/url.test.ts`                                |    88 | imports only                                                                                         |
| `public/app/plugins/panel/barchart/distribute.test.ts`                                  | `src/plugins/panel/barchart/distribute.test.ts`                                  |   109 | imports only                                                                                         |
| `public/app/plugins/panel/barchart/quadtree.test.ts`                                    | `src/plugins/panel/barchart/quadtree.test.ts`                                    |   329 | imports only                                                                                         |
| `public/app/plugins/panel/state-timeline/StateTimelinePanel.test.tsx`                   | `src/plugins/panel/state-timeline/StateTimelinePanel.test.tsx`                   |   120 | imports; validFrame fields get `config.custom = {}`                                                  |
| `public/app/plugins/panel/state-timeline/StateTimelineTooltip.test.tsx`                 | `src/plugins/panel/state-timeline/StateTimelineTooltip.test.tsx`                 |   135 | imports only                                                                                         |
| `public/app/plugins/panel/state-timeline/hooks.test.tsx`                                | `src/plugins/panel/state-timeline/hooks.test.tsx`                                |    62 | imports only                                                                                         |
| `public/app/plugins/panel/state-timeline/migrations.test.ts`                            | `src/plugins/panel/state-timeline/migrations.test.ts`                            |   165 | imports; PanelModel type from @grafana/data instead of core's dashboard PanelModel class             |
| `public/app/plugins/panel/test-utils.ts`                                                | `src/plugins/panel/test-utils.ts`                                                |    30 | imports only                                                                                         |
| `public/app/plugins/panel/timeseries/InsertNullsEditor.test.tsx`                        | `src/plugins/panel/timeseries/InsertNullsEditor.test.tsx`                        |    68 | imports only                                                                                         |
| `public/app/plugins/panel/timeseries/LineStyleEditor.test.tsx`                          | `src/plugins/panel/timeseries/LineStyleEditor.test.tsx`                          |   160 | imports only                                                                                         |
| `public/app/plugins/panel/timeseries/NullsThresholdInput.test.tsx`                      | `src/plugins/panel/timeseries/NullsThresholdInput.test.tsx`                      |    90 | imports only                                                                                         |
| `public/app/plugins/panel/timeseries/SpanNullsEditor.test.tsx`                          | `src/plugins/panel/timeseries/SpanNullsEditor.test.tsx`                          |    79 | imports only                                                                                         |
| `public/app/plugins/panel/timeseries/TimeSeriesTooltip.test.tsx`                        | `src/plugins/panel/timeseries/TimeSeriesTooltip.test.tsx`                        |   120 | imports only                                                                                         |
| `public/app/plugins/panel/timeseries/plugins/AnnotationPlugin.test.tsx`                 | `src/plugins/panel/timeseries/plugins/AnnotationPlugin.test.tsx`                 |    35 | imports only                                                                                         |
| `public/app/plugins/panel/timeseries/plugins/AnnotationsPlugin.test.tsx`                | `src/plugins/panel/timeseries/plugins/AnnotationsPlugin.test.tsx`                |  1133 | imports only                                                                                         |
| `public/app/plugins/panel/timeseries/plugins/OutsideRangePlugin.test.tsx`               | `src/plugins/panel/timeseries/plugins/OutsideRangePlugin.test.tsx`               |   199 | imports only                                                                                         |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationAvatar.test.tsx`     | `src/plugins/panel/timeseries/plugins/annotations/AnnotationAvatar.test.tsx`     |    31 | imports only                                                                                         |
| `public/app/plugins/panel/timeseries/plugins/annotations/AnnotationEditor.test.tsx`     | `src/plugins/panel/timeseries/plugins/annotations/AnnotationEditor.test.tsx`     |    81 | imports only                                                                                         |
| `public/app/plugins/panel/timeseries/plugins/annotations/getAnnotationTooltip.test.tsx` | `src/plugins/panel/timeseries/plugins/annotations/getAnnotationTooltip.test.tsx` |    73 | imports only                                                                                         |
| `public/app/plugins/panel/timeseries/plugins/mocks/mockAnnotationFrames.ts`             | `src/plugins/panel/timeseries/plugins/mocks/mockAnnotationFrames.ts`             |  1030 | imports only                                                                                         |
| `public/app/plugins/panel/timeseries/plugins/utils.test.ts`                             | `src/plugins/panel/timeseries/plugins/utils.test.ts`                             |   215 | imports only                                                                                         |
| `public/app/plugins/panel/timeseries/utils.test.ts`                                     | `src/plugins/panel/timeseries/utils.test.ts`                                     |   798 | imports only                                                                                         |
