# Upstream: Grafana core time series

This plugin will be a port of Grafana's core **time series** panel (`timeseries`) from
[grafana/grafana](https://github.com/grafana/grafana) at tag **`v13.2.3`** (commit `6193dc0`, "Release: 13.2.3").
With nothing configured it is to look and behave like the core panel. The plan is `plans/atlas-timeseries-panel.md` in
pjan/atlas.

**Status: scaffold.** Nothing is copied from grafana/grafana yet; the panel is the scaffold's placeholder (see
`README.md`). Apart from the build configuration and `plugin.json`, the sections below describe the rules the port
follows; the tables of copied files, changes and left-off features come with it.

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
import rewrites is marked `pjan-timeseries-panel:` in the code (also removals in files listed under "Copies with marked
changes", see there).

## Layout

Copied files mirror their upstream path under `src/`:

- `public/app/<path>` is copied to `src/<path>`.
- `packages/grafana-<pkg>/src/<path>` is copied to `src/packages/grafana-<pkg>/src/<path>`.
- `src/pjan/` is plugin-authored code (not from grafana/grafana). It gets the scaffold's normal lint rules (see "Plugin
  build configuration"). The colour helpers shared with the other plugins of the repository are in the workspace package
  `@pjan/grafana-styling` (`packages/grafana-styling/`, Apache-2.0, bundled from source).
- `src/module.ts` is the plugin entry: it initialises `@grafana/i18n` for this plugin and exports `plugin` (for now the
  scaffold's placeholder; after the port, a re-export from `src/plugins/panel/timeseries/module.tsx`).
- `src/img/icn-timeseries-panel.svg` is core's `public/app/plugins/panel/timeseries/img/icn-timeseries-panel.svg` (the
  panel logo).

Non-relative imports such as `core/components/...` resolve from `src/` (scaffold `baseUrl`/`paths` in
`.config/tsconfig.json`, `resolve.modules` in webpack, `modulePaths` in Jest).

## Import rewrites (mechanical, applied to every copied file)

The same rewrites as State timeline plus, which `scripts/resync-upstream.mjs` applies when it re-syncs:

| Upstream import                                  | Plugin import                         | Why                                                                         |
| ------------------------------------------------ | ------------------------------------- | --------------------------------------------------------------------------- |
| `'app/<path>'`                                   | `'<path>'`                            | Same file, resolved from `src/`.                                            |
| `'@grafana/ui/internal'`                         | `'packages/grafana-ui/internal'`      | `/internal` is not shared with plugins at runtime.                          |
| `'@grafana/data/internal'`                       | `'packages/grafana-data/internal'`    | Same.                                                                       |
| `'@grafana/runtime/internal'`                    | `'packages/grafana-runtime/internal'` | Same.                                                                       |
| `'@grafana/e2e-selectors'` (non-test files only) | `'packages/grafana-e2e-selectors'`    | Avoids bundling the package for a few `data-testid` strings; tests keep it. |

## Copies with marked changes

The copies with lines marked `pjan-timeseries-panel`. `scripts/check-upstream-copies.mjs` (repository root, run in CI;
`scripts/README.md`) reads this list: another plugin's copy of the same upstream file may differ from one listed here
only in hunks with a marked line; every other copy that another plugin also has must be identical to it, apart from the
header's `Changes:` text. Every copy with a marked line is listed, and only those.

None yet.

## Stand-ins of its own

The stand-ins (files starting `// Plugin stand-in for ...`) that another plugin also has at the same path, but with
different content. `scripts/check-upstream-copies.mjs` reads this list: a stand-in at a path another plugin also has
must be byte-identical to the other plugins' unlisted stand-ins there, unless it is listed here; a stand-in is listed
here exactly when no other plugin's stand-in at that path has the same content.

None yet.

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
- `jest-setup.js`: `jest-canvas-mock` (core's `setupFiles`), core's `MessageChannel` and `ResizeObserver` polyfills from
  `public/test/jest-setup.ts`, and a `URL.canParse` polyfill (jsdom 20 lacks it).
- `eslint.config.mjs`: `react/react-in-jsx-scope` off for `src/`; `@pjan/grafana-styling` imported through its entry
  point only (tests may import its `src/testdata/`); for the mirrored tree only
  (`src/{core,features,packages,plugins}/**`): `react-hooks/refs`, `react-hooks/set-state-in-effect`,
  `@typescript-eslint/array-type`, `no-redeclare` off and unused disable directives not reported.
- `docker-compose.yaml`: Grafana OSS 13.2.3 (the image and version Atlas runs), session tokens rotated every 2 hours
  (`GF_AUTH_TOKEN_ROTATION_INTERVAL_MINUTES: 120`). `playwright.config.ts`: 60 s per test, 10 s per assertion, 4
  workers.
- i18n: `src/module.ts` calls `await initPluginTranslations(pluginJson.id)` for the bundled `@grafana/i18n`. The plugin
  ships no translations.
- Runtime dependencies bundled (not shared by Grafana), pinned to the versions in grafana/grafana v13.2.3's `yarn.lock`,
  the same set and versions as State timeline plus: `uplot` 1.6.32, `@floating-ui/react` 0.27.20 and
  `@floating-ui/dom` 1.8.0, `react-hook-form` 7.62.0, `react-select` 5.10.2, `tinycolor2` 1.6.0, `micro-memoize` 4.2.0,
  `react-use` 17.6.1, `@grafana/schema` and `@grafana/i18n` 13.2.3, and the workspace package `@pjan/grafana-styling`.
  `lodash` 4.18.1 is a shared external at runtime. Until the port, only `@grafana/i18n` (with its i18next helpers) is
  bundled: `src/module.ts` initialises it. Dev dependency for the copied tests: `react-select-event` 5.5.1
  (`TimezonesEditor.test.tsx`, `ThresholdsStyleEditor.test.tsx`).

## plugin.json

The scaffold's id; the name is "Time series plus". From core's `plugin.json`: the `img/icn-timeseries-panel.svg` logo
and the documentation link. Added a "Source code" link (AGPL source offer). Not applicable to an external panel:
`"suggestions": true` (suggestions stay off, as in the other plugins), the "Raise issue" link (Grafana's tracker).

`grafanaDependency` is `^13.2.0`: the code will be that of Grafana 13.2.3. **Every Grafana minor upgrade** needs the
parity tests against that version and a re-sync check against the new tag before `grafanaDependency` is widened.

## Tests

- `src/pjan/buildConfig.test.ts`: the `build`/`dev` scripts use `webpack.config.ts`, which turns on the automatic JSX
  runtime, and `tsconfig.json` type-checks with it.
- `tests/panel.spec.ts`: the scaffold's end-to-end tests of the placeholder panel (the visualization renamed to "Time
  series plus").

## Re-syncing to a newer tag

`scripts/resync-upstream.mjs` (repository root, `scripts/README.md`) re-syncs the copies of every plugin at once: it
re-copies those that differ from upstream only by the import rewrites, and merges the upstream changes into the others
(a 3-way merge), which then need a review. Per plugin, by hand: re-run the dependency closure from
`public/app/plugins/panel/timeseries/module.tsx` at the new tag; check the stand-ins and the names imported from
`packages/grafana-*/internal`; bump `@grafana/*` and the bundled dependency versions (`package.json`, and `yarn.lock` of
grafana/grafana) and `grafana_version` in `docker-compose.yaml`; then run `npm run check:upstream-copies`, the four
checks and `npm run e2e`.

**`pluginVersion`:** core time series has no load migration handler in 13.2.3, so a saved plugin version of 1.x
triggers nothing on load. At each re-sync, check whether Grafana added a time series migration handler that compares
versions: a saved 1.x would then read as an old Grafana version.

## Files

None copied yet.
