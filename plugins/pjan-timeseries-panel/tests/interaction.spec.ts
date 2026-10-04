import { type APIRequestContext, expect, test, type Page } from '@grafana/plugin-e2e';

import { apiClient, savedPanel } from './helpers';
import { CORE, drawn, panelContent, panelOf, PLUGIN, readDashboard, type DashboardPanel } from './parity';

// How the panels behave, core and plugin alike, on the parity dashboards (scripts/generate-parity-dashboard.mjs).
// Where the result depends on the page position (the tooltip's place, the zoomed range), the core panel on top of
// parity.json is compared with the plugin panel on top of parity-swapped.json, at the same position. Results that are
// written to the dashboard (legend clicks, colours, sorting, filters) are read from the save model.
const DASHBOARDS = [readDashboard('parity.json'), readDashboard('parity-swapped.json')] as const;
const TYPES = [CORE, PLUGIN] as const;

// The id of a case's top panel in the twin where `type` is on top
const topId = (title: string, type: string) => panelOf(DASHBOARDS[type === CORE ? 0 : 1], title, type).id;

// Opens the twin where `type` is on top and waits for the case's panel
const openCase = async (page: Page, title: string, type: string) => {
  const dashboard = DASHBOARDS[type === CORE ? 0 : 1];
  const id = topId(title, type);
  await page.goto(`/d/${dashboard.uid}?orgId=1&theme=light`);
  await drawn(page, id);
  await page.mouse.move(0, 0);
  return id;
};

// The plot area of a panel (uPlot's overlay) in page coordinates
const plotBox = async (page: Page, id: number) => (await panelContent(page, id).locator('.u-over').boundingBox())!;

const hoverAt = async (page: Page, id: number, fx: number, fy: number) => {
  await panelContent(page, id).scrollIntoViewIfNeeded();
  const box = await plotBox(page, id);
  await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 4 });
};

// TooltipPlugin2 portals its tooltip into Grafana's portal container (the notifications' live region is nested deeper)
const TOOLTIP = '#grafana-portal-container > div[aria-live="polite"]';

// The tooltip: every element with all its attributes, and its text
const tooltipDom = async (page: Page) => {
  const tooltip = page.locator(TOOLTIP);
  await expect(tooltip).toBeVisible();
  // icons load asynchronously: an icon is an empty <svg> until then
  await expect
    .poll(() =>
      tooltip.evaluate((root) => Array.from(root.querySelectorAll('svg')).every((svg) => svg.childElementCount > 0))
    )
    .toBe(true);
  return tooltip.evaluate((root) => ({
    elements: [root, ...Array.from(root.querySelectorAll('*'))].map((el) =>
      [
        el.tagName.toLowerCase(),
        ...Array.from(el.attributes)
          .map((attribute) => `${attribute.name}=${JSON.stringify(attribute.value)}`)
          .sort(),
      ].join(' ')
    ),
    text: (root as HTMLElement).innerText,
  }));
};

// The time of row 12 of the tooltip cases (24 rows, 15 minutes apart, the last at 2025-10-02 00:00 UTC): 21:15 UTC,
// at 3.25 h of the 6 h range
const ROW_12 = 3.25 / 6;

test.describe('tooltip', () => {
  for (const title of [
    'tooltip single',
    'tooltip all, sorted descending',
    'tooltip all, hide zeros',
    'tooltip all, max height 100',
  ]) {
    test(`${title}: the same tooltip as core`, async ({ page }) => {
      const results = [];
      for (const type of TYPES) {
        const id = await openCase(page, title, type);
        // on the second series of row 12 (single mode picks the series closest to the cursor)
        await hoverAt(page, id, ROW_12, 0.5);
        results.push(await tooltipDom(page));
      }
      expect(results[1]).toEqual(results[0]);
      expect(results[0].elements.length).toBeGreaterThan(5);
    });
  }

  test('the tooltip text of a CSV point, worked out by hand', async ({ page }) => {
    // Row 12 of 'tooltip all, sorted descending': wave(i, 12) = 40 + 15 i + 25 sin((12 + 7 i) / 6) = 62.73, 54.37 and
    // 46.77 (CSV, two decimals), shown with one decimal and the unit req/s, sorted descending
    for (const type of TYPES) {
      const id = await openCase(page, 'tooltip all, sorted descending', type);
      await hoverAt(page, id, ROW_12, 0.5);
      const { text } = await tooltipDom(page);
      expect(text.split('\n').filter((line) => line.trim() !== '')).toEqual([
        '2025-10-01 21:15:00',
        's1',
        '62.7 req/s',
        's2',
        '54.4 req/s',
        's3',
        '46.8 req/s',
      ]);
    }
  });

  test('hideFrom tooltip by override: s2 is left out of the tooltip, as in core', async ({ page }) => {
    // single mode (the default) shows the series closest to the cursor: hovered at several heights of row 12 (s1 41.3,
    // s2 78.4, s3 87.3), the tooltip shows s3 near the top and s1 lower down, never s2 (when s2 is closest, core shows
    // only the time)
    const results = [];
    for (const type of TYPES) {
      const id = await openCase(page, 'hideFrom tooltip by override', type);
      const tooltips = [];
      for (const fy of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        await hoverAt(page, id, ROW_12, fy);
        // once the tooltip has followed the cursor to row 12 (72 rows, 5 minutes apart: 21:15 is one of them)
        await expect(page.locator(TOOLTIP)).toContainText('2025-10-01 21:15:00');
        tooltips.push(await tooltipDom(page));
      }
      results.push(tooltips);
    }
    expect(results[1]).toEqual(results[0]);
    const texts = results[0].map(({ text }) => text.split('\n').map((line) => line.trim()));
    expect(texts.flat()).not.toContain('s2');
    expect(texts.flat()).toEqual(expect.arrayContaining(['s1', 's3']));
  });

  test('tooltip hidden: no tooltip, as in core', async ({ page }) => {
    for (const type of TYPES) {
      const id = await openCase(page, 'tooltip hidden', type);
      await hoverAt(page, id, ROW_12, 0.5);
      // the plot follows the cursor (uPlot's cursor line is in the plot) ...
      await expect
        .poll(() =>
          panelContent(page, id)
            .locator('.u-cursor-x')
            .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41)
        )
        .toBeGreaterThan(0);
      // ... but no tooltip shows (TooltipPlugin2 isn't rendered with mode none)
      await page.waitForTimeout(1000);
      await expect(page.locator(TOOLTIP), type).toHaveCount(0);
    }
  });

  test('a click pins the tooltip; its data link and action render as in core', async ({ page }) => {
    const results = [];
    for (const type of TYPES) {
      const id = await openCase(page, 'data link and action', type);
      // onto the point of row 12: TooltipPlugin2 pins only a tooltip with a series point under the cursor, and uPlot
      // shows its cursor point (u-cursor-pt without u-off) only then, so move down the row until it shows
      const point = panelContent(page, id).locator('.u-cursor-pt:not(.u-off)');
      for (let fy = 0.02; fy < 1 && (await point.count()) === 0; fy += 0.02) {
        await hoverAt(page, id, ROW_12, fy);
      }
      await expect(point).toHaveCount(1);
      await page.mouse.down();
      await page.mouse.up();
      const tooltip = page.locator(TOOLTIP);
      // pinned: the close button shows, and moving away leaves it open
      await expect(tooltip.getByRole('button', { name: 'Close' })).toBeVisible();
      await page.mouse.move(0, 0);
      await expect(tooltip).toBeVisible();
      const link = tooltip.getByRole('link', { name: 'Details' });
      await expect(link).toBeVisible();
      await expect(tooltip.getByRole('button', { name: 'Restart' })).toBeVisible();
      results.push({ ...(await tooltipDom(page)), href: await link.getAttribute('href') });

      // the data link opens (in the same tab: the link has no "open in new tab" set)
      const opened = page.waitForRequest((r) => r.isNavigationRequest() && r.url().startsWith('https://example.com/'));
      await link.click();
      expect((await opened).url()).toMatch(/^https:\/\/example\.com\/details\?value=\d/);
    }
    expect(results[1]).toEqual(results[0]);
  });
});

test('threshold lines are drawn where worked out by hand', async ({ page }) => {
  // 'thresholds line': a fixed 0-100 scale, steps at 50 (orange) and 70 (red). In canvas pixels, a value v is at
  // (top + height × (1 − v / 100)) × pixel ratio, with top and height those of the plot area (uPlot's overlay, placed
  // over the canvas). The row with the most orange or red pixels near there must be within 2 pixels of it, and cover
  // most of the plot's width (the series cross it only here and there).
  for (const type of TYPES) {
    const id = await openCase(page, 'thresholds line', type);
    const rows = await panelContent(page, id).evaluate((root) => {
      const canvas = root.querySelector('canvas')!;
      const over = root.querySelector<HTMLElement>('.u-over')!;
      const canvasBox = canvas.getBoundingClientRect();
      const overBox = over.getBoundingClientRect();
      const ratio = canvas.width / canvasBox.width;
      const [left, top, width, height] = [
        overBox.left - canvasBox.left,
        overBox.top - canvasBox.top,
        overBox.width,
        overBox.height,
      ];
      const ctx = canvas.getContext('2d')!;
      return [50, 70].map((value) => {
        const expected = (top + height * (1 - value / 100)) * ratio;
        let best = { row: -1, share: 0 };
        for (let row = Math.floor(expected) - 4; row <= Math.ceil(expected) + 4; row++) {
          const data = ctx.getImageData(Math.round(left * ratio), row, Math.round(width * ratio), 1).data;
          let hits = 0;
          for (let i = 0; i < data.length; i += 4) {
            // orange or red: much more red than green and blue, and drawn
            if (data[i + 3] > 0 && data[i] - data[i + 1] > 50 && data[i] - data[i + 2] > 100) {
              hits++;
            }
          }
          const share = hits / (data.length / 4);
          if (share > best.share) {
            best = { row, share };
          }
        }
        return { value, expected, ...best };
      });
    });
    for (const { value, expected, row, share } of rows) {
      expect(Math.abs(row - expected), `threshold ${value} (${type})`).toBeLessThanOrEqual(2);
      expect(share, `threshold ${value} (${type})`).toBeGreaterThan(0.8);
    }
  }
});

test('drag to zoom sets the same time range', async ({ page }) => {
  const ranges = [];
  for (const type of TYPES) {
    const id = await openCase(page, 'defaults, three series', type);
    const box = await plotBox(page, id);
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page).toHaveURL(/from=\d+/);
    const url = new URL(page.url());
    // epoch milliseconds or ISO strings, depending on the Grafana version
    const time = (name: string) => {
      const value = url.searchParams.get(name)!;
      return /^\d+$/.test(value) ? Number(value) : Date.parse(value);
    };
    ranges.push([time('from'), time('to')]);
  }
  expect(ranges[1]).toEqual(ranges[0]);
  // a quarter to a half of the 6 hours from 2025-10-01 18:00 UTC: about 19:30 to 21:00, within a minute
  const [from, to] = ranges[0];
  expect(Math.abs(from - Date.UTC(2025, 9, 1, 19, 30))).toBeLessThan(60_000);
  expect(Math.abs(to - Date.UTC(2025, 9, 1, 21, 0))).toBeLessThan(60_000);
});

test('keyboard: the plot takes focus and the arrow keys move the cursor, as in core', async ({ page }) => {
  const results = [];
  for (const type of TYPES) {
    const id = await openCase(page, 'defaults, three series', type);
    const root = panelContent(page, id).locator('.uplot');
    await expect(root).toHaveAttribute('tabindex', '0');
    // Tab from the panel frame into the plot: focus-visible puts the cursor in the middle
    await page.locator(`[data-viz-panel-key="panel-${id}"] section`).first().focus();
    for (let i = 0; i < 6 && !(await root.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(root).toBeFocused();
    const cursorLeft = () =>
      panelContent(page, id)
        .locator('.u-cursor-x')
        .evaluate((el) => Number(new DOMMatrix(getComputedStyle(el).transform).m41));
    const width = (await plotBox(page, id)).width;
    await expect.poll(async () => Math.abs((await cursorLeft()) - width / 2)).toBeLessThanOrEqual(1);
    const before = await cursorLeft();
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowRight');
    const after = await cursorLeft();
    expect(after).toBeGreaterThan(before);
    results.push(Math.round(before));
  }
  expect(results[1]).toEqual(results[0]);
});

test('long data in the panel editor: core’s message and actions, without "Transform to wide" (plan decision 5)', async ({
  page,
}) => {
  // Grafana's PanelDataErrorView shows its actions only in the panel editor (CoreApp.PanelEditor) and only for a panel
  // it finds in the dashboard. Core adds the "Transform to wide time series format" suggestion; the plugin can't (its
  // DashboardSrv stand-in has no current dashboard), so it shows the other two actions.
  const results = [];
  for (const type of TYPES) {
    const dashboard = DASHBOARDS[type === CORE ? 0 : 1];
    const id = topId('long data', type);
    await page.goto(`/d/${dashboard.uid}?orgId=1&theme=light&editPanel=${id}`);
    // the editor's panel (the Panel styles cards below it draw the same message)
    const message = page.getByTestId('data-testid panel content').getByTestId('data-testid Panel data error message');
    await expect(message).toHaveText('Long data must be converted to wide');
    const buttons = message.locator('xpath=..').getByRole('button');
    await expect(buttons.last()).toHaveText('Open visualization suggestions');
    results.push(await buttons.allInnerTexts());
  }
  expect(results[0].map((text) => text.trim())).toEqual([
    'Transform to wide time series format',
    'Switch to table',
    'Open visualization suggestions',
  ]);
  expect(results[1].map((text) => text.trim())).toEqual(['Switch to table', 'Open visualization suggestions']);
});

test.describe('legend', () => {
  const overridesAfter = async (page: Page, title: string, type: string, act: (id: number) => Promise<void>) => {
    const id = await openCase(page, title, type);
    await act(id);
    await expect.poll(async () => (await savedPanel(page, id))?.fieldConfig.overrides.length).toBeGreaterThan(0);
    return (await savedPanel(page, id))!.fieldConfig.overrides;
  };

  test('a click isolates a series, as in core', async ({ page }) => {
    const results = [];
    for (const type of TYPES) {
      results.push(
        await overridesAfter(page, 'defaults, three series', type, async (id) => {
          await panelContent(page, id)
            .getByTestId('data-testid VizLegend series s2')
            .getByRole('button', { name: 'All series selected' })
            .click();
        })
      );
    }
    expect(results[1]).toEqual(results[0]);
    expect(JSON.stringify(results[0])).toContain('hideSeriesFrom');
  });

  test('Ctrl/Cmd-click toggles a series, as in core', async ({ page }) => {
    const results = [];
    for (const type of TYPES) {
      results.push(
        await overridesAfter(page, 'defaults, three series', type, async (id) => {
          await panelContent(page, id)
            .getByTestId('data-testid VizLegend series s2')
            .getByRole('button', { name: 'All series selected' })
            .click({ modifiers: ['ControlOrMeta'] });
        })
      );
    }
    expect(results[1]).toEqual(results[0]);
  });

  test('the colour picker writes the same override', async ({ page }) => {
    const results = [];
    for (const type of TYPES) {
      results.push(
        await overridesAfter(page, 'defaults, three series', type, async (id) => {
          await panelContent(page, id).getByRole('button', { name: 'Edit color for s2' }).click();
          await page.getByRole('button', { name: 'dark-purple color', exact: true }).click();
        })
      );
    }
    expect(results[1]).toEqual(results[0]);
    expect(results[0]).toEqual([
      {
        matcher: { id: 'byName', options: 's2' },
        properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: 'dark-purple' } }],
      },
    ]);
  });

  test('a column click writes the same legend sort', async ({ page }) => {
    const results = [];
    for (const type of TYPES) {
      const id = await openCase(page, 'legend table on the right, width 260', type);
      await panelContent(page, id).getByRole('columnheader', { name: 'Mean' }).click();
      await expect
        .poll(async () => ((await savedPanel(page, id))?.options.legend as { sortBy?: string })?.sortBy)
        .toBe('Mean');
      results.push((await savedPanel(page, id))!.options.legend);
    }
    expect(results[1]).toEqual(results[0]);
  });

  test('the legend values of the top-N form, worked out by hand', async ({ page }) => {
    // wave(i, k) over the 72 rows: last value and max of each series (CSV, two decimals), sorted by max descending
    // (the first cell holds the series colour)
    const expected = [
      ['', 's5', '82.21', '124.99'],
      ['', 's4', '94.15', '109.99'],
      ['', 's3', '94.99', '94.99'],
      ['', 's2', '65.50', '79.99'],
      ['', 's1', '23.27', '64.99'],
    ];
    for (const type of TYPES) {
      const id = await openCase(page, 'legend lastNotNull and max, sorted by max descending', type);
      const rows = await panelContent(page, id)
        .locator('tbody tr')
        .evaluateAll((trs) =>
          trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.trim()))
        );
      expect(rows).toEqual(expected);
    }
  });

  test('the series visibility filter and its pinning write the same as core', async ({ page }) => {
    const results = [];
    for (const type of TYPES) {
      const id = await openCase(page, 'legend series visibility filter', type);
      await panelContent(page, id).getByTestId('faceted-labels-filter-toggle').click();
      const filter = page.getByTestId('faceted-labels-filter');
      await filter.getByRole('button', { name: 'host' }).click();
      await filter.getByText('web-1', { exact: true }).click();
      await expect.poll(async () => (await savedPanel(page, id))?.fieldConfig.overrides.length).toBe(1);
      await page.getByRole('button', { name: 'Pin to sidebar' }).click();
      await expect
        .poll(
          async () =>
            ((await savedPanel(page, id))?.options.legend as { facetedFilterPinned?: boolean })?.facetedFilterPinned
        )
        .toBe(true);
      const saved = (await savedPanel(page, id))!;
      results.push({ overrides: saved.fieldConfig.overrides, legend: saved.options.legend });
    }
    expect(results[1]).toEqual(results[0]);
  });
});

test.describe('on dashboards of their own', () => {
  test.describe.configure({ mode: 'default' });
  let api: APIRequestContext;
  const dashboards: string[] = [];
  const annotationIds: number[] = [];
  const PARITY = DASHBOARDS[0];
  const csvTarget = panelOf(PARITY, 'defaults, three series', CORE).targets;

  const createDashboard = async (uid: string, panels: Array<Partial<DashboardPanel>>) => {
    const response = await api.post('/api/dashboards/db', {
      data: {
        dashboard: { uid, title: uid, time: PARITY.time, timezone: 'utc', schemaVersion: 42, graphTooltip: 1, panels },
        overwrite: true,
      },
    });
    expect(response.ok()).toBe(true);
    dashboards.push(uid);
  };

  test.beforeAll(async ({ playwright, grafanaAPICredentials }) => {
    api = await apiClient(playwright, grafanaAPICredentials);
  });

  test.afterAll(async () => {
    for (const id of annotationIds) {
      await api.delete(`/api/annotations/${id}`);
    }
    for (const uid of dashboards) {
      await api.delete(`/api/dashboards/uid/${uid}`);
    }
    await api.dispose();
  });

  test('crosshair sync works both ways between core and plugin, and with the state timelines', async ({ page }) => {
    const states = {
      refId: 'A',
      datasource: { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' },
      scenarioId: 'csv_content',
      csvContent: ['time,state']
        .concat(
          Array.from(
            { length: 12 },
            (_, k) => `${Date.parse(PARITY.time.from) + k * 1_800_000},${['ok', 'warn'][k % 2]}`
          )
        )
        .join('\n'),
    };
    // one column, the same width, so the same time is at the same x in every panel
    const panel = (id: number, type: string, targets: unknown) => ({
      id,
      type,
      title: type,
      datasource: { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' },
      targets,
      gridPos: { x: 0, y: (id - 1) * 5, w: 16, h: 5 },
      fieldConfig: { defaults: {}, overrides: [] },
      options: {},
    });
    await createDashboard('pjan-timeseries-crosshair', [
      panel(1, CORE, csvTarget),
      panel(2, PLUGIN, csvTarget),
      panel(3, 'state-timeline', [states]),
      panel(4, 'pjan-statetimeline-panel', [states]),
    ]);
    await page.goto('/d/pjan-timeseries-crosshair?orgId=1');
    for (const id of [1, 2, 3, 4]) {
      await drawn(page, id);
    }
    // Where a panel's vertical cursor line (uPlot's u-cursor-x) is, as a share of its plot's width, or null while it is
    // hidden (uPlot moves it out of the plot, to a negative left). The state timelines' plots start further right.
    const cursorAt = (id: number) =>
      panelContent(page, id).evaluate((root) => {
        const line = root.querySelector('.u-cursor-x')!;
        const left = new DOMMatrix(getComputedStyle(line).transform).m41;
        const width = root.querySelector('.u-over')!.getBoundingClientRect().width;
        return getComputedStyle(line).display === 'none' || left < 0 ? null : { left, width };
      });
    for (const [from, to] of [
      [1, 2],
      [2, 1],
      [1, 4],
      [4, 2],
      [3, 2],
    ]) {
      await hoverAt(page, from, 0.4, 0.5);
      const own = await cursorAt(from);
      expect(own, `panel ${from} draws its own cursor`).not.toBeNull();
      // the same time, within a pixel
      await expect
        .poll(async () => {
          const other = await cursorAt(to);
          return other === null ? null : Math.abs(other.left / other.width - own!.left / own!.width) * other.width <= 1;
        }, `panel ${to} follows panel ${from}`)
        .toBe(true);
      await page.mouse.move(0, 0);
    }
  });

  test('Cmd/Ctrl-click on the plot adds the same annotation', async ({ page }) => {
    const panel = (id: number, type: string) => ({
      ...panelOf(PARITY, 'defaults, three series', type),
      id,
      gridPos: { x: 0, y: (id - 1) * 8, w: 16, h: 8 },
    });
    await createDashboard('pjan-timeseries-add-annotation', [panel(1, CORE), panel(2, PLUGIN)]);
    const bodies = [];
    for (const id of [1, 2]) {
      await page.goto('/d/pjan-timeseries-add-annotation?orgId=1');
      await expect(panelContent(page, id).locator('canvas')).toBeVisible();
      await hoverAt(page, id, 0.6, 0.3);
      await page.keyboard.down('ControlOrMeta');
      await page.mouse.down();
      await page.mouse.up();
      await page.keyboard.up('ControlOrMeta');
      await page.getByLabel('Description').fill(`added on panel ${id}`);
      const request = page.waitForRequest((r) => r.url().endsWith('/api/annotations') && r.method() === 'POST');
      await page.getByRole('button', { name: 'Save' }).click();
      const posted = await request;
      const { id: annotationId } = await (await posted.response())!.json();
      annotationIds.push(annotationId);
      const { time, timeEnd, tags } = posted.postDataJSON();
      bodies.push({ time, timeEnd, tags });
    }
    expect(bodies[1]).toEqual(bodies[0]);
    // 60 % of the range from 2025-10-01 18:00 UTC: about 21:36, within a minute
    expect(Math.abs(bodies[0].time - Date.UTC(2025, 9, 1, 21, 36))).toBeLessThan(60_000);
  });
});
