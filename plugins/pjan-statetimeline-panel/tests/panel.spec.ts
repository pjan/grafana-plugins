import { test, expect } from '@grafana/plugin-e2e';

// provisioning/dashboards/dashboard.json shows the same data in the core state timeline and in
// this plugin, side by side, with the core panel's default options.
const DASHBOARD = 'dashboard.json';
const CORE = 'Core state timeline';
const PLUGIN = 'pjan-statetimeline-panel';

test('renders a timeline canvas and a legend', async ({ gotoDashboardPage, readProvisionedDashboard }) => {
  const dashboard = await readProvisionedDashboard({ fileName: DASHBOARD });
  const dashboardPage = await gotoDashboardPage(dashboard);
  const panel = dashboardPage.getPanelByTitle(PLUGIN);
  await expect(panel.locator.locator('canvas')).toBeVisible();
  await expect(panel.locator).toContainText('ok');
  await expect(panel.locator).toContainText('warn');
  await expect(panel.locator).toContainText('crit');
});

test('draws the same pixels as the core state timeline', async ({ gotoDashboardPage, readProvisionedDashboard, page }) => {
  const dashboard = await readProvisionedDashboard({ fileName: DASHBOARD });
  const dashboardPage = await gotoDashboardPage(dashboard);
  const core = dashboardPage.getPanelByTitle(CORE).locator.locator('canvas');
  const plugin = dashboardPage.getPanelByTitle(PLUGIN).locator.locator('canvas');
  await expect(core).toBeVisible();
  await expect(plugin).toBeVisible();
  const pixels = (canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data).join(',');
  expect(await plugin.evaluate(pixels)).toEqual(await core.evaluate(pixels));
});

test('shows the same legend as the core state timeline', async ({ gotoDashboardPage, readProvisionedDashboard }) => {
  const dashboard = await readProvisionedDashboard({ fileName: DASHBOARD });
  const dashboardPage = await gotoDashboardPage(dashboard);
  const legend = (title: string) => dashboardPage.getPanelByTitle(title).locator.locator('[data-testid^="data-testid VizLegend series"]');
  await expect(legend(PLUGIN).first()).toBeVisible();
  expect(await legend(PLUGIN).allInnerTexts()).toEqual(await legend(CORE).allInnerTexts());
});
