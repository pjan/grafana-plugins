import { expect, test, type Page } from '@grafana/plugin-e2e';

import { CORE, panelOf, PLUGIN, readDashboard, serialise } from './parity';

// Core's and Table plus's option editors are the same (the plan's parity table, "Options"): the same option groups in
// the same order, and in them the same options (panel and field options, standard ones included), with the same labels,
// descriptions, editors and default values, apart from the plugin's own options (custom.styling.*: Background color and
// Text color, right after Cell type, tests/stylingEditor.spec.ts); and the Cell type editor offers the same choices. Compared on a parity
// case without options (`defaults: …`), in the panel editor, in Grafana's default language (en-US). Run with
// --workers=1.
const PARITY = readDashboard('parity.json');
const CASE = 'defaults: string, status, number, time and boolean';
// The plugin's own field options (custom.styling.*), which core doesn't have
const OWN_OPTIONS = ['Background color', 'Text color'];

/** The options pane: its groups in order, and each option's elements (ids mapped) and the state of its inputs. */
const optionsPane = (page: Page) =>
  page.evaluate((serialiseSource) => {
    // eslint-disable-next-line no-new-func
    const serialiseFn = new Function(`return (${serialiseSource})`)() as (r: Element, n: boolean) => string[];
    const groups = Array.from(document.querySelectorAll('[data-testid^="data-testid Options group "]'))
      .map((group) => group.getAttribute('data-testid')!)
      .filter((testId) => !testId.endsWith(' toggle'));
    const options = Array.from(document.querySelectorAll('[data-testid$=" field property editor"]')).map((option) => ({
      option: option.getAttribute('data-testid'),
      elements: serialiseFn(option, true),
      // what attributes don't show: the inputs' current values
      inputs: Array.from(option.querySelectorAll('input, textarea')).map((input) => {
        const field = input as HTMLInputElement;
        return [field.type, field.value, field.checked];
      }),
    }));
    return { groups, options };
  }, serialise.toString());

const openEditor = async (page: Page, type: string) => {
  const { id } = panelOf(PARITY, CASE, type);
  await page.goto(`/d/${PARITY.uid}?orgId=1&editPanel=${id}`);
  const lastGroup = page.getByTestId('data-testid Options group Thresholds');
  await expect(lastGroup).toBeVisible();
  // every option editor has drawn, its icons too
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid$=" field property editor"] svg')).every(
          (svg) => svg.childElementCount > 0
        )
      )
    )
    .toBe(true);
  // the preview has its data: some option editors depend on it (a unit set in the data shows a "pre-configured" note)
  await expect(page.getByTestId('data-testid panel content').locator('[role="row"]').nth(1)).toBeVisible();
  await page.mouse.move(0, 0);
};

/** The options pane once two reads 500 ms apart agree. */
const stablePane = async (page: Page) => {
  let previous = '';
  await expect
    .poll(
      async () => {
        const current = JSON.stringify(await optionsPane(page));
        const stable = current === previous;
        previous = current;
        return stable;
      },
      { intervals: [500] }
    )
    .toBe(true);
  return JSON.parse(previous) as Awaited<ReturnType<typeof optionsPane>>;
};

test('the option editors list the same options, in the same order, with the same labels and defaults', async ({
  page,
}) => {
  const panes = [];
  for (const type of [CORE, PLUGIN]) {
    await openEditor(page, type);
    panes.push(await stablePane(page));
  }
  const [core, plugin] = panes;
  expect(core.groups).toEqual(
    expect.arrayContaining(['data-testid Options group Table', 'data-testid Options group Cell options'])
  );
  // the table's own options, in core's order
  expect(core.options.map((o) => o.option)).toEqual(
    expect.arrayContaining([
      'data-testid Table Show table header field property editor',
      'data-testid Table footer Calculation field property editor',
      'data-testid Cell options Cell type field property editor',
      'data-testid Cell options Styling from field field property editor',
    ])
  );
  expect(plugin.groups).toEqual(core.groups);
  // the plugin's own options, right after Cell type; every other option as core's
  const own = OWN_OPTIONS.map((name) => `data-testid Cell options ${name} field property editor`);
  const at = plugin.options.findIndex((o) => o.option === 'data-testid Cell options Cell type field property editor');
  expect(plugin.options.slice(at + 1, at + 1 + own.length).map((o) => o.option)).toEqual(own);
  const pluginCore = plugin.options.filter((o) => !own.includes(o.option!));
  expect(pluginCore.map((o) => o.option)).toEqual(core.options.map((o) => o.option));
  for (const [i, option] of core.options.entries()) {
    expect(pluginCore[i], option.option!).toEqual(option);
  }
});

test('the Cell type editor offers the same choices', async ({ page }) => {
  const choices = [];
  for (const type of [CORE, PLUGIN]) {
    await openEditor(page, type);
    await page.getByTestId('data-testid Cell options Cell type field property editor').getByRole('combobox').click();
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    choices.push(await listbox.getByRole('option').allInnerTexts());
    await page.keyboard.press('Escape');
  }
  expect(choices[0]).toEqual(
    expect.arrayContaining([expect.stringContaining('Auto'), expect.stringContaining('Pill')])
  );
  expect(choices[1]).toEqual(choices[0]);
});
