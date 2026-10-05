import { test, type PanelEditPage } from '@grafana/plugin-e2e';

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

// The table feature flags (tests/featureFlags.ts): defaults and localStorage overrides. Run with --workers=1.
type GotoEditor = (args: { dashboard: { uid?: string }; id: string }) => Promise<PanelEditPage>;
const expectEditors = async (gotoPanelEditPage: GotoEditor, dashboard: { uid?: string }, shown: boolean) => {
  for (const title of [CORE_PAGINATION, PLUGIN_PAGINATION]) {
    await expectEditorPageSize(await gotoPanelEditPage({ dashboard, id: panelId(title) }), shown);
  }
};

test.describe('feature flags as core reads them', () => {
  test('both flags are off by default, in the plugin and in core', async ({
    gotoDashboardPage,
    gotoPanelEditPage,
    readProvisionedDashboard,
    page,
  }) => {
    const dashboard = await readProvisionedDashboard({ fileName: DASHBOARD_FILE });
    const dashboardPage = await gotoDashboardPage(dashboard);
    await expectSameAsCore(dashboardPage, page, flags(false, false));
    await expectEditors(gotoPanelEditPage, dashboard, false);
  });

  test('a localStorage override reaches the plugin as it reaches core, and its removal too', async ({
    gotoDashboardPage,
    gotoPanelEditPage,
    readProvisionedDashboard,
    page,
  }) => {
    const dashboard = await readProvisionedDashboard({ fileName: DASHBOARD_FILE });
    let dashboardPage = await gotoDashboardPage(dashboard);
    const setOverrides = (overrides: Record<string, string | null>) =>
      page.evaluate(
        ({ prefix, overrides }) => {
          for (const [key, value] of Object.entries(overrides)) {
            if (value === null) {
              localStorage.removeItem(prefix + key);
            } else {
              localStorage.setItem(prefix + key, value);
            }
          }
        },
        { prefix: LOCAL_STORAGE_PREFIX, overrides }
      );

    // Overrides are read at evaluation, but both core's hooks and the plugin's evaluate on render: reload, as Grafana's
    // feature-toggle tooling does.
    await setOverrides({ 'table.paginationPageSize': 'true' });
    dashboardPage = await gotoDashboardPage(dashboard);
    await expectSameAsCore(dashboardPage, page, flags(false, true));
    await expectEditors(gotoPanelEditPage, dashboard, true);

    await setOverrides({ 'table.paginationPageSize': null, 'table.autoColumnWidths': 'true' });
    dashboardPage = await gotoDashboardPage(dashboard);
    await expectSameAsCore(dashboardPage, page, flags(true, false));
    await expectEditors(gotoPanelEditPage, dashboard, false);

    await setOverrides({ 'table.autoColumnWidths': null });
    dashboardPage = await gotoDashboardPage(dashboard);
    await expectSameAsCore(dashboardPage, page, flags(false, false));
  });
});
