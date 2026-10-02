// Generates provisioning/dashboards/styling.json: the cases of tests/styling.spec.ts for Color mode Custom, one panel
// per case (and a core Value mode panel to compare "nothing set" with). Run with
// `node scripts/generate-styling-dashboard.mjs` after changing a case.
//
// Four series with value mappings to words and Grafana colour names (Up green, Degraded yellow, Down red, Info
// dark-blue), each ending in its state; the values before vary, for a sparkline. Fixed UTC times, as in the parity
// dashboard.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../provisioning/dashboards/styling.json');
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };
const END = Date.UTC(2025, 9, 2);
const MIN = 60_000;
const ROWS = 36;

export const STATES = [
  { name: 'api', value: 1, text: 'Up', color: 'green' },
  { name: 'web', value: 2, text: 'Degraded', color: 'yellow' },
  { name: 'db', value: 3, text: 'Down', color: 'red' },
  { name: 'queue', value: 4, text: 'Info', color: 'dark-blue' },
];

const csv = (text) => ({ refId: 'A', datasource: DS, scenarioId: 'csv_content', csvContent: text });
const series = (names, gen) => {
  const lines = ['time,' + names.join(',')];
  for (let k = 0; k < ROWS; k++) {
    lines.push(END - (ROWS - 1 - k) * 10 * MIN + ',' + names.map((_, i) => gen(i, k)).join(','));
  }
  return csv(lines.join('\n'));
};
// Each series ends in its state; before that it varies between 1 and 4 (a sparkline)
const states = series(
  STATES.map((s) => s.name),
  (i, k) => (k === ROWS - 1 ? STATES[i].value : 1 + ((i + k) % 4))
);
const wave = (i, k) => (40 + i * 13 + 30 * Math.sin((k + i * 5) / 4)).toFixed(1);
const rising = (_i, k) => String(20 + k * 2);

const MAPPED = {
  defaults: {
    color: { mode: 'thresholds' },
    thresholds: { mode: 'absolute', steps: [{ value: null, color: 'green' }] },
    mappings: [
      {
        type: 'value',
        options: Object.fromEntries(
          STATES.map((s, index) => [String(s.value), { text: s.text, color: s.color, index }])
        ),
      },
    ],
  },
  overrides: [],
};

const custom = (styling, extra = {}) => ({
  colorMode: 'custom',
  textMode: 'value_and_name',
  graphMode: 'area',
  ...extra,
  ...(styling ? { styling } : {}),
});

const atlas = {
  backgroundColor: { mode: 'shade', shade: 'soft' },
  textColor: { mode: 'contrast' },
  sparklineColor: { mode: 'text' },
  sparklineLineOpacity: 45,
  sparklineFillOpacity: 18,
};

// id, title, options, field config (default MAPPED), targets (default the four states), panel type, height
export const CASES = [
  // "Nothing set" next to core's Value mode: the same pixels
  { id: 10, title: 'core value mode', type: 'stat', options: { colorMode: 'value', textMode: 'value_and_name' } },
  { id: 11, title: 'custom, nothing set', options: custom() },

  // Background color
  { id: 20, title: 'background value', options: custom({ backgroundColor: { mode: 'value' } }) },
  { id: 21, title: 'background softer', options: custom({ backgroundColor: { mode: 'shade', shade: 'softer' } }) },
  { id: 22, title: 'background fixed', options: custom({ backgroundColor: { mode: 'fixed', fixedColor: 'purple' } }) },
  { id: 23, title: 'background none', options: custom({ backgroundColor: { mode: 'none' } }) },

  // Text color
  {
    id: 30,
    title: 'text best contrast on value',
    options: custom({ backgroundColor: { mode: 'value' }, textColor: { mode: 'contrast' } }),
  },
  { id: 31, title: 'text value, no background', options: custom({ textColor: { mode: 'value' } }) },
  {
    id: 32,
    title: 'text stronger on soft',
    options: custom({
      backgroundColor: { mode: 'shade', shade: 'soft' },
      textColor: { mode: 'shade', shade: 'stronger' },
    }),
  },
  {
    id: 33,
    title: 'text fixed on value',
    options: custom({ backgroundColor: { mode: 'value' }, textColor: { mode: 'fixed', fixedColor: 'black' } }),
  },
  // pjan's example: black tiles, text in the state colour; small tiles (values below 24 px need 4.5:1), so the dark
  // blue state falls back to best contrast
  {
    id: 34,
    title: 'black tiles, value text',
    options: custom(
      { backgroundColor: { mode: 'fixed', fixedColor: 'black' }, textColor: { mode: 'value' } },
      { graphMode: 'none' }
    ),
    h: 3,
  },

  // Sparkline
  {
    id: 40,
    title: 'sparkline value 45/18 width 3',
    options: custom({
      sparklineColor: { mode: 'value' },
      sparklineLineOpacity: 45,
      sparklineFillOpacity: 18,
      sparklineLineWidth: 3,
    }),
  },
  { id: 41, title: 'sparkline strong', options: custom({ sparklineColor: { mode: 'shade', shade: 'strong' } }) },
  { id: 42, title: 'atlas: soft, best contrast, sparkline as text', options: custom(atlas) },
  {
    id: 43,
    title: 'sparkline fixed width 5',
    options: custom({
      backgroundColor: { mode: 'value' },
      sparklineColor: { mode: 'fixed', fixedColor: 'blue' },
      sparklineLineWidth: 5,
    }),
  },

  // An override on one series
  {
    id: 50,
    title: 'override on web',
    options: custom({ backgroundColor: { mode: 'value' } }),
    fieldConfig: {
      ...MAPPED,
      overrides: [
        {
          matcher: { id: 'byName', options: 'web' },
          properties: [
            { id: 'custom.backgroundColor', value: { mode: 'fixed', fixedColor: 'purple' } },
            { id: 'custom.textColor', value: { mode: 'fixed', fixedColor: 'white' } },
            { id: 'custom.sparklineLineWidth', value: 4 },
          ],
        },
      ],
    },
  },

  // Percent change: on a background it follows the text colour; without one it keeps its own mode
  {
    id: 60,
    title: 'percent change on a background',
    options: custom({ backgroundColor: { mode: 'value' } }, { showPercentChange: true }),
    targets: [series(['a', 'b'], rising)],
    fieldConfig: {
      defaults: { thresholds: { mode: 'absolute', steps: [{ value: null, color: 'green' }] } },
      overrides: [],
    },
  },
  {
    id: 61,
    title: 'percent change without a background',
    options: custom({ textColor: { mode: 'fixed', fixedColor: 'purple' } }, { showPercentChange: true }),
    targets: [series(['a', 'b'], rising)],
    fieldConfig: {
      defaults: { thresholds: { mode: 'absolute', steps: [{ value: null, color: 'green' }] } },
      overrides: [],
    },
  },

  // Colours without a name (a continuous scheme): background shade = the value colour, text shade = best contrast
  {
    id: 70,
    title: 'continuous, background value',
    options: custom({ backgroundColor: { mode: 'value' } }),
    targets: [series(['a', 'b', 'c'], wave)],
    fieldConfig: { defaults: { color: { mode: 'continuous-GrYlRd' }, min: 0, max: 100 }, overrides: [] },
  },
  {
    id: 71,
    title: 'continuous, shades',
    options: custom({
      backgroundColor: { mode: 'shade', shade: 'softer' },
      textColor: { mode: 'shade', shade: 'stronger' },
    }),
    targets: [series(['a', 'b', 'c'], wave)],
    fieldConfig: { defaults: { color: { mode: 'continuous-GrYlRd' }, min: 0, max: 100 }, overrides: [] },
  },

  // The contrast minimum per element, against fixed colours (the same in both themes): #949494 on white is 3.03:1,
  // enough for text from 24 px only
  {
    id: 80,
    title: 'value keeps its colour, percent change falls back',
    options: custom(
      {
        backgroundColor: { mode: 'fixed', fixedColor: '#ffffff' },
        textColor: { mode: 'fixed', fixedColor: '#949494' },
      },
      { showPercentChange: true, graphMode: 'none', text: { valueSize: 40, percentSize: 16 } }
    ),
    targets: [series(['a', 'b'], rising)],
    fieldConfig: {
      defaults: { thresholds: { mode: 'absolute', steps: [{ value: null, color: 'green' }] } },
      overrides: [],
    },
  },
  {
    id: 81,
    title: '30 px value with a unit: guarded at the unit’s size',
    options: custom(
      {
        backgroundColor: { mode: 'fixed', fixedColor: '#ffffff' },
        textColor: { mode: 'fixed', fixedColor: '#949494' },
      },
      { graphMode: 'none', text: { valueSize: 30 } }
    ),
    targets: [series(['a', 'b'], rising)],
    fieldConfig: {
      defaults: { unit: 'percent', thresholds: { mode: 'absolute', steps: [{ value: null, color: 'green' }] } },
      overrides: [],
    },
  },
  {
    id: 82,
    title: '30 px value without a unit',
    options: custom(
      {
        backgroundColor: { mode: 'fixed', fixedColor: '#ffffff' },
        textColor: { mode: 'fixed', fixedColor: '#949494' },
      },
      { graphMode: 'none', text: { valueSize: 30 } }
    ),
    targets: [series(['a', 'b'], rising)],
    fieldConfig: {
      defaults: { thresholds: { mode: 'absolute', steps: [{ value: null, color: 'green' }] } },
      overrides: [],
    },
  },
  // A transparent panel: text is measured against the dashboard's canvas behind it. #767676 is 4.55:1 on the light
  // panel background and 4.39:1 on the light canvas; #808080 4.36:1 on the dark panel background, 4.75:1 on the dark
  // canvas (names are 14 px or less: 4.5:1)
  ...[
    [83, '#767676', false],
    [84, '#767676', true],
    [85, '#808080', false],
    [86, '#808080', true],
  ].map(([id, fixedColor, transparent]) => ({
    id,
    title: `text ${fixedColor}${transparent ? ', transparent panel' : ''}`,
    options: custom({ textColor: { mode: 'fixed', fixedColor } }, { graphMode: 'none', text: { titleSize: 14 } }),
    transparent,
    targets: [series(['a', 'b'], rising)],
    fieldConfig: {
      defaults: { thresholds: { mode: 'absolute', steps: [{ value: null, color: 'green' }] } },
      overrides: [],
    },
  })),
];

const panels = [];
let x = 0;
let y = 0;
for (const c of CASES) {
  const h = c.h ?? 5;
  if (x + 12 > 24) {
    x = 0;
    y += 5;
  }
  panels.push({
    id: c.id,
    type: c.type ?? 'pjan-stat-panel',
    title: c.title,
    datasource: DS,
    targets: c.targets ?? [states],
    gridPos: { x, y, w: 12, h },
    fieldConfig: c.fieldConfig ?? MAPPED,
    options: c.options,
    ...(c.transparent ? { transparent: true } : {}),
  });
  x += 12;
}

const dashboard = {
  uid: 'pjan-stat-styling',
  title: 'Stat ++ styling (Color mode Custom)',
  tags: ['pjan-stat-panel'],
  editable: true,
  schemaVersion: 42,
  timezone: 'utc',
  time: { from: new Date(END - ROWS * 10 * MIN).toISOString(), to: new Date(END).toISOString() },
  panels,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const json = await prettier.format(JSON.stringify(dashboard), {
    ...(await prettier.resolveConfig(OUT)),
    filepath: OUT,
  });
  fs.writeFileSync(OUT, json);
  console.log(`${OUT}: ${CASES.length} cases`);
}
