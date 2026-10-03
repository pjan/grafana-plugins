import fs from 'node:fs';
import path from 'node:path';

import { type APIRequestContext, expect, type Page, test } from '@grafana/plugin-e2e';

import { CORE, panelContent, PLUGIN, savedPanel } from './helpers';

// Color mode Custom in the panel editor and in the saved JSON: the "Stat styles" list and its showIf, what selecting
// Custom and setting and clearing a value save, and that opening the editor writes nothing.
const STYLING = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../provisioning/dashboards/styling.json'), 'utf8')
) as { uid: string; time: object; panels: Array<Record<string, unknown> & { id: number; options: object }> };
const ATLAS_ID = 42;
const SETTINGS = [
  'Background color',
  'Text color',
  'Sparkline color',
  'Sparkline line opacity',
  'Sparkline fill opacity',
  'Sparkline line width',
]; // "atlas: soft, automatic, sparkline as text"

const editor = (page: Page, name: string) => page.getByTestId(`data-testid Stat styles ${name} field property editor`);

// The "Stat styles" options shown in the editor, in order
const statStyles = (page: Page) =>
  page.locator('[data-testid$=" field property editor"]').evaluateAll((elements) =>
    elements
      .map((el) => el.getAttribute('data-testid')!)
      .filter((id) => id.startsWith('data-testid Stat styles '))
      .map((id) => id.slice('data-testid Stat styles '.length, -' field property editor'.length))
  );

const pickColorMode = async (page: Page, label: string) => {
  const select = editor(page, 'Color mode');
  await select.scrollIntoViewIfNeeded();
  await select.getByRole('combobox').click();
  // An option's accessible name includes its description
  await page.getByRole('option', { name: new RegExp(`^${label}`) }).click();
};

test.describe('Color mode Custom in the editor and the saved JSON', () => {
  test.describe.configure({ mode: 'default' });
  let api: APIRequestContext;
  const created: string[] = [];

  test.beforeAll(async ({ playwright, grafanaAPICredentials }) => {
    const { user, password } = grafanaAPICredentials;
    api = await playwright.request.newContext({
      baseURL: process.env.GRAFANA_URL || 'http://localhost:3000',
      extraHTTPHeaders: { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` },
    });
  });

  test.afterAll(async () => {
    for (const uid of created) {
      await api.delete(`/api/dashboards/uid/${uid}`);
    }
    await api.dispose();
  });

  const createDashboard = async (uid: string, panels: object[]) => {
    const response = await api.post('/api/dashboards/db', {
      data: {
        dashboard: { uid, title: uid, time: STYLING.time, timezone: 'utc', schemaVersion: 42, panels },
        overwrite: true,
      },
    });
    expect(response.ok()).toBe(true);
    created.push(uid);
  };

  test('the settings show only with Custom, in the plan’s order; the sparkline ones only with Graph mode Area', async ({
    panelEditPage,
    page,
  }) => {
    await panelEditPage.setVisualization('Stat plus');
    const core = ['Orientation', 'Text mode', 'Color mode', 'Graph mode', 'Text alignment', 'Show percent change'];
    await expect.poll(() => statStyles(page)).toEqual(core);

    const before = (await savedPanel(page))!;
    await pickColorMode(page, 'Custom');
    await expect
      .poll(() => statStyles(page))
      .toEqual([
        'Orientation',
        'Text mode',
        'Color mode',
        'Background color',
        'Text color',
        'Graph mode',
        'Sparkline color',
        'Sparkline line opacity',
        'Sparkline fill opacity',
        'Sparkline line width',
        'Text alignment',
        'Show percent change',
      ]);
    // Selecting Custom saves only the color mode
    await expect.poll(async () => (await savedPanel(page))?.options.colorMode).toBe('custom');
    const after = (await savedPanel(page))!;
    expect(after.options).toEqual({ ...before.options, colorMode: 'custom' });
    expect(after.fieldConfig).toEqual(before.fieldConfig);

    // Graph mode None: no sparkline settings
    await editor(page, 'Graph mode').getByRole('radio', { name: 'None' }).click();
    await expect
      .poll(() => statStyles(page))
      .toEqual([
        'Orientation',
        'Text mode',
        'Color mode',
        'Background color',
        'Text color',
        'Graph mode',
        'Text alignment',
        'Show percent change',
      ]);

    // Back to a core mode: none of the settings
    await pickColorMode(page, 'Background Solid');
    await expect.poll(() => statStyles(page)).toEqual(core);
  });

  test('the settings are in the "Add override property" menu under Stat styles, and not in the field defaults', async ({
    gotoDashboardPage,
    page,
  }) => {
    await gotoDashboardPage({ uid: STYLING.uid, queryParams: new URLSearchParams({ editPanel: String(ATLAS_ID) }) });
    await expect(editor(page, 'Background color')).toBeVisible({ timeout: 30_000 });
    // In the defaults, each name appears once: the panel option (the field option is hidden from the defaults)
    for (const name of SETTINGS) {
      await expect(editor(page, name)).toHaveCount(1);
    }
    await page.getByTestId('data-testid Value picker button Add field override').click();
    await page.getByRole('option', { name: /^Fields with name\s*Set properties for a specific field/ }).click();
    await page
      .getByTestId('data-testid panel-options-override-0 Fields with name field property editor')
      .getByRole('combobox')
      .click();
    await page.getByRole('option', { name: 'web', exact: true }).click();
    await page.getByTestId('data-testid Value picker button Add override property').click();
    const properties = (await page.getByRole('option').allInnerTexts()).map((text) => text.split('\n')[0]);
    expect(properties.filter((p) => p.startsWith('Stat styles > '))).toEqual(
      SETTINGS.map((name) => `Stat styles > ${name}`)
    );
  });

  test('tabbing through the unset sliders saves nothing', async ({ gotoDashboardPage, page }) => {
    const panel = STYLING.panels.find((p) => p.id === 11)!; // "custom, nothing set"
    await createDashboard('pjan-stat-styling-sliders', [{ ...panel, id: 1 }]);
    await gotoDashboardPage({ uid: 'pjan-stat-styling-sliders', queryParams: new URLSearchParams({ editPanel: '1' }) });
    await expect(editor(page, 'Sparkline line width')).toBeVisible({ timeout: 30_000 });
    const before = await savedPanel(page, 1);
    for (const name of ['Sparkline line opacity', 'Sparkline fill opacity', 'Sparkline line width']) {
      const input = editor(page, name).getByRole('textbox');
      await input.scrollIntoViewIfNeeded();
      await input.focus();
      await input.blur();
    }
    await page.waitForTimeout(1000);
    expect(await savedPanel(page, 1)).toEqual(before);
    expect(before?.options).not.toHaveProperty('styling');
  });

  test('a value set is saved, a cleared one loses its key', async ({ gotoDashboardPage, page }) => {
    const panel = STYLING.panels.find((p) => p.id === 11)!; // "custom, nothing set"
    await createDashboard('pjan-stat-styling-edit', [{ ...panel, id: 1 }]);
    await gotoDashboardPage({ uid: 'pjan-stat-styling-edit', queryParams: new URLSearchParams({ editPanel: '1' }) });
    await expect(editor(page, 'Background color')).toBeVisible({ timeout: 30_000 });
    const styling = async () => ((await savedPanel(page, 1))?.options.styling ?? {}) as Record<string, unknown>;

    // A colour: Value, then cleared
    const background = editor(page, 'Background color');
    await background.getByRole('combobox').click();
    await page.getByRole('option', { name: /^Value/ }).click();
    await expect.poll(async () => (await styling()).backgroundColor).toEqual({ mode: 'value' });
    await background.getByRole('button', { name: 'Clear value' }).click();
    await expect.poll(styling).not.toHaveProperty('backgroundColor');

    // A shade
    const text = editor(page, 'Text color');
    await text.getByRole('combobox').click();
    await page.getByRole('option', { name: /^Stronger/ }).click();
    await expect.poll(async () => (await styling()).textColor).toEqual({ mode: 'shade', shade: 'stronger' });

    // A slider, then cleared
    const width = editor(page, 'Sparkline line width');
    await width.scrollIntoViewIfNeeded();
    const input = width.getByRole('textbox').or(width.getByRole('spinbutton')).first();
    await input.fill('3');
    await input.blur();
    await expect.poll(async () => (await styling()).sparklineLineWidth).toBe(3);
    await width.getByRole('button', { name: 'Clear value' }).click();
    await expect.poll(styling).not.toHaveProperty('sparklineLineWidth');
    expect(await styling()).toEqual({ textColor: { mode: 'shade', shade: 'stronger' } });
  });

  test('an override property is saved as `custom.styling.<key>`; cleared, it keeps no value', async ({
    gotoDashboardPage,
    page,
  }) => {
    const panel = STYLING.panels.find((p) => p.title === 'custom, nothing set')!;
    await createDashboard('pjan-stat-styling-override', [{ ...panel, id: 1 }]);
    await gotoDashboardPage({
      uid: 'pjan-stat-styling-override',
      queryParams: new URLSearchParams({ editPanel: '1' }),
    });
    await expect(editor(page, 'Background color')).toBeVisible({ timeout: 30_000 });
    const fieldConfig = async () =>
      (await savedPanel(page, 1))?.fieldConfig as {
        defaults: { custom?: object };
        overrides: Array<{ matcher: object; properties: object[] }>;
      };
    const before = await fieldConfig();

    await page.getByTestId('data-testid Value picker button Add field override').click();
    await page.getByRole('option', { name: /^Fields with name\s*Set properties for a specific field/ }).click();
    await page
      .getByTestId('data-testid panel-options-override-0 Fields with name field property editor')
      .getByRole('combobox')
      .click();
    await page.getByRole('option', { name: 'web', exact: true }).click();
    await page.getByTestId('data-testid Value picker button Add override property').click();
    await page.getByRole('option', { name: /^Stat styles > Background color/ }).click();
    // The property's row: the innermost element with its remove button and its editor
    const row = page
      .locator('div')
      .filter({ has: page.getByRole('button', { name: 'Remove property' }) })
      .filter({ has: page.getByRole('combobox') })
      .last();
    await row.getByRole('combobox').click();
    await page.getByRole('option', { name: /^Value/ }).click();
    // Grafana's editor also saves the matcher's scope
    const matcher = expect.objectContaining({ id: 'byName', options: 'web' });
    await expect
      .poll(async () => (await fieldConfig())?.overrides)
      .toEqual([{ matcher, properties: [{ id: 'custom.styling.backgroundColor', value: { mode: 'value' } }] }]);

    await row.getByRole('button', { name: 'Clear value' }).click();
    await expect
      .poll(async () => (await fieldConfig())?.overrides)
      .toEqual([{ matcher, properties: [{ id: 'custom.styling.backgroundColor' }] }]);
    expect((await fieldConfig())?.defaults).toEqual(before?.defaults);
  });

  test('opening the editor of a Custom panel writes nothing', async ({ gotoDashboardPage, page }) => {
    await gotoDashboardPage({ uid: STYLING.uid });
    await panelContent(page, ATLAS_ID).scrollIntoViewIfNeeded();
    await expect(panelContent(page, ATLAS_ID).locator('canvas').first()).toBeVisible();
    await expect.poll(async () => (await savedPanel(page, ATLAS_ID))?.options).toHaveProperty('styling');
    const before = await savedPanel(page, ATLAS_ID);
    await gotoDashboardPage({ uid: STYLING.uid, queryParams: new URLSearchParams({ editPanel: String(ATLAS_ID) }) });
    await expect(editor(page, 'Background color')).toBeVisible({ timeout: 30_000 });
    for (let t = 0; t < 3000; t += 250) {
      expect(await savedPanel(page, ATLAS_ID)).toEqual(before);
      await page.waitForTimeout(250);
    }
  });
});
