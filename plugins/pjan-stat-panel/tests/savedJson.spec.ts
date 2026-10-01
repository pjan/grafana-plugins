import fs from 'node:fs';
import path from 'node:path';

import { type APIRequestContext, expect, PanelEditPage, test } from '@grafana/plugin-e2e';

import { CORE, panelContent, PLUGIN, savedPanel, type SavedPanel } from './helpers';

// The saved JSON (the dashboard's save model, as Grafana writes it): a new Stat ++ panel saves what a new core Stat
// panel saves, opening the editor writes nothing, converting a panel by changing `type` and back keeps it, and
// switching a core Stat panel to Stat ++ in the panel editor keeps its options and colour mode.
interface PanelJson {
  id: number;
  type: string;
  title: string;
  pluginVersion?: string;
  [key: string]: unknown;
}
const PARITY = JSON.parse(fs.readFileSync(path.join(__dirname, '../provisioning/dashboards/parity.json'), 'utf8')) as {
  uid: string;
  time: object;
  panels: PanelJson[];
};
const parityPanel = (id: number) => PARITY.panels.find((p) => p.id === id)!;

const PLUGIN_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')).version;

const settings = (panel: SavedPanel | undefined) => ({ options: panel?.options, fieldConfig: panel?.fieldConfig });

test.describe('saved JSON', () => {
  // One worker, in order: the tests add dashboards through the API and delete them afterwards.
  test.describe.configure({ mode: 'default' });
  let api: APIRequestContext;
  const created: string[] = [];

  const createDashboard = async (uid: string, panels: PanelJson[]) => {
    const response = await api.post('/api/dashboards/db', {
      data: {
        dashboard: { uid, title: uid, time: PARITY.time, timezone: 'utc', schemaVersion: 42, panels },
        overwrite: true,
      },
    });
    expect(response.ok()).toBe(true);
    created.push(uid);
  };

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

  test('a new Stat ++ panel saves what a new core Stat panel saves', async ({ gotoDashboardPage, page }) => {
    const newPanel = async (visualization: string, type: string) => {
      const dashboardPage = await gotoDashboardPage({});
      const panelEditPage = await dashboardPage.addPanel();
      await panelEditPage.setVisualization(visualization);
      await expect.poll(async () => (await savedPanel(page))?.type).toBe(type);
      return (await savedPanel(page))!;
    };
    const core = await newPanel('Stat', CORE);
    const plugin = await newPanel('Stat ++', PLUGIN);

    expect(plugin.pluginVersion).toBe(PLUGIN_VERSION);
    expect(Object.keys(plugin.options).sort()).toEqual(Object.keys(core.options).sort());
    expect(Object.keys(plugin.fieldConfig.defaults).sort()).toEqual(Object.keys(core.fieldConfig.defaults).sort());
    expect(settings(plugin)).toEqual(settings(core));
  });

  test('opening the editor writes nothing', async ({ gotoDashboardPage, page }) => {
    const id = 11; // "defaults, one series", the plugin panel
    await gotoDashboardPage({ uid: PARITY.uid });
    await expect(panelContent(page, id).locator('canvas')).toBeVisible();
    // once the panel has loaded its plugin (Grafana then adds the plugin's defaults, as for any panel)
    await expect.poll(async () => (await savedPanel(page, id))?.options).toHaveProperty('colorMode');
    const before = await savedPanel(page, id);
    expect(before?.type).toBe(PLUGIN);

    await gotoDashboardPage({ uid: PARITY.uid, queryParams: new URLSearchParams({ editPanel: String(id) }) });
    await expect(page.getByTestId('data-testid Stat styles Color mode field property editor')).toBeVisible();
    // for a few seconds: the editor may write late
    for (let t = 0; t < 3000; t += 250) {
      expect(await savedPanel(page, id)).toEqual(before);
      await page.waitForTimeout(250);
    }
  });

  test('converting a panel by changing its type, and back, keeps its settings', async ({ gotoDashboardPage, page }) => {
    // "explicit text sizes" and "override on one series": options and field config away from the defaults
    for (const id of [350, 620]) {
      const original = parityPanel(id);
      expect(original.type).toBe(CORE);
      await gotoDashboardPage({ uid: PARITY.uid });
      await panelContent(page, id).scrollIntoViewIfNeeded();
      await expect.poll(async () => (await savedPanel(page, id))?.options).toHaveProperty('colorMode');
      const core = (await savedPanel(page, id))!;

      // To the plugin: the same panel JSON with the plugin's type
      await createDashboard('pjan-stat-convert', [{ ...original, id: 1, type: PLUGIN }]);
      await gotoDashboardPage({ uid: 'pjan-stat-convert' });
      await expect(panelContent(page, 1).locator('div').first()).toBeVisible();
      await expect.poll(async () => (await savedPanel(page, 1))?.type).toBe(PLUGIN);
      const plugin = (await savedPanel(page, 1))!;
      expect(settings(plugin)).toEqual(settings(core));

      // Back to core: the plugin's saved JSON with core's type
      await createDashboard('pjan-stat-convert-back', [{ ...original, ...plugin, id: 1, type: CORE }]);
      await gotoDashboardPage({ uid: 'pjan-stat-convert-back' });
      await expect(panelContent(page, 1).locator('div').first()).toBeVisible();
      await expect.poll(async () => (await savedPanel(page, 1))?.type).toBe(CORE);
      expect(settings(await savedPanel(page, 1))).toEqual(settings(core));
    }
  });

  test(`back to core, a panel saved by the plugin (pluginVersion ${PLUGIN_VERSION}) gets core's < 8.0 migration`, async ({
    gotoDashboardPage,
    page,
  }) => {
    // Documented in README.md and UPSTREAM.md: Grafana's sharedSingleStatMigrationHandler reads pluginVersion as a
    // Grafana version, so `percent` without min and max gets min 0 and max 100 written in.
    const original = parityPanel(400); // "unit percent, saved without pluginVersion"
    expect(original.pluginVersion).toBeUndefined();
    await createDashboard('pjan-stat-convert-back', [
      { ...original, id: 1, type: CORE, pluginVersion: PLUGIN_VERSION },
    ]);
    await gotoDashboardPage({ uid: 'pjan-stat-convert-back' });
    await expect(panelContent(page, 1).locator('div').first()).toBeVisible();
    await expect
      .poll(async () => (await savedPanel(page, 1))?.fieldConfig.defaults)
      .toMatchObject({
        unit: 'percent',
        min: 0,
        max: 100,
      });
  });

  test("back to core with pluginVersion set to Grafana's, the panel keeps its field config (src/README.md)", async ({
    gotoDashboardPage,
    page,
  }) => {
    const original = parityPanel(400); // "unit percent, saved without pluginVersion"
    await createDashboard('pjan-stat-convert-back', [{ ...original, id: 1, type: CORE, pluginVersion: '13.2.3' }]);
    await gotoDashboardPage({ uid: 'pjan-stat-convert-back' });
    await expect(panelContent(page, 1).locator('div').first()).toBeVisible();
    await expect.poll(async () => (await savedPanel(page, 1))?.options).toHaveProperty('colorMode');
    const defaults = (await savedPanel(page, 1))!.fieldConfig.defaults;
    expect(defaults.unit).toBe('percent');
    expect(defaults).not.toHaveProperty('min');
    expect(defaults).not.toHaveProperty('max');
  });

  test("picking Stat in the editor for a Stat ++ panel is Grafana's switch: two options, thresholds colours (src/README.md)", async ({
    gotoPanelEditPage,
    page,
  }) => {
    await createDashboard('pjan-stat-switch-back', [
      {
        ...parityPanel(621), // "override on one series", the plugin panel
        id: 1,
        options: { ...SWITCH_OPTIONS },
        fieldConfig: { defaults: { color: { mode: 'palette-classic' }, unit: 'ms' }, overrides: [] },
      },
    ]);
    const panelEditPage = await gotoPanelEditPage({ dashboard: { uid: 'pjan-stat-switch-back' }, id: '1' });
    await expect(
      panelEditPage.panel.locator.getByTestId('data-testid panel content').locator('div').first()
    ).toBeVisible();
    await expect.poll(async () => (await savedPanel(page, 1))?.type).toBe(PLUGIN);
    await panelEditPage.setVisualization('Stat');
    await expect.poll(async () => (await savedPanel(page, 1))?.type).toBe(CORE);
    const core = (await savedPanel(page, 1))!;
    expect(core.fieldConfig.defaults).toMatchObject({ color: { mode: 'thresholds' }, unit: 'ms' });
    expect(core.options).toMatchObject({
      reduceOptions: SWITCH_OPTIONS.reduceOptions,
      orientation: SWITCH_OPTIONS.orientation,
      // the rest are core's defaults again
      colorMode: 'value',
      textMode: 'auto',
      showPercentChange: false,
    });
  });

  // Switches a core Stat panel to Stat ++ in the panel editor and checks the saved JSON and the tiles drawn.
  // `pluginLoaded`: the dashboard also has a Stat ++ panel, so the plugin's module is already loaded when the
  // visualization changes (scenes then loads it synchronously); the editor is opened in the app, without a reload.
  const SWITCH_OPTIONS = {
    reduceOptions: { values: false, calcs: ['mean'], fields: '' },
    orientation: 'horizontal',
    textMode: 'value_and_name',
    wideLayout: false,
    colorMode: 'background_solid',
    graphMode: 'none',
    justifyMode: 'center',
    showPercentChange: true,
    percentChangeColorMode: 'inverted',
    text: { titleSize: 12, valueSize: 24, percentSize: 10 },
  };
  for (const { name, color, pluginLoaded } of [
    // The classic palette: Grafana's picker switch resets it to thresholds for Stat (adaptFieldColorMode)
    { name: 'the classic palette', color: { mode: 'palette-classic' }, pluginLoaded: false },
    { name: 'the classic palette, plugin already loaded', color: { mode: 'palette-classic' }, pluginLoaded: true },
    // No colour: adaptFieldColorMode writes `thresholds`, which core never saved for this panel
    { name: 'no colour set', color: undefined, pluginLoaded: false },
    { name: 'no colour set, plugin already loaded', color: undefined, pluginLoaded: true },
  ]) {
    test(`switching a core Stat panel to Stat ++ in the panel editor keeps its settings (${name})`, async ({
      gotoDashboardPage,
      page,
      selectors,
      grafanaVersion,
      request,
    }, testInfo) => {
      const uid = `pjan-stat-switch-${created.length}`;
      const corePanel: PanelJson = {
        ...parityPanel(620), // three series
        id: 1,
        title: 'switched in the editor',
        options: SWITCH_OPTIONS,
        fieldConfig: {
          defaults: { ...(color ? { color } : {}), unit: 'ms', decimals: 1 },
          overrides: [
            { matcher: { id: 'byName', options: 's2' }, properties: [{ id: 'displayName', value: 'second' }] },
          ],
        },
      };
      const panels = [corePanel];
      if (pluginLoaded) {
        panels.push({ ...parityPanel(11), id: 2, gridPos: { x: 12, y: 0, w: 12, h: 4 } });
      }
      await createDashboard(uid, panels);
      await gotoDashboardPage({ uid });
      for (const panel of panels) {
        await expect(panelContent(page, panel.id).locator('div').first()).toBeVisible();
      }
      await expect.poll(async () => (await savedPanel(page, 1))?.options).toHaveProperty('colorMode');
      const core = (await savedPanel(page, 1))!;
      expect(core.fieldConfig.defaults.color).toEqual(color);
      if (pluginLoaded) {
        expect((await savedPanel(page, 2))?.type).toBe(PLUGIN);
        // In the app (no reload): the Stat ++ module stays loaded
        await page.locator('[data-viz-panel-key="panel-1"]').hover();
        await page.keyboard.press('e');
        await expect(page).toHaveURL(/editPanel=1/);
      } else {
        await gotoDashboardPage({ uid, queryParams: new URLSearchParams({ editPanel: '1' }) });
      }
      const panelEditPage = new PanelEditPage(
        { page, selectors, grafanaVersion, request, testInfo },
        { dashboard: { uid }, id: '1' }
      );
      const preview = panelEditPage.panel.locator.getByTestId('data-testid panel content');
      // Inline style declarations sorted: when the panel is drawn first with Grafana's adapted colour and then with
      // the restored one (plugin already loaded, see src/pjan/fieldConfigRefresh.ts), React updates the existing
      // elements, and the browser lists the properties it changed last. Same declarations, other order.
      const tiles = () =>
        preview.evaluate((root) =>
          Array.from(root.querySelectorAll('*')).map((el) => {
            const style = el as HTMLElement;
            const declarations = Array.from(style.style ?? [])
              .map((property) => `${property}: ${style.style.getPropertyValue(property)}`)
              .sort();
            return `${declarations.join('; ')} ${el.textContent}`;
          })
        );
      await expect(preview.getByText('second')).toBeVisible();
      const coreTiles = await tiles();

      await panelEditPage.setVisualization('Stat ++');
      await expect.poll(async () => (await savedPanel(page, 1))?.type).toBe(PLUGIN);
      expect(settings(await savedPanel(page, 1))).toEqual(settings(core));
      // and it draws with them: the same tiles, in the same colours
      await expect.poll(tiles).toEqual(coreTiles);
    });
  }
});
