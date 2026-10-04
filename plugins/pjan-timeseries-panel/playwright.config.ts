import type { PluginOptions } from '@grafana/plugin-e2e';
import { defineConfig } from '@playwright/test';
import baseConfig from './.config/playwright.config';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig<PluginOptions>(baseConfig, {
  // Add your own configuration here.
  // See https://grafana.com/developers/plugin-tools/how-to-guides/extend-configurations#extend-the-playwright-config for further info.

  // The parity and styling tests each drive two or more Grafana pages, often at pixel ratio 2. On a busy machine the
  // default 30 s per test and 5 s per assertion are too short for Grafana to load and draw them, so a test failed on
  // a timeout without any difference in what it compares. Longer waits, and at most four workers.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 4,
});
