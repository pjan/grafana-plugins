# pjan-stat-panel

**Stat ++** (its name in Grafana's visualization picker): a port of Grafana's core stat panel, from grafana/grafana **v13.2.3**, into a panel plugin. With nothing configured it is a drop-in replacement for the core panel; additions will be opt-in. The plan is `plans/atlas-stat-panel.md` in pjan/atlas. `src/README.md` is the user-facing description (shown in Grafana).

**Status:** the port is done (parity with core Stat, verified by the parity suite); no additions yet.

- **Upstream:** `UPSTREAM.md` covers:
  - every copied file, from upstream path to plugin path (the core panel, and the `BigValue` tile renderer from `@grafana/ui`);
  - every change beyond import rewrites;
  - what was left off (panel suggestions), with the reason;
  - the panel-change handler, and the `pluginVersion` caveat;
  - the steps to re-sync with a newer Grafana tag, and what each Grafana minor upgrade needs.

  Keep copied files as close to upstream as possible, so the next re-sync stays a diff.

- **Layout** (as in `plugins/pjan-statetimeline-panel`):
  - `src/core/`, `src/features/`, `src/packages/`, `src/plugins/`: mirrored from grafana/grafana, with relaxed lint rules (`eslint.config.mjs`).
  - `src/pjan/`: plugin-authored code (the panel-change handler, the module wiring test), with the scaffold's normal lint rules. Don't put it in the mirrored tree, and don't add `src/pjan/` to the relaxed list.
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

Every plugin's dev server uses port 3000: run one at a time.

End-to-end tests:

- `provisioning/dashboards/dashboard.json` (`tests/panel.spec.ts`) shows the same data in the core stat panel and in this plugin, one above the other; the tests check both draw the same tiles, sparklines and pixels.
- `provisioning/dashboards/parity.json` and `parity-swapped.json` (`tests/parity.spec.ts`) have 66 parity cases, each a core and a plugin panel with the same query and settings. They are generated: edit `scripts/generate-parity-dashboard.mjs` and run `node scripts/generate-parity-dashboard.mjs`. Every case is compared in the light and the dark theme, and after a live theme switch each way, at pixel ratio 1 and 2: screenshots byte by byte, every attribute of every element, sparkline canvases and native tooltips. Each panel is compared with the panel at the same place in the other dashboard (core and plugin swapped), because Chrome dithers the background gradient differently at different places on the page; Grafana's panel frame is squared off for the screenshots, because the anti-aliasing of its rounded bottom corners, where they clip the tiles, differed in 3 or 4 pixels between two loads of the same core panel. Details in `UPSTREAM.md`, "Tests". The parity run takes about 5 minutes.
- `tests/interaction.spec.ts`: data links (one link, the links menu, keyboard focus) in the core panel and the plugin.
- `tests/savedJson.spec.ts`: the saved JSON of a new panel, opening the editor, converting by `type` and back, the `pluginVersion` caveat and its workaround, switching back to Stat in the editor, and switching a core Stat panel to Stat ++ in the panel editor (classic palette or no colour, plugin module loaded or not). It creates dashboards through the HTTP API and deletes them afterwards.
- Dashboard time ranges with absolute times must be ISO strings (`"2025-10-01T00:00:00.000Z"`); Grafana shows epoch-millisecond strings as "Invalid date".
- If you change the `uid` of a provisioned dashboard while the dev server runs, Grafana 13.2.3 refuses to save it ("deprecatedInternalID … is already in use"); restart the server with `docker compose down` and `npm run server`.
