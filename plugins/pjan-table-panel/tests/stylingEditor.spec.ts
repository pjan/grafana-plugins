import { selectors } from '@grafana/e2e-selectors';
import { type APIRequestContext, expect, type Page, test } from '@grafana/plugin-e2e';

import { apiClient, savedPanel } from './helpers';
import { readDashboard } from './parity';

// Text color and Background color in the panel editor and in the saved JSON: where they sit (right after Cell type, in
// the field defaults with Cell type Auto, and in the overrides menu), what setting and clearing a value saves (no
// `custom.styling: {}` left), an override saved as `custom.styling.<key>` and cleared, that opening the editor writes
// nothing, and that the options and overrides survive saving and reloading the dashboard. Run with --workers=1.
const STYLING = readDashboard('styling.json');
const NOTHING_SET = STYLING.panels.find((p) => p.title === 'text automatic, background basic: nothing set')!;
const SET = STYLING.panels.find((p) => p.title === 'override on one column: set')!;
const OPTIONS = ['Background color', 'Text color'];

const editor = (page: Page, name: string) => page.getByTestId(`data-testid Cell options ${name} field property editor`);

/** The "Cell options" field options shown in the editor, in order. */
const cellOptions = (page: Page) =>
  page.locator('[data-testid$=" field property editor"]').evaluateAll((elements) =>
    elements
      .map((el) => el.getAttribute('data-testid')!)
      .filter((id) => id.startsWith('data-testid Cell options '))
      .map((id) => id.slice('data-testid Cell options '.length, -' field property editor'.length))
  );

/** Picks a choice in an option's select (a choice's accessible name includes its description). */
const choose = async (page: Page, scope: ReturnType<Page['locator']>, label: string) => {
  const combobox = scope.getByRole('combobox');
  await combobox.scrollIntoViewIfNeeded();
  await combobox.click();
  await page.getByRole('option', { name: new RegExp(`^${label}(?![a-z])`) }).click();
};

const custom = async (page: Page, id: number) =>
  ((await savedPanel(page, id))?.fieldConfig.defaults.custom ?? {}) as Record<string, unknown>;
const overrides = async (page: Page, id: number) => (await savedPanel(page, id))?.fieldConfig.overrides;

/** Adds an override for the field `name` and one property of it, from the "Add override property" menu. */
const addOverrideProperty = async (page: Page, name: string, property: string) => {
  await openPropertyMenu(page, name);
  await page.getByRole('option', { name: new RegExp(`^${property}`) }).click();
};

/** Adds an override for the field `name` (after the panel's own) and opens its "Add override property" menu. */
const openPropertyMenu = async (page: Page, name: string) => {
  await page.getByTestId('data-testid Value picker button Add field override').click();
  await page.getByRole('option', { name: /^Fields with name\s*Set properties for a specific field/ }).click();
  await page
    .getByTestId(/^data-testid panel-options-override-\d+ Fields with name field property editor$/)
    .last()
    .getByRole('combobox')
    .click();
  await page.getByRole('option', { name, exact: true }).click();
  await page.getByTestId('data-testid Value picker button Add override property').last().click();
};

/** The row of the last override property added: the innermost element with its remove button and its select. */
const lastPropertyRow = (page: Page) =>
  page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: 'Remove property' }) })
    .filter({ has: page.getByRole('combobox') })
    .last();

test.describe('Text color and Background color in the editor and the saved JSON', () => {
  test.describe.configure({ mode: 'default' });
  let api: APIRequestContext;
  const created: string[] = [];

  test.beforeAll(async ({ playwright, grafanaAPICredentials }) => {
    api = await apiClient(playwright, grafanaAPICredentials);
  });

  test.afterAll(async () => {
    for (const uid of created) {
      await api.delete(`/api/dashboards/uid/${uid}`);
    }
    await api.dispose();
  });

  const createDashboard = async (uid: string, panel: object) => {
    const response = await api.post('/api/dashboards/db', {
      data: {
        dashboard: { uid, title: uid, time: STYLING.time, timezone: 'utc', schemaVersion: 42, panels: [panel] },
        overwrite: true,
      },
    });
    expect(response.ok()).toBe(true);
    created.push(uid);
  };

  const openEditor = async (page: Page, uid: string, id = 1) => {
    await page.goto(`/d/${uid}?orgId=1&editPanel=${id}`);
    await expect(editor(page, 'Text color')).toBeVisible({ timeout: 30_000 });
  };

  test('they sit right after Cell type, in order, and show in the field defaults with Cell type Auto', async ({
    panelEditPage,
    page,
  }) => {
    await panelEditPage.setVisualization('Table plus');
    await expect.poll(() => cellOptions(page)).toEqual(expect.arrayContaining(['Cell type', ...OPTIONS]));
    const shown = await cellOptions(page);
    const at = shown.indexOf('Cell type');
    expect(shown.slice(at, at + 4)).toEqual(['Cell type', 'Background color', 'Text color', 'Cell value inspect']);
    // the field defaults' Cell type is Auto: the options show anyway (no cell-type showIf)
    await expect(editor(page, 'Cell type').getByRole('combobox')).toHaveValue('Auto');
    // unset, the placeholder says what is drawn (Text color as Stat plus's: Automatic on a fill the plugin draws)
    const placeholders: Record<string, string> = {
      'Background color': 'As Grafana',
      'Text color': 'Automatic on a Background color, otherwise as Grafana',
    };
    for (const name of OPTIONS) {
      await expect(editor(page, name)).toBeVisible();
      await expect(editor(page, name).getByRole('combobox')).toHaveAttribute('placeholder', placeholders[name]);
    }
    // a new panel saves nothing of them
    expect(((await savedPanel(page))?.fieldConfig.defaults.custom ?? {}) as object).not.toHaveProperty('styling');
  });

  test('they are in the "Add override property" menu, under Cell options', async ({ page }) => {
    await createDashboard('pjan-table-styling-menu', { ...NOTHING_SET, id: 1 });
    await openEditor(page, 'pjan-table-styling-menu');
    await openPropertyMenu(page, 'state');
    const properties = (await page.getByRole('option').allInnerTexts()).map((text) => text.split('\n')[0]);
    const cell = properties.filter((p) => p.startsWith('Cell options > '));
    const at = cell.indexOf('Cell options > Cell type');
    expect(cell.slice(at, at + 3)).toEqual([
      'Cell options > Cell type',
      'Cell options > Background color',
      'Cell options > Text color',
    ]);
  });

  test('a value set in the field defaults is saved; cleared, its key goes, and no empty `styling` is left', async ({
    page,
  }) => {
    await createDashboard('pjan-table-styling-edit', { ...NOTHING_SET, id: 1 });
    await openEditor(page, 'pjan-table-styling-edit');
    await expect.poll(() => custom(page, 1)).toHaveProperty('minWidth', 70);

    await choose(page, editor(page, 'Background color'), 'Soft');
    await expect
      .poll(async () => (await custom(page, 1)).styling)
      .toEqual({
        backgroundColor: { mode: 'shade', shade: 'soft' },
      });
    await choose(page, editor(page, 'Text color'), 'Automatic');
    await expect
      .poll(async () => (await custom(page, 1)).styling)
      .toEqual({
        backgroundColor: { mode: 'shade', shade: 'soft' },
        textColor: { mode: 'automatic' },
      });
    // the preview draws it: the state column's first cell in Grafana's default dark theme, Soft green (the semi-dark-green
    // shade, #56A64B; core's dark green is #73BF69), with Automatic text on it
    await expect(page.getByTestId('data-testid panel content').getByRole('gridcell', { name: 'Up' })).toHaveCSS(
      'background-color',
      'rgb(86, 166, 75)'
    );

    await editor(page, 'Background color').getByRole('button', { name: 'Clear value' }).click();
    await expect.poll(async () => (await custom(page, 1)).styling).toEqual({ textColor: { mode: 'automatic' } });
    await editor(page, 'Text color').getByRole('button', { name: 'Clear value' }).click();
    await expect.poll(() => custom(page, 1)).not.toHaveProperty('styling');
    expect(await custom(page, 1)).toHaveProperty('minWidth', 70);
  });

  test('an override property is saved as `custom.styling.<key>`; cleared, it keeps no value', async ({ page }) => {
    await createDashboard('pjan-table-styling-override', { ...NOTHING_SET, id: 1 });
    await openEditor(page, 'pjan-table-styling-override');
    const before = (await savedPanel(page, 1))!.fieldConfig;

    await addOverrideProperty(page, 'state', 'Cell options > Text color');
    await choose(page, lastPropertyRow(page), 'Stronger');
    // Grafana's editor also saves the matcher's scope
    const matcher = expect.objectContaining({ id: 'byName', options: 'state' });
    await expect
      .poll(async () => (await overrides(page, 1))?.at(-1))
      .toEqual({
        matcher,
        properties: [{ id: 'custom.styling.textColor', value: { mode: 'shade', shade: 'stronger' } }],
      });

    await lastPropertyRow(page).getByRole('button', { name: 'Clear value' }).click();
    await expect
      .poll(async () => (await overrides(page, 1))?.at(-1))
      .toEqual({ matcher, properties: [{ id: 'custom.styling.textColor' }] });
    // the overrides before it and the defaults are untouched
    expect((await overrides(page, 1))?.slice(0, -1)).toEqual(before.overrides);
    expect((await savedPanel(page, 1))?.fieldConfig.defaults).toEqual(before.defaults);
  });

  test('opening the editor of a styled panel writes nothing', async ({ page }) => {
    await page.goto(`/d/${STYLING.uid}?orgId=1&viewPanel=${SET.id}`);
    await expect(page.getByTestId('data-testid panel content').getByRole('gridcell').first()).toBeVisible({
      timeout: 30_000,
    });
    await expect.poll(async () => (await savedPanel(page, SET.id))?.options).toHaveProperty('cellHeight');
    const before = await savedPanel(page, SET.id);
    expect(before?.fieldConfig.defaults.custom).toHaveProperty('styling');
    await openEditor(page, STYLING.uid, SET.id);
    for (let t = 0; t < 3000; t += 250) {
      expect(await savedPanel(page, SET.id)).toEqual(before);
      await page.waitForTimeout(250);
    }
  });

  test('field options and overrides survive saving and reloading the dashboard', async ({ page }) => {
    await createDashboard('pjan-table-styling-reload', { ...NOTHING_SET, id: 1 });
    await openEditor(page, 'pjan-table-styling-reload');
    await choose(page, editor(page, 'Background color'), 'Softer');
    await choose(page, editor(page, 'Text color'), 'Stronger');
    await addOverrideProperty(page, 'state', 'Cell options > Background color');
    await choose(page, lastPropertyRow(page), 'Base');
    const styling = {
      backgroundColor: { mode: 'shade', shade: 'softer' },
      textColor: { mode: 'shade', shade: 'stronger' },
    };
    await expect.poll(async () => (await custom(page, 1)).styling).toEqual(styling);
    await expect
      .poll(async () => (await overrides(page, 1))?.at(-1)?.properties)
      .toEqual([{ id: 'custom.styling.backgroundColor', value: { mode: 'shade', shade: 'base' } }]);
    const edited = (await savedPanel(page, 1))!.fieldConfig;

    // Save as a user does, then load the dashboard again
    await page.getByTestId(selectors.components.NavToolbar.editDashboard.saveButton).click();
    await page.getByTestId(selectors.components.Drawer.DashboardSaveDrawer.saveButton).click();
    await expect
      .poll(async () => {
        const response = await api.get('/api/dashboards/uid/pjan-table-styling-reload');
        const json = (await response.json()) as { dashboard: { panels: Array<{ fieldConfig: unknown }> } };
        return json.dashboard.panels[0].fieldConfig;
      })
      .toEqual(edited);
    await openEditor(page, 'pjan-table-styling-reload');
    await expect.poll(async () => (await savedPanel(page, 1))?.fieldConfig).toEqual(edited);
    await expect(editor(page, 'Background color').getByRole('combobox')).toHaveValue('Softer');
    await expect(editor(page, 'Text color').getByRole('combobox')).toHaveValue('Stronger');
  });
});
