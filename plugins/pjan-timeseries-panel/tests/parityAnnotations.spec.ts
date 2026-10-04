import { type APIRequestContext, expect, test } from '@grafana/plugin-e2e';

import { apiClient } from './helpers';
import { casesOf, compareCase, openDashboard, readDashboard, THEMES } from './parity';

// The annotation cases (point and region, multi-lane, clustering) of provisioning/dashboards/parity-annotations.json
// against its swapped twin, compared as in tests/parity.spec.ts. The annotations are created here through the HTTP
// API, as in State timeline plus: the same ones on each of the two dashboards (the built-in "Annotations & Alerts"
// query), and a second lane of organisation annotations that both dashboards query by tag. Only this file uses these
// dashboards, and its tests run one after the other, so the annotations don't change while a test compares.
const DASHBOARDS = [
  readDashboard('parity-annotations.json'),
  readDashboard('parity-annotations-swapped.json'),
] as const;
const cases = casesOf(DASHBOARDS);
const LANE2_TAG = 'pjan-timeseries-parity-lane2';
const FROM = Date.parse(DASHBOARDS[0].time.from);
const TO = Date.parse(DASHBOARDS[0].time.to);
// Minutes after the start of the range; not on a 5-minute mark, so no marker sits on an x grid line
const at = (minutes: number) => FROM + minutes * 60_000;

const DASHBOARD_ANNOTATIONS = [
  { time: at(47), tags: ['deploy'], text: 'Deploy web v1.4' },
  { time: at(127), timeEnd: at(172), tags: ['maintenance'], text: 'Maintenance window' },
  // three within a few minutes: one cluster with clustering on
  { time: at(232), tags: ['restart'], text: 'Restart 1' },
  { time: at(234), tags: ['restart'], text: 'Restart 2' },
  { time: at(237), tags: ['restart'], text: 'Restart 3' },
];
const LANE2_ANNOTATIONS = [
  { time: at(83), tags: [LANE2_TAG], text: 'Backup' },
  { time: at(287), timeEnd: at(318), tags: [LANE2_TAG], text: 'Backup window' },
];

let api: APIRequestContext;

const deleteAnnotations = async () => {
  const lists = [
    ...DASHBOARDS.map((d) => `/api/annotations?dashboardUID=${d.uid}&from=${FROM}&to=${TO}&limit=1000`),
    `/api/annotations?tags=${LANE2_TAG}&from=${FROM}&to=${TO}&limit=1000`,
  ];
  for (const list of lists) {
    const response = await api.get(list);
    for (const { id, dashboardUID, tags } of (await response.json()) as Array<{
      id: number;
      dashboardUID?: string;
      tags?: string[];
    }>) {
      // The query filters already; checked again so nothing else is ever deleted.
      if (DASHBOARDS.some((d) => d.uid === dashboardUID) || tags?.includes(LANE2_TAG)) {
        await api.delete(`/api/annotations/${id}`);
      }
    }
  }
};

test.describe('parity with core time series: annotations', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ playwright, grafanaAPICredentials }) => {
    api = await apiClient(playwright, grafanaAPICredentials);
    await deleteAnnotations();
    for (const { uid } of DASHBOARDS) {
      for (const annotation of DASHBOARD_ANNOTATIONS) {
        const response = await api.post('/api/annotations', { data: { dashboardUID: uid, ...annotation } });
        expect(response.ok(), await response.text()).toBe(true);
      }
    }
    for (const annotation of LANE2_ANNOTATIONS) {
      const response = await api.post('/api/annotations', { data: annotation });
      expect(response.ok(), await response.text()).toBe(true);
    }
  });

  test.afterAll(async () => {
    await deleteAnnotations();
    await api.dispose();
  });

  for (const scale of [1, 2]) {
    for (const theme of THEMES) {
      test(`${theme.name}, pixel ratio ${scale}: ${cases.length} cases`, async ({ browser }) => {
        test.setTimeout(15 * 60_000);
        const context = await browser.newContext({
          deviceScaleFactor: scale,
          storageState: 'playwright/.auth/admin.json',
          viewport: { width: 1280, height: 720 },
        });
        const pages = [await context.newPage(), await context.newPage()];
        // The two annotation queries answer in either order, and Grafana passes their frames to the panels in the order
        // they arrive, which sets the order of the markers and of the canvas drawing. Core and plugin on one page get
        // the same order; the two pages are loaded again until they have the same one too (the colours of the first
        // panel's markers, in DOM order).
        const markerOrder = (d: number) =>
          pages[d]
            .locator(`[data-viz-panel-key="panel-${cases[0].ids[d][0]}"] [data-testid="data-testid annotation-marker"]`)
            .evaluateAll((markers) => markers.map((m) => (m as HTMLElement).style.cssText.replace(/left: [^;]+;/, '')));
        let attempts = 0;
        do {
          for (let d = 0; d < pages.length; d++) {
            await openDashboard(pages[d], DASHBOARDS[d].uid, cases, d, theme);
            // the markers of every annotation are there
            await expect
              .poll(async () => (await markerOrder(d)).length)
              .toBe(DASHBOARD_ANNOTATIONS.length + LANE2_ANNOTATIONS.length);
          }
          attempts++;
        } while (JSON.stringify(await markerOrder(0)) !== JSON.stringify(await markerOrder(1)) && attempts < 10);
        expect(await markerOrder(1), 'the same order of annotation frames on both pages').toEqual(await markerOrder(0));
        for (const c of cases) {
          await test.step(c.title, async () => {
            expect.soft(await compareCase(pages, c), c.title).toBe('identical');
          });
        }
        await context.close();
      });
    }
  }
});
