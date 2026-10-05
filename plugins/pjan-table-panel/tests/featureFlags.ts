import { expect, type DashboardPage, type PanelEditPage } from '@grafana/plugin-e2e';
import type { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// The table feature flags (plan decision 5; UPSTREAM.md, "Feature flags"): Table plus reads the two OpenFeature flags
// as core reads them, so it must behave like core, whatever sets them. provisioning/dashboards/feature-flags.json has
// the same two tables in core and in the plugin: one with pagination and a page size of 2 (`table.paginationPageSize`:
// the page size is used only with the flag, else it comes from the panel height), one with a long text column
// (`table.autoColumnWidths`: content-aware column widths). Core's values are also read from core's own OpenFeature
// client. Both editors show "Page size" only with the flag (its showIf reads getFeatureFlagClient()).
// Helpers of featureFlags.spec.ts and featureFlagsServer.spec.ts. Run them with --workers=1 (one browser at a time).

const FLAGS = ['table.autoColumnWidths', 'table.paginationPageSize'] as const;
type FlagValues = Record<(typeof FLAGS)[number], boolean>;
export const LOCAL_STORAGE_PREFIX = 'grafana.openfeature.'; // packages/grafana-runtime/src/internal/openFeature/index.ts

export const CORE_PAGINATION = 'Core table, pagination, page size 2';
export const PLUGIN_PAGINATION = 'Table plus, pagination, page size 2';
const CORE_WIDTHS = 'Core table, content widths';
const PLUGIN_WIDTHS = 'Table plus, content widths';

export const flags = (autoColumnWidths: boolean, paginationPageSize: boolean): FlagValues => ({
  'table.autoColumnWidths': autoColumnWidths,
  'table.paginationPageSize': paginationPageSize,
});

// Panels by title, never by a hard-coded id.
export const DASHBOARD_FILE = 'feature-flags.json';
const DASHBOARD: { panels: Array<{ id: number; title: string }> } = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../provisioning/dashboards', DASHBOARD_FILE), 'utf8')
);
export function panelId(title: string) {
  const panel = DASHBOARD.panels.find((p) => p.title === title);
  if (!panel) {
    throw new Error(`no panel titled "${title}" in provisioning/dashboards/${DASHBOARD_FILE}`);
  }
  return String(panel.id);
}

/** Core's own values: its client on the domain core reserves for itself, through the OpenFeature API singleton. */
async function coreFlags(page: Page): Promise<FlagValues> {
  return page.evaluate(
    (keys) => {
      type Api = { getClient(domain: string): { getBooleanValue(key: string, defaultValue: boolean): boolean } };
      const api = (globalThis as unknown as Record<symbol, Api>)[Symbol.for('@openfeature/web-sdk/api')];
      const client = api.getClient('internal-grafana-core');
      return Object.fromEntries(keys.map((key) => [key, client.getBooleanValue(key, false)])) as FlagValues;
    },
    FLAGS as unknown as string[]
  );
}

/** A panel of the open dashboard, by title (the whole panel, not only its header). */
const panelByTitle = (page: Page, title: string) =>
  page.locator('[data-viz-panel-key]').filter({ has: page.getByTestId(`data-testid Panel header ${title}`) });

/** The column widths a table panel draws (its grid's template columns). */
async function columnWidths(page: Page, title: string) {
  // Grafana draws a panel once it is scrolled into view
  await panelByTitle(page, title).scrollIntoViewIfNeeded();
  const grid = panelByTitle(page, title).locator('[role="grid"]').first();
  await expect(grid).toBeVisible();
  return grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
}

/** Checks the plugin against core on the dashboard, in every way each reads the flags. */
export async function expectSameAsCore(_dashboardPage: DashboardPage, page: Page, expected: FlagValues) {
  // Pagination: page size 2 with the flag, else from the panel height (all 5 rows fit)
  for (const title of [CORE_PAGINATION, PLUGIN_PAGINATION]) {
    await panelByTitle(page, title).scrollIntoViewIfNeeded();
    await expect(panelByTitle(page, title).getByText(/of 5 rows/)).toHaveText(
      expected['table.paginationPageSize'] ? '1 - 2 of 5 rows' : '1 - 5 of 5 rows'
    );
  }
  // Column widths: the plugin's are core's (content-aware with the flag, else spread evenly)
  const core = await columnWidths(page, CORE_WIDTHS);
  await expect.poll(() => columnWidths(page, PLUGIN_WIDTHS)).toBe(core);
  const widths = core.split(' ').map(parseFloat);
  const even = Math.max(...widths) - Math.min(...widths) < 2;
  expect(even, `column widths ${core}`).toBe(!expected['table.autoColumnWidths']);
  // And core's own client (read once the panels have drawn: Grafana has initialised OpenFeature by then)
  expect(await coreFlags(page)).toEqual(expected);
}

/** An editor shows "Page size" only with pagination on and the flag on (core and plugin alike). */
export async function expectEditorPageSize(panelEditPage: PanelEditPage, shown: boolean) {
  const table = panelEditPage.getCustomOptions('Table');
  await expect(table.getFieldLocator('Enable pagination')).toBeVisible();
  await expect(table.getFieldLocator('Page size')).toHaveCount(shown ? 1 : 0);
}
