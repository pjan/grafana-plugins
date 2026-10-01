// Generates provisioning/dashboards/parity.json: one row per parity case, the core state timeline on the left and
// this plugin on the right, with the same query and options. tests/parity.spec.ts compares their canvases pixel by
// pixel. Run with `node scripts/generate-parity-dashboard.mjs` after changing a case.
//
// The TestData CSV scenario has no relative time, so every timestamp and the dashboard time range are fixed (UTC):
// the 6 hours before END, which every case fills.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../provisioning/dashboards/parity.json');
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };
const END = Date.UTC(2025, 9, 2); // 2025-10-02T00:00:00Z
const MIN = 60_000;

const csv = (text, refId = 'A') => ({ refId, datasource: DS, scenarioId: 'csv_content', csvContent: text });

// `count` rows of `n` series, one row every `stepMs` milliseconds, ending at END.
const rows = (n, stepMs, count, gen) => {
  const lines = ['time,' + Array.from({ length: n }, (_, i) => `r${i}`).join(',')];
  for (let k = 0; k < count; k++) {
    const t = END - count * stepMs + k * stepMs;
    lines.push(t + ',' + Array.from({ length: n }, (_, i) => gen(i, k)).join(','));
  }
  return lines.join('\n');
};

const states = (i, k) => String(1 + ((i + Math.floor(k / 5)) % 4));
const maps = [
  {
    type: 'value',
    options: {
      1: { text: 'ok', color: 'green' },
      2: { text: 'warn', color: 'yellow' },
      3: { text: 'crit', color: 'red' },
      4: { text: 'unk', color: 'blue' },
    },
  },
];
const fixedBlue = { mode: 'fixed', fixedColor: 'blue' };
const mapped = (custom) => ({ defaults: { color: fixedBlue, mappings: maps, ...(custom ? { custom } : {}) }, overrides: [] });

const series36 = (k) => END - 36 * 10 * MIN + k * 10 * MIN;
const range36 = (gen) => Array.from({ length: 36 }, (_, k) => gen(k));
const gaps =
  'time,a,b\n' +
  range36((k) => `${series36(k)},${k > 10 && k < 20 ? '' : 1 + (k % 3)},${k % 4 === 0 ? '' : 1 + (k % 3)}`).join('\n');
const special =
  'time,a,b\n' +
  range36((k) => `${series36(k)},${k % 7 === 0 ? '' : k % 2 ? 'true' : 'false'},${k % 5 === 0 ? '' : k}`).join('\n');

const cases = [
  { title: 'defaults', targets: [csv(rows(4, 10 * MIN, 36, states))] },
  {
    title: 'thresholds',
    targets: [csv(rows(3, 10 * MIN, 36, (i, k) => String((i * 7 + k * 3) % 100)))],
    fieldConfig: {
      defaults: {
        color: { mode: 'thresholds' },
        thresholds: {
          mode: 'absolute',
          steps: [
            { color: 'green', value: null },
            { color: 'orange', value: 40 },
            { color: 'red', value: 75 },
          ],
        },
      },
      overrides: [],
    },
    options: { mergeValues: false },
  },
  {
    title: 'special mappings',
    targets: [csv(special)],
    fieldConfig: {
      defaults: {
        color: fixedBlue,
        mappings: [
          { type: 'special', options: { match: 'null', result: { text: 'none', color: 'purple' } } },
          { type: 'special', options: { match: 'true', result: { text: 'yes', color: 'green' } } },
          { type: 'special', options: { match: 'false', result: { text: 'no', color: 'red' } } },
          { type: 'range', options: { from: 10, to: 20, result: { text: 'teen', color: 'orange' } } },
        ],
      },
      overrides: [],
    },
  },
  { title: 'nulls default', targets: [csv(gaps)] },
  { title: 'spanNulls true', targets: [csv(gaps)], fieldConfig: mapped({ spanNulls: true }) },
  { title: 'insertNulls 30m', targets: [csv(gaps)], fieldConfig: mapped({ insertNulls: 30 * MIN }) },
  { title: 'pagination 3 per page', targets: [csv(rows(8, 10 * MIN, 36, states))], options: { perPage: 3 } },
  {
    title: 'legend table right, tooltip multi',
    targets: [csv(rows(3, 10 * MIN, 36, states))],
    options: {
      legend: { showLegend: true, displayMode: 'table', placement: 'right', calcs: ['lastNotNull'] },
      tooltip: { mode: 'multi', sort: 'desc' },
    },
  },
  {
    title: 'axis hidden, align center, show always',
    targets: [csv(rows(3, 10 * MIN, 36, states))],
    fieldConfig: mapped({ axisPlacement: 'hidden', fillOpacity: 40, lineWidth: 2 }),
    options: { alignValue: 'center', showValue: 'always', rowHeight: 0.6 },
  },
  {
    title: 'overrides',
    targets: [csv(rows(3, 10 * MIN, 36, states))],
    fieldConfig: {
      defaults: { color: fixedBlue, mappings: maps },
      overrides: [
        {
          matcher: { id: 'byName', options: 'r1' },
          properties: [
            { id: 'custom.fillOpacity', value: 20 },
            { id: 'custom.hideFrom', value: { legend: true, tooltip: false, viz: false } },
          ],
        },
      ],
    },
    options: { legend: { showLegend: true, displayMode: 'list', placement: 'bottom' } },
  },
  {
    title: '50 rows, 2160 points each',
    targets: [csv(rows(50, 10_000, 2160, (i, k) => String(1 + ((i * 3 + Math.floor(k / 40)) % 4))))],
    options: { showValue: 'never', mergeValues: true },
    height: 20,
  },
];

const PANEL_TYPES = ['state-timeline', 'pjan-statetimeline-panel'];

const panels = [];
let y = 0;
cases.forEach((c, n) => {
  const h = c.height ?? 8;
  PANEL_TYPES.forEach((type, col) => {
    panels.push({
      id: (n + 1) * 10 + col,
      type,
      title: `${c.title} [${type}]`,
      datasource: DS,
      targets: c.targets,
      gridPos: { x: col * 12, y, w: 12, h },
      fieldConfig: c.fieldConfig ?? mapped(),
      options: c.options ?? {},
    });
  });
  y += h;
});

const dashboard = {
  uid: 'pjan-statetimeline-parity',
  title: 'State timeline parity: core vs pjan-statetimeline-panel',
  tags: ['pjan-statetimeline-panel'],
  editable: true,
  schemaVersion: 42,
  graphTooltip: 1,
  timezone: 'utc',
  // ISO strings: Grafana does not parse epoch-millisecond strings as an absolute dashboard time range.
  time: { from: new Date(END - 6 * 60 * MIN).toISOString(), to: new Date(END).toISOString() },
  panels,
};

fs.writeFileSync(OUT, JSON.stringify(dashboard, null, 2) + '\n');
console.log(`${OUT}: ${cases.length} cases, ${panels.length} panels`);
