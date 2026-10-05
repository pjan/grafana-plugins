import { type APIRequestContext, expect, PanelEditPage, test, type Locator, type Page } from '@grafana/plugin-e2e';

import { apiClient, savedPanel, type SavedPanel } from './helpers';
import { CORE, drawn, panelOf, PLUGIN, readDashboard, serialise, type DashboardPanel } from './parity';

// The saved JSON (the dashboard's save model, as Grafana writes it): a new Table plus panel saves what a new core Table
// panel saves, opening the editor writes nothing, converting a panel by changing `type` (or, in a v2 dashboard,
// `vizConfig.group`) keeps it, the load migration gives the same model as core's, and switching a core Table panel to
// Table plus in the panel editor keeps its options and field config and draws the same. Run with --workers=1.
const PARITY = readDashboard('parity.json');

const PLUGIN_VERSION = require('../package.json').version;

const settings = (panel: SavedPanel | undefined) => ({ options: panel?.options, fieldConfig: panel?.fieldConfig });

/** The elements of a drawn table (ids mapped, as in the parity test), once two reads in a row agree. */
const stableTable = async (root: Locator) => {
  let previous = '';
  await expect
    .poll(async () => {
      const current = JSON.stringify(
        await root.evaluate((el, source) => {
          // eslint-disable-next-line no-new-func
          const fn = new Function(`return (${source})`)() as (r: Element, n: boolean) => string[];
          return el.querySelector('[role="row"]') ? fn(el, true) : null;
        }, serialise.toString())
      );
      const stable = current === previous && current !== 'null';
      previous = current;
      return stable;
    })
    .toBe(true);
  return previous;
};

test.describe('saved JSON', () => {
  // One worker, in order: the tests add dashboards through the API and delete them afterwards.
  test.describe.configure({ mode: 'default' });
  let api: APIRequestContext;
  const created: string[] = [];

  const createDashboard = async (uid: string, panels: DashboardPanel[]) => {
    const response = await api.post('/api/dashboards/db', {
      data: {
        dashboard: { uid, title: uid, time: PARITY.time, timezone: 'utc', schemaVersion: 42, panels },
        overwrite: true,
      },
    });
    expect(response.ok()).toBe(true);
    created.push(uid);
  };

  const loaded = async (page: Page, id: number) => {
    await drawn(page, id);
    // once the panel has loaded its plugin (Grafana then adds the plugin's defaults, as for any panel)
    await expect.poll(async () => (await savedPanel(page, id))?.options).toHaveProperty('cellHeight');
    return (await savedPanel(page, id))!;
  };

  test.beforeAll(async ({ playwright, grafanaAPICredentials }) => {
    api = await apiClient(playwright, grafanaAPICredentials);
  });

  test.afterAll(async () => {
    for (const uid of created) {
      await api.delete(`/api/dashboards/uid/${uid}`);
    }
    await api.dispose();
  });

  test('a new Table plus panel saves what a new core Table panel saves', async ({ gotoDashboardPage, page }) => {
    const newPanel = async (visualization: string, type: string) => {
      const dashboardPage = await gotoDashboardPage({});
      const panelEditPage = await dashboardPage.addPanel();
      await panelEditPage.setVisualization(visualization);
      await expect.poll(async () => (await savedPanel(page))?.type).toBe(type);
      // once Grafana has added the plugin's defaults
      await expect.poll(async () => (await savedPanel(page))?.fieldConfig.defaults.custom).toBeTruthy();
      return (await savedPanel(page))!;
    };
    const core = await newPanel('Table', CORE);
    const plugin = await newPanel('Table plus', PLUGIN);

    expect(plugin.pluginVersion).toBe(PLUGIN_VERSION);
    expect(Object.keys(core.options).sort()).toEqual(['cellHeight', 'showHeader']);
    expect(core.fieldConfig.defaults.custom).toMatchObject({ align: 'auto', cellOptions: { type: 'auto' } });
    expect(settings(plugin)).toEqual(settings(core));
  });

  test('opening the editor writes nothing', async ({ gotoDashboardPage, page }) => {
    const { id } = panelOf(PARITY, 'nested frames, collapsed, with nested-scope overrides', PLUGIN);
    await gotoDashboardPage({ uid: PARITY.uid });
    const before = await loaded(page, id);
    expect(before.type).toBe(PLUGIN);

    await gotoDashboardPage({ uid: PARITY.uid, queryParams: new URLSearchParams({ editPanel: String(id) }) });
    await expect(page.getByText('Show table header', { exact: true })).toBeVisible();
    // for a few seconds: the editor may write late
    for (let t = 0; t < 3000; t += 250) {
      expect(await savedPanel(page, id)).toEqual(before);
      await page.waitForTimeout(250);
    }
  });

  test('converting a panel by changing its type keeps its settings', async ({ gotoDashboardPage, page }) => {
    // options, field config and overrides away from the defaults
    for (const title of [
      'nested frames, collapsed, with nested-scope overrides',
      'sorting: two columns',
      'layout: two frozen columns, horizontal overflow',
    ]) {
      const original = panelOf(PARITY, title, CORE);
      await gotoDashboardPage({ uid: PARITY.uid });
      const core = await loaded(page, original.id);

      // To the plugin: the same panel JSON with the plugin's type
      await createDashboard('pjan-table-convert', [{ ...original, id: 1, type: PLUGIN }]);
      await gotoDashboardPage({ uid: 'pjan-table-convert' });
      await expect.poll(async () => (await savedPanel(page, 1))?.type).toBe(PLUGIN);
      expect(settings(await loaded(page, 1))).toEqual(settings(core));
    }
  });

  test('converting a panel in a v2 dashboard by changing vizConfig.group keeps its settings', async ({
    gotoDashboardPage,
    page,
  }) => {
    const source = panelOf(PARITY, 'nested frames, collapsed, with nested-scope overrides', CORE);
    const v2 = (uid: string, group: string) => ({
      apiVersion: 'dashboard.grafana.app/v2',
      kind: 'Dashboard',
      metadata: { name: uid },
      spec: {
        title: uid,
        annotations: [],
        cursorSync: 'Off',
        editable: true,
        links: [],
        liveNow: false,
        preload: false,
        tags: [],
        variables: [],
        timeSettings: {
          from: PARITY.time.from,
          to: PARITY.time.to,
          timezone: 'utc',
          autoRefresh: '',
          autoRefreshIntervals: ['5s', '1m'],
          fiscalYearStartMonth: 0,
          hideTimepicker: false,
        },
        elements: {
          'panel-1': {
            kind: 'Panel',
            spec: {
              id: 1,
              title: source.title,
              description: '',
              links: [],
              data: {
                kind: 'QueryGroup',
                spec: {
                  queries: [
                    {
                      kind: 'PanelQuery',
                      spec: {
                        refId: 'A',
                        hidden: false,
                        query: {
                          kind: 'DataQuery',
                          group: 'grafana-testdata-datasource',
                          version: 'v0',
                          datasource: { name: 'trlxrdZVk' },
                          spec: (source.targets as Array<Record<string, unknown>>)[0],
                        },
                      },
                    },
                  ],
                  queryOptions: {},
                  transformations: (source.transformations as Array<{ id: string; options: object }>).map((t) => ({
                    kind: t.id,
                    spec: { id: t.id, options: t.options },
                  })),
                },
              },
              vizConfig: {
                kind: 'VizConfig',
                group,
                version: '',
                spec: { options: source.options, fieldConfig: source.fieldConfig },
              },
            },
          },
        },
        layout: {
          kind: 'GridLayout',
          spec: {
            items: [
              {
                kind: 'GridLayoutItem',
                spec: { x: 0, y: 0, width: 24, height: 10, element: { kind: 'ElementReference', name: 'panel-1' } },
              },
            ],
          },
        },
      },
    });
    const saved = async (uid: string, group: string) => {
      await api.delete(`/apis/dashboard.grafana.app/v2/namespaces/default/dashboards/${uid}`);
      const response = await api.post('/apis/dashboard.grafana.app/v2/namespaces/default/dashboards', {
        data: v2(uid, group),
      });
      expect(response.ok(), await response.text()).toBe(true);
      created.push(uid);
      await gotoDashboardPage({ uid });
      await expect.poll(async () => (await savedPanel(page, 1))?.type).toBe(group);
      return loaded(page, 1);
    };
    const core = await saved('pjan-table-v2-core', CORE);
    const plugin = await saved('pjan-table-v2-plugin', PLUGIN);
    expect(settings(plugin)).toEqual(settings(core));
    expect(JSON.stringify(plugin.fieldConfig.overrides)).toContain('"scope":"nested"');
  });

  // The load migration (tableMigrationHandler, copied): scenes runs it when the saved pluginVersion differs from the
  // running panel's (core: 13.2.3, the plugin: its package version), and it compares no versions itself. A panel with a
  // legacy footer, a `custom.hidden` override and the old `cellOptions.wrapText`, saved with each version:
  const LEGACY = {
    options: {
      showHeader: true,
      footer: { show: true, reducer: ['sum'], fields: ['metric 1'], countRows: false, enablePagination: true },
    },
    fieldConfig: {
      defaults: { custom: { cellOptions: { type: 'auto', wrapText: true } } },
      overrides: [
        { matcher: { id: 'byName', options: 'metric 2' }, properties: [{ id: 'custom.hidden', value: true }] },
      ],
    },
  };
  for (const version of [undefined, '13.2.3', PLUGIN_VERSION]) {
    test(`the load migration, saved with pluginVersion ${version ?? '(none)'}`, async ({ gotoDashboardPage, page }) => {
      const source = panelOf(PARITY, 'footer: legacy footer options, migrated on load', CORE);
      const panel = (type: string, id: number, x: number): DashboardPanel => ({
        ...source,
        id,
        type,
        gridPos: { x, y: 0, w: 12, h: 8 },
        ...LEGACY,
        ...(version ? { pluginVersion: version } : {}),
      });
      const uid = `pjan-table-migration-${version ?? 'none'}`.replace(/\./g, '-');
      await createDashboard(uid, [panel(CORE, 1, 0), panel(PLUGIN, 2, 12)]);
      await gotoDashboardPage({ uid });
      const core = await loaded(page, 1);
      const plugin = await loaded(page, 2);

      const migrated = {
        options: { enablePagination: true },
        custom: { wrapText: true },
        overrides: [
          { matcher: { id: 'byName', options: 'metric 2' }, properties: [{ id: 'custom.hideFrom.viz', value: true }] },
          {
            matcher: { id: 'byName', options: 'metric 1' },
            properties: [{ id: 'custom.footer.reducers', value: ['sum'] }],
          },
        ],
      };
      const expectMigrated = (saved: SavedPanel) => {
        expect(saved.options).toMatchObject(migrated.options);
        expect(saved.options).not.toHaveProperty('footer');
        expect(saved.fieldConfig.defaults.custom).toMatchObject(migrated.custom);
        expect(saved.fieldConfig.overrides).toEqual(migrated.overrides);
      };
      const expectAsSaved = (saved: SavedPanel) => {
        expect(saved.options).toMatchObject({ footer: LEGACY.options.footer });
        // not migrated: Grafana drops `custom.hidden`, which the table registers no option for, on load
        expect(saved.fieldConfig.overrides).toEqual([
          { matcher: { id: 'byName', options: 'metric 2' }, properties: [] },
        ]);
      };
      // Each panel migrates when the saved version isn't its own, as scenes decides for any panel plugin
      (version === '13.2.3' ? expectAsSaved : expectMigrated)(core);
      (version === PLUGIN_VERSION ? expectAsSaved : expectMigrated)(plugin);
      if (version === undefined) {
        // the case of every classic dashboard, which saves no pluginVersion: the same model in both
        expect(settings(plugin)).toEqual(settings(core));
      }
      // after a save, each panel carries its own version, so neither migrates again
      expect(core.pluginVersion).not.toBe(plugin.pluginVersion);
      expect(plugin.pluginVersion).toBe(PLUGIN_VERSION);
    });
  }

  // Switches a core Table panel to Table plus in the panel editor and checks the saved JSON and the table drawn.
  // `pluginLoaded`: the dashboard also has a Table plus panel, so the plugin's module is already loaded when the
  // visualization changes (scenes then loads it synchronously); the editor is opened in the app, without a reload.
  const SWITCH_OPTIONS = {
    showHeader: true,
    cellHeight: 'md',
    frozenColumns: { left: 1 },
    sortBy: [{ displayName: 'cpu', desc: true }],
  };
  const SWITCH_CUSTOM = { align: 'center', minWidth: 80, inspect: true, filterable: true, wrapHeaderText: true };
  for (const { name, color, pluginLoaded } of [
    // Not by value: Grafana's picker switch turns these into Thresholds (adaptFieldColorMode)
    { name: 'classic palette', color: { mode: 'palette-classic' }, pluginLoaded: false },
    { name: 'classic palette, plugin already loaded', color: { mode: 'palette-classic' }, pluginLoaded: true },
    { name: 'thresholds', color: { mode: 'thresholds' }, pluginLoaded: false },
    { name: 'fixed', color: { mode: 'fixed', fixedColor: 'purple' }, pluginLoaded: true },
    { name: 'no colour mode', color: undefined, pluginLoaded: false },
    { name: 'no colour mode, plugin already loaded', color: undefined, pluginLoaded: true },
  ]) {
    test(`switching a core Table panel to Table plus in the panel editor keeps its settings (${name})`, async ({
      gotoDashboardPage,
      page,
      selectors,
      grafanaVersion,
      request,
    }, testInfo) => {
      const uid = `pjan-table-switch-${created.length}`;
      const corePanel: DashboardPanel = {
        ...panelOf(PARITY, 'nested frames, collapsed, with nested-scope overrides', CORE),
        id: 1,
        title: 'switched in the editor',
        gridPos: { x: 0, y: 0, w: 12, h: 9 },
        options: SWITCH_OPTIONS,
        fieldConfig: {
          defaults: {
            ...(color ? { color } : {}),
            unit: 'none',
            thresholds: {
              mode: 'absolute',
              steps: [
                { value: null, color: 'green' },
                { value: 30, color: 'red' },
              ],
            },
            custom: SWITCH_CUSTOM,
          },
          overrides: [
            {
              matcher: { id: 'byName', options: 'stack' },
              properties: [
                { id: 'displayName', value: 'Stack' },
                { id: 'custom.width', value: 140 },
                { id: 'custom.cellOptions', value: { type: 'color-background', mode: 'basic' } },
              ],
            },
            {
              matcher: { id: 'byName', options: 'cpu (max)' },
              properties: [{ id: 'custom.hideFrom.viz', value: true }],
            },
            {
              matcher: { id: 'byName', options: 'state', scope: 'nested' },
              properties: [{ id: 'custom.cellOptions', value: { type: 'pill' } }],
            },
          ],
        },
      };
      const panels = [corePanel];
      if (pluginLoaded) {
        panels.push({
          ...panelOf(PARITY, 'defaults: string, status, number, time and boolean', PLUGIN),
          id: 2,
          gridPos: { x: 12, y: 0, w: 12, h: 9 },
        });
      }
      await createDashboard(uid, panels);
      await gotoDashboardPage({ uid });
      for (const panel of panels) {
        await drawn(page, panel.id);
      }
      const core = await loaded(page, 1);
      expect(core.fieldConfig.defaults.color).toEqual(color);
      if (pluginLoaded) {
        expect((await savedPanel(page, 2))?.type).toBe(PLUGIN);
        // In the app (no reload): the Table plus module stays loaded
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
      await expect(preview.getByText('Stack', { exact: true })).toBeVisible();
      await page.mouse.move(0, 0);
      const coreTable = await stableTable(preview);

      await panelEditPage.setVisualization('Table plus');
      await expect.poll(async () => (await savedPanel(page, 1))?.type).toBe(PLUGIN);
      expect(settings(await savedPanel(page, 1))).toEqual(settings(core));
      // and it draws with them: the same table
      await page.mouse.move(0, 0);
      expect(await stableTable(preview)).toBe(coreTable);
      // and the field config applied again after the restore saves the same
      expect(settings(await savedPanel(page, 1))).toEqual(settings(core));
    });
  }
});
