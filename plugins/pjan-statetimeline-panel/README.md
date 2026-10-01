# pjan-statetimeline-panel

A port of Grafana's core state-timeline panel, from grafana/grafana **v13.2.3**, into a panel plugin. With nothing configured it is a drop-in replacement for the core panel. Opt-in additions (settings that are off by default) are planned; none exist yet. `src/README.md` is the user-facing description (shown in Grafana).

- **Upstream:** `UPSTREAM.md` covers:
  - every copied file, from upstream path to plugin path;
  - every change beyond import rewrites;
  - every pruned or left-off feature, with the reason;
  - the Apache-2.0 helpers copied from `@grafana/*` packages;
  - the steps to re-sync with a newer Grafana tag, and what each Grafana minor upgrade needs.

  Keep copied files as close to upstream as possible, so the next re-sync stays a diff.
- **Layout:**
  - `src/core/`, `src/features/`, `src/packages/`, `src/plugins/`: mirrored from grafana/grafana. These get relaxed lint rules (`eslint.config.mjs`), so upstream code is not rewritten.
  - `src/pjan/`: plugin-authored code (the panel-change handler, and the planned opt-in features). It keeps the scaffold's normal lint rules; don't put it in the mirrored tree, and don't add `src/pjan/` to the relaxed list.
- **Build setup:** `webpack.config.ts` extends the scaffold's config (automatic JSX runtime, licence notices in `dist/`). The `build`/`dev` scripts must keep using it: after `npx @grafana/create-plugin update`, check them (`src/pjan/buildConfig.test.ts` fails if they point at `.config/` again).
- **Licence:** AGPL-3.0 (`LICENSE`); copied package code is Apache-2.0 (`LICENSE_APACHE2`); Grafana's `NOTICE.md`. `dist/` also gets `THIRD_PARTY_NOTICES.txt` for the bundled npm packages.

## Development

Install from the repository root (`npm install`). From this directory:

| Command | What it does |
|---|---|
| `npm run dev` | Build and watch into `dist/` |
| `npm run build` | Production build into `dist/` |
| `npm run typecheck`, `npm run lint`, `npm run test:ci` | Checks (`npm test` watches) |
| `npm run server` | Start a Grafana 13.2.3 OSS dev server on http://localhost:3000 with this plugin mounted and `provisioning/` loaded |
| `npm run e2e` | Playwright tests against that server (`npm exec playwright install chromium` once) |

End-to-end tests:

- `provisioning/dashboards/dashboard.json` (`tests/panel.spec.ts`) shows the same data in the core state timeline and in this plugin, side by side; the tests check both draw identical pixels and the same legend.
- `provisioning/dashboards/parity.json` (`tests/parity.spec.ts`) has 11 parity cases (options, mappings, nulls, pagination, legend, overrides, a large panel), each compared pixel by pixel with the core panel in the light and the dark theme. It is generated: edit `scripts/generate-parity-dashboard.mjs` and run `node scripts/generate-parity-dashboard.mjs`.
- Dashboard time ranges with absolute times must be ISO strings (`"2025-10-01T00:00:00.000Z"`); Grafana shows epoch-millisecond strings as "Invalid date".
