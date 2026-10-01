// Generates provisioning/dashboards/styling.json, used by tests/styling.spec.ts: one row per styling option, the core
// state timeline (as reference) next to this plugin with the option set. Run with
// `node scripts/generate-styling-dashboard.mjs` after changing a case.
//
// Range 2025-10-25 12:00 to 2025-10-27 12:00 UTC: two midnights, and the end of summer time in Europe (Sunday 26
// October). Dashboard time zone UTC. Rows a, b and c change state every 8 hours, with 1-hour states in between that
// are too short for their value.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../provisioning/dashboards/styling.json');
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };
const FROM = Date.UTC(2025, 9, 25, 12);
const TO = Date.UTC(2025, 9, 27, 12);
const HOUR = 60 * 60_000;
const CORE = 'state-timeline';
const PLUGIN = 'pjan-statetimeline-panel';

const count = (TO - FROM) / HOUR;
// 1 running, 2 degraded, 3 down. The last values: a running, b down, c degraded.
const LAST = [1, 3, 2];
const state = (row, k) => {
  if (k === count - 1) {
    return LAST[row];
  }
  const block = 1 + ((row + Math.floor(k / 8)) % 3);
  return k % 8 === 5 ? 1 + (block % 3) : block;
};
const lines = ['time,a,b,c'];
for (let k = 0; k < count; k++) {
  lines.push(`${FROM + k * HOUR},${[0, 1, 2].map((row) => state(row, k)).join(',')}`);
}
const csv = (text) => ({ refId: 'A', datasource: DS, scenarioId: 'csv_content', csvContent: text });
const target = csv(lines.join('\n'));

// For the value alignment cases: 8-hour states from 3 hours before the range, so the first box starts 3 hours before
// the plot, and the one at the end lasts until 5 hours after it (a next state starts then; core draws the last box
// only to the plot's end). Centred and right-aligned values of those boxes reach past the plot's edges.
const edges = ['time,a,b,c'];
for (let k = -3; k <= count + 5; k++) {
  edges.push(`${FROM + k * HOUR},${[0, 1, 2].map((row) => 1 + ((row + Math.floor((k + 3) / 8)) % 3)).join(',')}`);
}
const edgeTarget = csv(edges.join('\n'));

// For best contrast on a continuous scheme: numbers without mappings (the panel's default colour mode, by value), in
// 3-hour states, up to the scheme's red end. 100 is mapped to a colour given as rgb(), as older dashboards have them;
// core's Fill opacity turns it into rgb(r, g, b, a).
const LEVELS = [0, 25, 50, 75, 100, 90, 60];
const numbers = ['time,a,b,c'];
for (let k = 0; k < count; k++) {
  numbers.push(
    `${FROM + k * HOUR},${[0, 1, 2].map((row) => LEVELS[(row + Math.floor(k / 3)) % LEVELS.length]).join(',')}`
  );
}
const numberTarget = csv(numbers.join('\n'));
const numberDefaults = {
  min: 0,
  max: 100,
  mappings: [{ type: 'value', options: { 100: { color: 'rgb(242, 73, 92)', index: 0 } } }],
};

// The state colour names, and the names of the relative shades in Grafana's stock themes (ranked by contrast with
// the panel background: light shades are the softer ones on a light background, dark ones on a dark background).
const HUES = { 1: ['running', 'green'], 2: ['degraded', 'yellow'], 3: ['down', 'red'] };
const SHADE_NAMES = {
  light: { softer: 'super-light-', stronger: 'dark-' },
  dark: { softer: 'dark-', stronger: 'super-light-' },
};
const mappingsOf = (colorOf) => [
  {
    type: 'value',
    options: Object.fromEntries(
      Object.entries(HUES).map(([value, [text, hue]], index) => [value, { text, color: colorOf(hue), index }])
    ),
  },
];
const mappings = mappingsOf((hue) => hue);
const shadeMappings = (theme, shade) => mappingsOf((hue) => SHADE_NAMES[theme][shade] + hue);

const byName = (name, properties) => ({
  matcher: { id: 'byName', options: name },
  properties: Object.entries(properties).map(([id, value]) => ({ id, value })),
});

let id = 0;
const panel = (
  type,
  title,
  { custom, overrides = [], options = {}, defaults = {}, targets = [target] } = {},
  gridPos
) => ({
  id: ++id,
  type,
  title,
  datasource: DS,
  targets,
  gridPos,
  fieldConfig: { defaults: { mappings, ...defaults, ...(custom ? { custom } : {}) }, overrides },
  options,
});

// A case: the core panel above the plugin, full width, or with `references` (core panels per theme that draw what the
// plugin should draw) side by side. Panels of a case have the same size, so their canvases can be compared.
let y = 0;
const panels = [];
const addCase = (title, plugin, { core = {}, references } = {}) => {
  const w = 8;
  const h = 6;
  const row = references
    ? [
        panel(CORE, `${title} [${CORE} light]`, references.light, { x: 0, y, w, h }),
        panel(CORE, `${title} [${CORE} dark]`, references.dark, { x: w, y, w, h }),
        panel(PLUGIN, `${title} [${PLUGIN}]`, plugin, { x: 2 * w, y, w, h }),
      ]
    : [
        panel(CORE, `${title} [${CORE}]`, core, { x: 0, y, w: 24, h }),
        panel(PLUGIN, `${title} [${PLUGIN}]`, plugin, { x: 0, y: y + h, w: 24, h }),
      ];
  panels.push(...row);
  y += references ? h : 2 * h;
};

const shade = (s) => ({ mode: 'shade', shade: s });
const fixed = (fixedColor) => ({ mode: 'fixed', fixedColor });

// Fill color: stronger on every row, softer on row b. Core draws the same with the shades' names as mapping colours.
addCase(
  'fill color',
  { custom: { fillColor: shade('stronger') }, overrides: [byName('b', { 'custom.fillColor': shade('softer') })] },
  {
    references: Object.fromEntries(
      ['light', 'dark'].map((theme) => [
        theme,
        {
          defaults: { mappings: shadeMappings(theme, 'stronger') },
          overrides: [byName('b', { mappings: shadeMappings(theme, 'softer') })],
        },
      ])
    ),
  }
);

// Line color: purple on every row, the stronger shade on row b; no fill. Core draws the same with the line colours as
// mapping colours (its line is the state colour).
const lineCustom = { lineWidth: 2, fillOpacity: 0 };
addCase(
  'line color',
  {
    custom: { ...lineCustom, lineColor: fixed('purple') },
    overrides: [byName('b', { 'custom.lineColor': shade('stronger') })],
  },
  {
    references: Object.fromEntries(
      ['light', 'dark'].map((theme) => [
        theme,
        {
          custom: lineCustom,
          defaults: { mappings: mappingsOf(() => 'purple') },
          overrides: [byName('b', { mappings: shadeMappings(theme, 'stronger') })],
        },
      ])
    ),
  }
);

addCase('value color', {
  custom: { valueColor: fixed('#1f60c4') },
  overrides: [
    byName('b', { 'custom.valueColor': shade('stronger') }),
    byName('c', { 'custom.valueColor': { mode: 'contrast' } }),
  ],
});
addCase('value overflow', { options: { styling: { valueOverflow: 'hide' } } });
for (const align of ['center', 'right']) {
  addCase(
    `value overflow, ${align}`,
    { targets: [edgeTarget], options: { alignValue: align, styling: { valueOverflow: 'hide' } } },
    { core: { targets: [edgeTarget], options: { alignValue: align } } }
  );
}
addCase(
  'best contrast, continuous',
  {
    targets: [numberTarget],
    defaults: numberDefaults,
    custom: { valueColor: { mode: 'contrast' } },
  },
  { core: { targets: [numberTarget], defaults: numberDefaults } }
);
addCase('grid and axis text', { options: { styling: { gridColor: 'red', axisTextColor: '#ff7f00' } } });
addCase('row names', {
  overrides: [
    byName('a', { 'custom.rowNameColor': { mode: 'state' } }),
    byName('b', { 'custom.rowNameColor': fixed('purple') }),
    byName('c', { 'custom.rowNameColor': { mode: 'state' } }),
  ],
});
addCase('day boundaries', { options: { styling: { dayBoundaries: true } } });
addCase(
  'day boundaries, New York, orange',
  { options: { timezone: ['America/New_York'], styling: { dayBoundaries: true, dayBoundaryColor: 'orange' } } },
  { core: { options: { timezone: ['America/New_York'] } } }
);
for (const zone of ['Europe/Brussels', 'Asia/Kolkata']) {
  addCase(
    `day boundaries, ${zone}`,
    { options: { timezone: [zone], styling: { dayBoundaries: true } } },
    { core: { options: { timezone: [zone] } } }
  );
}
addCase('pill', { options: { styling: { look: 'pill' } } });
// Nothing set, for the panel editor checks.
addCase('nothing set', {});
// A plugin panel switched back to core by changing its type in the JSON: core's panel with the plugin's options.
panels.push(
  panel(
    CORE,
    'switched back to core',
    {
      custom: { fillColor: shade('soft') },
      overrides: [byName('b', { 'custom.rowNameColor': fixed('purple'), 'custom.fillOpacity': 40 })],
      options: { styling: { look: 'pill', gridColor: 'red' } },
    },
    { x: 0, y, w: 24, h: 6 }
  )
);

const dashboard = {
  uid: 'pjan-statetimeline-styling',
  title: 'State timeline styling: core vs pjan-statetimeline-panel',
  tags: ['pjan-statetimeline-panel'],
  editable: true,
  schemaVersion: 42,
  timezone: 'utc',
  // ISO strings: Grafana does not parse epoch-millisecond strings as an absolute dashboard time range.
  time: { from: new Date(FROM).toISOString(), to: new Date(TO).toISOString() },
  panels,
};
fs.writeFileSync(OUT, JSON.stringify(dashboard, null, 2) + '\n');
console.log(`${OUT}: ${panels.length} panels`);
