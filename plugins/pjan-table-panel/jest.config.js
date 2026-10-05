// The tests in src/ are copied from grafana/grafana v13.2.3, whose jest.config.js runs them in this time zone:
// "Any wrong timezone handling could be hidden if we use UTC/GMT local time (which would happen in CI)."
process.env.TZ = 'Pacific/Easter'; // UTC-06:00 or UTC-05:00 depending on daylight savings

const path = require('path');
const grafanaConfig = require('./.config/jest.config');
const { grafanaESModules, nodeModulesToTransform } = require('./.config/jest/utils');

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...grafanaConfig,
  // grafana/grafana v13.2.3 transforms its tests with ts-jest (its jest.config.js), not the scaffold's swc, and the
  // copied table tests depend on it: TableNG/utils.ts, Cells/renderers.tsx and the cells form an import cycle, which
  // the PillCell, ImageCell and DataLinksCell tests enter at the cell. TypeScript's CommonJS output reads a binding of a
  // module still being evaluated as `undefined`, as in Grafana; swc's throws ("Cannot access 'getStyles' before
  // initialization"). tsconfig.json sets isolatedModules, as Grafana's does, so ts-jest transpiles without
  // type-checking (`npm run typecheck` does that). The ES modules from node_modules below go through it too.
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: path.join(__dirname, 'tsconfig.json') }],
  },
  // The scaffold's list of ES-module-only packages, plus the grid (grafana/grafana's jest.config.js lists it too).
  transformIgnorePatterns: [nodeModulesToTransform([...grafanaESModules, '@grafana/react-data-grid'])],
  moduleNameMapper: {
    ...grafanaConfig.moduleNameMapper,
    // Test stand-ins for packages the ported tests import that are not on npm or not dependencies of this plugin
    // (UPSTREAM.md, "Tests"); tsconfig.json maps the same names for the typecheck.
    '^@grafana/test-utils$': '<rootDir>/src/packages/grafana-test-utils/index.ts',
    '^@grafana/test-utils/unstable$': '<rootDir>/src/packages/grafana-test-utils/unstable.ts',
    '^@openfeature/react-sdk$': '<rootDir>/src/pjan/testdata/openFeatureReactSdk.tsx',
    // grafana/grafana's mock (public/test/mocks/react-inlinesvg.tsx) instead of the scaffold's: it passes the icon's
    // props through (the copied tests find icons by Grafana's `icon-<name>` test ids).
    'react-inlinesvg': path.resolve(__dirname, 'src/pjan/testdata/reactInlineSvg.tsx'),
  },
};
