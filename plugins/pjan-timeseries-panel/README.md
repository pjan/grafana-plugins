# pjan-timeseries-panel

**Time series plus** (its name in Grafana's visualization picker): a port of Grafana's core time series panel, from grafana/grafana **v13.2.3**, into a panel plugin. With nothing configured it is a drop-in replacement for the core panel. Opt-in additions: the colour model (Line color, Fill color, Point color) and the threshold line options (Threshold line color, opacity and width), both in `src/pjan/styling/`. The plan is `plans/atlas-timeseries-panel.md` in pjan/atlas. `src/README.md` is the user-facing description (shown in Grafana).

**Status:** the port is done, and both additions are built: the colour model (Line color, Fill color, Point color) and the threshold line options (Threshold line color, opacity and width). On 2026-10-05 the full end-to-end suite passed (58 of 58 tests, one worker: 103 parity cases in 8 theme and pixel ratio states, the annotation cases, interaction, saved JSON, the colour model and the threshold lines; `UPSTREAM.md`, "Test runs").

- **Upstream:** `UPSTREAM.md` covers:
  - every copied file, from upstream path to plugin path (the core panel, its overlays, GraphNG and the TimeSeries chart, and helpers from `@grafana/ui` and `@grafana/data`);
  - every change beyond import rewrites, the stand-ins for modules plugins can't use, and what was left off, with the reasons;
  - the panel-change handler;
  - the tests, the negative controls, and the steps to re-sync with a newer Grafana tag.

  Many copies are the same upstream files State timeline plus copies; `scripts/check-upstream-copies.mjs` (repository root) keeps those copies identical, and `scripts/resync-upstream.mjs` re-syncs all plugins at once (`scripts/README.md`). Keep copied files as close to upstream as possible, so the next re-sync stays a diff.

- **Layout** (as in `plugins/pjan-statetimeline-panel`):
  - `src/core/`, `src/features/`, `src/packages/`, `src/plugins/`: mirrored from grafana/grafana, with relaxed lint rules (`eslint.config.mjs`).
  - `src/pjan/`: plugin-authored code (the panel-change handler, which re-applies the field config with `@pjan/grafana-panel-utils`, and the plugin's own tests), with the scaffold's normal lint rules. Don't put it in the mirrored tree, and don't add `src/pjan/` to the relaxed list.
- **Build setup:** `webpack.config.ts` extends the scaffold's config (automatic JSX runtime, licence notices in `dist/`). The `build`/`dev` scripts must keep using it: after `npx @grafana/create-plugin update`, check them (`src/pjan/buildConfig.test.ts` fails if they point at `.config/` again).
- **Licence:** AGPL-3.0 (`LICENSE`); copied package code is Apache-2.0 (`LICENSE_APACHE2`); Grafana's `NOTICE.md`. `dist/` also gets `THIRD_PARTY_NOTICES.txt` for the bundled npm packages.

## Development

Install from the repository root (`npm install`). From this directory:

| Command                                                | What it does                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                                          | Build and watch into `dist/`                                                                                       |
| `npm run build`                                        | Production build into `dist/`                                                                                      |
| `npm run typecheck`, `npm run lint`, `npm run test:ci` | Checks (`npm test` watches)                                                                                        |
| `npm run server`                                       | Start a Grafana 13.2.3 OSS dev server on http://localhost:3000 with this plugin mounted and `provisioning/` loaded |
| `npm run e2e`                                          | Playwright tests against that server (`npm exec playwright install chromium` once)                                 |

Every plugin's dev server uses port 3000: run one at a time. On a busy machine, run the end-to-end tests with one browser at a time: `npx playwright test --workers=1` (the full suite then takes a long while; the parity tests run 8 × 103 comparisons). `PARITY_CASES=<regular expression>` limits the parity tests to the cases whose title matches. The dev server also mounts State timeline plus's `dist/` (build it first, `npm run build` at the root), for the crosshair check between the two plugins. It rotates login sessions every 2 hours instead of Grafana's 10 minutes (`docker-compose.yaml`), and Playwright allows 60 s per test and 10 s per assertion with four workers (`playwright.config.ts`), as for Stat plus.

End-to-end tests (details in `UPSTREAM.md`, "Tests"):

- `provisioning/dashboards/parity.json` and `parity-swapped.json` (`tests/parity.spec.ts`, with `tests/parity.ts`) have 103 parity cases, each a core and a plugin panel with the same query and settings, one above the other. They are generated: edit `scripts/generate-parity-dashboard.mjs` and run `node scripts/generate-parity-dashboard.mjs`. Every case is compared in the light and the dark theme, and after a live theme switch each way, at pixel ratio 1 and 2: canvas bytes, every attribute of every element, and screenshots byte by byte, each panel with the panel at the same place in the other dashboard (core and plugin swapped). The annotation cases are on their own pair of dashboards, `parity-annotations*.json` (`tests/parityAnnotations.spec.ts`), which creates their annotations through the HTTP API and deletes them afterwards.
- `tests/interaction.spec.ts`: tooltips (hover, a series hidden from the tooltip, no tooltip, pinning, data link, action), long data in the panel editor, drag to zoom, keyboard, the legend (isolate, toggle, colour picker, sort, Series visibility filter and pinning), crosshair sync (with the state timelines too) and adding an annotation, core and plugin alike; and values worked out by hand (a tooltip, the legend's last and max, where threshold lines are drawn).
- `tests/savedJson.spec.ts`: the saved JSON of a new panel, opening the editor, converting by `type` (and by `vizConfig.group` in a v2 dashboard), and switching a core Time series panel to Time series plus in the panel editor (plugin module loaded or not).
- `tests/styling.spec.ts`: the colour model (Line color, Fill color, Point color): what each draws in light and dark, the legend's and tooltip's swatches, ignored with colours by value and the Scheme gradient, the editor's order and when the options show, saving and clearing.
- `tests/thresholdLines.spec.ts`: the threshold line options: each line's position, colour, alpha and thickness worked out by hand in light and dark at pixel ratio 1 and 2, transparent steps, one set of lines per scale, the editor's order and when the options show, saving and clearing.
- Look panels up by title in the generated dashboards, never by id: adding a case shifts the ids.
- Dashboard time ranges with absolute times must be ISO strings (`"2025-10-01T00:00:00.000Z"`); Grafana shows epoch-millisecond strings as "Invalid date". Dashboard uids are at most 40 characters.
- If you change the `uid` of a provisioned dashboard while the dev server runs, Grafana 13.2.3 refuses to save it ("deprecatedInternalID … is already in use"); recreate the server with `docker compose down` and `npm run server`.
