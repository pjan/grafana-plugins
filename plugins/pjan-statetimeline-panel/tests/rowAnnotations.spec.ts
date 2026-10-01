import { type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { expect, test } from '@grafana/plugin-e2e';

// provisioning/dashboards/row-annotations.json: rows web, media and tools (data from 00:30, so each row has empty plot
// space before it), dashboard range 2025-10-01 00:00 to 06:00 UTC. The tools row has the override
// "Annotation key" = toolbox. This file creates its annotations on that dashboard and deletes them afterwards.
const DASHBOARD_UID = 'pjan-row-annotations';
const PANEL = 'Show on matching rows';
const PANEL_CLUSTERED = 'Show on matching rows, clustering, row height 0.7';
const PANEL_PAGED = 'Pagination, 2 rows per page';
const PANEL_LEGEND_RIGHT = 'Legend on the right';
const PANEL_HIDDEN_ROW = 'Media row hidden (hideFrom.viz)';
const PANEL_LABEL = 'Row key: label job';
const PANEL_TEXT_FIELD = 'Annotation field: text';
const FROM = Date.UTC(2025, 9, 1, 0, 0);
const TO = Date.UTC(2025, 9, 1, 6, 0);
const at = (h: number, m: number) => Date.UTC(2025, 9, 1, h, m);

// Times avoid multiples of 5 minutes, so no annotation line sits on an x grid line.
const ANNOTATIONS = {
  web: { time: at(1, 7), tags: ['DeployStack', 'web'], text: 'Deploy web v1.4' },
  media: { time: at(2, 7), timeEnd: at(2, 52), tags: ['DeployStack', 'media'], text: 'Media migration' },
  tools: { time: at(4, 22), tags: ['DeployStack', 'toolbox'], text: 'Deploy tools v2.0' },
  unmatched: { time: at(3, 37), tags: ['note'], text: 'Change freeze starts' },
  // 5 minutes apart: clustered on the web row of the clustering panel, separate on the other
  web2: { time: at(5, 7), tags: ['web'], text: 'Restart web 1' },
  web3: { time: at(5, 12), tags: ['web'], text: 'Restart web 2' },
};

let api: APIRequestContext;

const deleteDashboardAnnotations = async () => {
  const response = await api.get(`/api/annotations?dashboardUID=${DASHBOARD_UID}&from=${FROM}&to=${TO}&limit=1000`);
  for (const { id, dashboardUID } of (await response.json()) as Array<{ id: number; dashboardUID?: string }>) {
    // The query filters by dashboard already; checked again so nothing else is ever deleted.
    if (dashboardUID === DASHBOARD_UID) {
      await api.delete(`/api/annotations/${id}`);
    }
  }
};

test.describe('per-row annotations', () => {
  // The tests share the annotations created once below, so they run in one worker, in order.
  test.describe.configure({ mode: 'default' });

  test.beforeAll(async ({ playwright, grafanaAPICredentials }) => {
    const { user, password } = grafanaAPICredentials;
    api = await playwright.request.newContext({
      baseURL: process.env.GRAFANA_URL || 'http://localhost:3000',
      extraHTTPHeaders: { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` },
    });
    await deleteDashboardAnnotations();
    for (const annotation of Object.values(ANNOTATIONS)) {
      const response = await api.post('/api/annotations', { data: { dashboardUID: DASHBOARD_UID, ...annotation } });
      expect(response.ok()).toBe(true);
    }
  });

  test.afterAll(async () => {
    await deleteDashboardAnnotations();
    await api.dispose();
  });

  for (const theme of ['light', 'dark']) {
    test(`with the option off, draws the same pixels and markers as the core panel (${theme})`, async ({
      gotoDashboardPage,
    }) => {
      const dashboardPage = await gotoDashboardPage({
        uid: DASHBOARD_UID,
        queryParams: new URLSearchParams({ theme }),
      });
      const panelOf = async (type: string) => {
        const panel = dashboardPage.getPanelByTitle(`Option off [${type}]`).locator;
        await panel.scrollIntoViewIfNeeded();
        return panel;
      };
      const core = await panelOf('state-timeline');
      const plugin = await panelOf('pjan-statetimeline-panel');
      await expect(core.getByLabel(/^Annotation/)).toHaveCount(6);

      await expect
        .poll(async () => {
          const [a, b] = await Promise.all([fingerprint(core), fingerprint(plugin)]);
          return a === b ? 'identical' : { core: a, plugin: b };
        })
        .toBe('identical');
    });
  }

  test('places point and region annotations on their rows, and the unmatched one full height', async ({
    gotoDashboardPage,
    page,
  }) => {
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID });
    const panel = dashboardPage.getPanelByTitle(PANEL).locator;
    const plot = await waitForPlot(page, panel);
    const rowMarkers = panel.getByTestId('pjan-row-annotations').getByLabel(/^Annotation/);
    await expect(rowMarkers).toHaveCount(5);

    const marker = async (time: number) => {
      const box = await markerNear(rowMarkers, plot, time);
      return { ...box, row: rowOf(plot, box.y) };
    };
    expect((await marker(ANNOTATIONS.web.time)).row).toBe(0);
    expect((await marker(ANNOTATIONS.web2.time)).row).toBe(0);
    expect((await marker(ANNOTATIONS.tools.time)).row).toBe(2);

    const region = await marker(ANNOTATIONS.media.time);
    expect(region.row).toBe(1);
    expect(Math.abs(region.x + region.width - plot.x(ANNOTATIONS.media.timeEnd))).toBeLessThanOrEqual(1);

    // The unmatched annotation keeps core's marker below the plot, and its line crosses the gaps between rows.
    const axisMarker = panel.locator('.u-axis').getByLabel('Annotation', { exact: true });
    await expect(axisMarker).toHaveCount(1);
    const axisBox = (await axisMarker.boundingBox())!;
    expect(Math.abs(axisBox.x + axisBox.width / 2 - plot.x(ANNOTATIONS.unmatched.time))).toBeLessThanOrEqual(1);
    expect(await plot.gapPainted(ANNOTATIONS.unmatched.time)).toBe(true);

    // A row annotation's line is drawn on its row only.
    expect(await plot.gapPainted(ANNOTATIONS.web.time)).toBe(false);
    expect(await plot.rowPainted(ANNOTATIONS.web.time, 0)).toBe(true);
    expect(await plot.rowPainted(ANNOTATIONS.web.time, 1)).toBe(false);
  });

  // Guard against silent misalignment: the markers are positioned from a copy of the timeline's row geometry
  // (src/pjan/rowAnnotations/rowLayout.ts). This reads the rows from the canvas pixels instead and fails if a marker
  // is not exactly at the top edge of a drawn row, inside it.
  const GUARDED = [
    { title: PANEL, rows: 3 },
    { title: PANEL_CLUSTERED, rows: 3 },
    { title: PANEL_LEGEND_RIGHT, rows: 3 },
    { title: PANEL_HIDDEN_ROW, rows: 2 },
    { title: PANEL_LABEL, rows: 3 },
  ];
  for (const { title, rows } of GUARDED) {
    test(`row markers sit exactly at the top of the rows the timeline draws: ${title}`, async ({
      gotoDashboardPage,
      page,
    }) => {
      const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID });
      const panel = dashboardPage.getPanelByTitle(title).locator;
      await panel.scrollIntoViewIfNeeded();
      await expectMarkersOnRowTops(panel, await waitForPlot(page, panel, rows));
    });
  }

  test.describe('at pixel ratio 2', () => {
    test.use({ deviceScaleFactor: 2 });

    for (const title of [PANEL, PANEL_CLUSTERED]) {
      test(`row markers sit exactly at the top of the rows the timeline draws: ${title}`, async ({
        gotoDashboardPage,
        page,
      }) => {
        const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID });
        const panel = dashboardPage.getPanelByTitle(title).locator;
        await panel.scrollIntoViewIfNeeded();
        await expectMarkersOnRowTops(panel, await waitForPlot(page, panel));
      });
    }
  });

  test('row markers follow the rows when only the panel height changes', async ({ gotoDashboardPage, page }) => {
    // The viewed panel fills the window, so a lower window only makes the panel lower.
    await page.setViewportSize({ width: 1400, height: 900 });
    const dashboardPage = await gotoDashboardPage({
      uid: DASHBOARD_UID,
      queryParams: new URLSearchParams({ viewPanel: 'panel-1' }),
    });
    const panel = dashboardPage.getPanelByTitle(PANEL).locator;
    const before = await waitForPlot(page, panel);
    await expectMarkersOnRowTops(panel, before);

    await page.setViewportSize({ width: 1400, height: 600 });
    await expect.poll(async () => (await panel.locator('.u-over').boundingBox())?.height).toBeLessThan(before.height);
    const after = await waitForPlot(page, panel);
    expect(after.width).toBe(before.width);
    await expectMarkersOnRowTops(panel, after);
  });

  test('with pagination, draws only the annotations of the rows on the page', async ({ gotoDashboardPage, page }) => {
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID });
    const panel = dashboardPage.getPanelByTitle(PANEL_PAGED).locator;
    await panel.scrollIntoViewIfNeeded();
    const rowMarkers = panel.getByTestId('pjan-row-annotations').getByLabel(/^Annotation/);
    const axisMarkers = panel.locator('.u-axis').getByLabel(/^Annotation/);

    // Page 1: web and media. The tools annotation belongs to a row on page 2: not drawn here, not even full height.
    let plot = await waitForPlot(page, panel, 2);
    await expect(rowMarkers).toHaveCount(4);
    await expect(axisMarkers).toHaveCount(1);
    expect(rowOf(plot, (await markerNear(rowMarkers, plot, ANNOTATIONS.media.time)).y)).toBe(1);
    await expectNoMarkerAt([rowMarkers, axisMarkers], plot, ANNOTATIONS.tools.time);
    await expectMarkersOnRowTops(panel, plot);

    // Page 2: tools only.
    await panel.getByRole('button', { name: '2', exact: true }).click();
    plot = await waitForPlot(page, panel, 1);
    await expect(rowMarkers).toHaveCount(1);
    expect(rowOf(plot, (await markerNear(rowMarkers, plot, ANNOTATIONS.tools.time)).y)).toBe(0);
    await expect(axisMarkers).toHaveCount(1);
    await expectNoMarkerAt([rowMarkers, axisMarkers], plot, ANNOTATIONS.web.time);
    await expectMarkersOnRowTops(panel, plot);
  });

  test('draws no annotations for a row hidden with hideFrom.viz', async ({ gotoDashboardPage, page }) => {
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID });
    const panel = dashboardPage.getPanelByTitle(PANEL_HIDDEN_ROW).locator;
    await panel.scrollIntoViewIfNeeded();
    const plot = await waitForPlot(page, panel, 2);
    const rowMarkers = panel.getByTestId('pjan-row-annotations').getByLabel(/^Annotation/);
    const axisMarkers = panel.locator('.u-axis').getByLabel(/^Annotation/);

    expect(rowOf(plot, (await markerNear(rowMarkers, plot, ANNOTATIONS.tools.time)).y)).toBe(1);
    await expectNoMarkerAt([rowMarkers, axisMarkers], plot, ANNOTATIONS.media.time);
    await expect(axisMarkers).toHaveCount(1);
  });

  test('matches rows by a label with "Row key: Label"', async ({ gotoDashboardPage, page }) => {
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID });
    const panel = dashboardPage.getPanelByTitle(PANEL_LABEL).locator;
    await panel.scrollIntoViewIfNeeded();
    const plot = await waitForPlot(page, panel);
    const rowMarkers = panel.getByTestId('pjan-row-annotations').getByLabel(/^Annotation/);

    // Rows are named server-a/b/c, with labels job=web/media/tools; the tools annotation is tagged "toolbox".
    expect(rowOf(plot, (await markerNear(rowMarkers, plot, ANNOTATIONS.web.time)).y)).toBe(0);
    expect(rowOf(plot, (await markerNear(rowMarkers, plot, ANNOTATIONS.media.time)).y)).toBe(1);
    await expect(panel.locator('.u-axis').getByLabel(/^Annotation/)).toHaveCount(2);
  });

  test('switching the option in the panel editor shows and removes the row markers', async ({
    gotoDashboardPage,
    page,
  }) => {
    await gotoDashboardPage({ uid: DASHBOARD_UID, queryParams: new URLSearchParams({ editPanel: '3' }) });
    const panel = page.getByTestId(/^data-testid Panel header Option off \[pjan-statetimeline-panel\]/);
    const rowMarkers = page.getByTestId('pjan-row-annotations').getByLabel(/^Annotation/);
    const axisMarkers = page.locator('.u-axis').getByLabel(/^Annotation/);
    const optionSwitch = page
      .getByTestId('data-testid Options group Annotations')
      .locator('input[type="checkbox"]')
      .last();
    await optionSwitch.scrollIntoViewIfNeeded();
    await expect(axisMarkers).toHaveCount(6);
    const initial = await fingerprint(panel);

    await optionSwitch.check({ force: true });
    // web, media, and the two restarts on rows (no "Annotation key" override here: toolbox stays unmatched)
    await expect(rowMarkers).toHaveCount(4);
    await expect(axisMarkers).toHaveCount(2);

    await optionSwitch.uncheck({ force: true });
    await expect(rowMarkers).toHaveCount(0);
    await expect(axisMarkers).toHaveCount(6);
    // no row lines left on the canvas
    await expect.poll(() => fingerprint(panel)).toBe(initial);
  });

  test('clusters close annotations of a row when clustering is on', async ({ gotoDashboardPage, page }) => {
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID });
    const panel = dashboardPage.getPanelByTitle(PANEL_CLUSTERED).locator;
    await panel.scrollIntoViewIfNeeded();
    const plot = await waitForPlot(page, panel);
    const rowMarkers = panel.getByTestId('pjan-row-annotations').getByLabel(/^Annotation/);
    // web, media region, tools, and one cluster region for the two restarts
    await expect(rowMarkers).toHaveCount(4);
    const cluster = await markerNear(rowMarkers, plot, ANNOTATIONS.web2.time);
    expect(rowOf(plot, cluster.y)).toBe(0);
    // a cluster is drawn as a region
    await expect(cluster.locator).toHaveAttribute('aria-label', 'Annotation region');

    await cluster.locator.hover();
    await expect(page.getByTestId('annotation-marker')).toContainText('Restart web 1');
    await expect(page.getByTestId('annotation-marker')).toContainText('Restart web 2');
  });

  test('shows Grafana’s annotation tooltip on a row marker, without the state tooltip', async ({
    gotoDashboardPage,
    page,
  }) => {
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID });
    const panel = dashboardPage.getPanelByTitle(PANEL).locator;
    const plot = await waitForPlot(page, panel);
    const rowMarkers = panel.getByTestId('pjan-row-annotations').getByLabel(/^Annotation/);
    const { locator } = await markerNear(rowMarkers, plot, ANNOTATIONS.web.time);

    // Hover a state box first, then the marker: the state tooltip goes, the annotation tooltip shows.
    await page.mouse.move(plot.left + plot.width * 0.5, plot.rows[0].top + 10);
    await expect(page.getByTestId('data-testid viz-tooltip-wrapper')).toBeVisible();
    await locator.hover();
    const tooltip = page.getByTestId('annotation-marker');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Deploy web v1.4');
    await expect(tooltip).toContainText('DeployStack');
    await expect(page.getByTestId('data-testid viz-tooltip-wrapper')).toBeHidden();
  });

  test('pins one annotation tooltip at a time across core and row markers', async ({ gotoDashboardPage, page }) => {
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID });
    const panel = dashboardPage.getPanelByTitle(PANEL).locator;
    const plot = await waitForPlot(page, panel);
    const tooltips = page.getByTestId('annotation-marker');
    const away = () => page.mouse.move(5, 5);

    await panel.locator('.u-axis').getByLabel('Annotation', { exact: true }).click();
    await away();
    await expect(tooltips).toHaveCount(1);
    await expect(tooltips).toContainText('Change freeze starts');

    const rowMarkers = panel.getByTestId('pjan-row-annotations').getByLabel(/^Annotation/);
    await (await markerNear(rowMarkers, plot, ANNOTATIONS.web.time)).locator.click();
    await away();
    await expect(tooltips).toHaveCount(1);
    await expect(tooltips).toContainText('Deploy web v1.4');

    await panel.locator('.u-axis').getByLabel('Annotation', { exact: true }).click();
    await away();
    await expect(tooltips).toHaveCount(1);
    await expect(tooltips).toContainText('Change freeze starts');
  });

  test('Ctrl/Cmd-click on a row adds an annotation tagged with the row key', async ({ gotoDashboardPage, page }) => {
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID });
    const panel = dashboardPage.getPanelByTitle(PANEL).locator;
    const plot = await waitForPlot(page, panel);
    const time = at(0, 13);

    // Empty plot space on the tools row, whose key is its "Annotation key" override.
    const y = (plot.rows[2].top + plot.rows[2].bottom) / 2;
    await page.mouse.move(plot.x(time), y);
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.click(plot.x(time), y);
    await page.keyboard.up('ControlOrMeta');

    const editor = page.getByTestId('annotation-marker');
    await expect(editor).toContainText('Add annotation');
    await expect(editor).toContainText('toolbox');
    const wip = await markerNear(panel.getByTestId('pjan-row-annotations').getByLabel(/^Annotation/), plot, time);
    expect(rowOf(plot, wip.y)).toBe(2);

    await editor.getByRole('textbox').first().fill('Added on the tools row');
    const created = page.waitForResponse(
      (r) => r.url().endsWith('/api/annotations') && r.request().method() === 'POST'
    );
    await editor.getByRole('button', { name: 'Save' }).click();
    const { id } = (await (await created).json()) as { id: number };
    try {
      const saved = (await (
        await api.get(`/api/annotations?dashboardUID=${DASHBOARD_UID}&from=${FROM}&to=${TO}`)
      ).json()) as Array<{
        id: number;
        tags: string[];
        time: number;
      }>;
      const annotation = saved.find((a) => a.id === id);
      expect(annotation?.tags).toEqual(['toolbox']);
      expect(Math.abs(annotation!.time - time)).toBeLessThan(60_000);

      // It matches its row again once the dashboard has reloaded its annotations.
      await expect
        .poll(async () => {
          const markers = await boxes(panel.getByTestId('pjan-row-annotations').getByLabel(/^Annotation/));
          return markers.some((b) => Math.abs(b.x + b.width / 2 - plot.x(time)) <= 2 && rowOf(plot, b.y) === 2);
        })
        .toBe(true);
    } finally {
      await api.delete(`/api/annotations/${id}`);
    }
  });

  test('"Add annotation" in the tooltip of a value tags the annotation with that row’s key', async ({
    gotoDashboardPage,
    page,
  }) => {
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID });
    const panel = dashboardPage.getPanelByTitle(PANEL).locator;
    const plot = await waitForPlot(page, panel);
    const time = at(3, 52);

    // Pin the tooltip of a value on the media row, then add an annotation from it.
    await page.mouse.click(plot.x(time), (plot.rows[1].top + plot.rows[1].bottom) / 2);
    await page.getByTestId('data-testid viz-tooltip-wrapper').getByRole('button', { name: 'Add annotation' }).click();

    const editor = page.getByTestId('annotation-marker');
    await expect(editor).toContainText('Add annotation');
    await expect(editor).toContainText('media');
    const wip = await markerNear(panel.getByTestId('pjan-row-annotations').getByLabel(/^Annotation/), plot, time);
    expect(rowOf(plot, wip.y)).toBe(1);
    await editor.getByRole('button', { name: 'Cancel' }).click();
    await expect(editor).toBeHidden();
  });

  test('Ctrl/Cmd-drag tags the annotation with the row where the drag started', async ({ gotoDashboardPage, page }) => {
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID });
    const panel = dashboardPage.getPanelByTitle(PANEL).locator;
    const plot = await waitForPlot(page, panel);
    const [from, to] = [at(0, 3), at(0, 24)];

    // From empty space on the media row to the tools row.
    await page.mouse.move(plot.x(from), (plot.rows[1].top + plot.rows[1].bottom) / 2);
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.down();
    await page.mouse.move(plot.x(to), (plot.rows[2].top + plot.rows[2].bottom) / 2, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');

    const editor = page.getByTestId('annotation-marker');
    await expect(editor).toContainText('Add annotation');
    await expect(editor).toContainText('media');
    const wip = await markerNear(panel.getByTestId('pjan-row-annotations').getByLabel('Annotation region'), plot, from);
    expect(rowOf(plot, wip.y)).toBe(1);
    await editor.getByRole('button', { name: 'Cancel' }).click();
    await expect(editor).toBeHidden();
  });

  test('with another annotation field than tags, Ctrl/Cmd-click adds core\u2019s untagged annotation', async ({
    gotoDashboardPage,
    page,
  }) => {
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID });
    const panel = dashboardPage.getPanelByTitle(PANEL_TEXT_FIELD).locator;
    await panel.scrollIntoViewIfNeeded();
    const plot = await waitForPlot(page, panel);
    const time = at(0, 13);

    const y = (plot.rows[0].top + plot.rows[0].bottom) / 2;
    await page.mouse.move(plot.x(time), y);
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.click(plot.x(time), y);
    await page.keyboard.up('ControlOrMeta');

    const editor = page.getByTestId('annotation-marker');
    await expect(editor).toContainText('Add annotation');
    await expect(editor.getByText('web', { exact: true })).toHaveCount(0);
    // core's marker below the plot, none on the row
    await markerNear(panel.locator('.u-axis').getByLabel(/^Annotation/), plot, time);
    await expectNoMarkerAt([panel.getByTestId('pjan-row-annotations').getByLabel(/^Annotation/)], plot, time);
    await editor.getByRole('button', { name: 'Cancel' }).click();
  });

  test('a new panel saves no per-row annotation options until they are used', async ({ panelEditPage, page }) => {
    await panelEditPage.setVisualization('State timeline (pjan)');
    const saved = () =>
      page.evaluate(() => {
        let found: { options: Record<string, unknown>; custom: Record<string, unknown> } | undefined;
        type SceneObject = {
          state: {
            pluginId?: string;
            options?: Record<string, unknown>;
            fieldConfig?: { defaults: { custom?: object } };
          };
          forEachChild?: (cb: (child: SceneObject) => void) => void;
        };
        const walk = (o?: SceneObject) => {
          if (o?.state.pluginId === 'pjan-statetimeline-panel' && o.state.options) {
            found = {
              options: o.state.options,
              custom: (o.state.fieldConfig?.defaults.custom ?? {}) as Record<string, unknown>,
            };
          }
          o?.forEachChild?.(walk);
        };
        walk((window as unknown as { __grafanaSceneContext?: SceneObject }).__grafanaSceneContext);
        return found;
      });
    await expect.poll(async () => (await saved())?.options).toBeDefined();
    const { options, custom } = (await saved())!;
    expect(options).toHaveProperty('legend');
    expect(options).not.toHaveProperty('rowAnnotations');
    expect(custom).not.toHaveProperty('annotationKey');
  });
});

const expectMarkersOnRowTops = async (panel: Locator, plot: Plot) => {
  const markers = await boxes(panel.getByTestId('pjan-row-annotations').getByLabel(/^Annotation/));
  expect(markers.length).toBeGreaterThan(0);
  for (const box of markers) {
    const row = plot.rows.find((r) => Math.abs(r.top - box.y) <= 0.5);
    expect(row, `marker at y=${box.y} on a row top (rows: ${JSON.stringify(plot.rows)})`).toBeDefined();
    expect(box.y + box.height).toBeLessThanOrEqual(row!.bottom + 0.5);
    expect(box.height).toBe(5);
  }
};

const expectNoMarkerAt = async (locators: Locator[], plot: Plot, time: number) => {
  for (const locator of locators) {
    const near = (await boxes(locator)).filter(
      (b) => Math.abs(b.x + b.width / 2 - plot.x(time)) <= 3 || Math.abs(b.x - plot.x(time)) <= 3
    );
    expect(near, `no marker at ${new Date(time).toISOString()}`).toEqual([]);
  }
};

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Plot {
  left: number;
  width: number;
  height: number;
  /** Rows as drawn on the canvas, in page pixels */
  rows: Array<{ top: number; bottom: number }>;
  /** Page x of a time */
  x: (time: number) => number;
  /** Whether anything is drawn at a time's x in the gaps between rows */
  gapPainted: (time: number) => Promise<boolean>;
  /** Whether a line is drawn at a time's x on a row (pixels differ from a few pixels to the right) */
  rowPainted: (time: number, row: number) => Promise<boolean>;
}

const boxes = async (locator: Locator): Promise<Array<Box & { locator: Locator }>> => {
  const result = [];
  for (const marker of await locator.all()) {
    result.push({ ...(await marker.boundingBox())!, locator: marker });
  }
  return result;
};

/** The marker that starts (region) or is centred (point) at a time */
const markerNear = async (locator: Locator, plot: Plot, time: number) => {
  const x = plot.x(time);
  const found = (await boxes(locator)).find((b) => Math.abs(b.x + b.width / 2 - x) <= 1.5 || Math.abs(b.x - x) <= 1.5);
  expect(found, `a marker at ${new Date(time).toISOString()}`).toBeDefined();
  return found!;
};

const rowOf = (plot: Plot, y: number) => plot.rows.findIndex((r) => y >= r.top - 0.5 && y < r.bottom);

// Width, height, a hash of the RGBA bytes of the canvas, and the positions of the annotation markers.
const fingerprint = (panel: Locator) =>
  panel.evaluate((el) => {
    const canvas = el.querySelector('canvas')!;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) {
      hash = Math.imul(hash ^ data[i], 0x01000193);
    }
    const markers = [...el.querySelectorAll('button[aria-label^="Annotation"]')].map((b) => {
      const style = (b as HTMLElement).style;
      return `${b.getAttribute('aria-label')}@${style.left},${style.top},${style.width}`;
    });
    return `${canvas.width}x${canvas.height}:${hash >>> 0} ${markers.join(' ')}`;
  });

/**
 * Reads the rows from the canvas: in a pixel column that crosses no line, rows are the runs of painted pixels
 * (uPlot's canvas is transparent elsewhere). Expects `numRows` rows, all with data in the second half of the range.
 */
const waitForPlot = async (page: Page, panel: Locator, numRows = 3): Promise<Plot> => {
  const over = panel.locator('.u-over');
  await expect(over).toBeVisible();
  const canvas = panel.locator('canvas').first();
  const overHandle = await over.elementHandle();

  const read = () =>
    canvas.evaluate(
      (c: HTMLCanvasElement, { overEl, numRows }) => {
        const rect = c.getBoundingClientRect();
        const plot = (overEl as HTMLElement).getBoundingClientRect();
        const ratio = c.width / rect.width;
        const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        const alpha = (x: number, y: number) => data[(Math.round(y) * c.width + Math.round(x)) * 4 + 3];
        const y0 = (plot.top - rect.top) * ratio;
        const y1 = (plot.bottom - rect.top) * ratio;
        const counts = new Map<string, number>();
        // columns in the second half of the plot (every row has data there)
        for (let px = plot.left + plot.width / 2; px < plot.right - 2; px += 3) {
          const x = (px - rect.left) * ratio;
          const runs: number[][] = [];
          let start = -1;
          for (let y = Math.ceil(y0); y < y1; y++) {
            const painted = alpha(x, y) > 0;
            if (painted && start < 0) {
              start = y;
            } else if (!painted && start >= 0) {
              runs.push([start, y]);
              start = -1;
            }
          }
          if (start >= 0) {
            runs.push([start, Math.ceil(y1)]);
          }
          if (runs.length === numRows) {
            const key = JSON.stringify(runs.map(([a, b]) => [a / ratio + rect.top, b / ratio + rect.top]));
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }
        const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        return best ? (JSON.parse(best[0]) as number[][]) : null;
      },
      { overEl: overHandle, numRows }
    );

  await expect.poll(read, { timeout: 15_000 }).not.toBeNull();
  const rows = (await read())!.map(([top, bottom]) => ({ top, bottom }));
  const plotBox = (await over.boundingBox())!;
  const x = (time: number) => plotBox.x + ((time - FROM) / (TO - FROM)) * plotBox.width;

  const pixels = (time: number, ys: number[]) =>
    canvas.evaluate(
      (c: HTMLCanvasElement, { px, ys }) => {
        const rect = c.getBoundingClientRect();
        const ratio = c.width / rect.width;
        const ctx = c.getContext('2d')!;
        return [-1, 0, 1].map((dx) =>
          ys.map((py) =>
            Array.from(ctx.getImageData((px - rect.left) * ratio + dx, (py - rect.top) * ratio, 1, 1).data)
          )
        );
      },
      { px: x(time), ys }
    );

  const range = (a: number, b: number) => Array.from({ length: Math.max(0, Math.floor(b - a)) }, (_, i) => a + i + 0.5);

  return {
    left: plotBox.x,
    width: plotBox.width,
    height: plotBox.height,
    rows,
    x,
    gapPainted: async (time) => {
      const gaps = rows.slice(1).flatMap((row, i) => range(rows[i].bottom + 1, row.top - 1));
      return (await pixels(time, gaps)).some((column) => column.some((rgba) => rgba[3] > 0));
    },
    rowPainted: async (time, row) => {
      const ys = range(rows[row].top + 1, rows[row].bottom - 1);
      const [here, reference] = [await pixels(time, ys), await pixels(time + 4 * ((TO - FROM) / plotBox.width), ys)];
      return here.some((column, i) => column.some((rgba, j) => rgba.join() !== reference[i][j].join()));
    },
  };
};
