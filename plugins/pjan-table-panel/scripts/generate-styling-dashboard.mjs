// Generates provisioning/dashboards/styling.json: the cases of tests/styling.spec.ts for Text color and Background
// color (build 1), the pill options and the Pill look (build 2) and Text weight (build 3; custom.styling.*,
// options.styling.look), one row per
// case with three panels of the same width and the same data: core's table ("<case>: core"), Table plus with nothing
// set ("<case>: nothing set") and Table plus with the case's styling ("<case>: set"; the look, if the case has one, in
// its panel options). Run with `node scripts/generate-styling-dashboard.mjs` after changing a case.
//
// As in Atlas, the field defaults keep cell type Auto and the cell types are set by override; the styling is set in
// the field defaults (once for every column), except where a case says otherwise. The data comes from TestData "Raw
// frames" with fixed values: four services with a state mapped to a Grafana colour name (Up green, Degraded yellow,
// Down red, Info blue), and a level with thresholds. The tests look panels up by title, never by id.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../provisioning/dashboards/styling.json');
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };
const END = Date.UTC(2025, 9, 2);
const HOUR = 3_600_000;
const CORE = 'table';
const PLUGIN = 'pjan-table-panel';

const raw = (frames) => ({
  refId: 'A',
  datasource: DS,
  scenarioId: 'raw_frame',
  rawFrameContent: JSON.stringify(frames),
});
const field = (name, type, values, config = {}) => ({ name, type, values, config });

// The services and their state's colour name, as mapped (the spec reads them from here). The raw state equals its
// mapped text: core looks a pill's colour up again from the displayed text (PillCell's getPillColor), so a pill whose
// raw value differs from its mapped text would be gray in core and plugin alike.
export const STATES = [
  { host: 'api', state: 'Up', color: 'green', level: 10 },
  { host: 'web', state: 'Degraded', color: 'yellow', level: 45 },
  { host: 'db', state: 'Down', color: 'red', level: 90 },
  { host: 'queue', state: 'Info', color: 'blue', level: 60 },
];
const STATE_MAPPINGS = [
  {
    type: 'value',
    options: Object.fromEntries(STATES.map((s, index) => [s.state, { color: s.color, index }])),
  },
];
// Level: green below 40, orange from 40, dark-red from 75 (green needs Automatic's help in light, dark-red in dark)
export const LEVEL_STEPS = [
  [null, 'green'],
  [40, 'orange'],
  [75, 'dark-red'],
];
const LEVEL_THRESHOLDS = { mode: 'absolute', steps: LEVEL_STEPS.map(([value, color]) => ({ value, color })) };

const services = (extra = []) => [
  field(
    'host',
    'string',
    STATES.map((s) => s.host)
  ),
  field(
    'state',
    'string',
    STATES.map((s) => s.state),
    { mappings: STATE_MAPPINGS }
  ),
  field(
    'level',
    'number',
    STATES.map((s) => s.level),
    { thresholds: LEVEL_THRESHOLDS }
  ),
  ...extra,
];

// Colours without a name (hex, from Grafana's classic palette and CSS): a and b are nearest Grafana's green and red in
// both stock themes, c (CSS teal) is near no hue (Stat plus's hex case, a separate implementation of the rule)
export const HEX = { a: '#629E51', b: '#890F02', c: '#008080' };
const hexMappings = [
  {
    type: 'value',
    options: Object.fromEntries(Object.entries(HEX).map(([name, color], index) => [name, { color, index }])),
  },
];

// A continuous scheme (Green-Yellow-Red by value) on cpu 0, 25, 50, 75 and 100 with min 0 and max 100: the positions
// 0, 0.25, 0.5, 0.75 and 1
export const SCHEME_VALUES = [0, 25, 50, 75, 100];

const override = (name, properties, scope) => ({
  matcher: { id: 'byName', options: name, ...(scope ? { scope } : {}) },
  properties: Object.entries(properties).map(([id, value]) => ({ id, value })),
});
const cell = (type, extra = {}) => ({ 'custom.cellOptions': { type, ...extra } });
const BASIC = cell('color-background', { mode: 'basic' });
const GRADIENT = cell('color-background', { mode: 'gradient' });
const ROW_BASIC = cell('color-background', { mode: 'basic', applyToRow: true });
const ROW_GRADIENT = cell('color-background', { mode: 'gradient', applyToRow: true });
const PILL = cell('pill');
// Every pill column of the pills frame: Pill by override, as Atlas sets cell types
const ALL_PILLS = ['host', 'state', 'flags', 'power', 'tier'].map((name) => override(name, PILL));
const TEXT = cell('color-text');

// Pills (build 2): a frame with a pill per kind of colour core gives a pill. `state` is mapped (four colour names, as
// above); `flags` has several pills per cell (comma-separated, each mapped); `power` is mapped to blue and to
// `transparent` (core draws a 1 px border on a transparent pill in dark, none in light: Grafana's light `transparent` is
// rgba(255, 255, 255, 0)); `tier` has a fixed colour (purple) and no mappings; `host` (Pill by override) takes core's
// string hash over the classic palette (hex colours without a name).
export const POWER = { On: 'blue', Off: 'transparent' };
const POWER_MAPPINGS = [
  {
    type: 'value',
    options: Object.fromEntries(Object.entries(POWER).map(([v, color], index) => [v, { color, index }])),
  },
];
const FLAGS = ['Up,Info', 'Degraded', 'Down,Up', 'Info,Degraded,Down'];
const POWER_VALUES = ['On', 'Off', 'On', 'Off'];
const pills = () => [
  ...services(),
  field('flags', 'string', FLAGS, { mappings: STATE_MAPPINGS }),
  field('power', 'string', POWER_VALUES, { mappings: POWER_MAPPINGS }),
  field('tier', 'string', ['gold', 'silver', 'gold', 'bronze'], { color: { mode: 'fixed', fixedColor: 'purple' } }),
];

// Wrapped text (Text weight, build 3): Grafana declares Inter at 400 and 500 only, so 600 is drawn from the 500
// face (in Chrome a synthesised bold with the 500 face's advances): at 14 px NOTE is 339.2 px wide at 400 and 342.6 px
// at 500 and 600, at 12 px the eight TAGS pills 479.3 px at 400 and 484.6 px from 500 (with their 12 px padding and 4 px
// gaps; measured in Chrome, job tmp table-plan/build3/probe). The columns are sized so that their content (the width less
// 13 px of padding and border) fits on one line at 400 and not from 500: NOTE in 341 px, TAGS in 482 px.
export const NOTE = 'Degraded service on the primary database cluster';
export const TAGS = 'degraded,primary,replica,backup,archive,standby,cluster,storage';
export const WRAPPED_WIDTHS = { note: 354, msg: 354, tags: 495 };
// r4: only its pills wrap (from 500), so its height comes from the pill measurer alone
const wrappedFrame = () => [
  field('host', 'string', ['r1', 'r2', 'r3', 'r4']),
  field('note', 'string', [NOTE, 'ok', 'Replication lag above the threshold on the standby node', 'ok']),
  field('msg', 'string', [NOTE, 'ok', 'Backups delayed: the archive volume is nearly full again', 'ok']),
  field('tags', 'string', [TAGS, 'primary', 'degraded,backup', TAGS]),
];
const WRAPPED_OVERRIDES = [
  override('note', { ...TEXT, 'custom.width': WRAPPED_WIDTHS.note, 'custom.wrapText': true }),
  override('msg', { ...BASIC, 'custom.width': WRAPPED_WIDTHS.msg, 'custom.wrapText': true }),
  override('tags', { ...PILL, 'custom.width': WRAPPED_WIDTHS.tags, 'custom.wrapText': true }),
];

const AUTOMATIC = { mode: 'automatic' };
const shade = (s) => ({ mode: 'shade', shade: s });
const fixed = (fixedColor) => ({ mode: 'fixed', fixedColor });

/**
 * A case: `kind` says how the spec reads its coloured column(s) (`column`): `fill` (Colored background, basic or
 * gradient), `row` (Apply to entire row: the row's fill and text, and `level`, Colored text on it), `pill`, `text`
 * (Colored text), `nested` (a sub-table), `tooltip` (Tooltip from field). `styling` goes into the field defaults;
 * `overrides` set the cell types (and anything else).
 */
export const CASES = [
  // Text color on Colored background
  {
    title: 'text automatic, background basic',
    kind: 'fill',
    column: 'state',
    overrides: [override('state', BASIC)],
    styling: { textColor: AUTOMATIC },
  },
  {
    title: 'text automatic, background gradient',
    kind: 'fill',
    column: 'state',
    overrides: [override('state', GRADIENT)],
    styling: { textColor: AUTOMATIC },
  },
  {
    title: 'text value, background basic',
    kind: 'fill',
    column: 'state',
    overrides: [override('state', BASIC)],
    styling: { textColor: { mode: 'value' } },
  },
  {
    title: 'text stronger, background gradient',
    kind: 'fill',
    column: 'state',
    overrides: [override('state', GRADIENT)],
    styling: { textColor: shade('stronger') },
  },
  {
    title: 'text fixed, background basic',
    kind: 'fill',
    column: 'state',
    overrides: [override('state', BASIC)],
    styling: { textColor: fixed('purple') },
  },

  // Background color
  {
    title: 'background soft, basic',
    kind: 'fill',
    column: 'state',
    overrides: [override('state', BASIC)],
    styling: { backgroundColor: shade('soft') },
  },
  {
    title: 'background fixed, basic',
    kind: 'fill',
    column: 'state',
    overrides: [override('state', BASIC)],
    styling: { backgroundColor: fixed('purple') },
  },
  {
    title: 'background soft, gradient',
    kind: 'fill',
    column: 'state',
    overrides: [override('state', GRADIENT)],
    styling: { backgroundColor: shade('soft') },
  },
  {
    title: 'background fixed, gradient (ignored)',
    kind: 'fill',
    column: 'state',
    overrides: [override('state', GRADIENT)],
    styling: { backgroundColor: fixed('purple') },
  },
  {
    title: 'background softer, text stronger, basic',
    kind: 'fill',
    column: 'state',
    overrides: [override('state', BASIC)],
    styling: { backgroundColor: shade('softer'), textColor: shade('stronger') },
  },

  // Apply to entire row: the row-colouring field's options colour the row; a Colored text column on it
  {
    title: 'row: text automatic, basic',
    kind: 'row',
    column: 'state',
    overrides: [override('state', ROW_BASIC), override('level', TEXT)],
    styling: { textColor: AUTOMATIC },
  },
  {
    title: 'row: background soft, gradient',
    kind: 'row',
    column: 'state',
    // Background color in the defaults (it fills only the row); Text color only on level, so the row's text is unset:
    // Automatic on the plugin's fill (Stat plus's unset rule)
    overrides: [override('state', ROW_GRADIENT), override('level', { ...TEXT, 'custom.styling.textColor': AUTOMATIC })],
    styling: { backgroundColor: shade('soft') },
  },

  // Pill
  {
    title: 'pill: text automatic',
    kind: 'pill',
    column: 'state',
    overrides: [override('state', PILL)],
    styling: { textColor: AUTOMATIC },
  },
  {
    title: 'pill: text stronger',
    kind: 'pill',
    column: 'state',
    overrides: [override('state', PILL)],
    styling: { textColor: shade('stronger') },
  },
  {
    title: 'pill, string hash: text stronger',
    kind: 'pill',
    column: 'host',
    overrides: [override('host', PILL)],
    styling: { textColor: shade('stronger') },
  },

  // Colored text
  {
    title: 'colored text: text automatic',
    kind: 'text',
    column: 'level',
    overrides: [override('level', TEXT)],
    styling: { textColor: AUTOMATIC },
  },
  {
    title: 'colored text: text stronger',
    kind: 'text',
    column: 'level',
    overrides: [override('level', TEXT)],
    styling: { textColor: shade('stronger') },
  },
  {
    title: 'colored text, transparent panel: text automatic',
    kind: 'text',
    column: 'level',
    overrides: [override('level', TEXT)],
    styling: { textColor: AUTOMATIC },
    transparent: true,
  },

  // Colours without a name
  {
    title: 'hex colours: background softer, text stronger',
    kind: 'fill',
    column: 'hex',
    frames: [
      [field('host', 'string', Object.keys(HEX)), field('hex', 'string', Object.keys(HEX), { mappings: hexMappings })],
    ],
    overrides: [override('hex', BASIC)],
    styling: { backgroundColor: shade('softer'), textColor: shade('stronger') },
  },

  // A continuous colour scheme
  ...[
    ['scheme: background soft, basic', BASIC, { backgroundColor: shade('soft') }, 'fill'],
    ['scheme: background soft, gradient', GRADIENT, { backgroundColor: shade('soft') }, 'fill'],
    ['scheme: text stronger, colored text', TEXT, { textColor: shade('stronger') }, 'text'],
  ].map(([title, cellType, styling, kind]) => ({
    title,
    kind,
    column: 'cpu',
    scheme: true,
    frames: [
      [
        field(
          'host',
          'string',
          SCHEME_VALUES.map((v) => `cpu ${v}`)
        ),
        field('cpu', 'number', SCHEME_VALUES, { min: 0, max: 100, color: { mode: 'continuous-GrYlRd' } }),
      ],
    ],
    overrides: [override('cpu', cellType)],
    styling,
    h: 8,
  })),

  // A nested table (Atlas Containers' shape): the sub-tables' columns styled by nested-scope overrides
  {
    title: 'nested table: background soft and text automatic in the sub-tables',
    kind: 'nested',
    column: 'state',
    frames: [
      [
        field('stack', 'string', ['web', 'web', 'db', 'db']),
        field(
          'host',
          'string',
          STATES.map((s) => s.host)
        ),
        field(
          'state',
          'string',
          STATES.map((s) => s.state),
          { mappings: STATE_MAPPINGS }
        ),
        field(
          'level',
          'number',
          STATES.map((s) => s.level),
          { thresholds: LEVEL_THRESHOLDS }
        ),
      ],
    ],
    transformations: [
      {
        id: 'groupToNestedTable',
        options: {
          expandAllRows: true,
          fields: { stack: { aggregations: [], operation: 'groupby' } },
        },
      },
    ],
    overrides: [override('state', BASIC, 'nested'), override('level', TEXT, 'nested')],
    styling: { backgroundColor: shade('soft'), textColor: AUTOMATIC },
    h: 13,
  },

  // Pill options (build 2), each on its own, then combined; set once in the field defaults, so every pill column of the
  // frame (mapped, several per cell, transparent, fixed, string hash) changes and nothing else does
  ...[
    ['pill options: fill softer', { fillColor: shade('softer') }],
    ['pill options: fill fixed', { fillColor: fixed('purple') }],
    ['pill options: line color base', { lineColor: shade('base') }],
    ['pill options: line color fixed, width 3', { lineColor: fixed('blue'), lineWidth: 3 }],
    ['pill options: line width 2 alone', { lineWidth: 2 }],
    ['pill options: corner radius 2', { cornerRadius: 2 }],
    [
      'pill options: the CONVENTIONS pill (softer, base line, radius 4, text automatic)',
      { fillColor: shade('softer'), lineColor: shade('base'), cornerRadius: 4, textColor: AUTOMATIC },
    ],
  ].map(([title, styling]) => ({
    title,
    kind: 'pill',
    column: 'state',
    frames: [pills()],
    wide: true,
    overrides: ALL_PILLS,
    styling,
  })),

  // The Pill look (panel option): alone, with options of the column's own, on a transparent panel, on a coloured row
  {
    title: 'pill look',
    kind: 'pill',
    column: 'state',
    frames: [pills()],
    wide: true,
    overrides: ALL_PILLS,
    styling: {},
    look: 'pill',
  },
  {
    title: 'pill look, with radius 4 and a column’s own fill and line width',
    kind: 'pill',
    column: 'state',
    frames: [pills()],
    wide: true,
    overrides: [
      ...ALL_PILLS.filter((o) => o.matcher.options !== 'state'),
      override('state', { ...PILL, 'custom.styling.fillColor': fixed('purple'), 'custom.styling.lineWidth': 2 }),
    ],
    styling: { cornerRadius: 4 },
    look: 'pill',
  },
  {
    title: 'pill look, transparent panel',
    kind: 'pill',
    column: 'state',
    frames: [pills()],
    wide: true,
    overrides: ALL_PILLS,
    styling: {},
    look: 'pill',
    transparent: true,
  },
  {
    title: 'pill look, pills on a row colored by apply to entire row',
    kind: 'pill',
    column: 'state',
    frames: [pills()],
    wide: true,
    overrides: [...ALL_PILLS, override('level', ROW_BASIC)],
    styling: {},
    look: 'pill',
  },
  {
    title: 'pill look, text stronger, on a gradient row',
    kind: 'pill',
    column: 'state',
    frames: [pills()],
    wide: true,
    overrides: [...ALL_PILLS, override('level', ROW_GRADIENT)],
    styling: { textColor: shade('stronger') },
    look: 'pill',
  },

  // Tooltip from field: the host's tooltip shows its level as Colored text
  {
    title: 'tooltip from field: colored text automatic',
    kind: 'tooltip',
    column: 'level',
    overrides: [
      override('host', { 'custom.tooltip.field': 'level', 'custom.tooltip.placement': 'right' }),
      override('level', TEXT),
    ],
    styling: { textColor: AUTOMATIC },
    transparent: true,
  },

  // Pills in nested sub-tables (nested-scope overrides) and in Tooltip from field, with the look
  {
    title: 'pill look, nested table',
    kind: 'nested',
    column: 'state',
    frames: [
      [
        field('stack', 'string', ['web', 'web', 'db', 'db']),
        ...services(),
        field('power', 'string', POWER_VALUES, { mappings: POWER_MAPPINGS }),
      ],
    ],
    transformations: [
      {
        id: 'groupToNestedTable',
        options: {
          expandAllRows: true,
          fields: { stack: { aggregations: [], operation: 'groupby' } },
        },
      },
    ],
    overrides: [override('state', PILL, 'nested'), override('power', PILL, 'nested')],
    styling: {},
    look: 'pill',
    wide: true,
    h: 13,
  },
  {
    title: 'pill look, tooltip from field',
    kind: 'tooltip',
    column: 'state',
    overrides: [
      override('host', { 'custom.tooltip.field': 'state', 'custom.tooltip.placement': 'right' }),
      override('state', PILL),
    ],
    styling: {},
    look: 'pill',
  },

  // Text weight (build 3), set once in the field defaults unless a case says otherwise: on each cell type it applies
  // to, with Automatic text (the same colours as at 400: 14 and 12 px are never large text), with the Pill look, on a
  // row colored by Apply to entire row, in nested sub-tables and in Tooltip from field
  {
    title: 'text weight 600, colored text',
    kind: 'text',
    column: 'level',
    overrides: [override('level', TEXT)],
    styling: { textWeight: 600 },
  },
  {
    title: 'text weight 600, text automatic, background basic',
    kind: 'fill',
    column: 'state',
    overrides: [override('state', BASIC)],
    styling: { textWeight: 600, textColor: AUTOMATIC },
  },
  {
    title: 'text weight 500, background gradient',
    kind: 'fill',
    column: 'state',
    overrides: [override('state', GRADIENT)],
    styling: { textWeight: 500 },
  },
  {
    title: 'text weight 600, pills',
    kind: 'pill',
    column: 'state',
    frames: [pills()],
    wide: true,
    overrides: ALL_PILLS,
    styling: { textWeight: 600 },
  },
  {
    title: 'text weight 500, pill look',
    kind: 'pill',
    column: 'state',
    frames: [pills()],
    wide: true,
    overrides: ALL_PILLS,
    styling: { textWeight: 500 },
    look: 'pill',
  },
  {
    title: 'text weight on a row colored by apply to entire row: 600 on the row field, 500 on colored text',
    kind: 'row',
    column: 'state',
    overrides: [
      override('state', { ...ROW_BASIC, 'custom.styling.textWeight': 600 }),
      override('level', { ...TEXT, 'custom.styling.textWeight': 500 }),
    ],
    styling: {},
  },
  {
    title: 'nested table: text weight 600 in the sub-tables',
    kind: 'nested',
    column: 'state',
    frames: [[field('stack', 'string', ['web', 'web', 'db', 'db']), ...services()]],
    transformations: [
      {
        id: 'groupToNestedTable',
        options: {
          expandAllRows: true,
          fields: { stack: { aggregations: [], operation: 'groupby' } },
        },
      },
    ],
    overrides: [override('state', BASIC, 'nested'), override('level', TEXT, 'nested')],
    styling: { textWeight: 600 },
    h: 13,
  },
  {
    title: 'tooltip from field: text weight 600',
    kind: 'tooltip',
    column: 'level',
    overrides: [
      override('host', { 'custom.tooltip.field': 'level', 'custom.tooltip.placement': 'right' }),
      override('level', TEXT),
    ],
    styling: { textWeight: 600 },
  },
  // Wrapped text at each weight: Colored text, Colored background and Pill columns sized so that the first row fits one
  // line at 400 and needs two from 500 (above)
  ...[400, 500, 600].map((textWeight) => ({
    title: `wrapped text, text weight ${textWeight}`,
    kind: 'wrapped',
    column: 'note',
    frames: [wrappedFrame()],
    wide: true,
    overrides: WRAPPED_OVERRIDES,
    styling: { textWeight },
    h: 10,
  })),
  // A saved weight that isn't one of the three (700: not offered, Grafana draws it as 600) draws as core
  {
    title: 'text weight 700 saved (not offered): as core',
    kind: 'text',
    column: 'level',
    overrides: [override('level', TEXT)],
    styling: { textWeight: 700 },
  },
  // Content-aware column widths (the table.autoColumnWidths flag, tests/styling.spec.ts): two weighted Colored text
  // columns with NOTE in a panel too narrow for their content, so each column keeps its content width
  {
    title: 'content widths, text weight 600',
    kind: 'text',
    column: 'note',
    frames: [
      [
        field('host', 'string', ['r1', 'r2']),
        field('note', 'string', [NOTE, 'ok']),
        field('msg', 'string', [NOTE, 'ok']),
      ],
    ],
    overrides: [override('note', TEXT), override('msg', TEXT)],
    styling: { textWeight: 600 },
  },

  // An override styles only its column: Text color Automatic in the defaults, Fixed on level
  {
    title: 'override on one column',
    kind: 'text',
    column: 'level',
    overrides: [override('state', TEXT), override('level', { ...TEXT, 'custom.styling.textColor': fixed('purple') })],
    styling: { textColor: AUTOMATIC },
  },
];

const titles = CASES.map((c) => c.title);
if (new Set(titles).size !== titles.length) {
  throw new Error('styling cases: titles must be unique');
}

// One row per case: core, nothing set, set; each 8 columns wide. A wide case (the pills frame's six columns) has the three
// panels one above the other, each the dashboard's full width.
const panels = [];
let y = 0;
CASES.forEach((c, i) => {
  const h = c.h ?? 7;
  const frames = (c.frames ?? [services()]).map((fields) => ({ fields }));
  [
    [CORE, 'core', false],
    [PLUGIN, 'nothing set', false],
    [PLUGIN, 'set', true],
  ].forEach(([type, which, styled], k) => {
    panels.push({
      id: (i + 1) * 10 + k,
      type,
      title: `${c.title}: ${which}`,
      datasource: DS,
      targets: [raw(frames)],
      ...(c.transformations ? { transformations: c.transformations } : {}),
      ...(c.transparent ? { transparent: true } : {}),
      gridPos: c.wide ? { x: 0, y: y + k * h, w: 24, h } : { x: k * 8, y, w: 8, h },
      fieldConfig: {
        // A minimum column width of 70 (as Atlas sets), so every column fits a third of the dashboard's width
        defaults: {
          custom: { minWidth: 70, ...(styled && Object.keys(c.styling).length > 0 ? { styling: c.styling } : {}) },
        },
        overrides: styled
          ? c.overrides
          : c.overrides.map((o) => ({
              ...o,
              properties: o.properties.filter((p) => !p.id.startsWith('custom.styling.')),
            })),
      },
      options: { cellHeight: 'sm', showHeader: true, ...(styled && c.look ? { styling: { look: c.look } } : {}) },
    });
  });
  y += c.wide ? 3 * h : h;
});

const dashboard = {
  uid: 'pjan-table-styling',
  title: 'Table plus styling (Text color, Background color, pill options and Look, Text weight)',
  tags: ['pjan-table-panel'],
  editable: true,
  schemaVersion: 42,
  timezone: 'utc',
  time: { from: new Date(END - 48 * HOUR).toISOString(), to: new Date(END).toISOString() },
  panels,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const json = await prettier.format(JSON.stringify(dashboard), {
    ...(await prettier.resolveConfig(OUT)),
    filepath: OUT,
  });
  fs.writeFileSync(OUT, json);
  console.log(`${OUT}: ${CASES.length} cases, ${panels.length} panels`);
}
