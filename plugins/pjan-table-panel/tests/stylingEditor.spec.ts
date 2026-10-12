import { selectors } from '@grafana/e2e-selectors';
import { type APIRequestContext, expect, type Page, test } from '@grafana/plugin-e2e';

import { apiClient, savedPanel } from './helpers';
import { readDashboard } from './parity';

// Text color and Background color (build 1), the pill options and the Look (build 2) and Text weight (build 3) in the
// panel editor and in the saved JSON: where they sit (right after Cell type, in the field defaults with Cell type Auto, and in the overrides
// menu; the Look after core's Table options), what setting and clearing a value saves (no `custom.styling: {}` left),
// that tabbing through the unset sliders saves nothing, an override saved as `custom.styling.<key>` and cleared, that
// opening the editor writes nothing, and that the options, the look and the overrides survive saving and reloading the
// dashboard. Run with --workers=1.
const STYLING = readDashboard('styling.json');
const NOTHING_SET = STYLING.panels.find((p) => p.title === 'text automatic, background basic: nothing set')!;
const SET = STYLING.panels.find((p) => p.title === 'override on one column: set')!;
const OPTIONS = [
  'Background color',
  'Text color',
  'Text weight',
  'Pill fill color',
  'Pill line color',
  'Pill line width',
  'Pill corner radius',
];
const PILL_NOTHING_SET = STYLING.panels.find((p) => p.title === 'pill look: nothing set')!;

const editor = (page: Page, name: string) => page.getByTestId(`data-testid Cell options ${name} field property editor`);
const lookEditor = (page: Page) => page.getByTestId('data-testid Table Look field property editor');
/** The panel options of the Table category shown in the editor, in order. */
const tableOptions = (page: Page) =>
  page.locator('[data-testid$=" field property editor"]').evaluateAll((elements) =>
    elements
      .map((el) => el.getAttribute('data-testid')!)
      .filter((id) => id.startsWith('data-testid Table ') && !id.startsWith('data-testid Table footer'))
      .map((id) => id.slice('data-testid Table '.length, -' field property editor'.length))
  );

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

/** The row of the last override property added with a slider: the innermost element with its remove button and slider. */
const lastSliderRow = (page: Page) =>
  page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: 'Remove property' }) })
    .filter({ has: page.getByRole('slider') })
    .last();

/** The row of the last override property added: the innermost element with its remove button and its select. */
const lastPropertyRow = (page: Page) =>
  page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: 'Remove property' }) })
    .filter({ has: page.getByRole('combobox') })
    .last();

test.describe('Text color, Background color, the pill options and the Look in the editor and the saved JSON', () => {
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
    expect(shown.slice(at, at + 9)).toEqual(['Cell type', ...OPTIONS, 'Cell value inspect']);
    // the field defaults' Cell type is Auto: the options show anyway (no cell-type showIf)
    await expect(editor(page, 'Cell type').getByRole('combobox')).toHaveValue('Auto');
    // unset, the placeholder says what is drawn (Text color as Stat plus's: Automatic on a fill the plugin draws)
    const placeholders: Record<string, string> = {
      'Background color': 'As Grafana',
      'Text color': 'Automatic on a Background or Pill fill color or the Pill look, otherwise as Grafana',
      'Text weight': 'As Grafana',
      'Pill fill color': 'As Grafana',
      'Pill line color': 'Pill color',
    };
    for (const [name, placeholder] of Object.entries(placeholders)) {
      await expect(editor(page, name)).toBeVisible();
      await expect(editor(page, name).getByRole('combobox')).toHaveAttribute('placeholder', placeholder);
    }
    // the unset sliders show what unset draws: a 1 px line (when one is drawn), the theme's 6 px radius
    await expect(editor(page, 'Pill line width').getByRole('slider')).toHaveAttribute('aria-valuenow', '1');
    await expect(editor(page, 'Pill corner radius').getByRole('slider')).toHaveAttribute('aria-valuenow', '6');
    for (const name of ['Pill line width', 'Pill corner radius']) {
      await expect(editor(page, name).getByRole('button', { name: 'Clear value' })).toHaveCount(0);
    }
    // the Look: after core's Table panel options (Page size is hidden without its flag and with pagination off; the
    // Table field options follow), nothing chosen; as State timeline plus's Look after its category's core options
    await expect.poll(() => tableOptions(page)).toEqual(expect.arrayContaining(['Enable pagination', 'Look']));
    expect((await tableOptions(page)).slice(0, 6)).toEqual([
      'Show table header',
      'Frozen columns',
      'Cell height',
      'Max row height',
      'Enable pagination',
      'Look',
    ]);
    for (const label of ['Grafana', 'Pill']) {
      await expect(lookEditor(page).getByRole('radio', { name: label })).not.toBeChecked();
    }
    // a new panel saves nothing of them
    const saved = await savedPanel(page);
    expect((saved?.fieldConfig.defaults.custom ?? {}) as object).not.toHaveProperty('styling');
    expect(saved?.options ?? {}).not.toHaveProperty('styling');
  });

  test('they are in the "Add override property" menu, under Cell options', async ({ page }) => {
    await createDashboard('pjan-table-styling-menu', { ...NOTHING_SET, id: 1 });
    await openEditor(page, 'pjan-table-styling-menu');
    await openPropertyMenu(page, 'state');
    const properties = (await page.getByRole('option').allInnerTexts()).map((text) => text.split('\n')[0]);
    const cell = properties.filter((p) => p.startsWith('Cell options > '));
    const at = cell.indexOf('Cell options > Cell type');
    expect(cell.slice(at, at + 8)).toEqual(['Cell options > Cell type', ...OPTIONS.map((o) => `Cell options > ${o}`)]);
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

  test('the pill options: set and cleared in the field defaults, no `styling: {}` left', async ({ page }) => {
    await createDashboard('pjan-table-styling-pill-edit', { ...PILL_NOTHING_SET, id: 1 });
    await openEditor(page, 'pjan-table-styling-pill-edit');
    await expect.poll(() => custom(page, 1)).toHaveProperty('minWidth', 70);
    const preview = page.getByTestId('data-testid panel content');
    const upPill = preview.getByRole('gridcell', { name: 'Up', exact: true }).first().locator('span[style]');

    await choose(page, editor(page, 'Pill fill color'), 'Softer');
    await choose(page, editor(page, 'Pill line color'), 'Base');
    const width = editor(page, 'Pill line width').getByRole('textbox');
    await width.fill('2');
    await width.blur();
    const radius = editor(page, 'Pill corner radius').getByRole('textbox');
    await radius.fill('4');
    await radius.blur();
    const styling = {
      fillColor: { mode: 'shade', shade: 'softer' },
      lineColor: { mode: 'shade', shade: 'base' },
      lineWidth: 2,
      cornerRadius: 4,
    };
    await expect.poll(async () => (await custom(page, 1)).styling).toEqual(styling);
    // the preview draws it (Grafana's default dark theme: Softer green #37872D, a Base #73BF69 line)
    await expect(upPill).toHaveCSS('background-color', 'rgb(55, 135, 45)');
    await expect(upPill).toHaveCSS('box-shadow', 'rgb(115, 191, 105) 0px 0px 0px 2px inset');
    await expect(upPill).toHaveCSS('border-top-left-radius', '4px');

    for (const name of ['Pill fill color', 'Pill line color', 'Pill line width']) {
      await editor(page, name).getByRole('button', { name: 'Clear value' }).click();
    }
    await expect.poll(async () => (await custom(page, 1)).styling).toEqual({ cornerRadius: 4 });
    await editor(page, 'Pill corner radius').getByRole('button', { name: 'Clear value' }).click();
    await expect.poll(() => custom(page, 1)).not.toHaveProperty('styling');
    expect(await custom(page, 1)).toHaveProperty('minWidth', 70);
    await expect(upPill).toHaveCSS('box-shadow', 'none');
    await expect(upPill).toHaveCSS('border-top-left-radius', '6px');
  });

  test('Text weight: a weight is saved as a number and drawn; cleared, no `styling: {}` is left', async ({ page }) => {
    await createDashboard('pjan-table-styling-weight', { ...NOTHING_SET, id: 1 });
    await openEditor(page, 'pjan-table-styling-weight');
    await expect.poll(() => custom(page, 1)).toHaveProperty('minWidth', 70);
    const state = page.getByTestId('data-testid panel content').getByRole('gridcell', { name: 'Up' });
    const host = page.getByTestId('data-testid panel content').getByRole('gridcell', { name: 'api' });
    await expect(state).toHaveCSS('font-weight', '400');

    // the choices: the three weights by name and number (no 700), Grafana's "bold" named as such
    const combobox = editor(page, 'Text weight').getByRole('combobox');
    await combobox.scrollIntoViewIfNeeded();
    await combobox.click();
    expect((await page.getByRole('option').allInnerTexts()).map((t) => t.split('\n')[0])).toEqual([
      'Regular (400)',
      'Medium (500)',
      'Semibold (600)',
    ]);
    await page.keyboard.press('Escape');

    await choose(page, editor(page, 'Text weight'), 'Semibold');
    await expect.poll(async () => (await custom(page, 1)).styling).toEqual({ textWeight: 600 });
    await expect(combobox).toHaveValue('Semibold (600)');
    // the preview: the Colored background state cell at 600; the Auto host cell stays at 400
    await expect(state).toHaveCSS('font-weight', '600');
    await expect(host).toHaveCSS('font-weight', '400');

    await choose(page, editor(page, 'Text weight'), 'Medium');
    await expect.poll(async () => (await custom(page, 1)).styling).toEqual({ textWeight: 500 });
    await expect(state).toHaveCSS('font-weight', '500');

    await editor(page, 'Text weight').getByRole('button', { name: 'Clear value' }).click();
    await expect.poll(() => custom(page, 1)).not.toHaveProperty('styling');
    expect(await custom(page, 1)).toHaveProperty('minWidth', 70);
    await expect(combobox).toHaveValue('');
    await expect(combobox).toHaveAttribute('placeholder', 'As Grafana');
    await expect(state).toHaveCSS('font-weight', '400');
  });

  test('Text weight by override: saved as `custom.styling.textWeight`; cleared, it keeps no value', async ({
    page,
  }) => {
    await createDashboard('pjan-table-styling-weight-override', { ...NOTHING_SET, id: 1 });
    await openEditor(page, 'pjan-table-styling-weight-override');
    const before = (await savedPanel(page, 1))!.fieldConfig;
    await addOverrideProperty(page, 'state', 'Cell options > Text weight');
    await choose(page, lastPropertyRow(page), 'Medium');
    const matcher = expect.objectContaining({ id: 'byName', options: 'state' });
    await expect
      .poll(async () => (await overrides(page, 1))?.at(-1))
      .toEqual({ matcher, properties: [{ id: 'custom.styling.textWeight', value: 500 }] });
    await expect(page.getByTestId('data-testid panel content').getByRole('gridcell', { name: 'Up' })).toHaveCSS(
      'font-weight',
      '500'
    );
    await lastPropertyRow(page).getByRole('button', { name: 'Clear value' }).click();
    await expect
      .poll(async () => (await overrides(page, 1))?.at(-1))
      .toEqual({ matcher, properties: [{ id: 'custom.styling.textWeight' }] });
    expect((await overrides(page, 1))?.slice(0, -1)).toEqual(before.overrides);
    expect((await savedPanel(page, 1))?.fieldConfig.defaults).toEqual(before.defaults);
  });

  test('tabbing through the unset sliders saves nothing', async ({ page }) => {
    await createDashboard('pjan-table-styling-sliders', { ...PILL_NOTHING_SET, id: 1 });
    await openEditor(page, 'pjan-table-styling-sliders');
    await expect.poll(() => custom(page, 1)).toHaveProperty('minWidth', 70);
    const before = await savedPanel(page, 1);
    for (const name of ['Pill line width', 'Pill corner radius']) {
      const input = editor(page, name).getByRole('textbox');
      await input.scrollIntoViewIfNeeded();
      await input.focus();
      await page.keyboard.press('Tab');
    }
    for (let t = 0; t < 2000; t += 250) {
      expect(await savedPanel(page, 1)).toEqual(before);
      await page.waitForTimeout(250);
    }
    expect(before?.fieldConfig.defaults.custom ?? {}).not.toHaveProperty('styling');
  });

  test('the Look: Pill is saved and drawn; back to Grafana, the pills are core’s again', async ({ page }) => {
    await createDashboard('pjan-table-styling-look', { ...PILL_NOTHING_SET, id: 1 });
    await openEditor(page, 'pjan-table-styling-look');
    await expect.poll(async () => (await savedPanel(page, 1))?.options).toHaveProperty('cellHeight');
    const preview = page.getByTestId('data-testid panel content');
    const upPill = preview.getByRole('gridcell', { name: 'Up', exact: true }).first().locator('span[style]');
    await expect(upPill).toHaveCSS('background-color', 'rgb(115, 191, 105)'); // core's green (dark)

    await lookEditor(page).scrollIntoViewIfNeeded();
    await lookEditor(page).getByRole('radio', { name: 'Pill' }).click();
    await expect.poll(async () => (await savedPanel(page, 1))?.options.styling).toEqual({ look: 'pill' });
    await expect(upPill).toHaveCSS('background-color', 'rgb(55, 135, 45)'); // Softer
    await expect(upPill).toHaveCSS('box-shadow', 'rgb(115, 191, 105) 0px 0px 0px 1px inset'); // Base, 1 px
    // the field options don't change
    expect((await custom(page, 1)) as object).not.toHaveProperty('styling');

    await lookEditor(page).getByRole('radio', { name: 'Grafana' }).click();
    await expect.poll(async () => (await savedPanel(page, 1))?.options.styling).toEqual({ look: 'grafana' });
    await expect(upPill).toHaveCSS('background-color', 'rgb(115, 191, 105)');
    await expect(upPill).toHaveCSS('box-shadow', 'none');
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

    // a slider: Pill line width on one field
    await addOverrideProperty(page, 'state', 'Cell options > Pill line width');
    const width = lastSliderRow(page).getByRole('textbox');
    await width.fill('3');
    await width.blur();
    await expect
      .poll(async () => (await overrides(page, 1))?.at(-1))
      .toEqual({ matcher, properties: [{ id: 'custom.styling.lineWidth', value: 3 }] });
    await lastSliderRow(page).getByRole('button', { name: 'Clear value' }).click();
    await expect
      .poll(async () => (await overrides(page, 1))?.at(-1))
      .toEqual({ matcher, properties: [{ id: 'custom.styling.lineWidth' }] });
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
    await choose(page, editor(page, 'Text weight'), 'Medium');
    await choose(page, editor(page, 'Pill line color'), 'Strong');
    const radius = editor(page, 'Pill corner radius').getByRole('textbox');
    await radius.fill('3');
    await radius.blur();
    await lookEditor(page).scrollIntoViewIfNeeded();
    await lookEditor(page).getByRole('radio', { name: 'Pill' }).click();
    await addOverrideProperty(page, 'state', 'Cell options > Background color');
    await choose(page, lastPropertyRow(page), 'Base');
    const styling = {
      backgroundColor: { mode: 'shade', shade: 'softer' },
      textColor: { mode: 'shade', shade: 'stronger' },
      textWeight: 500,
      lineColor: { mode: 'shade', shade: 'strong' },
      cornerRadius: 3,
    };
    await expect.poll(async () => (await custom(page, 1)).styling).toEqual(styling);
    await expect
      .poll(async () => (await overrides(page, 1))?.at(-1)?.properties)
      .toEqual([{ id: 'custom.styling.backgroundColor', value: { mode: 'shade', shade: 'base' } }]);
    await expect.poll(async () => (await savedPanel(page, 1))?.options.styling).toEqual({ look: 'pill' });
    const edited = (await savedPanel(page, 1))!.fieldConfig;

    // Save as a user does, then load the dashboard again
    await page.getByTestId(selectors.components.NavToolbar.editDashboard.saveButton).click();
    await page.getByTestId(selectors.components.Drawer.DashboardSaveDrawer.saveButton).click();
    await expect
      .poll(async () => {
        const response = await api.get('/api/dashboards/uid/pjan-table-styling-reload');
        const json = (await response.json()) as {
          dashboard: { panels: Array<{ fieldConfig: unknown; options: { styling?: unknown } }> };
        };
        return [json.dashboard.panels[0].fieldConfig, json.dashboard.panels[0].options.styling];
      })
      .toEqual([edited, { look: 'pill' }]);
    await openEditor(page, 'pjan-table-styling-reload');
    await expect.poll(async () => (await savedPanel(page, 1))?.fieldConfig).toEqual(edited);
    await expect(editor(page, 'Background color').getByRole('combobox')).toHaveValue('Softer');
    await expect(editor(page, 'Text color').getByRole('combobox')).toHaveValue('Stronger');
    await expect(editor(page, 'Text weight').getByRole('combobox')).toHaveValue('Medium (500)');
    await expect(editor(page, 'Pill line color').getByRole('combobox')).toHaveValue('Strong');
    await expect(editor(page, 'Pill corner radius').getByRole('slider')).toHaveAttribute('aria-valuenow', '3');
    expect((await savedPanel(page, 1))?.options.styling).toEqual({ look: 'pill' });
    await expect(lookEditor(page).getByRole('radio', { name: 'Pill' })).toBeChecked();
  });
});
