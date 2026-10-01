# grafana-plugins

pjan's Grafana plugins. Each plugin is an npm workspace in its own directory under `plugins/`, scaffolded by [`@grafana/create-plugin`](https://grafana.com/developers/plugin-tools) and following Grafana's own code conventions:
- TypeScript;
- React function components;
- Emotion styles through `useStyles2`;
- Jest tests next to the code.

| Plugin | Type | What it is | Licence |
|---|---|---|---|
| [`pjan-statetimeline-panel`](plugins/pjan-statetimeline-panel/) | panel | Grafana's state timeline as a plugin: a drop-in replacement that behaves like the core panel. Opt-in additions (styling, per-row events) are planned, not built yet. | AGPL-3.0: it starts from Grafana's own state-timeline code (see its `UPSTREAM.md`) |

## Working in the repo

- **Requirements:** Node 22 or later (`.nvmrc`) and npm.
  - On a network that inspects TLS, set `NODE_EXTRA_CA_CERTS` to a PEM file with its CA before running `npm`.
- **Install:** `npm install` at the root installs every plugin.
- **Checks:** from the root, across all plugins: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. CI (`.github/workflows/ci.yml`) runs the same four.
- **One plugin:** `npm run <script> -w plugins/<plugin-id>`. Each plugin also has the scaffold's own scripts (`dev`, `e2e`, `server`), run from its directory.

## Adding a plugin

1. In `plugins/`, run `npx @grafana/create-plugin@latest --pluginType=<panel|app|datasource> --pluginName=<name> --orgName=pjan`.
2. Delete the generated `.github/`, `.npmrc` and `.nvmrc`: CI runs from the root, the root `.npmrc` (`ignore-scripts=true`) applies to every workspace, and the root `.nvmrc` sets the Node version.
3. Delete the plugin's own `package-lock.json` (and `node_modules/`, if the scaffold installed one), then run `npm install` at the root: there is one lock file for all workspaces.
4. Set its `name` in `package.json` to the plugin id, and pin `@grafana/*` to the Grafana version in use.
5. Workspace setup the scaffold doesn't do (see `plugins/pjan-statetimeline-panel` for a worked example):
   - `tsconfig.json`: add `"typeRoots": ["./node_modules/@types", "../../node_modules/@types"]`, because npm workspaces hoist `@types/*` to the root and the scaffold only looks in the plugin's own `node_modules`.
   - Code that uses the automatic JSX runtime (no `import React`, as in Grafana's own code) also needs `"jsx": "react-jsx"` in `tsconfig.json`, a root `webpack.config.ts` that extends `.config/webpack/webpack.config.ts` and sets the swc rule's `jsc.transform.react.runtime` to `'automatic'` (with `build`/`dev` in `package.json` pointing at it), and the same swc setting in `jest.config.js`. Never edit `.config/`; `create-plugin update` overwrites it, and also resets the `build`/`dev` scripts.
6. Add it to the table above, with its licence.

## Deployment

Not decided yet; until then the plugins run only in a local test Grafana. The built `dist/` of a plugin is what Grafana loads, from `/var/lib/grafana/plugins/<plugin-id>`. The plugins are unsigned, so Grafana needs `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=<plugin-id>`.
