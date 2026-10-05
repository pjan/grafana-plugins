import { test } from '@grafana/plugin-e2e';

import {
  CORE_PAGINATION,
  DASHBOARD_FILE,
  expectEditorPageSize,
  expectSameAsCore,
  flags,
  LOCAL_STORAGE_PREFIX,
  panelId,
  PLUGIN_PAGINATION,
} from './featureFlags';

// The feature-flag spike (tests/featureFlags.ts): server values. Its own file, because Playwright allows the
// `openFeature` option only at the top level of a file. Run with --workers=1.
//
// @grafana/plugin-e2e answers Grafana's OFREP bulk evaluation with these values (merged into the server's), 3 s late.
// Core waits for that answer before it renders (app.ts awaits initOpenFeature); the plugin must still have the
// values at its first render.
test.use({ openFeature: { flags: { 'table.paginationPageSize': true }, latency: 3000 } });

test('server values (OFREP), answered late, reach the plugin as they reach core, before its first render', async ({
  gotoDashboardPage,
  gotoPanelEditPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: DASHBOARD_FILE });
  const dashboardPage = await gotoDashboardPage(dashboard);
  await expectSameAsCore(dashboardPage, page, flags(false, true));

  for (const title of [CORE_PAGINATION, PLUGIN_PAGINATION]) {
    await expectEditorPageSize(await gotoPanelEditPage({ dashboard, id: panelId(title) }), true);
  }
});

test('a localStorage override comes before the server value, as in core', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: DASHBOARD_FILE });
  await gotoDashboardPage(dashboard);
  await page.evaluate((key) => localStorage.setItem(key, 'false'), `${LOCAL_STORAGE_PREFIX}table.paginationPageSize`);
  const dashboardPage = await gotoDashboardPage(dashboard);
  await expectSameAsCore(dashboardPage, page, flags(false, false));
});
