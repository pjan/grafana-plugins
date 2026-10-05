# @pjan/grafana-panel-utils

Panel helpers shared by pjan's Grafana panel plugins (State timeline plus, Stat plus, Time series plus and Table plus) that are not styling. A private npm workspace: plugins depend on it as `"@pjan/grafana-panel-utils": "*"` and bundle its TypeScript source; it is never built or published on its own. Apache-2.0 (`LICENSE`); the plugins that bundle it list it in their `THIRD_PARTY_NOTICES.txt`.

## What it holds

| File                        | What it does                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/fieldConfigRefresh.ts` | After a panel-change handler restored the core panel's field config in place (a core panel switched to a plus plugin in the panel editor), the panel applies it again: the handler calls `markFieldConfigChanged(fieldConfig)`, the panel calls `useApplyFieldConfigChangedInPlace(fieldConfig, onFieldConfigChange)`. Why it is needed (scenes 8.13.5's field config cache) is in the file |

Everything is exported from `src/index.ts`.

## Rules

- Only what more than one plugin needs, and only public `@grafana/*` APIs (`peerDependencies`; the plugin provides them). Styling helpers go to `@pjan/grafana-styling` instead.
- Plugin-authored code: no code copied from grafana/grafana. Grafana code conventions (TypeScript, function components, tests next to the code).
- Plugins import it through its entry point only (`@pjan/grafana-panel-utils`; each plugin's `eslint.config.mjs`).

## Checks

The root scripts include this workspace: `npm run typecheck`, `npm run lint`, `npm test` (or `-w packages/grafana-panel-utils`). A plugin's own `tsc` does not report errors inside this package, so its `typecheck` here is the one that counts.
