// Plugin stand-in for `@grafana/test-utils` (grafana/grafana v13.2.3: packages/grafana-test-utils/src/index.ts). Tests only.
// `@grafana/test-utils` is a private Grafana workspace package, not on npm. The ported editor tests
// (TableCellOptionEditor, SparklineCellOptionsEditor) use `mockComboboxRect`; jest.config.js and tsconfig.json map the
// package name to this file. Only the names the ported tests use, from the Apache-2.0 copy of its `jsdom.ts`.
export { mockBoundingClientRect, mockComboboxRect } from './src/jsdom';
