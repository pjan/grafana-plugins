import { expect, test } from '@grafana/plugin-e2e';

// provisioning/dashboards/dashboard.json shows the same data in the core stat panel and in this plugin, one above the
// other in the same column, with the core panel's default options.
const DASHBOARD = 'dashboard.json';
const CORE = 'Core stat';
const PLUGIN = 'Stat ++';

test('renders the values and their sparklines', async ({ gotoDashboardPage, readProvisionedDashboard }) => {
  const dashboard = await readProvisionedDashboard({ fileName: DASHBOARD });
  const dashboardPage = await gotoDashboardPage(dashboard);
  const panel = dashboardPage.getPanelByTitle(PLUGIN).locator;
  await expect(panel.locator('canvas')).toHaveCount(2);
  await expect(panel).toContainText('web');
  await expect(panel).toContainText('api');
});

test('draws the same tiles as the core stat panel', async ({ gotoDashboardPage, readProvisionedDashboard, page }) => {
  const dashboard = await readProvisionedDashboard({ fileName: DASHBOARD });
  const dashboardPage = await gotoDashboardPage(dashboard);
  const content = (title: string) =>
    dashboardPage.getPanelByTitle(title).locator.getByTestId('data-testid panel content');
  await expect(content(CORE).locator('canvas')).toHaveCount(2);
  await expect(content(PLUGIN).locator('canvas')).toHaveCount(2);

  // Inline styles and text of every element, and the sparkline pixels
  const tiles = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('*')).map((el) =>
      el instanceof HTMLCanvasElement
        ? Array.from(el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data).join(',')
        : `${el.getAttribute('style')} ${el.childElementCount === 0 ? el.textContent : ''}`
    );
  await expect.poll(async () => content(PLUGIN).evaluate(tiles)).toEqual(await content(CORE).evaluate(tiles));

  // Pixels, with Grafana's panel frame squared off: the anti-aliasing of its rounded bottom corners, where they clip
  // the tiles, differed in 3 or 4 corner pixels between two loads of the same core panel (see tests/parity.spec.ts)
  await page.addStyleTag({ content: '[data-viz-panel-key] > div > section { border-radius: 0 !important; }' });
  await page.mouse.move(0, 0);
  expect(await content(PLUGIN).screenshot()).toEqual(await content(CORE).screenshot());
});
