// The plugins' Jest setup (the create-plugin scaffold's .config/jest.config.js), reduced to what this package's tests
// need: React hooks in jsdom, no @grafana/* code at runtime (only types).
module.exports = {
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
};
