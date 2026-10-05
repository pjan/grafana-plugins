// Generates provisioning/dashboards/parity.json and parity-swapped.json: one pair of panels per parity case, the core
// table panel with this plugin right below it, in the same column and with the same width (so both land on the same
// sub-pixel x offset), the same query, transformations, field config and options. parity-swapped.json is the same
// dashboard with core and plugin swapped, so tests/parity.spec.ts can compare each panel with the panel at the same
// position on the other dashboard. Run with `node scripts/generate-parity-dashboard.mjs` after changing a case.
//
// Every case has a unique title; the tests look panels up by title and type, never by id. The data comes from TestData
// "Raw frames" (frames with typed fields, field config and meta, fixed values), with fixed UTC times: nothing depends
// on "now" (no relative times, no time-relative units such as dateTimeFromNow or dateTimeAsLocalNoDateIfToday), as the
// two panels render at different moments. The dashboard time range is fixed too (ISO strings).
//
// A case may ask the test to do something before it captures (`prepare`): scroll the grid to its bottom.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../provisioning/dashboards');
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };
const END = Date.UTC(2025, 9, 2); // 2025-10-02T00:00:00Z
const HOUR = 3_600_000;
const CORE = 'table';
const PLUGIN = 'pjan-table-panel';

// --- Data -------------------------------------------------------------------------------------------------------

/** A TestData "Raw frames" query: each frame is a DataFrame DTO ({ name, fields: [{ name, type, values, config }], meta }). */
const raw = (frames, refId = 'A') => ({
  refId,
  datasource: DS,
  scenarioId: 'raw_frame',
  rawFrameContent: JSON.stringify(frames),
});
const field = (name, type, values, config = {}) => ({ name, type, values, config });
const frame = (fields, extra = {}) => ({ fields, ...extra });

const SERVICES = ['api', 'auth', 'billing', 'search', 'web'];
const HOSTS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
const n = (count) => Array.from({ length: count }, (_, i) => i);
// Deterministic values: a few waves, different per column
const wave = (i, k = 0) => Math.round((50 + 45 * Math.sin((i + k * 3) / 2)) * 10) / 10;
const times = (count, step = HOUR) => n(count).map((i) => END - (count - i) * step);

/** Hosts with a status, a number, a time and a boolean: the basic frame most cases use. */
const hosts = (count = 8, extraFields = [], hostConfig = {}) =>
  frame([
    field(
      'host',
      'string',
      n(count).map((i) => HOSTS[i % HOSTS.length] + (i >= HOSTS.length ? `-${Math.floor(i / HOSTS.length)}` : '')),
      hostConfig
    ),
    field(
      'status',
      'string',
      n(count).map((i) => ['up', 'degraded', 'down', 'up', 'maintenance'][i % 5])
    ),
    field(
      'cpu',
      'number',
      n(count).map((i) => wave(i)),
      { unit: 'percent' }
    ),
    field('started', 'time', times(count)),
    field(
      'healthy',
      'boolean',
      n(count).map((i) => i % 3 !== 2)
    ),
    ...extraFields,
  ]);

/** A frame of `columns` number columns (and a name column first), `rows` rows; `scale` makes the numbers longer. */
const wide = (columns, rows, scale = 1) =>
  frame([
    field(
      'name',
      'string',
      n(rows).map((i) => `row ${i + 1}`)
    ),
    ...n(columns).map((c) =>
      field(
        `metric ${c + 1}`,
        'number',
        n(rows).map((i) => Math.round(wave(i, c) * scale * 10) / 10)
      )
    ),
  ]);

/** One row per service, with its trend as a frame per row (a time and a number field), for sparkline cells. */
const trends = (names, points = 24) =>
  frame([
    field('service', 'string', names),
    field(
      'trend',
      'frame',
      names.map((_, s) => ({
        fields: [
          field('time', 'time', times(points)),
          field(
            'value',
            'number',
            n(points).map((i) => wave(i, s))
          ),
        ],
        length: points,
      }))
    ),
    field(
      'last',
      'number',
      names.map((_, s) => wave(points - 1, s))
    ),
  ]);

/** The same trends as number arrays (an `other` field), the other value shape sparkline cells take. */
const trendArrays = (names, points = 24) =>
  frame([
    field('service', 'string', names),
    field(
      'trend',
      'other',
      names.map((_, s) => n(points).map((i) => wave(i, s)))
    ),
  ]);

const thresholds = (steps) => ({ mode: 'absolute', steps: steps.map(([value, color]) => ({ value, color })) });
const TRAFFIC = thresholds([
  [null, 'green'],
  [40, 'orange'],
  [75, 'red'],
]);
const overrideByName = (name, properties) => ({
  matcher: { id: 'byName', options: name },
  properties: Object.entries(properties).map(([id, value]) => ({ id, value })),
});
const cellType = (type, extra = {}) => ({ cellOptions: { type, ...extra } });
const link = (title) => ({
  title,
  url: `https://example.com/${title.toLowerCase().replace(/\s/g, '-')}?host=\${__data.fields.host}`,
});

// A 16 x 16 SVG square as a data: URI (no network)
const svgSquare = (color) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="${color}"/></svg>`
  )}`;

const STATUS_MAPPINGS = [
  {
    type: 'value',
    options: {
      up: { text: 'Up', color: 'green', index: 0 },
      degraded: { text: 'Degraded', color: 'yellow', index: 1 },
      down: { text: 'Down', color: 'red', index: 2 },
      maintenance: { text: 'Maintenance', color: 'blue', index: 3 },
    },
  },
];

// --- Cases ------------------------------------------------------------------------------------------------------

const cases = [
  // 1. Defaults
  { title: 'defaults: string, status, number, time and boolean', targets: [raw([hosts()])] },
  { title: 'defaults: wider than the panel (horizontal scroll)', targets: [raw([wide(14, 8, 1000)])], w: 8, h: 5 },
  { title: 'defaults: 200 rows (virtualised)', targets: [raw([wide(4, 200)])], h: 8 },
  {
    title: 'defaults: 200 rows, scrolled to the bottom',
    targets: [raw([wide(4, 200)])],
    h: 8,
    prepare: 'scroll-bottom',
  },

  // 2. Cell types
  {
    title: 'cell type colored text',
    targets: [raw([hosts()])],
    fieldConfig: { defaults: { thresholds: TRAFFIC, custom: cellType('color-text') }, overrides: [] },
  },
  {
    title: 'cell type colored background, basic',
    targets: [raw([hosts()])],
    fieldConfig: {
      defaults: { thresholds: TRAFFIC, custom: cellType('color-background', { mode: 'basic' }) },
      overrides: [],
    },
  },
  {
    title: 'cell type colored background, gradient',
    targets: [raw([hosts()])],
    fieldConfig: {
      defaults: { thresholds: TRAFFIC, custom: cellType('color-background', { mode: 'gradient' }) },
      overrides: [],
    },
  },
  {
    title: 'cell type colored background, basic, applied to the entire row',
    targets: [raw([hosts()])],
    fieldConfig: {
      defaults: { thresholds: TRAFFIC },
      overrides: [
        overrideByName('cpu', { 'custom.cellOptions': { type: 'color-background', mode: 'basic', applyToRow: true } }),
      ],
    },
  },
  {
    title: 'cell type colored background, gradient, applied to the entire row',
    targets: [raw([hosts()])],
    fieldConfig: {
      defaults: { thresholds: TRAFFIC },
      overrides: [
        overrideByName('cpu', {
          'custom.cellOptions': { type: 'color-background', mode: 'gradient', applyToRow: true },
        }),
      ],
    },
  },
  {
    title: 'data links: one link, two links, and the data links cell type',
    targets: [
      raw([
        frame([
          field('host', 'string', HOSTS.slice(0, 6)),
          field(
            'one link',
            'string',
            HOSTS.slice(0, 6).map((h) => `${h} home`),
            { links: [link('Details')] }
          ),
          field(
            'two links',
            'string',
            HOSTS.slice(0, 6).map((h) => `${h} menu`),
            {
              links: [link('Details'), link('Runbook')],
            }
          ),
          field('links cell', 'string', HOSTS.slice(0, 6), {
            links: [link('Details'), link('Runbook')],
            custom: cellType('data-links'),
          }),
        ]),
      ]),
    ],
  },
  ...['basic', 'gradient', 'lcd'].map((mode) => ({
    title: `cell type gauge, ${mode}, value displayed as colour, text and hidden`,
    targets: [
      raw([
        frame([
          field('host', 'string', HOSTS.slice(0, 6)),
          ...['color', 'text', 'hidden'].map((valueDisplayMode) =>
            field(
              `cpu ${valueDisplayMode}`,
              'number',
              n(6).map((i) => wave(i, valueDisplayMode.length)),
              { unit: 'percent', min: 0, max: 100, custom: cellType('gauge', { mode, valueDisplayMode }) }
            )
          ),
        ]),
      ]),
    ],
    fieldConfig: { defaults: { thresholds: TRAFFIC }, overrides: [] },
  })),
  ...[
    ['line', { drawStyle: 'line' }],
    ['bars, value hidden', { drawStyle: 'bars', hideValue: true }],
    ['points', { drawStyle: 'points', pointSize: 4 }],
  ].map(([name, options]) => ({
    title: `cell type sparkline, ${name}`,
    targets: [raw([trends(SERVICES)])],
    fieldConfig: {
      defaults: { thresholds: TRAFFIC },
      overrides: [overrideByName('trend', { 'custom.cellOptions': { type: 'sparkline', ...options } })],
    },
  })),
  {
    title: 'cell type sparkline, number arrays',
    targets: [raw([trendArrays(SERVICES)])],
    fieldConfig: {
      defaults: {},
      overrides: [
        overrideByName('trend', { 'custom.cellOptions': { type: 'sparkline', lineWidth: 2, fillOpacity: 0 } }),
      ],
    },
  },
  {
    title: 'cell type JSON view',
    targets: [
      raw([
        frame([
          field('host', 'string', HOSTS.slice(0, 5)),
          field(
            'labels',
            'other',
            n(5).map((i) => ({ zone: `zone-${i % 2}`, replicas: i + 1, tags: ['a', 'b'].slice(0, (i % 2) + 1) }))
          ),
          field(
            'raw',
            'string',
            n(5).map((i) => JSON.stringify({ id: i, ok: i % 2 === 0 }))
          ),
        ]),
      ]),
    ],
    fieldConfig: { defaults: { custom: cellType('json-view') }, overrides: [] },
  },
  {
    title: 'cell type pill, colours from value mappings',
    targets: [raw([hosts()])],
    fieldConfig: {
      defaults: {},
      overrides: [overrideByName('status', { 'custom.cellOptions': { type: 'pill' }, mappings: STATUS_MAPPINGS })],
    },
  },
  {
    title: 'cell type pill, a fixed colour',
    targets: [raw([hosts()])],
    fieldConfig: {
      defaults: {},
      overrides: [
        overrideByName('status', {
          'custom.cellOptions': { type: 'pill' },
          color: { mode: 'fixed', fixedColor: 'purple' },
        }),
      ],
    },
  },
  {
    title: 'cell type pill, colours from the string hash',
    targets: [raw([hosts()])],
    fieldConfig: { defaults: {}, overrides: [overrideByName('status', { 'custom.cellOptions': { type: 'pill' } })] },
  },
  {
    title: 'cell type pill, several values per cell and a transparent mapping',
    targets: [
      raw([
        frame([
          field('host', 'string', HOSTS.slice(0, 6)),
          field('roles', 'string', ['web,api', 'db', 'web, cache, api', '["batch","web"]', '', 'none']),
        ]),
      ]),
    ],
    fieldConfig: {
      defaults: {},
      overrides: [
        overrideByName('roles', {
          'custom.cellOptions': { type: 'pill' },
          mappings: [
            {
              type: 'value',
              options: {
                web: { color: 'blue', index: 0 },
                api: { color: 'green', index: 1 },
                none: { color: 'transparent', index: 2 },
              },
            },
          ],
        }),
      ],
    },
  },
  {
    title: 'cell type markdown and HTML, sanitised',
    targets: [
      raw([
        frame([
          field('host', 'string', HOSTS.slice(0, 4)),
          field('notes', 'string', [
            '**Bold** and _italic_ with `code`',
            '<b>HTML</b> <script>window.injected = true</script><img src="x" onerror="window.injected = true">',
            '[A link](https://example.com/docs) and <span style="color: red">red</span>',
            '- one\n- two',
          ]),
        ]),
      ]),
    ],
    fieldConfig: { defaults: {}, overrides: [overrideByName('notes', { 'custom.cellOptions': { type: 'markdown' } })] },
  },
  {
    title: 'cell type markdown, dynamic height',
    targets: [
      raw([
        frame([
          field('host', 'string', HOSTS.slice(0, 4)),
          field('notes', 'string', [
            '# Heading\n\nA paragraph.',
            'One line',
            '1. first\n2. second\n3. third',
            '> A quote\n\nand text',
          ]),
        ]),
      ]),
    ],
    fieldConfig: {
      defaults: {},
      overrides: [overrideByName('notes', { 'custom.cellOptions': { type: 'markdown', dynamicHeight: true } })],
    },
    h: 9,
  },
  {
    title: 'cell type image from data URIs',
    targets: [
      raw([
        frame([
          field('host', 'string', HOSTS.slice(0, 5)),
          field('icon', 'string', ['#73bf69', '#f2cc0c', '#f2495c', '#5794f2', '#b877d9'].map(svgSquare)),
        ]),
      ]),
    ],
    fieldConfig: {
      defaults: {},
      overrides: [
        overrideByName('icon', { 'custom.cellOptions': { type: 'image', alt: 'Status icon', title: 'Status' } }),
      ],
    },
  },
  {
    title: 'cell type actions',
    targets: [raw([hosts(5)])],
    fieldConfig: {
      defaults: {},
      overrides: [
        overrideByName('host', {
          'custom.cellOptions': { type: 'actions' },
          actions: [
            {
              title: 'Restart',
              type: 'fetch',
              fetch: { method: 'POST', url: 'https://example.com/restart', body: '{}', headers: [], queryParams: [] },
            },
            {
              title: 'Drain',
              type: 'fetch',
              fetch: { method: 'POST', url: 'https://example.com/drain', body: '{}', headers: [], queryParams: [] },
            },
          ],
        }),
      ],
    },
  },
  {
    title: 'cell type geo, points from coordinates (spatial operations)',
    targets: [
      raw([
        frame([
          field('site', 'string', ['Brussels', 'Ghent', 'Antwerp', 'Liège']),
          field('lat', 'number', [50.8503, 51.0543, 51.2194, 50.6326]),
          field('lon', 'number', [4.3517, 3.7174, 4.4025, 5.5797]),
        ]),
      ]),
    ],
    transformations: [
      { id: 'spatial', options: { action: 'prepare', source: { mode: 'coords', latitude: 'lat', longitude: 'lon' } } },
    ],
  },
  {
    title: 'cell type geo, a line through the points (spatial operations)',
    targets: [
      raw([
        frame([
          field('site', 'string', ['Brussels', 'Ghent', 'Antwerp', 'Liège']),
          field('lat', 'number', [50.8503, 51.0543, 51.2194, 50.6326]),
          field('lon', 'number', [4.3517, 3.7174, 4.4025, 5.5797]),
        ]),
      ]),
    ],
    transformations: [
      { id: 'spatial', options: { action: 'prepare', source: { mode: 'coords', latitude: 'lat', longitude: 'lon' } } },
      { id: 'spatial', options: { action: 'modify', modify: { op: 'asLine' } } },
    ],
    w: 8,
    h: 3,
  },

  // 3. Colours
  {
    title: 'colours: thresholds with a text base step (colored text)',
    targets: [raw([hosts()])],
    fieldConfig: {
      defaults: {
        thresholds: thresholds([
          [null, 'text'],
          [60, 'red'],
        ]),
        custom: cellType('color-text'),
      },
      overrides: [],
    },
  },
  {
    title: 'colours: thresholds with a transparent base step (colored background)',
    targets: [raw([hosts()])],
    fieldConfig: {
      defaults: {
        thresholds: thresholds([
          [null, 'transparent'],
          [60, 'red'],
        ]),
        custom: cellType('color-background', { mode: 'basic' }),
      },
      overrides: [],
    },
  },
  {
    title: 'colours: value, range, regex and special mappings with named colours',
    targets: [
      raw([
        frame([
          field('host', 'string', HOSTS.slice(0, 6)),
          field('state', 'string', ['ok', 'warn-1', 'warn-2', 'failed', '', null]),
          field('load', 'number', [5, 35, 65, 95, null, 50]),
        ]),
      ]),
    ],
    fieldConfig: {
      defaults: {
        custom: cellType('color-background', { mode: 'basic' }),
        mappings: [
          { type: 'value', options: { ok: { text: 'OK', color: 'green', index: 0 } } },
          {
            type: 'regex',
            options: { pattern: 'warn-(.*)', result: { text: 'Warning $1', color: 'yellow', index: 1 } },
          },
          { type: 'range', options: { from: 0, to: 50, result: { color: 'blue', index: 2 } } },
          { type: 'range', options: { from: 50, to: 100, result: { color: 'purple', index: 3 } } },
          { type: 'special', options: { match: 'null+nan', result: { text: 'n/a', color: 'gray', index: 4 } } },
          { type: 'special', options: { match: 'empty', result: { text: 'empty', color: 'orange', index: 5 } } },
        ],
      },
      overrides: [],
    },
  },
  {
    title: 'colours: a continuous colour scheme',
    targets: [raw([wide(4, 8)])],
    fieldConfig: {
      defaults: {
        min: 0,
        max: 100,
        color: { mode: 'continuous-GrYlRd' },
        custom: cellType('color-background', { mode: 'basic' }),
      },
      overrides: [],
    },
  },
  {
    title: 'colours: hex colours in mappings and thresholds',
    targets: [raw([hosts()])],
    fieldConfig: {
      defaults: {
        thresholds: thresholds([
          [null, '#2f7d32'],
          [50, '#c4162a'],
        ]),
        custom: cellType('color-text'),
      },
      overrides: [
        overrideByName('status', { mappings: [{ type: 'value', options: { up: { color: '#1f60c4', index: 0 } } }] }),
      ],
    },
  },
  {
    title: 'colours: color mode thresholds in the defaults, gradient cells',
    targets: [raw([hosts()])],
    fieldConfig: {
      defaults: {
        color: { mode: 'thresholds' },
        thresholds: thresholds([
          [null, 'dark-red'],
          [30, 'dark-green'],
        ]),
      },
      overrides: [overrideByName('cpu', { 'custom.cellOptions': { type: 'color-background' } })],
    },
  },

  {
    // tests/handComputed.spec.ts checks these cells against values computed by hand
    title: 'colours: hex fills, basic and gradient (hand-computed values)',
    targets: [
      raw([
        frame([
          field('host', 'string', HOSTS.slice(0, 4)),
          field('basic', 'number', [20, 80, 20, 80], { custom: cellType('color-background', { mode: 'basic' }) }),
          field('gradient', 'number', [20, 80, 20, 80], {
            custom: cellType('color-background', { mode: 'gradient' }),
          }),
        ]),
      ]),
    ],
    fieldConfig: {
      defaults: {
        thresholds: thresholds([
          [null, '#fade2a'],
          [50, '#1f60c4'],
        ]),
      },
      overrides: [],
    },
    w: 8,
    h: 5,
  },

  // 4. Layout
  ...['sm', 'md', 'lg'].map((cellHeight) => ({
    title: `layout: cell height ${cellHeight}`,
    targets: [raw([hosts()])],
    options: { cellHeight },
    w: 8,
  })),
  {
    title: 'layout: wrapped text with a max row height',
    targets: [
      raw([
        frame([
          field('host', 'string', HOSTS.slice(0, 4)),
          field(
            'message',
            'string',
            n(4).map(
              (i) =>
                `Request ${i + 1} failed after ${i + 2} retries because the upstream service did not answer in time; the next attempt is scheduled and the operator has been notified about it.`
            )
          ),
        ]),
      ]),
    ],
    fieldConfig: { defaults: { custom: { wrapText: true } }, overrides: [] },
    options: { maxRowHeight: 60 },
  },
  {
    title: 'layout: wrapped text and wrapped header text',
    targets: [
      raw([
        frame([
          field('a host name column with a long header', 'string', HOSTS.slice(0, 5)),
          field(
            'a message column with a long header that wraps',
            'string',
            n(5).map((i) => `Line ${i + 1} of a message that is long enough to wrap in its column`)
          ),
        ]),
      ]),
    ],
    fieldConfig: { defaults: { custom: { wrapText: true, wrapHeaderText: true, width: 160 } }, overrides: [] },
  },
  {
    title: 'layout: alignment left, center and right',
    targets: [raw([hosts()])],
    fieldConfig: {
      defaults: {},
      overrides: [
        overrideByName('host', { 'custom.align': 'right' }),
        overrideByName('status', { 'custom.align': 'center' }),
        overrideByName('cpu', { 'custom.align': 'left' }),
      ],
    },
  },
  {
    title: 'layout: column width and minimum width',
    targets: [raw([hosts()])],
    fieldConfig: {
      defaults: { custom: { minWidth: 90 } },
      overrides: [overrideByName('host', { 'custom.width': 220 }), overrideByName('status', { 'custom.width': 70 })],
    },
  },
  {
    title: 'layout: a column hidden in the table',
    targets: [raw([hosts()])],
    fieldConfig: { defaults: {}, overrides: [overrideByName('started', { 'custom.hideFrom.viz': true })] },
  },
  { title: 'layout: header hidden', targets: [raw([hosts()])], options: { showHeader: false } },
  { title: 'layout: type icons in the header', targets: [raw([hosts()])], options: { showTypeIcons: true } },
  ...[1, 2].map((left) => ({
    title: `layout: ${left === 1 ? 'one frozen column' : 'two frozen columns'}, horizontal overflow`,
    targets: [raw([wide(12, 8)])],
    options: { frozenColumns: { left } },
    w: 8,
  })),
  {
    title: 'layout: display names with a thin space',
    targets: [raw([hosts()])],
    fieldConfig: {
      defaults: {},
      overrides: [
        overrideByName('cpu', { displayName: 'CPU %' }),
        overrideByName('started', { displayName: ' Started' }),
      ],
    },
  },

  // 5. Footer
  {
    title: 'footer: one reducer for all fields',
    targets: [raw([hosts()])],
    fieldConfig: { defaults: { custom: { footer: { reducers: ['sum'] } } }, overrides: [] },
  },
  {
    title: 'footer: different reducers per field',
    targets: [raw([wide(3, 8)])],
    fieldConfig: {
      defaults: { unit: 'ms' },
      overrides: [
        overrideByName('metric 1', { 'custom.footer.reducers': ['sum'] }),
        overrideByName('metric 2', { 'custom.footer.reducers': ['mean', 'max'] }),
        overrideByName('metric 3', { 'custom.footer.reducers': ['min'] }),
      ],
    },
  },
  {
    title: 'footer: count of all rows',
    targets: [raw([hosts()])],
    fieldConfig: { defaults: { custom: { footer: { reducers: ['countAll'] } } }, overrides: [] },
  },
  {
    title: 'footer: legacy footer options, migrated on load',
    targets: [raw([wide(3, 8)])],
    options: { footer: { show: true, reducer: ['mean'], fields: ['metric 1', 'metric 2'], countRows: false } },
  },

  {
    // tests/handComputed.spec.ts checks the footer against values computed by hand
    title: 'footer: sum and mean of a known column (hand-computed values)',
    targets: [
      raw([
        frame([
          field('host', 'string', HOSTS.slice(0, 4)),
          field('latency', 'number', [10, 20, 30, 41], {
            unit: 'ms',
            custom: { footer: { reducers: ['sum', 'mean'] } },
          }),
        ]),
      ]),
    ],
    w: 8,
    h: 5,
  },

  // 6. Pagination
  {
    title: 'pagination: page size from the panel height, several pages',
    targets: [raw([wide(3, 60)])],
    options: { enablePagination: true },
    h: 8,
  },

  // 7. Tooltip from field, styling from field
  {
    title: 'tooltip from field, each placement',
    targets: [
      raw([
        frame([
          ...['auto', 'top', 'right', 'bottom', 'left'].map((placement) =>
            field(placement, 'string', HOSTS.slice(0, 5))
          ),
          field(
            'details',
            'string',
            n(5).map((i) => `Details of host ${i + 1}`)
          ),
        ]),
      ]),
    ],
    fieldConfig: {
      defaults: {},
      overrides: ['auto', 'top', 'right', 'bottom', 'left'].map((placement) =>
        overrideByName(placement, { 'custom.tooltip.field': 'details', 'custom.tooltip.placement': placement })
      ),
    },
  },
  {
    title: 'styling from field (CSS in a JSON field)',
    targets: [
      raw([
        frame([
          field('host', 'string', HOSTS.slice(0, 5)),
          field(
            'cpu',
            'number',
            n(5).map((i) => wave(i))
          ),
          field('style', 'string', [
            '{"fontWeight":"bold"}',
            '{"color":"#5794f2","textDecoration":"underline"}',
            '{"background":"#fade2a33"}',
            '{"fontStyle":"italic","letterSpacing":"2px"}',
            '',
          ]),
        ]),
      ]),
    ],
    fieldConfig: {
      defaults: { custom: { styleField: 'style' } },
      overrides: [overrideByName('style', { 'custom.hideFrom.viz': true })],
    },
  },

  // 8, 9. Cell value inspect, column filter
  {
    title: 'cell value inspect on',
    targets: [raw([hosts()])],
    fieldConfig: { defaults: { custom: { inspect: true } }, overrides: [] },
  },
  {
    title: 'column filter on',
    // and the host field filterable, as data sources mark fields (the cell's "Filter for value" buttons)
    targets: [raw([hosts(8, [], { filterable: true })])],
    fieldConfig: { defaults: { custom: { filterable: true } }, overrides: [] },
  },

  // 10. Nested frames
  ...[false, true].map((expandAllRows) => ({
    title: `nested frames, ${expandAllRows ? 'every row expanded' : 'collapsed'}, with nested-scope overrides`,
    targets: [
      raw([
        frame([
          field('stack', 'string', ['web', 'web', 'web', 'db', 'db', 'cache']),
          field('container', 'string', ['nginx', 'app', 'worker', 'postgres', 'backup', 'redis']),
          field('cpu', 'number', [12.5, 48, 7.25, 63, 1.5, 22], { unit: 'percent' }),
          field('state', 'string', ['up', 'up', 'down', 'up', 'degraded', 'up']),
        ]),
      ]),
    ],
    transformations: [
      {
        id: 'groupToNestedTable',
        options: {
          expandAllRows,
          fields: {
            stack: { aggregations: [], operation: 'groupby' },
            cpu: { aggregations: ['max'], operation: 'aggregate', keepNestedField: true },
          },
        },
      },
    ],
    fieldConfig: {
      defaults: { thresholds: TRAFFIC },
      overrides: [
        {
          matcher: { id: 'byName', options: 'state', scope: 'nested' },
          properties: [
            { id: 'custom.cellOptions', value: { type: 'pill' } },
            { id: 'mappings', value: STATUS_MAPPINGS },
          ],
        },
        {
          matcher: { id: 'byName', options: 'cpu', scope: 'nested' },
          properties: [
            { id: 'custom.cellOptions', value: { type: 'gauge', mode: 'basic', valueDisplayMode: 'text' } },
            { id: 'custom.width', value: 160 },
          ],
        },
      ],
    },
    h: expandAllRows ? 9 : 4,
  })),
  {
    title: 'nested frames from parentRowIndex frames (migrated in the panel)',
    targets: [
      raw([
        frame([field('stack', 'string', ['web', 'db']), field('containers', 'number', [2, 1])], { name: 'stacks' }),
        frame([field('container', 'string', ['nginx', 'app']), field('cpu', 'number', [12.5, 48])], {
          meta: { custom: { parentRowIndex: 0 } },
        }),
        frame([field('container', 'string', ['postgres']), field('cpu', 'number', [63])], {
          meta: { custom: { parentRowIndex: 1 } },
        }),
      ]),
    ],
    w: 8,
    h: 3,
  },

  // 11. Several frames
  ...[0, 1].map((frameIndex) => ({
    title: `several frames, frame ${frameIndex + 1} shown (the frame picker)`,
    targets: [
      raw([
        frame([field('host', 'string', HOSTS.slice(0, 4)), field('cpu', 'number', [10, 20, 30, 40])], {
          name: 'first',
        }),
        frame([field('service', 'string', ['api', 'web', 'db']), field('errors', 'number', [3, 0, 7])], {
          name: 'second',
        }),
      ]),
    ],
    options: { frameIndex },
  })),

  // 12. Sorting
  {
    title: 'sorting: a string column, ascending',
    targets: [raw([hosts()])],
    options: { sortBy: [{ displayName: 'status', desc: false }] },
  },
  {
    title: 'sorting: a number column, descending',
    targets: [raw([hosts()])],
    options: { sortBy: [{ displayName: 'cpu', desc: true }] },
  },
  {
    title: 'sorting: two columns',
    targets: [raw([hosts()])],
    options: {
      sortBy: [
        { displayName: 'healthy', desc: true },
        { displayName: 'cpu', desc: false },
      ],
    },
  },

  // 13. No values, no rows, no data, data-level field config
  {
    title: 'no value: a field noValue and nulls',
    targets: [
      raw([
        frame([
          field('host', 'string', HOSTS.slice(0, 5)),
          field('cpu', 'number', [10, null, 30, null, 50], { noValue: 'no value' }),
          field('memory', 'number', [null, 2, null, 4, 5]),
        ]),
      ]),
    ],
    h: 5,
  },
  {
    title: 'no rows: a frame without rows',
    targets: [raw([frame([field('host', 'string', []), field('cpu', 'number', [])])])],
    w: 8,
    h: 4,
  },
  { title: 'no data: no frames', targets: [raw([])], w: 3, h: 3 },
  {
    title: 'field config from the data: a column not sortable',
    targets: [
      raw([
        frame([
          field('host', 'string', HOSTS),
          field(
            'cpu',
            'number',
            n(8).map((i) => wave(i)),
            { unit: 'percent', custom: { sortable: false } }
          ),
        ]),
      ]),
    ],
    w: 6,
    h: 5,
  },

  // 14. Transparent panel
  {
    title: 'transparent panel',
    targets: [raw([hosts()])],
    fieldConfig: {
      defaults: { thresholds: TRAFFIC },
      overrides: [overrideByName('cpu', { 'custom.cellOptions': { type: 'color-text' } })],
    },
    transparent: true,
  },

  // 15. Load
  { title: 'load: 20 columns and 2000 rows', targets: [raw([wide(19, 2000)])], w: 24, h: 10 },

  // 16. Panel resize: the same table at two widths
  ...[8, 16].map((w) => ({
    title: `resize: the same table ${w === 8 ? 'narrow' : 'wide'}`,
    targets: [raw([wide(6, 8)])],
    fieldConfig: { defaults: { custom: { minWidth: 60 } }, overrides: [] },
    w,
  })),
];

// --- Layout -----------------------------------------------------------------------------------------------------

// Pack the cases into rows of the 24-column grid; each case is a column of two panels, one above the other.
// `order` is the panel type at the top and at the bottom of each case.
const layout = (order) => {
  const panels = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  cases.forEach((c, i) => {
    const w = c.w ?? 12;
    const h = c.h ?? 7;
    if (x + w > 24) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    order.forEach((type, k) => {
      panels.push({
        id: (i + 1) * 10 + k,
        type,
        title: c.title,
        ...(c.transparent ? { transparent: true } : {}),
        datasource: DS,
        targets: c.targets,
        ...(c.transformations ? { transformations: c.transformations } : {}),
        gridPos: { x, y: y + k * h, w, h },
        fieldConfig: c.fieldConfig ?? { defaults: {}, overrides: [] },
        options: c.options ?? {},
        ...(c.prepare ? { description: `parity: ${c.prepare}` } : {}),
      });
    });
    x += w;
    rowHeight = Math.max(rowHeight, 2 * h);
  });
  return panels;
};

const titles = cases.map((c) => c.title);
if (new Set(titles).size !== titles.length) {
  throw new Error('parity cases: titles must be unique');
}

const dashboards = [
  { uid: 'pjan-table-parity', file: 'parity.json', order: [CORE, PLUGIN], title: 'core above pjan-table-panel' },
  {
    uid: 'pjan-table-parity-swapped',
    file: 'parity-swapped.json',
    order: [PLUGIN, CORE],
    title: 'pjan-table-panel above core',
  },
];

for (const { uid, file, order, title } of dashboards) {
  const dashboard = {
    uid,
    title: `Table parity: ${title}`,
    tags: ['pjan-table-panel'],
    editable: true,
    schemaVersion: 42,
    timezone: 'utc',
    // ISO strings: Grafana does not parse epoch-millisecond strings as an absolute dashboard time range.
    time: { from: new Date(END - 48 * HOUR).toISOString(), to: new Date(END).toISOString() },
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
