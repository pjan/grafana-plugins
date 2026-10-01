// The plugins' Jest setup (the create-plugin scaffold's .config/jest.config.js and .config/jest/utils.js), reduced to
// what this package's tests need.

// ES-module-only packages that @grafana/* depend on: Jest has to transform them.
const grafanaESModules = [
  '@grafana/schema',
  '@react-hookz/web',
  '@ver0/deep-equal',
  '@wojtekmaj/date-utils',
  'd3',
  'd3-color',
  'd3-force',
  'd3-interpolate',
  'd3-scale-chromatic',
  'get-user-locale',
  'marked',
  'memoize',
  'mimic-function',
  'ol',
  'react-calendar',
  'react-colorful',
  'rxjs',
  'uuid',
];
const nodeModulesToTransform = (moduleNames) => `node_modules\/(?!.*(${moduleNames.join('|')})\/.*)`;

module.exports = {
  moduleNameMapper: {
    '\\.(css|scss|sass)$': 'identity-obj-proxy',
    'react-inlinesvg': '<rootDir>/jest/reactInlineSvgMock.tsx',
  },
  setupFilesAfterEnv: ['<rootDir>/jest-setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          transform: { react: { runtime: 'automatic' } },
        },
      },
    ],
  },
  transformIgnorePatterns: [nodeModulesToTransform(grafanaESModules)],
};
