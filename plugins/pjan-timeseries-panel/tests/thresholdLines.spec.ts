import { type APIRequestContext, expect, test, type Page } from '@grafana/plugin-e2e';

import { apiClient, savedPanel } from './helpers';
import { drawn, panelContent, PLUGIN, readDashboard, type DashboardPanel } from './parity';

// The threshold line options (Threshold line color, opacity and width; src/pjan/styling/thresholdLines.ts): where the
// lines are drawn, in which colour, at which alpha and how thick, worked out by hand, in the light and the dark theme
// at pixel ratio 1 and 2; transparent steps; one set of lines per scale; the editor; what is saved. The dashboard is
// created through the HTTP API and deleted afterwards.
const PARITY = readDashboard('parity.json');
const UID = 'pjan-timeseries-threshold-lines';
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };

// Series well below the thresholds (5-25 on a fixed 0-100 scale), so that no series crosses a threshold line
const END = Date.parse(PARITY.time.to);
const csv = (names: string[]) => {
  const lines = ['time,' + names.join(',')];
  for (let k = 0; k < 72; k++) {
    lines.push(
      `${END - (71 - k) * 300_000},` + names.map((_, i) => (12 + i * 5 + 6 * Math.sin(k / 6)).toFixed(2)).join(',')
    );
  }
  return [{ refId: 'A', datasource: DS, scenarioId: 'csv_content', csvContent: lines.join('\n') }];
};

const steps = (...list: Array<[number | null, string]>) => ({
  mode: 'absolute',
  steps: list.map(([value, color]) => ({ value, color })),
});
// orange 45, red 65, blue 85: off the grid (switched off anyway) and far from the series
const STEPS = steps([null, 'green'], [45, 'orange'], [65, 'red'], [85, 'blue']);
const VALUES = [45, 65, 85];

let nextId = 1;
const panel = (
  title: string,
  custom: Record<string, unknown>,
  {
    thresholds = STEPS,
    overrides = [],
    names = ['s1'],
  }: { thresholds?: object; overrides?: unknown[]; names?: string[] } = {}
): DashboardPanel => {
  const id = nextId++;
  return {
    id,
    type: PLUGIN,
    title,
    datasource: DS,
    targets: csv(names),
    gridPos: { x: ((id - 1) % 2) * 12, y: Math.floor((id - 1) / 2) * 8, w: 12, h: 8 },
    fieldConfig: {
      defaults: {
        min: 0,
        max: 100,
        thresholds,
        custom: { lineWidth: 2, axisGridShow: false, thresholdsStyle: { mode: 'line' }, ...custom },
      },
      overrides,
    },
    options: { tooltip: { mode: 'single', sort: 'none' }, legend: { showLegend: false } },
  };
};

const MAGENTA = { mode: 'fixed', fixedColor: '#ff00ff' };
const CYAN = { mode: 'fixed', fixedColor: '#00ffff' };
const P = {
  unset: panel('unset: as Grafana', {}),
  fixed: panel('fixed magenta, opacity 100, width 3', {
    styling: { thresholdLineColor: MAGENTA, thresholdLineOpacity: 100, thresholdLineWidth: 3 },
  }),
  fixedDefaultAlpha: panel('fixed magenta', { styling: { thresholdLineColor: MAGENTA } }),
  stronger: panel('shade stronger', { styling: { thresholdLineColor: { mode: 'shade', shade: 'stronger' } } }),
  opacity: panel('opacity 40, width 1', { styling: { thresholdLineOpacity: 40, thresholdLineWidth: 1 } }),
  // green / transparent 45 / red 65 / transparent 85: the line at 45 takes green (below the first transparent step),
  // 65 red, and 85 (a later transparent step) is drawn at alpha 0 by Grafana: never drawn, even in a fixed colour
  transparent: panel(
    'transparent steps, fixed magenta, opacity 100',
    { styling: { thresholdLineColor: MAGENTA, thresholdLineOpacity: 100 } },
    { thresholds: steps([null, 'green'], [45, 'transparent'], [65, 'red'], [85, 'transparent']) }
  ),
  // two series on one scale, both showing thresholds: one set of lines, the first series'
  firstStyled: panel(
    'two series, s1 cyan by override',
    {},
    {
      names: ['s1', 's2'],
      overrides: [
        {
          matcher: { id: 'byName', options: 's1' },
          properties: [{ id: 'custom.styling.thresholdLineColor', value: CYAN }],
        },
      ],
    }
  ),
  secondStyled: panel(
    'two series, s2 cyan by override',
    {},
    {
      names: ['s1', 's2'],
      overrides: [
        {
          matcher: { id: 'byName', options: 's2' },
          properties: [{ id: 'custom.styling.thresholdLineColor', value: CYAN }],
        },
      ],
    }
  ),
  dashed: panel('dashed, fixed magenta, opacity 100, width 5', {
    thresholdsStyle: { mode: 'dashed' },
    styling: { thresholdLineColor: MAGENTA, thresholdLineOpacity: 100, thresholdLineWidth: 5 },
  }),
  editor: panel('editor', {}),
};
const PANELS = Object.values(P);

// Grafana 13.2.3's colours (theme.visualization.getColorByName) and, for Stronger, the shade of each hue with the
// highest contrast with the panel background (white in light, #181b1f in dark), computed with @grafana/data's
// createTheme and colorManipulator.getContrastRatio: light dark-orange #E55400 (3.75), dark-red #AD0317 (7.50),
// dark-blue #1250B0 (7.50); dark super-light-orange #FFCB7D (11.56), super-light-red #FFA6B0 (9.30),
// super-light-blue #C0D8FF (11.89).
const COLORS = {
  light: {
    green: '#56a64b',
    orange: '#ff780a',
    red: '#e02f44',
    blue: '#3274d9',
    stronger: ['#e55400', '#ad0317', '#1250b0'],
  },
  dark: {
    green: '#73bf69',
    orange: '#ff9830',
    red: '#f2495c',
    blue: '#5794f2',
    stronger: ['#ffcb7d', '#ffa6b0', '#c0d8ff'],
  },
} as const;
// Grafana's alpha for a colour without one of its own, 0.7, read back from the canvas
const ALPHA_70 = [178, 179];

interface Row {
  row: number;
  // the row's colour when every pixel of the window has the same RGBA, else null
  rgba: number[] | null;
  // pixels drawn (alpha above 0) in the window
  painted: number;
  // the lengths of the painted and unpainted runs along the row
  runs: number[];
}

// The canvas rows around each threshold value, in the middle of the plot (30-70 % of its width): a value v is at
// (top + height × (1 − v / 100)) × pixel ratio in canvas pixels, with top and height those of the plot area (uPlot's
// overlay), as in interaction.spec.ts
const rowsAround = (page: Page, id: number, values: number[]) =>
  panelContent(page, id).evaluate((root, values) => {
    const canvas = root.querySelector('canvas')!;
    const over = root.querySelector<HTMLElement>('.u-over')!;
    const canvasBox = canvas.getBoundingClientRect();
    const overBox = over.getBoundingClientRect();
    const ratio = canvas.width / canvasBox.width;
    const top = overBox.top - canvasBox.top;
    const x0 = Math.round((overBox.left - canvasBox.left + overBox.width * 0.3) * ratio);
    const x1 = Math.round((overBox.left - canvasBox.left + overBox.width * 0.7) * ratio);
    const ctx = canvas.getContext('2d')!;
    return {
      ratio,
      lines: values.map((value) => {
        const expected = (top + overBox.height * (1 - value / 100)) * ratio;
        const rows = [];
        for (let row = Math.floor(expected) - 16; row <= Math.ceil(expected) + 16; row++) {
          const data = ctx.getImageData(x0, row, x1 - x0, 1).data;
          let uniform = true;
          let painted = 0;
          const runs: number[] = [];
          for (let i = 0; i < data.length; i += 4) {
            uniform &&= [0, 1, 2, 3].every((k) => data[i + k] === data[k]);
            const on = data[i + 3] > 0;
            painted += on ? 1 : 0;
            if (i === 0 || on !== data[i - 1] > 0) {
              runs.push(0);
            }
            runs[runs.length - 1]++;
          }
          rows.push({ row, rgba: uniform ? Array.from(data.slice(0, 4)) : null, painted, runs });
        }
        return { value, expected, rows };
      }),
    };
  }, values);

// The band of rows a line covers: consecutive rows each painted all across the window in one colour
const band = (rows: Row[], expected: number) => {
  const painted = rows.filter((r) => r.painted > 0);
  const lineRows = rows.filter((r) => r.rgba !== null && r.rgba[3] > 0);
  return {
    painted,
    lineRows,
    near: lineRows.length > 0 && Math.abs((lineRows[0].row + lineRows.at(-1)!.row + 1) / 2 - expected) <= 2,
  };
};

const hex = (rgba: number[]) =>
  '#' +
  rgba
    .slice(0, 3)
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
const closeTo = (rgba: number[], color: string, tolerance = 2) =>
  [1, 3, 5].every((i, k) => Math.abs(rgba[k] - parseInt(color.slice(i, i + 2), 16)) <= tolerance);

// Checks one line: crisp (every row it covers painted all across in one colour, and nothing drawn in the rows around
// it: no anti-aliased edge), `width` rows thick, near where worked out by hand, in that colour and alpha
const expectLine = (
  line: { value: number; expected: number; rows: Row[] },
  { width, color, alpha, tolerance = 2 }: { width: number; color: string; alpha: number[]; tolerance?: number },
  label: string
) => {
  const { painted, lineRows, near } = band(line.rows, line.expected);
  expect(lineRows.length, `${label}: rows of the line at ${line.value}`).toBe(width);
  expect(
    painted.map((r) => r.row),
    `${label}: only the line's rows are drawn (crisp)`
  ).toEqual(lineRows.map((r) => r.row));
  expect(lineRows.at(-1)!.row - lineRows[0].row + 1, `${label}: one band`).toBe(width);
  expect(near, `${label}: at ${line.expected.toFixed(1)}, drawn at ${lineRows[0].row}-${lineRows.at(-1)!.row}`).toBe(
    true
  );
  for (const r of lineRows) {
    expect(closeTo(r.rgba!, color, tolerance), `${label}: ${hex(r.rgba!)} for ${color}`).toBe(true);
    expect(alpha, `${label}: alpha ${r.rgba![3]}`).toContain(r.rgba![3]);
  }
};

test.describe('threshold lines', () => {
  test.describe.configure({ mode: 'default' });
  let api: APIRequestContext;

  test.beforeAll(async ({ playwright, grafanaAPICredentials }) => {
    api = await apiClient(playwright, grafanaAPICredentials);
    const response = await api.post('/api/dashboards/db', {
      data: {
        dashboard: { uid: UID, title: UID, time: PARITY.time, timezone: 'utc', schemaVersion: 42, panels: PANELS },
        overwrite: true,
      },
    });
    expect(response.ok()).toBe(true);
  });

  test.afterAll(async () => {
    await api.delete(`/api/dashboards/uid/${UID}`);
    await api.dispose();
  });

  for (const ratio of [1, 2]) {
    test.describe(`pixel ratio ${ratio}`, () => {
      test.use({ deviceScaleFactor: ratio });

      for (const theme of ['light', 'dark'] as const) {
        test(`draws each option where, as and as thick as worked out by hand, ${theme}`, async ({ page }, testInfo) => {
          const colors = COLORS[theme];
          await page.goto(`/d/${UID}?orgId=1&theme=${theme}`);
          for (const { id } of PANELS) {
            await drawn(page, id);
          }
          await page.mouse.move(0, 0);
          const lines = async (p: DashboardPanel, values = VALUES) => {
            const result = await rowsAround(page, p.id, values);
            expect(result.ratio).toBe(ratio);
            return result.lines;
          };
          const label = (p: DashboardPanel) => `${p.title} (${theme}, ratio ${ratio})`;

          // Not set: Grafana's lines, 2 canvas pixels at both ratios, alpha 0.7
          const unset = await lines(P.unset);
          [colors.orange, colors.red, colors.blue].forEach((color, i) =>
            expectLine(unset[i], { width: 2, color, alpha: ALPHA_70 }, label(P.unset))
          );

          // Fixed at opacity 100: the hex exactly, opaque; width 3 CSS pixels = 3 × ratio canvas pixels
          for (const line of await lines(P.fixed)) {
            expectLine(line, { width: 3 * ratio, color: '#ff00ff', alpha: [255], tolerance: 0 }, label(P.fixed));
          }
          // Fixed without an opacity: at Grafana's 0.7
          for (const line of await lines(P.fixedDefaultAlpha)) {
            expectLine(line, { width: 2, color: '#ff00ff', alpha: ALPHA_70 }, label(P.fixedDefaultAlpha));
          }

          // Stronger: each line in its own hue's strongest shade, at 0.7
          const stronger = await lines(P.stronger);
          colors.stronger.forEach((color, i) =>
            expectLine(stronger[i], { width: 2, color, alpha: ALPHA_70 }, label(P.stronger))
          );

          // Opacity 40 replaces 0.7 (alpha 102); width 1 = 1 × ratio, crisp at ratio 1 too (half-pixel shift)
          const opacity = await lines(P.opacity);
          [colors.orange, colors.red, colors.blue].forEach((color, i) =>
            expectLine(opacity[i], { width: ratio, color, alpha: [101, 102, 103], tolerance: 3 }, label(P.opacity))
          );

          // Transparent steps: 45 (below the first transparent step) and 65 in magenta; 85 not drawn at all
          const transparent = await lines(P.transparent);
          for (const line of transparent.slice(0, 2)) {
            expectLine(line, { width: 2, color: '#ff00ff', alpha: [255], tolerance: 0 }, label(P.transparent));
          }
          expect(
            transparent[2].rows.filter((r) => r.painted > 0).map((r) => r.row),
            `${label(P.transparent)}: no line at 85`
          ).toEqual([]);

          // One set of lines per scale: the first series' (s1 cyan); with the colour on s2, Grafana's lines of s1
          for (const line of await lines(P.firstStyled)) {
            expectLine(line, { width: 2, color: '#00ffff', alpha: ALPHA_70 }, label(P.firstStyled));
          }
          const second = await lines(P.secondStyled);
          [colors.orange, colors.red, colors.blue].forEach((color, i) =>
            expectLine(second[i], { width: 2, color, alpha: ALPHA_70 }, label(P.secondStyled))
          );

          // Dashed at width 5: 5 × ratio canvas pixels thick; the dashes keep Grafana's 10 canvas pixels on, 10 off
          await panelContent(page, P.dashed.id).scrollIntoViewIfNeeded();
          const [dashed] = await lines(P.dashed, [65]);
          const dashRows = dashed.rows.filter((r) => r.painted > 0);
          expect(dashRows.length, label(P.dashed)).toBe(5 * ratio);
          for (const r of dashRows) {
            // the runs along the row, without the two cut by the window's edges: 10 on, 10 off
            expect(new Set(r.runs.slice(1, -1)), label(P.dashed)).toEqual(new Set([10]));
          }
          await testInfo.attach(`dashed width 5, ${theme}, ratio ${ratio}`, {
            body: await panelContent(page, P.dashed.id).screenshot(),
            contentType: 'image/png',
          });
        });
      }
    });
  }

  // The Thresholds options, in the editor's order
  const thresholdOptions = (page: Page) =>
    page
      .locator('[data-testid^="data-testid Thresholds "][data-testid$=" field property editor"]')
      .evaluateAll((els) =>
        els.map((el) =>
          el.getAttribute('data-testid')!.replace('data-testid Thresholds ', '').replace(' field property editor', '')
        )
      );
  const OPTIONS = ['Threshold line color', 'Threshold line opacity', 'Threshold line width'];

  test('the editor shows the options right after Show thresholds, only when it draws lines', async ({ page }) => {
    await page.goto(`/d/${UID}?orgId=1&editPanel=${P.editor.id}`);
    const show = page.getByTestId('data-testid Thresholds Show thresholds field property editor');
    await expect(show).toBeVisible();
    const listed = await thresholdOptions(page);
    expect(listed.slice(listed.indexOf('Show thresholds'), listed.indexOf('Show thresholds') + 4)).toEqual([
      'Show thresholds',
      ...OPTIONS,
    ]);

    // Show thresholds is a select: pick each mode in the editor
    for (const [mode, shown] of [
      ['Off', false],
      ['As lines', true],
      ['As filled regions', false],
      ['As lines (dashed)', true],
      ['As filled regions and lines', true],
      ['As filled regions and lines (dashed)', true],
    ] as const) {
      await show.getByRole('combobox').click();
      await page.getByRole('option', { name: mode, exact: true }).click();
      const editor = page.getByTestId('data-testid Thresholds Threshold line color field property editor');
      await expect(editor, mode).toHaveCount(shown ? 1 : 0);
      const now = await thresholdOptions(page);
      for (const option of OPTIONS) {
        expect(now.includes(option), `${option} with ${mode}`).toBe(shown);
      }
    }
  });

  test('a set option is saved under custom.styling, a cleared one leaves nothing', async ({ page }) => {
    await page.goto(`/d/${UID}?orgId=1&editPanel=${P.editor.id}`);
    const editor = (name: string) => page.getByTestId(`data-testid Thresholds ${name} field property editor`);
    await expect(editor('Threshold line color')).toBeVisible();
    await expect.poll(async () => (await savedPanel(page, P.editor.id))?.options).toHaveProperty('tooltip');
    const before = (await savedPanel(page, P.editor.id))!;
    expect(before.fieldConfig.defaults.custom ?? {}).not.toHaveProperty('styling');
    const styling = async () => (await savedPanel(page, P.editor.id))?.fieldConfig.defaults.custom?.styling;

    // Color: unset reads "Threshold color"; pick Stronger, then clear it
    const color = editor('Threshold line color').getByRole('combobox');
    await expect(color).toHaveAttribute('placeholder', 'Threshold color');
    await color.click();
    await expect(page.getByText('Shade of the threshold color')).toBeVisible();
    await page.getByRole('option', { name: /^Stronger/ }).click();
    await expect.poll(styling).toEqual({ thresholdLineColor: { mode: 'shade', shade: 'stronger' } });
    await editor('Threshold line color').getByRole('button', { name: 'Clear value' }).click();
    await expect
      .poll(async () => (await savedPanel(page, P.editor.id))?.fieldConfig.defaults.custom ?? {})
      .not.toHaveProperty('styling');

    // Opacity: unset shows 70; a click on the slider's handle picks 70 and saves it (unset is 70 only for colours
    // without an alpha of their own)
    const opacity = editor('Threshold line opacity');
    await expect(opacity.getByRole('slider')).toHaveAttribute('aria-valuenow', '70');
    await opacity.getByRole('slider').click();
    await expect.poll(styling).toEqual({ thresholdLineOpacity: 70 });
    await opacity.getByRole('button', { name: 'Clear value' }).click();

    // Width: unset shows 2 at pixel ratio 1 (Grafana's 2 canvas pixels, 1 CSS pixel at ratio 2); a click on the handle
    // saves 2
    const width = editor('Threshold line width');
    await expect(width.getByRole('slider')).toHaveAttribute('aria-valuenow', '2');
    await width.getByRole('slider').click();
    await expect.poll(styling).toEqual({ thresholdLineWidth: 2 });
    await width.getByRole('button', { name: 'Clear value' }).click();

    await expect.poll(async () => (await savedPanel(page, P.editor.id))?.fieldConfig).toEqual(before.fieldConfig);
  });

  test('options and overrides survive loading the dashboard', async ({ page }) => {
    await page.goto(`/d/${UID}?orgId=1`);
    for (const p of [P.fixed, P.firstStyled]) {
      await drawn(page, p.id);
      await expect.poll(async () => (await savedPanel(page, p.id))?.options).toHaveProperty('tooltip');
      const saved = (await savedPanel(page, p.id))!;
      const fieldConfig = p.fieldConfig as { defaults: { custom: { styling?: unknown } }; overrides: unknown[] };
      expect(saved.fieldConfig.defaults.custom?.styling).toEqual(fieldConfig.defaults.custom.styling);
      expect(saved.fieldConfig.overrides).toEqual(fieldConfig.overrides);
    }
  });
});
