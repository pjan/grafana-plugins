import { expect, test, type Page } from '@grafana/plugin-e2e';

import { panelContent } from './helpers';

// Data links on provisioning/dashboards/parity.json: one link (a link around the tile) and two (a button that opens
// the links menu), each in the core panel (id n * 10) and in this plugin (n * 10 + 1). tests/parity.spec.ts compares
// how they look and their native tooltips; this file checks how they behave.
const UID = 'pjan-stat-parity';
const ONE_LINK = 430;
const TWO_LINKS = 440;

// Loads the dashboard once per test (a second load of the same dashboard in one test timed out under load)
const open = async (page: Page, gotoDashboardPage: (args: { uid: string }) => Promise<unknown>) => {
  await gotoDashboardPage({ uid: UID });
};

// Scrolls to a case's two panels (core, plugin) and waits until they are drawn
const show = async (page: Page, id: number) => {
  for (const panelId of [id, id + 1]) {
    await page.locator(`[data-viz-panel-key="panel-${panelId}"]`).scrollIntoViewIfNeeded();
    await expect(panelContent(page, panelId).locator('canvas')).toBeVisible({ timeout: 30_000 });
  }
};

// Moves the keyboard focus into a panel's content with Tab, from the panel itself
const tabIntoContent = async (page: Page, id: number) => {
  await page.locator(`[data-viz-panel-key="panel-${id}"] section`).focus();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    const inside = await panelContent(page, id).evaluate((root) => root.contains(document.activeElement));
    if (inside) {
      // The focus ring fades in (a CSS transition on the focused element). Settled, not finished: a transition that is
      // replaced rejects its promise.
      await page.evaluate(() =>
        Promise.allSettled((document.activeElement?.getAnimations() ?? []).map((animation) => animation.finished))
      );
      return page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const style = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          href: el.getAttribute('href'),
          focusVisible: el.matches(':focus-visible'),
          outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
          boxShadow: style.boxShadow,
        };
      });
    }
  }
  throw new Error(`Tab did not reach the content of panel ${id}`);
};

for (const [type, offset] of [
  ['core', 0],
  ['plugin', 1],
] as const) {
  test.describe(`data links (${type} panel)`, () => {
    test('one link: the tile is a link', async ({ gotoDashboardPage, page }) => {
      const id = ONE_LINK + offset;
      await open(page, gotoDashboardPage);
      await show(page, ONE_LINK);
      const link = panelContent(page, id).getByRole('link');
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute('href', 'https://example.com/details');
      await expect(link).toContainText(/\d/);
    });

    test('two links: clicking the tile opens the links menu', async ({ gotoDashboardPage, page }) => {
      const id = TWO_LINKS + offset;
      await open(page, gotoDashboardPage);
      await show(page, TWO_LINKS);
      await panelContent(page, id).getByRole('button').click();
      await expect(page.getByRole('menuitem', { name: 'Details' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Runbook' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menuitem', { name: 'Details' })).toBeHidden();
    });

    test('keyboard: the link and the menu button take focus; Enter opens the menu', async ({
      gotoDashboardPage,
      page,
    }) => {
      await open(page, gotoDashboardPage);
      await show(page, ONE_LINK);
      expect(await tabIntoContent(page, ONE_LINK + offset)).toMatchObject({
        tag: 'a',
        href: 'https://example.com/details',
        focusVisible: true,
      });

      await show(page, TWO_LINKS);
      expect(await tabIntoContent(page, TWO_LINKS + offset)).toMatchObject({ tag: 'button', focusVisible: true });
      await page.keyboard.press('Enter');
      await expect(page.getByRole('menuitem', { name: 'Runbook' })).toBeVisible();
    });
  });
}

test('the focus ring of the plugin tiles is core’s', async ({ gotoDashboardPage, page }) => {
  await open(page, gotoDashboardPage);
  for (const id of [ONE_LINK, TWO_LINKS]) {
    await show(page, id);
    const core = await tabIntoContent(page, id);
    const plugin = await tabIntoContent(page, id + 1);
    expect(plugin).toEqual(core);
  }
});
