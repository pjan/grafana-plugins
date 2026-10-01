// Generates provisioning/dashboards/parity.json: one pair of panels per parity case, the core stat panel with this
// plugin right below it, in the same column and with the same width (so both land on the same sub-pixel x offset), the
// same query, field config and options. tests/parity.spec.ts compares them pixel by pixel. Run with
// `node scripts/generate-parity-dashboard.mjs` after changing a case.
//
// Cases are keyed by panel id (core: (n + 1) * 10, plugin: (n + 1) * 10 + 1), not by title: one case has no title.
// The TestData CSV scenario has no relative time, so every timestamp and the dashboard time range are fixed (UTC):
// the 6 hours before END, which every case fills.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../provisioning/dashboards');
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };
const END = Date.UTC(2025, 9, 2); // 2025-10-02T00:00:00Z
const MIN = 60_000;
const ROWS = 36; // one row every 10 minutes: the 6 hours before END

const csv = (text, refId = 'A') => ({ refId, datasource: DS, scenarioId: 'csv_content', csvContent: text });

// One frame with a time field and `names.length` number fields; gen(i, k) is the value of series i in row k.
const series = (names, gen, count = ROWS) => {
  const lines = ['time,' + names.join(',')];
  for (let k = 0; k < count; k++) {
    const t = END - (count - k) * 10 * MIN + 10 * MIN;
    lines.push(t + ',' + names.map((_, i) => gen(i, k)).join(','));
  }
  return csv(lines.join('\n'));
};
const names = (n) => Array.from({ length: n }, (_, i) => `s${i + 1}`);
// A wave per series, ending at a value that differs per series (so the tiles get different colours and sizes)
const wave = (i, k) => (40 + i * 13 + 30 * Math.sin((k + i * 5) / 4)).toFixed(1);
// A frame with labels on its number fields (TestData raw frames), for display name templates
const labelled = {
  refId: 'A',
  datasource: DS,
  scenarioId: 'raw_frame',
  rawFrameContent: JSON.stringify(
    ['web-1', 'web-2'].map((host) => ({
      schema: {
        fields: [
          { name: 'time', type: 'time' },
          { name: 'requests', type: 'number', labels: { host } },
        ],
      },
      data: {
        values: [
          Array.from({ length: ROWS }, (_, k) => END - (ROWS - 1 - k) * 10 * MIN),
          Array.from({ length: ROWS }, (_, k) => Number(wave(host === 'web-1' ? 0 : 1, k))),
        ],
      },
    }))
  ),
};
const rising = (_i, k) => String(20 + k * 2); // last 90, first 20: +350 %
const falling = (_i, k) => String(90 - k * 2); // last 20, first 90: -77.8 %

const thresholds = (steps, mode = 'absolute') => ({ mode, steps: steps.map(([value, color]) => ({ value, color })) });
const defaults = (extra = {}) => ({ defaults: extra, overrides: [] });
const link = (title) => ({ title, url: `https://example.com/${title.toLowerCase().replace(/\s/g, '-')}` });

const COLOR_MODES = ['none', 'value', 'background', 'background_solid'];
const WAVE_THRESHOLDS = defaults({
  thresholds: thresholds([
    [null, 'green'],
    [50, 'orange'],
    [70, 'red'],
  ]),
});

const cases = [
  { title: 'defaults, one series', targets: [series(['value'], wave)] },

  // Color mode x graph mode
  ...COLOR_MODES.flatMap((colorMode) =>
    ['none', 'area'].map((graphMode) => ({
      title: `color ${colorMode}, graph ${graphMode}`,
      targets: [series(names(2), wave)],
      fieldConfig: WAVE_THRESHOLDS,
      options: { colorMode, graphMode },
    }))
  ),

  // Text modes, wide layout, alignment
  ...['auto', 'value', 'value_and_name', 'name', 'none'].map((textMode) => ({
    title: `text mode ${textMode}`,
    targets: [series(names(2), wave)],
    options: { textMode },
  })),
  {
    title: 'value and name, wide layout off',
    targets: [series(names(2), wave)],
    options: { textMode: 'value_and_name', wideLayout: false },
  },
  { title: 'text alignment center', targets: [series(names(2), wave)], options: { justifyMode: 'center' } },

  // Orientations
  ...[4, 12].flatMap((n) =>
    ['auto', 'horizontal', 'vertical'].map((orientation) => ({
      title: `${n} series, orientation ${orientation}`,
      targets: [series(names(n), wave)],
      fieldConfig: WAVE_THRESHOLDS,
      options: { orientation, colorMode: 'background' },
      h: n === 12 ? 8 : 5,
    }))
  ),
  {
    title: 'all values, limit 5',
    targets: [series(['value'], wave)],
    options: { reduceOptions: { values: true, limit: 5, calcs: [], fields: '' } },
    fieldConfig: WAVE_THRESHOLDS,
  },

  // Percent change
  ...COLOR_MODES.flatMap((colorMode) =>
    [
      ['rising', rising],
      ['falling', falling],
    ].map(([trend, gen]) => ({
      title: `percent change ${trend}, color ${colorMode}`,
      targets: [series(['value'], gen)],
      fieldConfig: WAVE_THRESHOLDS,
      options: { colorMode, showPercentChange: true },
    }))
  ),
  {
    title: 'percent change inverted',
    targets: [series(['value'], rising)],
    options: { showPercentChange: true, percentChangeColorMode: 'inverted' },
  },
  {
    title: 'percent change same as value',
    targets: [series(['value'], falling)],
    fieldConfig: WAVE_THRESHOLDS,
    options: { showPercentChange: true, percentChangeColorMode: 'same_as_value', colorMode: 'value' },
  },
  {
    title: 'percent change, text mode none',
    targets: [series(['value'], rising)],
    options: { showPercentChange: true, textMode: 'none' },
  },

  // Text sizes, mappings, thresholds, special values
  {
    title: 'explicit text sizes',
    targets: [series(names(2), rising)],
    options: { text: { titleSize: 14, valueSize: 40, percentSize: 16 }, showPercentChange: true },
  },
  {
    title: 'status tile: thresholds and mappings to words',
    targets: [series(['api', 'web', 'db'], (i) => String([1, 0, 2][i]))],
    fieldConfig: defaults({
      thresholds: thresholds([
        [null, 'red'],
        [1, 'green'],
        [2, 'orange'],
      ]),
      mappings: [
        {
          type: 'value',
          options: {
            0: { text: 'Down', index: 0 },
            1: { text: 'Up', index: 1 },
            2: { text: 'Degraded', index: 2 },
          },
        },
      ],
    }),
    options: { colorMode: 'background', graphMode: 'none', justifyMode: 'center', textMode: 'value_and_name' },
  },
  {
    title: 'percentage thresholds',
    targets: [series(names(3), wave)],
    fieldConfig: defaults({
      thresholds: thresholds(
        [
          [null, 'green'],
          [40, 'orange'],
          [80, 'red'],
        ],
        'percentage'
      ),
    }),
    options: { colorMode: 'background_solid' },
  },
  {
    title: 'no value',
    targets: [csv('time,value')],
    fieldConfig: defaults({ noValue: 'Nothing here' }),
    options: { colorMode: 'background_solid' },
  },
  {
    title: 'a string value',
    targets: [series(['status'], (_i, k) => (k % 2 ? 'running' : 'stopped'))],
    options: { reduceOptions: { values: false, calcs: ['lastNotNull'], fields: '/.*/' }, colorMode: 'background' },
  },

  // `percent` without min and max: Grafana's single-stat migration (pluginVersion < 8.0) writes min 0 and max 100 in.
  {
    title: 'unit percent, saved without pluginVersion',
    targets: [series(['value'], wave)],
    fieldConfig: defaults({ unit: 'percent' }),
    options: { colorMode: 'background' },
  },
  {
    title: 'unit percent, saved with pluginVersion 13.2.3',
    targets: [series(['value'], wave)],
    fieldConfig: defaults({ unit: 'percent' }),
    options: { colorMode: 'background' },
    pluginVersion: { core: '13.2.3', plugin: '13.2.3' },
  },
  {
    title: "unit percent, saved with each panel's version",
    targets: [series(['value'], wave)],
    fieldConfig: defaults({ unit: 'percent' }),
    options: { colorMode: 'background' },
    pluginVersion: { core: '13.2.3', plugin: '1.0.0' },
  },

  // Data links
  {
    title: 'one data link',
    targets: [series(['value'], wave)],
    fieldConfig: defaults({ links: [link('Details')] }),
  },
  {
    title: 'two data links',
    targets: [series(['value'], wave)],
    fieldConfig: defaults({ links: [link('Details'), link('Runbook')] }),
    options: { colorMode: 'background' },
  },
  {
    title: 'percent change with links',
    targets: [series(names(2), rising)],
    fieldConfig: defaults({ links: [link('Details')] }),
    options: { showPercentChange: true },
  },

  // Text mode Auto: names shown with a display name, or on a panel without a title
  {
    title: 'auto text mode with a display name',
    targets: [series(['value'], wave)],
    fieldConfig: defaults({ displayName: 'Requests' }),
  },
  { title: '', targets: [series(['requests'], wave)] },

  // Field min and max, graph mode line, layouts
  {
    title: 'field min and max set',
    targets: [series(['value'], wave)],
    fieldConfig: defaults({ min: 0, max: 200 }),
  },
  { title: 'graph mode line (saved)', targets: [series(['value'], wave)], options: { graphMode: 'line' } },
  // At the 1280 px wide test viewport a 12-column panel is about 427 px wide; content heights are 38 * h - 42 px.
  {
    title: 'wide: width/height above 2.5',
    targets: [series(['value'], wave)],
    options: { textMode: 'value_and_name' },
    h: 5,
  },
  {
    title: 'stacked: width/height below 2.5',
    targets: [series(['value'], wave)],
    options: { textMode: 'value_and_name' },
    h: 6,
  },
  // Tiles about 40, 80 and 140 px tall (horizontal orientation stacks the tiles), wide (12 columns) and narrow (4)
  ...[
    [3, 5, '40'],
    [2, 6, '80'],
    [1, 5, '140'],
    [1, 2, '26'],
  ].flatMap(([n, h, px]) =>
    [12, 4].map((w) => ({
      title: `tiles ${px} px tall, ${w} columns`,
      targets: [series(names(n), wave)],
      // The background colour mode, so that short, wide tiles are at least 5 % painted (see tests/parity.spec.ts)
      options: {
        textMode: 'value_and_name',
        showPercentChange: true,
        orientation: 'horizontal',
        colorMode: 'background',
      },
      fieldConfig: WAVE_THRESHOLDS,
      h,
      w,
    }))
  ),

  // Colour schemes and overrides
  {
    title: 'continuous color scheme',
    targets: [series(names(4), wave)],
    fieldConfig: defaults({ color: { mode: 'continuous-GrYlRd' }, min: 0, max: 100 }),
    options: { colorMode: 'background' },
  },
  {
    title: 'classic palette',
    targets: [series(names(4), wave)],
    fieldConfig: defaults({ color: { mode: 'palette-classic' } }),
    options: { colorMode: 'value' },
  },
  {
    title: 'override on one series',
    targets: [series(names(3), wave)],
    fieldConfig: {
      defaults: { thresholds: WAVE_THRESHOLDS.defaults.thresholds },
      overrides: [
        {
          matcher: { id: 'byName', options: 's2' },
          properties: [
            { id: 'color', value: { mode: 'fixed', fixedColor: 'purple' } },
            { id: 'unit', value: 'ms' },
            { id: 'decimals', value: 2 },
          ],
        },
      ],
    },
    options: { colorMode: 'background_solid' },
  },

  // Added after the first review (appended, so the ids above stay the same)
  {
    // A tile with two or more links is a button (the links menu), and that branch of BigValue draws no percent change
    title: 'percent change with two links (menu)',
    targets: [series(names(2), rising)],
    fieldConfig: defaults({ links: [link('Details'), link('Runbook')] }),
    options: { showPercentChange: true, colorMode: 'background' },
  },
  {
    title: 'display name template with labels',
    targets: [labelled],
    fieldConfig: defaults({ displayName: '${__field.labels.host}: ${__field.name}' }),
    options: { textMode: 'value_and_name' },
  },
  {
    title: 'nulls in the sparkline data',
    targets: [series(names(2), (i, k) => (k % 7 === 3 || (k > 12 && k < 18 && i === 0) ? '' : wave(i, k)))],
    fieldConfig: WAVE_THRESHOLDS,
    options: { colorMode: 'background' },
  },
  // Grafana's default "No data" (no `noValue` set)
  { title: 'no data', targets: [csv('time,value')], options: { colorMode: 'background_solid' } },
];

const CORE = 'stat';
const PLUGIN = 'pjan-stat-panel';

// Pack the cases into rows of the 24-column grid; each case is a column of two panels, one above the other.
// `order` is the panel type at the top and at the bottom of each case.
const layout = (order) => {
  const panels = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  cases.forEach((c, n) => {
    const w = c.w ?? 12;
    const h = c.h ?? 4;
    if (x + w > 24) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    order.forEach((type, k) => {
      const version = c.pluginVersion?.[type === CORE ? 'core' : 'plugin'];
      panels.push({
        id: (n + 1) * 10 + k,
        type,
        title: c.title,
        datasource: DS,
        targets: c.targets,
        gridPos: { x, y: y + k * h, w, h },
        fieldConfig: c.fieldConfig ?? defaults(),
        options: c.options ?? {},
        ...(version ? { pluginVersion: version } : {}),
      });
    });
    x += w;
    rowHeight = Math.max(rowHeight, 2 * h);
  });
  return panels;
};

// Chrome rasterises the same CSS differently at different places on the page (the panel frame's rounded corners, and
// the dithering of the Background Gradient), so screenshots are compared at the same place: the second dashboard is
// the first with core and plugin swapped, and each panel is compared with the one at its position there.
const dashboards = [
  { uid: 'pjan-stat-parity', file: 'parity.json', order: [CORE, PLUGIN], title: 'core above pjan-stat-panel' },
  {
    uid: 'pjan-stat-parity-swapped',
    file: 'parity-swapped.json',
    order: [PLUGIN, CORE],
    title: 'pjan-stat-panel above core',
  },
];

for (const { uid, file, order, title } of dashboards) {
  const dashboard = {
    uid,
    title: `Stat parity: ${title}`,
    tags: ['pjan-stat-panel'],
    editable: true,
    schemaVersion: 42,
    timezone: 'utc',
    // ISO strings: Grafana does not parse epoch-millisecond strings as an absolute dashboard time range.
    time: { from: new Date(END - ROWS * 10 * MIN).toISOString(), to: new Date(END).toISOString() },
    panels: layout(order),
  };
  const out = path.join(DIR, file);
  // Formatted as `npx prettier --check .` expects
  const json = await prettier.format(JSON.stringify(dashboard), {
    ...(await prettier.resolveConfig(out)),
    filepath: out,
  });
  fs.writeFileSync(out, json);
  console.log(`${out}: ${cases.length} cases, ${dashboard.panels.length} panels`);
}
