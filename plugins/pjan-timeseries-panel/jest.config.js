// The tests in src/ are copied from grafana/grafana v13.2.3, whose jest.config.js runs them in this time zone:
// "Any wrong timezone handling could be hidden if we use UTC/GMT local time (which would happen in CI)."
process.env.TZ = 'Pacific/Easter'; // UTC-06:00 or UTC-05:00 depending on daylight savings

const grafanaConfig = require('./.config/jest.config');

// The scaffold's swc transform, picked by its key in .config/jest.config.js.
const SWC_PATTERN = '^.+\\.(t|j)sx?$';
if (!grafanaConfig.transform[SWC_PATTERN]) {
  throw new Error(`jest.config.js: no transform for ${SWC_PATTERN} in .config/jest.config.js`);
}
const [swcJest, swcOptions] = grafanaConfig.transform[SWC_PATTERN];

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...grafanaConfig,
  // The code copied from grafana/grafana uses the automatic JSX runtime (no `import React`).
  transform: {
    [SWC_PATTERN]: [
      swcJest,
      {
        ...swcOptions,
        jsc: { ...swcOptions.jsc, transform: { react: { runtime: 'automatic' } } },
      },
    ],
  },
};
