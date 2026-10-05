import { expect, test, type Locator, type Page } from '@grafana/plugin-e2e';

import { savedPanel } from './helpers';
import { CORE, drawn, panelContent, panelOf, PLUGIN, readDashboard, restingState, serialise } from './parity';

// Core's table and Table plus behave alike: the same action on both panels of a parity case (provisioning/dashboards/
// parity.json, panels looked up by title) gives the same rows, the same saved options and field config, and the same
// popups. tests/parity.spec.ts compares how they look at rest. Run with --workers=1.
const PARITY = readDashboard('parity.json');
const TYPES = [CORE, PLUGIN] as const;

const ids = (title: string) => TYPES.map((type) => panelOf(PARITY, title, type).id);

const openDashboard = async (page: Page) => {
  await page.goto(`/d/${PARITY.uid}?orgId=1`);
};

/** Scrolls to a case's panels and waits until both are drawn; returns their ids (core, plugin). */
const show = async (page: Page, title: string) => {
  const [core, plugin] = ids(title);
  for (const id of [core, plugin]) {
    await drawn(page, id);
  }
  return [core, plugin] as const;
};

const grid = (page: Page, id: number) => panelContent(page, id).locator('[role="grid"]').first();
const header = (page: Page, id: number, name: string) =>
  panelContent(page, id)
    .locator('[role="columnheader"]')
    .filter({ hasText: new RegExp(`^${name}$`) })
    .first();

/** The text of every rendered row (cells joined with |), header excluded. */
const readRows = (page: Page, id: number) =>
  panelContent(page, id).evaluate((root) =>
    Array.from(root.querySelectorAll('[role="row"]'))
      .filter((row) => row.querySelector('[role="gridcell"]'))
      .map((row) =>
        Array.from(row.querySelectorAll('[role="gridcell"]'))
          .map((cell) => (cell as HTMLElement).innerText.trim())
          .join('|')
      )
  );

/** The rows, once two reads 250 ms apart agree (the grid re-renders after a click). */
const rows = async (page: Page, id: number) => {
  let previous = '';
  await expect
    .poll(
      async () => {
        const current = JSON.stringify(await readRows(page, id));
        const stable = current === previous;
        previous = current;
        return stable;
      },
      { intervals: [250] }
    )
    .toBe(true);
  return JSON.parse(previous) as string[];
};

/** Waits until every icon in an element has loaded its path (Grafana's icons load asynchronously). */
const iconsLoaded = (root: Locator) =>
  expect
    .poll(() => root.evaluate((el) => Array.from(el.querySelectorAll('svg')).every((svg) => svg.childElementCount > 0)))
    .toBe(true);

// The inline styles that only place a popup on the page (floating-ui, Popover, the drawer's animation)
const POSITIONAL = /^(top|left|right|bottom|inset|transform|translate|position)$/;

/** A popup (portalled outside the panel) as its elements, with generated ids mapped and its placement left out. */
const serialisePopup = async (popup: Locator) => {
  await iconsLoaded(popup);
  return popup.evaluate(
    (root, { serialiseSource, positional }) => {
      // eslint-disable-next-line no-new-func
      const serialiseFn = new Function(`return (${serialiseSource})`)() as (r: Element, n: boolean) => string[];
      const re = new RegExp(positional);
      const clone = root.cloneNode(true) as HTMLElement;
      for (const el of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('[style]'))]) {
        const kept = Array.from(el.style)
          .filter((property) => !re.test(property))
          .map((property) => `${property}: ${el.style.getPropertyValue(property)}`)
          .join('; ');
        el.setAttribute('style', kept);
      }
      return serialiseFn(clone, true);
    },
    { serialiseSource: serialise.toString(), positional: POSITIONAL.source }
  );
};

/**
 * The request behind a panel's current data (its id and start time), from the dashboard scene: the VizPanel keyed
 * `panel-<id>` and its data provider's `data.request`. Changes with every query run, so a refresh is seen to happen.
 */
const lastRequest = (page: Page, id: number) =>
  page.evaluate((key) => {
    type SceneObject = {
      state: {
        key?: string;
        $data?: SceneObject;
        data?: { state?: string; request?: { requestId?: string; startTime?: number } };
      };
      forEachChild?: (callback: (child: SceneObject) => void) => void;
    };
    const find = (object: SceneObject): SceneObject | undefined => {
      if (object.state.key === key) {
        return object;
      }
      let found: SceneObject | undefined;
      object.forEachChild?.((child) => {
        found ??= find(child);
      });
      return found;
    };
    const scene = (window as unknown as { __grafanaSceneContext: SceneObject }).__grafanaSceneContext;
    const data = find(scene)?.state.$data?.state.data;
    return { state: data?.state, requestId: data?.request?.requestId, startTime: data?.request?.startTime };
  }, `panel-${id}`);

/** The panel options and field config Grafana would save for a panel. */
const settings = async (page: Page, id: number) => {
  const panel = await savedPanel(page, id);
  return { options: panel?.options, fieldConfig: panel?.fieldConfig };
};

test.describe('interaction, core and Table plus alike', () => {
  test('sorting: header clicks and a second column with the multi-sort key', async ({ page }) => {
    await openDashboard(page);
    const panels = await show(page, 'defaults: string, status, number, time and boolean');
    const states = [];
    for (const id of panels) {
      const steps = [];
      const sortBy = async () => JSON.stringify((await savedPanel(page, id))?.options.sortBy);
      const step = async (click: () => Promise<void>) => {
        const before = await sortBy();
        await click();
        await expect.poll(sortBy).not.toBe(before);
        steps.push({ rows: await rows(page, id), sortBy: JSON.parse(await sortBy()) });
      };
      await step(() => header(page, id, 'status').locator('button').click());
      await step(() => header(page, id, 'status').locator('button').click());
      // react-data-grid sorts by several columns with Ctrl or Cmd held
      await step(() =>
        header(page, id, 'cpu')
          .locator('button')
          .click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] })
      );
      states.push(steps);
    }
    expect(states[0][1].sortBy).toEqual([{ displayName: 'status', desc: true }]);
    expect(states[0][2].sortBy).toEqual([
      { displayName: 'status', desc: true },
      { displayName: 'cpu', desc: false },
    ]);
    expect(states[0][0].rows).not.toEqual(states[0][1].rows);
    expect(states[1]).toEqual(states[0]);
  });

  test('column resize: dragging a header edge saves the same width override', async ({ page }) => {
    await openDashboard(page);
    const panels = await show(page, 'defaults: string, status, number, time and boolean');
    const saved = [];
    for (const id of panels) {
      const handle = header(page, id, 'host').locator('div[aria-hidden="true"]').last();
      const box = (await handle.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 });
      await page.mouse.up();
      await expect.poll(async () => (await settings(page, id)).fieldConfig?.overrides.length).toBeGreaterThan(0);
      saved.push((await settings(page, id)).fieldConfig?.overrides);
    }
    expect(JSON.stringify(saved[0])).toContain('custom.width');
    expect(saved[1]).toEqual(saved[0]);
  });

  test('column resize in a nested table saves the override with the nested scope', async ({ page }) => {
    await openDashboard(page);
    const panels = await show(page, 'nested frames, every row expanded, with nested-scope overrides');
    const saved = [];
    for (const id of panels) {
      const nestedHeader = panelContent(page, id)
        .locator('[role="columnheader"]')
        .filter({ hasText: /^container$/ })
        .first();
      const handle = nestedHeader.locator('div[aria-hidden="true"]').last();
      const box = (await handle.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 6 });
      await page.mouse.up();
      await expect
        .poll(async () => JSON.stringify((await settings(page, id)).fieldConfig?.overrides))
        .toContain('"options":"container","scope":"nested"');
      saved.push((await settings(page, id)).fieldConfig?.overrides);
    }
    expect(saved[1]).toEqual(saved[0]);
  });

  test('filtering: the filter popup, search, values, select all and clear', async ({ page }) => {
    await openDashboard(page);
    const panels = await show(page, 'column filter on');
    const results = [];
    for (const id of panels) {
      const result: Record<string, unknown> = {};
      await header(page, id, 'status').getByTestId('data-testid tableng header filter').click();
      const popup = page.getByTestId('data-testid tablenf filter container');
      await expect(popup).toBeVisible();
      result.popup = await serialisePopup(popup);
      await popup.getByPlaceholder('Filter values').fill('d');
      result.searched = await popup.locator('label').allInnerTexts();
      await popup.getByPlaceholder('Filter values').fill('');
      await popup.getByText('down', { exact: true }).click();
      await popup.getByRole('button', { name: 'Ok' }).click();
      result.picked = await rows(page, id);
      await header(page, id, 'status').getByTestId('data-testid tableng header filter').click();
      await popup.getByTestId('data-testid tableng filter select-all').click();
      await popup.getByRole('button', { name: 'Ok' }).click();
      result.all = await rows(page, id);
      await header(page, id, 'status').getByTestId('data-testid tableng header filter').click();
      await popup.getByRole('button', { name: 'Clear filter' }).click();
      result.cleared = await rows(page, id);
      await expect(popup).toBeHidden();
      results.push(result);
    }
    expect((results[0].picked as string[]).every((row) => row.includes('|down|'))).toBe(true);
    expect(results[1]).toEqual(results[0]);
  });

  test('pagination: next and previous page, and the page label', async ({ page }) => {
    await openDashboard(page);
    const panels = await show(page, 'pagination: page size from the panel height, several pages');
    const results = [];
    for (const id of panels) {
      const content = panelContent(page, id);
      // the current page (the panel is too narrow for Grafana's "1 - 4 of 60 rows" summary)
      const label = async () => (await content.locator('[aria-current="page"]').innerText()).trim();
      const result = [{ label: await label(), rows: await rows(page, id) }];
      await content.getByRole('button', { name: 'next page' }).click();
      result.push({ label: await label(), rows: await rows(page, id) });
      await content.getByRole('button', { name: 'previous page' }).click();
      result.push({ label: await label(), rows: await rows(page, id) });
      results.push(result);
    }
    expect(results[0][1].label).not.toBe(results[0][0].label);
    expect(results[1]).toEqual(results[0]);
  });

  test('cell inspect: the drawer opens with the same content, as text and as code', async ({ page }) => {
    await openDashboard(page);
    const panels = await show(page, 'cell value inspect on');
    const results = [];
    for (const id of panels) {
      const cell = panelContent(page, id)
        .locator('[role="gridcell"]')
        .filter({ hasText: /^bravo$/ });
      await cell.hover();
      await cell.getByRole('button', { name: 'Inspect value' }).click();
      const drawer = page.getByRole('dialog').filter({ hasText: 'Inspect value' });
      await expect(drawer).toBeVisible();
      const text = await drawer.innerText();
      const tabs = await drawer.getByRole('tab').allInnerTexts();
      await drawer.getByRole('tab').nth(1).click();
      await expect(drawer).not.toContainText('Loading editor');
      await expect(drawer.locator('.monaco-editor[role="code"]')).toBeVisible();
      // Monaco draws its lines after it appears
      await expect(drawer.locator('.monaco-editor[role="code"] .view-lines')).toContainText('bravo');
      const code = await drawer.innerText();
      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden();
      results.push({ text, tabs, code });
    }
    expect(results[0].text).toContain('bravo');
    expect(results[1]).toEqual(results[0]);
  });

  test('data links: one link is a link; several open the same menu; actions render as buttons', async ({ page }) => {
    await openDashboard(page);
    const panels = await show(page, 'data links: one link, two links, and the data links cell type');
    const results = [];
    for (const id of panels) {
      const content = panelContent(page, id);
      const link = content.getByRole('link', { name: 'alpha home' });
      const one = { href: await link.getAttribute('href'), target: await link.getAttribute('target') };
      await content.getByText('bravo menu').click();
      const menu = page.getByTestId('data-testid Data links actions tooltip wrapper');
      await expect(menu).toBeVisible();
      const items = await menu
        .getByRole('link')
        .evaluateAll((links) => links.map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target')]));
      const popup = await serialisePopup(menu);
      await page.keyboard.press('Escape');
      await restingState(page);
      await expect(menu).toBeHidden();
      results.push({ one, items, popup });
    }
    expect(results[0].one.href).toBe('https://example.com/details?host=alpha');
    expect(results[0].items).toHaveLength(2);
    expect(results[1]).toEqual(results[0]);

    const actionPanels = await show(page, 'cell type actions');
    const buttons = [];
    for (const id of actionPanels) {
      buttons.push(await panelContent(page, id).getByRole('button').allInnerTexts());
    }
    expect(buttons[0].filter((b) => b === 'Restart')).toHaveLength(5);
    expect(buttons[1]).toEqual(buttons[0]);
  });

  test('ad hoc filters: "Filter for value" and "Filter out value" set the same filter', async ({ page }) => {
    const filters = [];
    for (const [k, id] of ids('column filter on').entries()) {
      const result = [];
      for (const button of ['Filter for value', 'Filter out value']) {
        await openDashboard(page);
        await drawn(page, id);
        const cell = panelContent(page, id)
          .locator('[role="gridcell"]')
          .filter({ hasText: /^charlie$/ });
        await cell.hover();
        await cell.getByRole('button', { name: button }).click();
        await expect.poll(() => new URL(page.url()).searchParams.toString()).toContain('var-');
        const params = new URL(page.url()).searchParams;
        result.push([...params.entries()].filter(([key]) => key.startsWith('var-')));
      }
      filters[k] = result;
    }
    expect(JSON.stringify(filters[0])).toContain('charlie');
    expect(filters[1]).toEqual(filters[0]);
  });

  test('nested rows: expand and collapse by click and by keyboard', async ({ page }) => {
    await openDashboard(page);
    const panels = await show(page, 'nested frames, collapsed, with nested-scope overrides');
    const results = [];
    for (const id of panels) {
      const content = panelContent(page, id);
      const expanders = content.getByRole('button', { name: 'Expand row' });
      const result = [await rows(page, id)];
      await expanders.first().click();
      result.push(await rows(page, id));
      await content.getByRole('button', { name: 'Collapse row' }).first().click();
      result.push(await rows(page, id));
      await content.getByRole('button', { name: 'Expand row' }).nth(1).focus();
      await page.keyboard.press('Enter');
      result.push(await rows(page, id));
      await page.keyboard.press('Enter');
      result.push(await rows(page, id));
      results.push(result);
    }
    expect(results[0][1].length).toBeGreaterThan(results[0][0].length);
    expect(results[0][3].length).toBeGreaterThan(results[0][0].length);
    expect(results[1]).toEqual(results[0]);
  });

  test('tooltip from field: hover shows the same tooltip, a click pins it', async ({ page }) => {
    await openDashboard(page);
    const panels = await show(page, 'tooltip from field, each placement');
    const results = [];
    for (const id of panels) {
      const result = [];
      for (const placement of ['auto', 'top', 'right', 'bottom', 'left']) {
        const column = ['auto', 'top', 'right', 'bottom', 'left'].indexOf(placement);
        const cell = panelContent(page, id).locator('[role="row"]').nth(2).locator('[role="gridcell"]').nth(column);
        await cell.getByRole('button', { name: 'Toggle tooltip' }).hover();
        const tooltip = page.getByTestId('data-testid tableng tooltip wrapper');
        await expect(tooltip).toHaveCount(1);
        await expect(tooltip).toBeVisible();
        result.push({ placement, text: await tooltip.innerText(), html: await serialisePopup(tooltip) });
        await restingState(page);
        // gone, not only fading out (its opacity transition), before the next one
        await expect(tooltip).toHaveCount(0);
      }
      // A click pins the tooltip: it stays while the pointer is away; a second click unpins it, and the tooltip goes
      // once the pointer has left. The click is dispatched on the caret: a pointer click there first hovers it, and
      // the tooltip that opens can take the click (core alike).
      const trigger = panelContent(page, id).getByRole('button', { name: 'Toggle tooltip' }).first();
      const wrapper = page.getByTestId('data-testid tableng tooltip wrapper');
      await trigger.dispatchEvent('click');
      await expect(trigger).toHaveAttribute('aria-pressed', 'true');
      await restingState(page);
      await page.waitForTimeout(500);
      const pinned = { pressed: await trigger.getAttribute('aria-pressed'), shown: await wrapper.count() };
      result.push({ pinned, html: await serialisePopup(wrapper) });
      await trigger.dispatchEvent('click');
      await expect(trigger).toHaveAttribute('aria-pressed', 'false');
      await restingState(page);
      await expect(wrapper).toHaveCount(0);
      results.push(result);
    }
    expect(results[0].at(-1)).toMatchObject({ pinned: { pressed: 'true', shown: 1 } });
    expect(results[1]).toEqual(results[0]);
  });

  test('refresh keeps sorting, filtering and expanded nested rows', async ({ page }) => {
    await openDashboard(page);
    const sorted = await show(page, 'defaults: string, status, number, time and boolean');
    const filtered = await show(page, 'column filter on');
    const nested = await show(page, 'nested frames, collapsed, with nested-scope overrides');
    const before = [];
    for (let k = 0; k < 2; k++) {
      await header(page, sorted[k], 'cpu').locator('button').click();
      await header(page, filtered[k], 'status').getByTestId('data-testid tableng header filter').click();
      const popup = page.getByTestId('data-testid tablenf filter container');
      await popup.getByLabel('up', { exact: true }).check();
      await popup.getByRole('button', { name: 'Ok' }).click();
      await panelContent(page, nested[k]).getByRole('button', { name: 'Expand row' }).first().click();
      before.push([await rows(page, sorted[k]), await rows(page, filtered[k]), await rows(page, nested[k])]);
    }
    // TestData's raw frames are answered in the browser (no /api/ds/query request), so the refresh is seen in each
    // panel's data: a new request (a later start time), done
    const panels = [...sorted, ...filtered, ...nested];
    const requests = await Promise.all(panels.map((id) => lastRequest(page, id)));
    expect(requests.every((request) => request.state === 'Done' && request.requestId)).toBe(true);
    await page.getByTestId('data-testid RefreshPicker run button').click();
    for (const [n, id] of panels.entries()) {
      // Grafana runs a panel's queries once it is in view
      await panelContent(page, id).scrollIntoViewIfNeeded();
      await expect
        .poll(async () => {
          const request = await lastRequest(page, id);
          return request.state === 'Done' && request.startTime !== requests[n].startTime;
        })
        .toBe(true);
    }
    const after = [];
    for (let k = 0; k < 2; k++) {
      after.push([await rows(page, sorted[k]), await rows(page, filtered[k]), await rows(page, nested[k])]);
    }
    expect(after).toEqual(before);
    expect(before[1]).toEqual(before[0]);
  });

  test('frame picker: choosing the second frame saves frameIndex 1', async ({ page }) => {
    await openDashboard(page);
    const panels = await show(page, 'several frames, frame 1 shown (the frame picker)');
    const results = [];
    for (const id of panels) {
      await panelContent(page, id).getByRole('combobox', { name: 'Query' }).click();
      await page.getByRole('option', { name: 'second' }).click();
      await expect.poll(async () => (await savedPanel(page, id))?.options.frameIndex).toBe(1);
      results.push(await rows(page, id));
    }
    expect(results[0][0]).toContain('api');
    expect(results[1]).toEqual(results[0]);
  });

  test('keyboard: arrow keys move the selected cell, with the same focus style', async ({ page }) => {
    await openDashboard(page);
    const panels = await show(page, 'defaults: string, status, number, time and boolean');
    const results = [];
    for (const id of panels) {
      await panelContent(page, id)
        .locator('[role="gridcell"]')
        .filter({ hasText: /^alpha$/ })
        .click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowRight');
      results.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          const style = getComputedStyle(el);
          return {
            text: el.innerText,
            selected: el.getAttribute('aria-selected'),
            column: el.getAttribute('aria-colindex'),
            outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor} ${style.outlineOffset}`,
          };
        })
      );
      await restingState(page);
    }
    expect(results[0]).toMatchObject({ text: 'degraded', selected: 'true', column: '2' });
    expect(results[1]).toEqual(results[0]);
  });

  test('panel resize: the grid re-flows alike when the page gets narrower', async ({ page }) => {
    await openDashboard(page);
    const panels = await show(page, 'resize: the same table wide');
    const widths = async (id: number) => grid(page, id).evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    const before = [await widths(panels[0]), await widths(panels[1])];
    await page.setViewportSize({ width: 900, height: 900 });
    await expect.poll(async () => widths(panels[0])).not.toBe(before[0]);
    await page.waitForTimeout(500);
    const after = [await widths(panels[0]), await widths(panels[1])];
    expect(before[1]).toBe(before[0]);
    expect(after[1]).toBe(after[0]);
  });

  test('geo cells: the WKT text, with OpenLayers loaded from the plugin’s own lazy chunk', async ({ page }) => {
    await openDashboard(page);
    const [core, plugin] = await show(page, 'cell type geo, points from coordinates (spatial operations)');
    for (const id of [core, plugin]) {
      await expect(panelContent(page, id).getByText('POINT(4.3517 50.850300000000004)')).toBeVisible();
    }
    const chunks = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => new URL(entry.name).pathname)
        .filter((name) => name.startsWith('/public/plugins/pjan-table-panel/') && /\/\d+\.js$/.test(name))
    );
    // The chunk that holds OpenLayers' WKT writer (the only lazy chunk with geometry code), from the plugin's path
    const sources = await Promise.all(
      chunks.map(async (chunk) => ({ chunk, text: await (await page.request.get(chunk)).text() }))
    );
    expect(sources.filter(({ text }) => text.includes('MULTIPOLYGON')).map(({ chunk }) => chunk)).toHaveLength(1);
  });
});
