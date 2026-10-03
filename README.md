# grafana-plugins

pjan's Grafana plugins. Each plugin is an npm workspace in its own directory under `plugins/`, scaffolded by [`@grafana/create-plugin`](https://grafana.com/developers/plugin-tools) and following Grafana's own code conventions:

- TypeScript;
- React function components;
- Emotion styles through `useStyles2`;
- Jest tests next to the code.

| Plugin                                                          | Type  | What it is                                                                                                                                                                             | Licence                                                                            |
| --------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`pjan-statetimeline-panel`](plugins/pjan-statetimeline-panel/) | panel | **State timeline plus**: Grafana's state timeline as a plugin: a drop-in replacement that behaves like the core panel. Opt-in additions: per-row annotations and styling (both built). | AGPL-3.0: it starts from Grafana's own state-timeline code (see its `UPSTREAM.md`) |
| [`pjan-stat-panel`](plugins/pjan-stat-panel/)                   | panel | **Stat plus**: Grafana's stat panel as a plugin: a drop-in replacement that behaves like the core panel. Opt-in addition: Color mode Custom (background, text and sparkline colours).  | AGPL-3.0: it starts from Grafana's own stat code (see its `UPSTREAM.md`)           |

Code shared by several plugins lives in workspace packages under `packages/`, which the plugins bundle from source:

| Package                                              | What it is                                                                                         | Licence    |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------- |
| [`@pjan/grafana-styling`](packages/grafana-styling/) | Opt-in styling helpers: relative shades, colour names, contrast, and the colour and slider editors | Apache-2.0 |

Colour options work the same in every plugin (`packages/grafana-styling/README.md`, "Colour rules for every plugin"): colours you choose are drawn as chosen, and **Automatic** text is the first shade of the same hue that is readable on what it is drawn on.

## Working in the repo

- **Requirements:** Node 22 or later (`.nvmrc`) and npm.
  - On a network that inspects TLS, set `NODE_EXTRA_CA_CERTS` to a PEM file with its CA before running `npm`.
- **Install:** `npm install` at the root installs every plugin and package.
- **Checks:** from the root, across all plugins and packages: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. CI (`.github/workflows/ci.yml`) runs the same four.
- **One plugin:** `npm run <script> -w plugins/<plugin-id>`. Each plugin also has the scaffold's own scripts (`dev`, `e2e`, `server`), run from its directory.

## Adding a plugin

1. In `plugins/`, run `npx @grafana/create-plugin@latest --pluginType=<panel|app|datasource> --pluginName=<name> --orgName=pjan`.
2. Delete the generated `.github/`, `.npmrc` and `.nvmrc`: CI runs from the root, the root `.npmrc` (`ignore-scripts=true`) applies to every workspace, and the root `.nvmrc` sets the Node version.
3. Delete the plugin's own `package-lock.json` (and `node_modules/`, if the scaffold installed one), then run `npm install` at the root: there is one lock file for all workspaces.
4. Set its `name` in `package.json` to the plugin id, and pin `@grafana/*` to the Grafana version in use.
5. Workspace setup the scaffold doesn't do (see `plugins/pjan-statetimeline-panel` for a worked example):
   - `tsconfig.json`: add `"typeRoots": ["./node_modules/@types", "../../node_modules/@types"]`, because npm workspaces hoist `@types/*` to the root and the scaffold only looks in the plugin's own `node_modules`.
   - Code that uses the automatic JSX runtime (no `import React`, as in Grafana's own code) also needs `"jsx": "react-jsx"` in `tsconfig.json`, a root `webpack.config.ts` that extends `.config/webpack/webpack.config.ts` and sets the swc rule's `jsc.transform.react.runtime` to `'automatic'` (with `build`/`dev` in `package.json` pointing at it), and the same swc setting in `jest.config.js`. Never edit `.config/`; `create-plugin update` overwrites it, and also resets the `build`/`dev` scripts.
6. To use a shared package (see `plugins/pjan-statetimeline-panel`):
   - add `"@pjan/grafana-styling": "*"` to the plugin's `dependencies` and run `npm install` at the root;
   - the package's code uses the automatic JSX runtime, so the plugin's webpack and Jest configs need it too (step 5; copy `src/pjan/buildConfig.test.ts`);
   - the plugin's `webpack.config.ts` must list workspace packages in `THIRD_PARTY_NOTICES.txt` and fail on duplicate packages (`ThirdPartyNoticesPlugin`, `WORKSPACE_PACKAGES_DIR`);
   - pin `@grafana/*` to the versions the package expects (its `peerDependencies`): a different version gets its own copy, and a second `@grafana/i18n` would never be initialised (the build fails on it);
   - only the package's `src/index.ts` exports are for plugin code; `src/testdata/` is for tests.
7. Add it to the table above, with its licence.

## Releasing

A tag `<plugin-id>/v<version>` releases one plugin (`.github/workflows/release.yml`):

1. Set `version` in the plugin's `package.json` (Grafana reads it into `plugin.json`) and add a `## <version> (<date>)` section to its `CHANGELOG.md`. Every change to a built plugin needs a new version: Grafana's plugin URLs carry the version, so browsers otherwise keep the previous build cached.
2. Commit, then tag and push: `git tag pjan-statetimeline-panel/v1.0.0 && git push origin main pjan-statetimeline-panel/v1.0.0`.
3. The workflow checks that the tag, `package.json`, and the changelog agree, runs the plugin's checks, builds it, and creates a GitHub release with `<plugin-id>-<version>.zip` (the built plugin in a `<plugin-id>/` directory, without source maps) and its `.sha256`.

## Deployment

Grafana loads a plugin from `/var/lib/grafana/plugins/<plugin-id>`: unzip a release there. The plugins are unsigned, so Grafana needs `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=<plugin-id>`.
