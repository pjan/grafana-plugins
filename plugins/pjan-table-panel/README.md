# pjan-table-panel

**Table plus** (its name in Grafana's visualization picker): a port of Grafana's core table panel and the `TableNG` component it renders, from grafana/grafana **v13.2.3**, into a panel plugin, planned as a drop-in replacement for the core panel with opt-in additions (first Text color, then the pill options). The plan is `plans/atlas-table-panel.md` in pjan/atlas. `src/README.md` is the user-facing description (shown in Grafana).

**Status: the parity port is done** (plan step 6, 2026-10-05; not released). With nothing configured, Table plus is a drop-in replacement for the core panel; the opt-in additions (step 7: Text color, then the pill options) are not started. The end-to-end suite compares it with core Table in 74 cases, in four theme states at pixel ratio 1 and 2, plus interaction, saved-JSON, hand-computed and feature-flag checks (`UPSTREAM.md`, "Tests").

- **Upstream:** `UPSTREAM.md` covers:
  - every copied file, from upstream path to plugin path (the core panel and its helpers, the `TableNG` component and the shared `Table/` files, `ActionButton`, and the copies shared with Time series plus and State timeline plus);
  - every change beyond import rewrites (four copies with marked changes), the stand-ins (for the `/internal` and `/unstable` entry points, core modules, tests, and the 29 relative-path re-exports of plan decision 8), and what was left off, with the reasons;
  - the panel-change handler and the load migration;
  - the feature flags, read as core reads them (plan decision 5);
  - the tests, their adaptations, the negative controls, and the steps to re-sync with a newer Grafana tag.

  Some copies are the same upstream files Time series plus and State timeline plus copy; `scripts/check-upstream-copies.mjs` (repository root) keeps those copies identical, and `scripts/resync-upstream.mjs` re-syncs all plugins at once (`scripts/README.md`). Keep copied files as close to upstream as possible, so the next re-sync stays a diff.

- **Layout** (as in the other plugins):
  - `src/core/`, `src/features/`, `src/packages/`, `src/plugins/`: mirrored from grafana/grafana, with relaxed lint rules (`eslint.config.mjs`). Never run Prettier on it.
  - `src/pjan/`: plugin-authored code (the panel-change handler, which re-applies the field config with `@pjan/grafana-panel-utils`, the plugin's own tests and test helpers), with the scaffold's normal lint rules. Don't put it in the mirrored tree, and don't add `src/pjan/` to the relaxed list.
- **Guard against stray imports:** ESLint bans `@grafana/ui/unstable` and `@grafana/{ui,data,runtime}/internal` in `src/`, and `src/pjan/buildConfig.test.ts` checks that the built `dist/module.js` asks Grafana for neither (after `npm run build`; `npm run test:dist` runs only that check and fails without a build, as CI and the release workflow do after building): a stray `@grafana/ui/unstable` import would render Grafana's own `TableNG` instead of the copy.
- **Build setup:** `webpack.config.ts` extends the scaffold's config (automatic JSX runtime, licence notices in `dist/`). The `build`/`dev` scripts must keep using it: after `npx @grafana/create-plugin update`, check them (`src/pjan/buildConfig.test.ts` fails if they point at `.config/` again). Jest uses `ts-jest`, as grafana/grafana does (`jest.config.js`; `UPSTREAM.md`, "Tests").
- **Licence:** AGPL-3.0 (`LICENSE`), because the panel is derived from Grafana's core code; copied package code is Apache-2.0 (`LICENSE_APACHE2`); Grafana's `NOTICE.md`. `dist/` also gets `THIRD_PARTY_NOTICES.txt` for the bundled npm packages.

## Development

Install from the repository root (`npm install`). From this directory:

| Command                                                | What it does                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                                          | Build and watch into `dist/`                                                                                       |
| `npm run build`                                        | Production build into `dist/`                                                                                      |
| `npm run typecheck`, `npm run lint`, `npm run test:ci` | Checks (`npm test` watches)                                                                                        |
| `npm run server`                                       | Start a Grafana 13.2.3 OSS dev server on http://localhost:3000 with this plugin mounted and `provisioning/` loaded |
| `npx playwright test --workers=1`                      | Playwright tests against that server (`npm exec playwright install chromium` once)                                 |

Every plugin's dev server uses port 3000: run one at a time, and stop it with `docker compose down`. The dev server rotates login sessions every 2 hours instead of Grafana's 10 minutes (`docker-compose.yaml`). Playwright allows 60 s per test and 10 s per assertion and runs one browser at a time (`playwright.config.ts`); pass `--workers=1` anyway.

End-to-end tests: `tests/parity.spec.ts` (the generated `provisioning/dashboards/parity.json` and `parity-swapped.json`; regenerate them with `node scripts/generate-parity-dashboard.mjs` after changing a case), `tests/interaction.spec.ts`, `tests/handComputed.spec.ts`, `tests/savedJson.spec.ts`, the feature-flag tests (`provisioning/dashboards/feature-flags.json`) and the scaffold's `tests/panel.spec.ts`. The full suite takes about half an hour at one worker; `PARITY_CASES=<regex>` runs a subset of the parity cases.
