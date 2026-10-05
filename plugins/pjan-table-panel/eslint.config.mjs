import { defineConfig } from 'eslint/config';
import baseConfig from './.config/eslint.config.mjs';

// Guard against the port quietly rendering Grafana's own table instead of the copy (plan "Architecture"): the plugin's
// externals (`/^@grafana\/ui/i` in .config/bundler/externals.ts) would leave a stray import of these entry points to
// Grafana at runtime, so core's TableNG would render and a core-vs-plugin comparison would still pass. The copied code
// reaches them only through the mechanical rewrites to `packages/grafana-*/...` stand-ins (UPSTREAM.md, "Import
// rewrites"). src/pjan/buildConfig.test.ts checks the built dist/module.js as well.
const GRAFANA_ENTRY_POINTS_NOT_FOR_PLUGINS = [
  {
    name: '@grafana/ui/unstable',
    message: "Not for plugins (Grafana's TableNG would render). Import 'packages/grafana-ui/unstable' (the copy).",
  },
  ...['ui', 'data', 'runtime'].map((pkg) => ({
    name: `@grafana/${pkg}/internal`,
    message: `Not shared with plugins at runtime. Import 'packages/grafana-${pkg}/internal' (the plugin's stand-in).`,
  })),
];

// Upstream's copied files disable rules of two plugins of Grafana's own lint setup (eslint-plugin-jsx-a11y and
// eslint-plugin-testing-library) on some lines. This config doesn't load those plugins, and ESLint reports a directive
// for an unknown rule as an error, so the names those directives use are declared here as rules that check nothing.
const checksNothing = { create: () => ({}) };
const declaredOnly = (names) => ({ rules: Object.fromEntries(names.map((name) => [name, checksNothing])) });
const UPSTREAM_DIRECTIVE_PLUGINS = {
  'jsx-a11y': declaredOnly(['anchor-is-valid', 'click-events-have-key-events', 'no-static-element-interactions']),
  'testing-library': declaredOnly(['prefer-user-event', 'render-result-naming-convention']),
};

export default defineConfig([
  {
    ignores: [
      '**/logs',
      '**/*.log',
      '**/npm-debug.log*',
      '**/yarn-debug.log*',
      '**/yarn-error.log*',
      '**/.pnpm-debug.log*',
      '**/node_modules/',
      '.yarn/cache',
      '.yarn/unplugged',
      '.yarn/build-state.yml',
      '.yarn/install-state.gz',
      '**/.pnp.*',
      '**/pids',
      '**/*.pid',
      '**/*.seed',
      '**/*.pid.lock',
      '**/lib-cov',
      '**/coverage',
      '**/dist/',
      '**/artifacts/',
      '**/work/',
      '**/ci/',
      'test-results/',
      'playwright-report/',
      'blob-report/',
      'playwright/.cache/',
      'playwright/.auth/',
      '**/.idea',
      '**/.eslintcache',
    ],
  },
  ...baseConfig,
  {
    // The plugin builds with the automatic JSX runtime (see tsconfig.json and webpack.config.ts).
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'react/react-in-jsx-scope': 'off',
    },
  },
  {
    // Plugin code imports the shared packages through their entry points only; src/testdata/ is for tests. Keeps
    // Grafana's own `moment` restriction (@grafana/eslint-config), which this rule would otherwise replace.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/**/testdata/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            'moment',
            ...GRAFANA_ENTRY_POINTS_NOT_FOR_PLUGINS,
            {
              // tsconfig.json maps it to a test stand-in, so a runtime import would typecheck against the stand-in
              name: '@openfeature/react-sdk',
              message:
                'Not a dependency; tests only (src/pjan/testdata/openFeatureReactSdk.tsx). Use @openfeature/web-sdk.',
            },
          ],
          patterns: [
            {
              group: ['@pjan/grafana-styling/*'],
              message: 'Import from @pjan/grafana-styling (its src/index.ts); its src/testdata/ is for tests.',
            },
            {
              group: ['@pjan/grafana-panel-utils/*'],
              message: 'Import from @pjan/grafana-panel-utils (its src/index.ts).',
            },
          ],
        },
      ],
    },
  },
  {
    // Tests and test data may import the shared packages' src/testdata/, but not Grafana's entry points either.
    files: ['src/**/*.test.{ts,tsx}', 'src/**/testdata/**'],
    rules: {
      'no-restricted-imports': ['error', { paths: ['moment', ...GRAFANA_ENTRY_POINTS_NOT_FOR_PLUGINS] }],
    },
  },
  {
    // Only the tree mirrored from grafana/grafana (see UPSTREAM.md). It is kept as close to upstream as possible, so
    // rules that Grafana's own lint setup does not enforce on this code are relaxed here instead of rewriting it.
    // Plugin-authored code lives in src/pjan/ and keeps the scaffold's rules: do not add it to this list.
    files: ['src/core/**', 'src/features/**', 'src/packages/**', 'src/plugins/**'],
    linterOptions: {
      // Upstream carries disable comments for rules this config does not trigger.
      reportUnusedDisableDirectives: 'off',
    },
    plugins: UPSTREAM_DIRECTIVE_PLUGINS,
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      // The React Compiler rules of eslint-plugin-react-hooks 7, which Grafana's lint setup doesn't run (the copied
      // TableNG hooks and the cell option editors).
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/void-use-memo': 'off',
      '@typescript-eslint/array-type': 'off',
      // TypeScript already rejects real redeclarations; this flags the TS value + type pattern.
      'no-redeclare': 'off',
      // The copied tests: MaybeWrapWithLink.test.tsx passes `children` as a prop, hooks.test.tsx returns wrapper
      // components from a function.
      'react/no-children-prop': 'off',
      'react/display-name': 'off',
    },
  },
]);
