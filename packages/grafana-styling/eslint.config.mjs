import { defineConfig } from 'eslint/config';
import grafanaConfig from '@grafana/eslint-config/flat.js';

// The plugins' lint rules (their scaffold .config/eslint.config.mjs plus the automatic JSX runtime).
export default defineConfig([
  {
    ignores: ['**/node_modules/', '**/.eslintcache', '**/coverage'],
  },
  ...grafanaConfig,
  {
    rules: {
      'react/prop-types': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      '@typescript-eslint/no-deprecated': 'warn',
      'react/react-in-jsx-scope': 'off',
    },
  },
]);
