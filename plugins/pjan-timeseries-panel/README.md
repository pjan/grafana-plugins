# pjan-timeseries-panel

**Time series plus** (its name in Grafana's visualization picker): a port of Grafana's core time series panel, from grafana/grafana **v13.2.3**, into a panel plugin, planned as a drop-in replacement for the core panel with opt-in additions (first the colour model, then threshold lines). The plan is `plans/atlas-timeseries-panel.md` in pjan/atlas. `src/README.md` is the user-facing description (shown in Grafana).

**Status: scaffold only.** The workspace is set up like the other plugins (build, tests, licences, dev server), but no Grafana code is copied yet. The panel is a **placeholder**: `@grafana/create-plugin` 7.11.0's sample panel (`src/components/SimplePanel.tsx`, `src/types.ts`, and its options in `src/module.ts`), kept so the plugin builds, loads and has something to test. The parity port replaces it: `src/module.ts` then re-exports `plugin` from the copied `src/plugins/panel/timeseries/module.tsx`, and the placeholder files go.

- **Upstream:** `UPSTREAM.md` will list every copied file, every change beyond import rewrites, what is left off and why, and the re-sync steps, as for the other plugins. Many files are the same upstream files State timeline plus copies; `scripts/check-upstream-copies.mjs` (repository root) keeps those copies identical, and `scripts/resync-upstream.mjs` re-syncs all plugins at once (`scripts/README.md`).
- **Layout** (as in `plugins/pjan-statetimeline-panel`):
  - `src/core/`, `src/features/`, `src/packages/`, `src/plugins/`: mirrored from grafana/grafana, with relaxed lint rules (`eslint.config.mjs`). Not there yet.
  - `src/pjan/`: plugin-authored code, with the scaffold's normal lint rules. Don't put it in the mirrored tree, and don't add `src/pjan/` to the relaxed list.
- **Build setup:** `webpack.config.ts` extends the scaffold's config (automatic JSX runtime, licence notices in `dist/`). The `build`/`dev` scripts must keep using it: after `npx @grafana/create-plugin update`, check them (`src/pjan/buildConfig.test.ts` fails if they point at `.config/` again).
- **Licence:** AGPL-3.0 (`LICENSE`), because the panel will be derived from Grafana's core code; copied package code is Apache-2.0 (`LICENSE_APACHE2`); Grafana's `NOTICE.md`. `dist/` also gets `THIRD_PARTY_NOTICES.txt` for the bundled npm packages.

## Development

Install from the repository root (`npm install`). From this directory:

| Command                                                | What it does                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                                          | Build and watch into `dist/`                                                                                       |
| `npm run build`                                        | Production build into `dist/`                                                                                      |
| `npm run typecheck`, `npm run lint`, `npm run test:ci` | Checks (`npm test` watches)                                                                                        |
| `npm run server`                                       | Start a Grafana 13.2.3 OSS dev server on http://localhost:3000 with this plugin mounted and `provisioning/` loaded |
| `npm run e2e`                                          | Playwright tests against that server (`npm exec playwright install chromium` once)                                 |

Every plugin's dev server uses port 3000: run one at a time. The dev server rotates login sessions every 2 hours instead of Grafana's 10 minutes (`docker-compose.yaml`), and Playwright allows 60 s per test and 10 s per assertion with four workers (`playwright.config.ts`), as for Stat plus.

End-to-end tests: only the scaffold's `tests/panel.spec.ts` for the placeholder panel (with `provisioning/dashboards/dashboard.json`), renamed to the plugin's name. The parity suite comes with the port.
