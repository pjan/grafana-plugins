import { type APIRequestContext, expect, test, type Page } from '@grafana/plugin-e2e';

import { apiClient, savedPanel } from './helpers';
import { CORE, drawn, panelContent, panelOf, PLUGIN, readDashboard, type DashboardPanel } from './parity';

// The colour model (Line color, Fill color, Point color; src/pjan/styling/): what each option draws, in the light and
// the dark theme, the legend's and the tooltip's swatches, where the options are in the editor and when they show,
// and what is saved. The dashboard is created through the HTTP API and deleted afterwards.
const PARITY = readDashboard('parity.json');
const ONE_SERIES = panelOf(PARITY, 'defaults, one series', CORE).targets;
const THREE_SERIES = panelOf(PARITY, 'defaults, three series', CORE).targets;
const UID = 'pjan-timeseries-styling';

// Grafana 13.2.3's colours (theme.visualization.getColorByName), and the shades Stronger of the first classic palette
// colour (green) ranks highest by contrast with the panel background: dark-green on white, super-light-green on dark
const COLORS = {
  light: { green: '#56a64b', stronger: '#19730e' },
  dark: { green: '#73bf69', stronger: '#c8f2c2' },
} as const;

let nextId = 1;
const panel = (
  title: string,
  custom: Record<string, unknown>,
  {
    defaults = {},
    overrides = [],
    targets = ONE_SERIES,
  }: { defaults?: object; overrides?: unknown[]; targets?: unknown } = {}
): DashboardPanel => {
  const id = nextId++;
  return {
    id,
    type: PLUGIN,
    title,
    datasource: { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' },
    targets,
    gridPos: { x: ((id - 1) % 2) * 12, y: Math.floor((id - 1) / 2) * 8, w: 12, h: 8 },
    fieldConfig: { defaults: { ...defaults, custom }, overrides },
    options: { tooltip: { mode: 'single', sort: 'none' } },
  };
};

const STRONGER = { lineColor: { mode: 'shade', shade: 'stronger' } };
const RED = { mode: 'fixed', fixedColor: '#ff0000' };
const BLUE = { mode: 'fixed', fixedColor: '#0000ff' };
const THRESHOLDS = {
  color: { mode: 'thresholds' },
  thresholds: {
    mode: 'absolute',
    steps: [
      { value: null, color: 'green' },
      { value: 60, color: 'red' },
    ],
  },
};

const P = {
  plain: panel('plain', { lineWidth: 3 }),
  stronger: panel('line stronger', { lineWidth: 3, styling: STRONGER }),
  fill: panel('fill blue', { lineWidth: 2, fillOpacity: 50, styling: { fillColor: BLUE } }),
  fillGradient: panel('fill blue, opacity gradient', {
    lineWidth: 2,
    fillOpacity: 50,
    gradientMode: 'opacity',
    styling: { fillColor: BLUE },
  }),
  fillSeries: panel('line stronger, fill series color', {
    lineWidth: 3,
    fillOpacity: 50,
    styling: { ...STRONGER, fillColor: { mode: 'series' } },
  }),
  points: panel('points red', { lineWidth: 2, showPoints: 'always', pointSize: 9, styling: { pointColor: RED } }),
  // by value: Grafana draws the line in the thresholds' colours, and the fill and the points from it
  thresholds: panel(
    'thresholds mode',
    { lineWidth: 3, fillOpacity: 30, showPoints: 'always' },
    { defaults: THRESHOLDS }
  ),
  thresholdsStyled: panel(
    'thresholds mode, line, fill and points red',
    {
      lineWidth: 3,
      fillOpacity: 30,
      showPoints: 'always',
      styling: { lineColor: RED, fillColor: RED, pointColor: RED },
    },
    { defaults: THRESHOLDS }
  ),
  continuous: panel('continuous scheme', { lineWidth: 3 }, { defaults: { color: { mode: 'continuous-GrYlRd' } } }),
  continuousStyled: panel(
    'continuous scheme, line red',
    { lineWidth: 3, styling: { lineColor: RED } },
    { defaults: { color: { mode: 'continuous-GrYlRd' } } }
  ),
  // colours by series (classic palette) with the Scheme gradient: Grafana draws the line and the fill from the scheme
  scheme: panel('scheme', { lineWidth: 3, fillOpacity: 30, gradientMode: 'scheme' }),
  schemeStyled: panel('scheme, line and fill red', {
    lineWidth: 3,
    fillOpacity: 30,
    gradientMode: 'scheme',
    styling: { lineColor: RED, fillColor: RED },
  }),
  // a fillBelowTo band at Fill opacity 0 (core fills it at 35)
  band: panel(
    'fillBelowTo band, fill blue',
    { lineWidth: 1 },
    {
      targets: THREE_SERIES,
      overrides: [
        {
          matcher: { id: 'byName', options: 's3' },
          properties: [
            { id: 'custom.fillBelowTo', value: 's1' },
            { id: 'custom.styling.fillColor', value: BLUE },
          ],
        },
      ],
    }
  ),
  // the axis in the series colour follows the line colour
  axisSeries: panel('axis colour series, line stronger', { lineWidth: 3, axisColorMode: 'series', styling: STRONGER }),
  picker: panel('legend picker, line stronger', { lineWidth: 3, styling: STRONGER }),
  override: panel(
    'three series, s2 red by override',
    { lineWidth: 3 },
    {
      targets: THREE_SERIES,
      overrides: [
        { matcher: { id: 'byName', options: 's2' }, properties: [{ id: 'custom.styling.lineColor', value: RED }] },
      ],
    }
  ),
  editor: panel('editor', { lineWidth: 1, fillOpacity: 0 }),
};
const PANELS = Object.values(P);

// The canvas's colours: opaque ones by hex, translucent ones as "hex@alpha", with their pixel counts; and a hash
const canvasColors = (page: Page, id: number) =>
  panelContent(page, id).evaluate((root) => {
    const canvas = root.querySelector('canvas')!;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const counts: Record<string, number> = {};
    let hash = 0x811c9dc5;
    for (let i = 0; i < data.length; i += 4) {
      for (let k = 0; k < 4; k++) {
        hash = Math.imul(hash ^ data[i + k], 0x01000193);
      }
      if (data[i + 3] === 0) {
        continue;
      }
      const hex = '#' + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
      const key = data[i + 3] === 255 ? hex : `${hex}@${data[i + 3]}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return { counts, hash: hash >>> 0 };
  });

// The opaque colour with the most pixels (the line, for a panel without fill and points)
const mainColor = (counts: Record<string, number>) =>
  Object.entries(counts)
    .filter(([key]) => !key.includes('@'))
    .sort((a, b) => b[1] - a[1])[0][0];

// Pixels of a colour, within ±tolerance per channel (translucent pixels read back with rounding), at an alpha range
const pixels = (counts: Record<string, number>, hex: string, alpha: [number, number] = [255, 255], tolerance = 2) =>
  Object.entries(counts)
    .filter(([key]) => {
      const [rgb, a] = key.split('@');
      const value = a === undefined ? 255 : Number(a);
      return (
        value >= alpha[0] &&
        value <= alpha[1] &&
        [1, 3, 5].every(
          (i) => Math.abs(parseInt(rgb.slice(i, i + 2), 16) - parseInt(hex.slice(i, i + 2), 16)) <= tolerance
        )
      );
    })
    .reduce((sum, [, n]) => sum + n, 0);

const toHex = (rgb: string) =>
  '#' +
  rgb
    .match(/\d+/g)!
    .slice(0, 3)
    .map((v) => Number(v).toString(16).padStart(2, '0'))
    .join('');

// The legend item's swatch colour (VizLegend's series icon), for the series named `name`
const legendSwatch = (page: Page, id: number, name = 'value') =>
  panelContent(page, id)
    .getByTestId(`data-testid VizLegend series ${name}`)
    .evaluate((item) =>
      Array.from(item.querySelectorAll('*'))
        .map((el) => getComputedStyle(el).backgroundColor)
        .filter((bg) => bg !== 'rgba(0, 0, 0, 0)')
    );

const TOOLTIP = '#grafana-portal-container > div[aria-live="polite"]';

test.describe('the colour model', () => {
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

  for (const theme of ['light', 'dark'] as const) {
    test(`draws each option as set, ${theme}`, async ({ page }) => {
      const colors = COLORS[theme];
      await page.goto(`/d/${UID}?orgId=1&theme=${theme}`);
      for (const { id } of PANELS) {
        await drawn(page, id);
      }
      await page.mouse.move(0, 0);
      const c = async (p: DashboardPanel) => (await canvasColors(page, p.id)).counts;

      // Line color: Stronger, instead of the series colour; the legend's and the tooltip's swatches follow
      expect(mainColor(await c(P.plain))).toBe(colors.green);
      expect(mainColor(await c(P.stronger))).toBe(colors.stronger);
      expect((await legendSwatch(page, P.plain.id)).map(toHex)).toEqual([colors.green]);
      expect((await legendSwatch(page, P.stronger.id)).map(toHex)).toEqual([colors.stronger]);
      await panelContent(page, P.stronger.id).scrollIntoViewIfNeeded();
      const box = (await panelContent(page, P.stronger.id).locator('.u-over').boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
      await page.mouse.move(box.x + box.width / 2 + 5, box.y + box.height / 2, { steps: 2 });
      const tooltip = page.locator(TOOLTIP);
      await expect(tooltip).toBeVisible();
      const tooltipSwatches = await tooltip.evaluate((root) =>
        Array.from(root.querySelectorAll('*'))
          .map((el) => getComputedStyle(el).backgroundColor)
          .filter((bg) => bg !== 'rgba(0, 0, 0, 0)')
      );
      expect(tooltipSwatches.map(toHex)).toContain(colors.stronger);
      expect(tooltipSwatches.map(toHex)).not.toContain(colors.green);
      await page.mouse.move(0, 0);

      // Fill color: blue at Fill opacity 50 (alpha 127–128), the line still green
      const fill = await c(P.fill);
      expect(pixels(fill, '#0000ff', [127, 128])).toBeGreaterThan(10_000);
      expect(pixels(fill, colors.green)).toBeGreaterThan(300);
      // with the Opacity gradient: blue from 50 % down to transparent
      const gradient = await c(P.fillGradient);
      expect(pixels(gradient, '#0000ff', [1, 64])).toBeGreaterThan(1000);
      expect(pixels(gradient, '#0000ff', [96, 128])).toBeGreaterThan(1000);
      // Series color under a Stronger line: the fill in the series colour, the line Stronger
      const fillSeries = await c(P.fillSeries);
      expect(pixels(fillSeries, colors.green, [127, 128])).toBeGreaterThan(10_000);
      expect(mainColor(fillSeries)).toBe(colors.stronger);

      // Point color: red points on the green line
      const points = await c(P.points);
      expect(pixels(points, '#ff0000')).toBeGreaterThan(1000);
      expect(pixels(points, colors.green)).toBeGreaterThan(50);

      // Ignored where Grafana draws the colours: colours by value, and the Scheme gradient
      expect((await canvasColors(page, P.thresholdsStyled.id)).hash).toBe(
        (await canvasColors(page, P.thresholds.id)).hash
      );
      expect((await canvasColors(page, P.schemeStyled.id)).hash).toBe((await canvasColors(page, P.scheme.id)).hash);
      expect((await canvasColors(page, P.continuousStyled.id)).hash).toBe(
        (await canvasColors(page, P.continuous.id)).hash
      );

      // A fillBelowTo band at Fill opacity 0: filled blue at 35 % (alpha 89)
      expect(pixels(await c(P.band), '#0000ff', [88, 90])).toBeGreaterThan(5000);

      // The axis colour Series follows the line colour: no pixel in the series colour is left
      const axis = await c(P.axisSeries);
      expect(pixels(axis, colors.stronger)).toBeGreaterThan(1000);
      expect(pixels(axis, colors.green, [1, 255], 0)).toBe(0);

      // By override: only s2 red, s1 and s3 in their palette colours
      const override = await c(P.override);
      expect(pixels(override, '#ff0000')).toBeGreaterThan(300);
      expect(pixels(override, colors.green)).toBeGreaterThan(300);
      expect((await legendSwatch(page, P.override.id, 's2')).map(toHex)).toEqual(['#ff0000']);
      expect((await legendSwatch(page, P.override.id, 's1')).map(toHex)).toEqual([colors.green]);
    });
  }

  test('a colour picked in the legend is drawn as picked, with a Line color set', async ({ page }) => {
    await page.goto(`/d/${UID}?orgId=1&theme=light`);
    await drawn(page, P.picker.id);
    await panelContent(page, P.picker.id).getByRole('button', { name: 'Edit color for value' }).click();
    await page.getByRole('button', { name: 'dark-purple color', exact: true }).click();
    await expect
      .poll(async () => (await savedPanel(page, P.picker.id))?.fieldConfig.overrides)
      .toEqual([
        {
          matcher: { id: 'byName', options: 'value' },
          properties: [
            { id: 'color', value: { mode: 'fixed', fixedColor: 'dark-purple' } },
            { id: 'custom.styling.lineColor', value: { mode: 'fixed', fixedColor: 'dark-purple' } },
          ],
        },
      ]);
    await page.mouse.move(0, 0);
    await expect.poll(async () => mainColor((await canvasColors(page, P.picker.id)).counts)).toBe('#7c2ea3');
    expect((await legendSwatch(page, P.picker.id)).map(toHex)).toEqual(['#7c2ea3']);
  });

  // The Graph styles options, in the editor's order
  const graphStyles = (page: Page) =>
    page
      .locator('[data-testid^="data-testid Graph styles "][data-testid$=" field property editor"]')
      .evaluateAll((els) =>
        els.map((el) =>
          el.getAttribute('data-testid')!.replace('data-testid Graph styles ', '').replace(' field property editor', '')
        )
      );

  test('the editor shows each option right after the core option it refines, where it applies', async ({ page }) => {
    await page.goto(`/d/${UID}?orgId=1&editPanel=${P.editor.id}`);
    await expect(page.getByTestId('data-testid Graph styles Style field property editor')).toBeVisible();
    // a line without fill, points auto: Line color and Point color, no Fill color
    expect(await graphStyles(page)).toEqual([
      'Style',
      'Line interpolation',
      'Line width',
      'Line color',
      'Fill opacity',
      'Gradient mode',
      'Line style',
      'Connect null values',
      'Disconnect values',
      'Show points',
      'Show values',
      'Point size',
      'Point color',
      'Stack series',
    ]);

    // a fill: Fill color right after Gradient mode
    await page.goto(`/d/${UID}?orgId=1&editPanel=${P.fill.id}`);
    await expect(page.getByTestId('data-testid Graph styles Fill color field property editor')).toBeVisible();
    const withFill = await graphStyles(page);
    expect(withFill[withFill.indexOf('Gradient mode') + 1]).toBe('Fill color');

    // the Scheme gradient, picked in the editor: no Line color, no Fill color; Point color stays
    await page
      .getByTestId('data-testid Graph styles Gradient mode field property editor')
      .getByTestId('data-testid radio-button-option scheme')
      .click();
    await expect(page.getByTestId('data-testid Graph styles Fill color field property editor')).toHaveCount(0);
    const scheme = await graphStyles(page);
    expect(scheme).not.toContain('Line color');
    expect(scheme).toContain('Point color');

    // points never: no Point color, as no Point size
    await page
      .getByTestId('data-testid Graph styles Show points field property editor')
      .getByTestId('data-testid radio-button-option never')
      .click();
    await expect(page.getByTestId('data-testid Graph styles Point color field property editor')).toHaveCount(0);
    expect(await graphStyles(page)).not.toContain('Point size');
  });

  test('a set option is saved under custom.styling, a cleared one leaves nothing', async ({ page }) => {
    await page.goto(`/d/${UID}?orgId=1&editPanel=${P.editor.id}`);
    const editor = (name: string) => page.getByTestId(`data-testid Graph styles ${name} field property editor`);
    await expect(editor('Line color')).toBeVisible();
    await expect.poll(async () => (await savedPanel(page, P.editor.id))?.options).toHaveProperty('tooltip');
    const before = (await savedPanel(page, P.editor.id))!;
    expect(before.fieldConfig.defaults.custom ?? {}).not.toHaveProperty('styling');

    // Line color: unset reads "Series color"; pick Stronger, then clear it
    const lineColor = editor('Line color').getByRole('combobox');
    await expect(lineColor).toHaveAttribute('placeholder', 'Series color');
    await lineColor.click();
    await page.getByRole('option', { name: /^Stronger/ }).click();
    await expect
      .poll(async () => (await savedPanel(page, P.editor.id))?.fieldConfig.defaults.custom?.styling)
      .toEqual({ lineColor: { mode: 'shade', shade: 'stronger' } });
    await editor('Line color').getByRole('button', { name: 'Clear value' }).click();
    await expect
      .poll(async () => (await savedPanel(page, P.editor.id))?.fieldConfig.defaults.custom ?? {})
      .not.toHaveProperty('styling');
    expect((await savedPanel(page, P.editor.id))?.fieldConfig).toEqual(before.fieldConfig);

    // Point color: unset reads "Line color"; Series color is offered
    const pointColor = editor('Point color').getByRole('combobox');
    await expect(pointColor).toHaveAttribute('placeholder', 'Line color');
    await pointColor.click();
    await page.getByRole('option', { name: /^Series color/ }).click();
    await expect
      .poll(async () => (await savedPanel(page, P.editor.id))?.fieldConfig.defaults.custom?.styling)
      .toEqual({ pointColor: { mode: 'series' } });
  });

  test('options and overrides survive loading the dashboard', async ({ page }) => {
    await page.goto(`/d/${UID}?orgId=1`);
    for (const p of [P.fillSeries, P.override]) {
      await drawn(page, p.id);
      await expect.poll(async () => (await savedPanel(page, p.id))?.options).toHaveProperty('tooltip');
      const saved = (await savedPanel(page, p.id))!;
      expect(saved.fieldConfig.defaults.custom?.styling).toEqual(
        (p.fieldConfig as { defaults: { custom: { styling?: unknown } } }).defaults.custom.styling
      );
      expect(saved.fieldConfig.overrides).toEqual((p.fieldConfig as { overrides: unknown[] }).overrides);
    }
  });
});
