# pjan-statetimeline-panel

A port of Grafana's core state-timeline panel, from grafana/grafana **v13.2.3**, into a panel plugin. With nothing configured it is a drop-in replacement for the core panel. Additions are opt-in (settings that are off by default); the first is per-row annotations ("Show on matching rows"). `src/README.md` is the user-facing description (shown in Grafana).

- **Upstream:** `UPSTREAM.md` covers:
  - every copied file, from upstream path to plugin path;
  - every change beyond import rewrites;
  - every pruned or left-off feature, with the reason;
  - the Apache-2.0 helpers copied from `@grafana/*` packages;
  - the steps to re-sync with a newer Grafana tag, and what each Grafana minor upgrade needs.

  Keep copied files as close to upstream as possible, so the next re-sync stays a diff.

- **Layout:**
  - `src/core/`, `src/features/`, `src/packages/`, `src/plugins/`: mirrored from grafana/grafana. These get relaxed lint rules (`eslint.config.mjs`), so upstream code is not rewritten.
  - `src/pjan/`: plugin-authored code (the panel-change handler, and the opt-in features: `rowAnnotations/`). It keeps the scaffold's normal lint rules; don't put it in the mirrored tree, and don't add `src/pjan/` to the relaxed list.
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

End-to-end tests:

- `provisioning/dashboards/dashboard.json` (`tests/panel.spec.ts`) shows the same data in the core state timeline and in this plugin, side by side; the tests check both draw identical pixels and the same legend.
- `provisioning/dashboards/parity.json` (`tests/parity.spec.ts`) has 11 parity cases (options, mappings, nulls, pagination, legend, overrides, a large panel), each compared pixel by pixel with the core panel in the light and the dark theme. It is generated: edit `scripts/generate-parity-dashboard.mjs` and run `node scripts/generate-parity-dashboard.mjs`.
- `provisioning/dashboards/row-annotations.json` (`tests/rowAnnotations.spec.ts`) is the per-row annotations case. The test creates its annotations on that dashboard through the HTTP API and deletes them afterwards, so the dashboard shows none outside a test run. It checks: with the option off, pixels and markers equal to the core panel; with it on, point and region markers on the right rows, the unmatched one full height, pagination, a row hidden with `hideFrom.viz`, Row key = Label (TestData random walk with labels), tooltips, one pinned tooltip at a time, clustering per row, switching the option in the panel editor, a new panel saving no per-row options, and adding an annotation on a row (Ctrl/Cmd-click, Ctrl/Cmd-drag, the tooltip's "Add annotation"; core's untagged one with another annotation field). A guard reads the rows from the canvas pixels and fails if a row marker is not exactly at the top of a drawn row (several layouts, pixel ratio 1 and 2, and after a height-only resize): `src/pjan/rowAnnotations/rowLayout.ts` copies the timeline's row geometry, and this catches it drifting from `timeline.ts` (`rowLayout.test.ts` also compares it with the boxes `timeline.ts` draws).
- Per-row annotations, code map (`src/pjan/rowAnnotations/`): `options.ts` (panel options and the "Annotation key" field option; `RowAnnotationsComboboxEditor.tsx` is their select), `matchRowAnnotations.ts` (row keys, matching, per-row frames), `rowLayout.ts` (row geometry), `StateTimelineAnnotations.tsx` (stands in for core's `AnnotationsPlugin` in `StateTimelinePanel.tsx`; renders it unchanged with the option off), `RowAnnotationsPlugin.tsx` (lines, markers, clustering, the annotation being added), `rowWipAnnotation.ts` (the annotation being added, and the row it goes on). The hooks in copied files are listed in `UPSTREAM.md`.
- Dashboard time ranges with absolute times must be ISO strings (`"2025-10-01T00:00:00.000Z"`); Grafana shows epoch-millisecond strings as "Invalid date".
