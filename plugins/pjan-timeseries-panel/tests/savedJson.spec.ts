import { type APIRequestContext, expect, PanelEditPage, test, type Page } from '@grafana/plugin-e2e';

import { apiClient, savedPanel, type SavedPanel } from './helpers';
import { CORE, panelContent, panelOf, PLUGIN, readDashboard, type DashboardPanel } from './parity';

// The saved JSON (the dashboard's save model, as Grafana writes it): a new Time series plus panel saves what a new core
// Time series panel saves, opening the editor writes nothing, converting a panel by changing `type` (or, in a v2
// dashboard, `vizConfig.group`) keeps it, and switching a core Time series panel to Time series plus in the panel editor
// keeps its options and field config and draws the same.
const PARITY = readDashboard('parity.json');

const PLUGIN_VERSION = require('../package.json').version;

const settings = (panel: SavedPanel | undefined) => ({ options: panel?.options, fieldConfig: panel?.fieldConfig });

// Width, height and an FNV hash of a canvas's RGBA bytes
const canvasPrint = (page: Page, root: ReturnType<Page['locator']>) =>
  root
    .locator('canvas')
    .first()
    .evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 0x811c9dc5;
      let painted = 0;
      for (let i = 0; i < data.length; i++) {
        hash = Math.imul(hash ^ data[i], 0x01000193);
        if (i % 4 === 3 && data[i] !== 0) {
          painted++;
        }
      }
      return { width: canvas.width, height: canvas.height, painted: painted > 0, hash: hash >>> 0 };
    });

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

  test.beforeAll(async ({ playwright, grafanaAPICredentials }) => {
    api = await apiClient(playwright, grafanaAPICredentials);
  });

  test.afterAll(async () => {
    for (const uid of created) {
      await api.delete(`/api/dashboards/uid/${uid}`);
    }
    await api.dispose();
  });

  test('a new Time series plus panel saves what a new core Time series panel saves', async ({
    gotoDashboardPage,
    page,
  }) => {
    const newPanel = async (visualization: string, type: string) => {
      const dashboardPage = await gotoDashboardPage({});
      const panelEditPage = await dashboardPage.addPanel();
      await panelEditPage.setVisualization(visualization);
      await expect.poll(async () => (await savedPanel(page))?.type).toBe(type);
      // once Grafana has added the plugin's defaults
      await expect.poll(async () => (await savedPanel(page))?.fieldConfig.defaults.custom).toBeTruthy();
      return (await savedPanel(page))!;
    };
    const core = await newPanel('Time series', CORE);
    const plugin = await newPanel('Time series plus', PLUGIN);

    expect(plugin.pluginVersion).toBe(PLUGIN_VERSION);
    expect(Object.keys(plugin.options).sort()).toEqual(Object.keys(core.options).sort());
    expect(Object.keys(plugin.fieldConfig.defaults).sort()).toEqual(Object.keys(core.fieldConfig.defaults).sort());
    // core saves its full `custom` block of defaults
    expect(Object.keys(core.fieldConfig.defaults.custom ?? {}).length).toBeGreaterThan(20);
    expect(settings(plugin)).toEqual(settings(core));
  });

  test('opening the editor writes nothing', async ({ gotoDashboardPage, page }) => {
    const { id } = panelOf(PARITY, 'stacking, two groups', PLUGIN);
    await gotoDashboardPage({ uid: PARITY.uid });
    await panelContent(page, id).scrollIntoViewIfNeeded();
    await expect(panelContent(page, id).locator('canvas')).toBeVisible();
    // once the panel has loaded its plugin (Grafana then adds the plugin's defaults, as for any panel)
    await expect.poll(async () => (await savedPanel(page, id))?.options).toHaveProperty('tooltip');
    const before = await savedPanel(page, id);
    expect(before?.type).toBe(PLUGIN);

    await gotoDashboardPage({ uid: PARITY.uid, queryParams: new URLSearchParams({ editPanel: String(id) }) });
    await expect(page.getByTestId('data-testid Graph styles Style field property editor')).toBeVisible();
    // for a few seconds: the editor may write late
    for (let t = 0; t < 3000; t += 250) {
      expect(await savedPanel(page, id)).toEqual(before);
      await page.waitForTimeout(250);
    }
  });

  test('converting a panel by changing its type keeps its settings', async ({ gotoDashboardPage, page }) => {
    // options, field config and overrides away from the defaults
    for (const title of ['stacking, two groups', 'legend lastNotNull and max, sorted by max descending']) {
      const original = panelOf(PARITY, title, CORE);
      await gotoDashboardPage({ uid: PARITY.uid });
      await panelContent(page, original.id).scrollIntoViewIfNeeded();
      await expect.poll(async () => (await savedPanel(page, original.id))?.options).toHaveProperty('tooltip');
      const core = (await savedPanel(page, original.id))!;

      // To the plugin: the same panel JSON with the plugin's type
      await createDashboard('pjan-timeseries-convert', [{ ...original, id: 1, type: PLUGIN }]);
      await gotoDashboardPage({ uid: 'pjan-timeseries-convert' });
      await expect(panelContent(page, 1).locator('canvas')).toBeVisible();
      await expect.poll(async () => (await savedPanel(page, 1))?.type).toBe(PLUGIN);
      expect(settings(await savedPanel(page, 1))).toEqual(settings(core));
    }
  });

  test('converting a panel in a v2 dashboard by changing vizConfig.group keeps its settings', async ({
    gotoDashboardPage,
    page,
  }) => {
    const source = panelOf(PARITY, 'legend lastNotNull and max, sorted by max descending', CORE);
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
                  transformations: [],
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
      await expect(panelContent(page, 1).locator('canvas')).toBeVisible();
      await expect.poll(async () => (await savedPanel(page, 1))?.type).toBe(group);
      await expect.poll(async () => (await savedPanel(page, 1))?.options).toHaveProperty('tooltip');
      return (await savedPanel(page, 1))!;
    };
    const core = await saved('pjan-timeseries-v2-core', CORE);
    const plugin = await saved('pjan-timeseries-v2-plugin', PLUGIN);
    expect(settings(plugin)).toEqual(settings(core));
  });

  // Switches a core Time series panel to Time series plus in the panel editor and checks the saved JSON and the canvas
  // drawn. `pluginLoaded`: the dashboard also has a Time series plus panel, so the plugin's module is already loaded
  // when the visualization changes (scenes then loads it synchronously); the editor is opened in the app, without a
  // reload.
  const SWITCH_OPTIONS = {
    legend: {
      showLegend: true,
      displayMode: 'table',
      placement: 'right',
      width: 220,
      calcs: ['lastNotNull', 'max'],
      sortBy: 'Max',
      sortDesc: true,
    },
    tooltip: { mode: 'multi', sort: 'desc', hideZeros: true },
  };
  const SWITCH_CUSTOM = {
    drawStyle: 'line',
    lineWidth: 2,
    fillOpacity: 25,
    gradientMode: 'opacity',
    showPoints: 'always',
    pointSize: 7,
    axisSoftMin: 0,
    thresholdsStyle: { mode: 'dashed' },
    stacking: { mode: 'normal', group: 'A' },
  };
  for (const { name, color, pluginLoaded } of [
    // By value: Grafana's picker switch resets these to the classic palette (adaptFieldColorMode)
    { name: 'thresholds colour mode', color: { mode: 'thresholds' }, pluginLoaded: false },
    { name: 'thresholds colour mode, plugin already loaded', color: { mode: 'thresholds' }, pluginLoaded: true },
    { name: 'continuous scheme', color: { mode: 'continuous-GrYlRd' }, pluginLoaded: false },
    { name: 'continuous scheme, plugin already loaded', color: { mode: 'continuous-GrYlRd' }, pluginLoaded: true },
  ]) {
    test(`switching a core Time series panel to Time series plus in the panel editor keeps its settings (${name})`, async ({
      gotoDashboardPage,
      page,
      selectors,
      grafanaVersion,
      request,
    }, testInfo) => {
      const uid = `pjan-timeseries-switch-${created.length}`;
      const corePanel: DashboardPanel = {
        ...panelOf(PARITY, 'defaults, three series', CORE),
        id: 1,
        title: 'switched in the editor',
        gridPos: { x: 0, y: 0, w: 12, h: 9 },
        options: SWITCH_OPTIONS,
        fieldConfig: {
          defaults: {
            color,
            unit: 'reqps',
            thresholds: {
              mode: 'absolute',
              steps: [
                { value: null, color: 'green' },
                { value: 60, color: 'red' },
              ],
            },
            custom: SWITCH_CUSTOM,
          },
          overrides: [
            {
              matcher: { id: 'byName', options: 's2' },
              properties: [
                { id: 'displayName', value: 'second' },
                { id: 'custom.axisPlacement', value: 'right' },
              ],
            },
            {
              matcher: { id: 'byName', options: 's3' },
              properties: [{ id: 'custom.transform', value: 'negative-Y' }],
            },
          ],
        },
      };
      const panels = [corePanel];
      if (pluginLoaded) {
        panels.push({
          ...panelOf(PARITY, 'defaults, one series', PLUGIN),
          id: 2,
          gridPos: { x: 12, y: 0, w: 12, h: 9 },
        });
      }
      await createDashboard(uid, panels);
      await gotoDashboardPage({ uid });
      for (const panel of panels) {
        await expect(panelContent(page, panel.id).locator('canvas')).toBeVisible();
      }
      await expect.poll(async () => (await savedPanel(page, 1))?.options).toHaveProperty('tooltip');
      const core = (await savedPanel(page, 1))!;
      expect(core.fieldConfig.defaults.color).toEqual(color);
      if (pluginLoaded) {
        expect((await savedPanel(page, 2))?.type).toBe(PLUGIN);
        // In the app (no reload): the Time series plus module stays loaded
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
      await expect(preview.getByText('second')).toBeVisible();
      await page.mouse.move(0, 0);
      // the canvas drawn, once stable
      const stableCanvas = async () => {
        let previous = '';
        await expect
          .poll(async () => {
            const current = JSON.stringify(await canvasPrint(page, preview));
            const stable = current === previous && JSON.parse(current).painted;
            previous = current;
            return stable;
          })
          .toBe(true);
        return previous;
      };
      const coreCanvas = await stableCanvas();

      await panelEditPage.setVisualization('Time series plus');
      await expect.poll(async () => (await savedPanel(page, 1))?.type).toBe(PLUGIN);
      expect(settings(await savedPanel(page, 1))).toEqual(settings(core));
      // and it draws with them: the same canvas
      await page.mouse.move(0, 0);
      await expect.poll(async () => JSON.stringify(await canvasPrint(page, preview))).toBe(coreCanvas);
    });
  }
});
