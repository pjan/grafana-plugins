import { defineConfig } from 'eslint/config';
import baseConfig from './.config/eslint.config.mjs';

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
    // Only the tree mirrored from grafana/grafana (see UPSTREAM.md). It is kept as close to upstream as possible, so
    // rules that Grafana's own lint setup does not enforce on this code are relaxed here instead of rewriting it.
    // Plugin-authored code lives in src/pjan/ and keeps the scaffold's rules: do not add it to this list.
    files: ['src/core/**', 'src/features/**', 'src/packages/**', 'src/plugins/**'],
    linterOptions: {
      // Upstream carries disable comments for rules this config does not trigger.
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      '@typescript-eslint/array-type': 'off',
      // TypeScript already rejects real redeclarations; this flags the TS value + type pattern.
      'no-redeclare': 'off',
    },
  },
]);
