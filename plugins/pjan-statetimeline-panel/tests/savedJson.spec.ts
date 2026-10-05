import fs from 'node:fs';
import path from 'node:path';

import { type APIRequestContext, expect as baseExpect, PanelEditPage, test, type Page } from '@grafana/plugin-e2e';

// Switching a core state timeline to State timeline plus in the panel editor keeps its options, its custom field
// config and its custom overrides (src/pjan/panelChangedHandler.ts), in the saved JSON and in the canvas drawn, with
// the plugin's module loaded before the switch and not (as Stat plus's and Time series plus's tests/savedJson.spec.ts).
const CORE = 'state-timeline';
const PLUGIN = 'pjan-statetimeline-panel';

// 10 s per assertion, as the other plus plugins (their playwright.config.ts): the machine running them is often busy.
const expect = baseExpect.configure({ timeout: 10_000 });

interface PanelJson {
  id: number;
  type: string;
  title: string;
  gridPos?: object;
  [key: string]: unknown;
}
const PARITY = JSON.parse(fs.readFileSync(path.join(__dirname, '../provisioning/dashboards/parity.json'), 'utf8')) as {
  time: object;
  panels: PanelJson[];
};
const parityPanel = (title: string) => PARITY.panels.find((p) => p.title === title)!;

interface SavedPanel {
  type: string;
  options: Record<string, unknown>;
  fieldConfig: { defaults: Record<string, unknown> & { custom?: Record<string, unknown> }; overrides: unknown[] };
}

// A panel of the open dashboard's save model, as Grafana writes it (classic or v2), by panel id (Stat plus's helper)
const savedPanel = (page: Page, id: number) =>
  page.evaluate((panelId) => {
    type Scene = { getSaveModel?: () => Record<string, unknown> };
    const scene = (window as unknown as { __grafanaSceneContext?: Scene }).__grafanaSceneContext;
    if (!scene?.getSaveModel) {
      return undefined;
    }
    const model = scene.getSaveModel() as {
      panels?: Array<{ id: number; type: string; options: object; fieldConfig: object }>;
      elements?: Record<
        string,
        { spec: { id: number; vizConfig: { group: string; spec: { options: object; fieldConfig: object } } } }
      >;
    };
    const v1 = model.panels?.find((p) => p.id === panelId);
    if (v1) {
      return JSON.parse(JSON.stringify({ type: v1.type, options: v1.options, fieldConfig: v1.fieldConfig }));
    }
    const v2 = Object.values(model.elements ?? {}).find((e) => e.spec.id === panelId);
    return v2 ? JSON.parse(JSON.stringify({ type: v2.spec.vizConfig.group, ...v2.spec.vizConfig.spec })) : undefined;
  }, id) as Promise<SavedPanel | undefined>;

const settings = (panel: SavedPanel | undefined) => ({ options: panel?.options, fieldConfig: panel?.fieldConfig });

const panelContent = (page: Page, id: number) =>
  page.locator(`[data-viz-panel-key="panel-${id}"] [data-testid="data-testid panel content"]`);

// The share of a canvas's pixels that must be painted, so that two canvases without boxes (for example while the data
// is still loading) cannot pass as identical (as tests/parity.spec.ts).
const MIN_PAINTED = 0.05;

// Width, height, the painted share and an FNV hash of a canvas's RGBA bytes (as tests/parity.spec.ts)
const canvasPrint = (root: ReturnType<Page['locator']>) =>
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
      return {
        width: canvas.width,
        height: canvas.height,
        painted: painted / (canvas.width * canvas.height),
        hash: hash >>> 0,
      };
    });

test.describe('saved JSON', () => {
  // One worker, in order: the tests add dashboards through the API and delete them afterwards. 60 s per test, as the
  // other plus plugins: each test loads a dashboard and the panel editor.
  test.describe.configure({ mode: 'default', timeout: 60_000 });
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

  // Options, custom field config and a custom override away from the defaults. The editor clears `custom` and the
  // custom override properties before the switch, so a panel drawn before the handler restores them draws boxes at
  // this plugin's defaults (fill opacity 70, line width 0), without the override.
  const SWITCH_OPTIONS = {
    mergeValues: true,
    showValue: 'always',
    alignValue: 'center',
    rowHeight: 0.8,
    legend: { showLegend: true, displayMode: 'list', placement: 'bottom' },
    tooltip: { mode: 'single', sort: 'none' },
  };
  const SWITCH_CUSTOM = { fillOpacity: 30, lineWidth: 3 };
  for (const { name, pluginLoaded } of [
    { name: 'plugin not loaded', pluginLoaded: false },
    { name: 'plugin already loaded', pluginLoaded: true },
  ]) {
    test(`switching a core state timeline to State timeline plus in the panel editor keeps its settings (${name})`, async ({
      gotoDashboardPage,
      page,
      selectors,
      grafanaVersion,
      request,
    }, testInfo) => {
      const uid = `pjan-statetimeline-switch-${created.length}`;
      const corePanel: PanelJson = {
        ...parityPanel(`defaults [${CORE}]`),
        id: 1,
        title: 'switched in the editor',
        gridPos: { x: 0, y: 0, w: 12, h: 9 },
        options: SWITCH_OPTIONS,
        fieldConfig: {
          defaults: {
            ...(parityPanel(`defaults [${CORE}]`).fieldConfig as { defaults: object }).defaults,
            custom: SWITCH_CUSTOM,
          },
          overrides: [
            {
              matcher: { id: 'byName', options: 'r1' },
              properties: [
                { id: 'displayName', value: 'second' },
                { id: 'custom.fillOpacity', value: 100 },
              ],
            },
          ],
        },
      };
      const panels = [corePanel];
      if (pluginLoaded) {
        panels.push({ ...parityPanel(`defaults [${PLUGIN}]`), id: 2, gridPos: { x: 12, y: 0, w: 12, h: 9 } });
      }
      await createDashboard(uid, panels);
      await gotoDashboardPage({ uid });
      for (const panel of panels) {
        await expect(panelContent(page, panel.id).locator('canvas')).toBeVisible();
      }
      await expect.poll(async () => (await savedPanel(page, 1))?.options).toHaveProperty('rowHeight');
      const core = (await savedPanel(page, 1))!;
      expect(core.fieldConfig.defaults.custom).toMatchObject(SWITCH_CUSTOM);
      if (pluginLoaded) {
        expect((await savedPanel(page, 2))?.type).toBe(PLUGIN);
        // In the app (no reload): the State timeline plus module stays loaded
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
      await expect(preview.locator('canvas')).toBeVisible();
      await page.mouse.move(0, 0);
      // the canvas drawn, once stable
      const stableCanvas = async () => {
        let previous = '';
        await expect
          .poll(async () => {
            const current = JSON.stringify(await canvasPrint(preview));
            const stable = current === previous && JSON.parse(current).painted >= MIN_PAINTED;
            previous = current;
            return stable;
          })
          .toBe(true);
        return previous;
      };
      const coreCanvas = await stableCanvas();

      await panelEditPage.setVisualization('State timeline plus');
      await expect.poll(async () => (await savedPanel(page, 1))?.type).toBe(PLUGIN);
      expect(settings(await savedPanel(page, 1))).toEqual(settings(core));
      // and it draws with them: the same canvas
      await page.mouse.move(0, 0);
      await expect.poll(async () => JSON.stringify(await canvasPrint(preview))).toBe(coreCanvas);
      // and the field config applied again after the restore saves the same
      expect(settings(await savedPanel(page, 1))).toEqual(settings(core));
    });
  }
});
