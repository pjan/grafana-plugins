import { expect, test } from '@grafana/plugin-e2e';

// The scaffold's smoke tests, for the ported panel: Table plus is in the visualization picker and draws a table, and
// shows Grafana's "No data" view without data.
test('Table plus is in the picker and draws the query as a table', async ({
  panelEditPage,
  readProvisionedDataSource,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);
  await panelEditPage.setVisualization('Table plus');
  const content = panelEditPage.panel.locator.getByTestId('data-testid panel content');
  await expect(content.getByRole('grid')).toBeVisible();
  await expect(content.getByRole('columnheader').first()).toBeVisible();
});

test('shows "No data" without data', async ({ gotoDashboardPage, page }) => {
  const dashboardPage = await gotoDashboardPage({ uid: 'pjan-table-parity' });
  const panel = dashboardPage.getPanelByTitle('no data: no frames');
  await panel.locator.first().scrollIntoViewIfNeeded();
  await expect(
    page.locator('[data-viz-panel-key] section').filter({ hasText: 'no data: no frames' }).last()
  ).toContainText('No data');
});
