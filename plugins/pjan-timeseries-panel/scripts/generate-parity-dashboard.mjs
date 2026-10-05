// Generates the parity dashboards in provisioning/dashboards/: one pair of panels per parity case, the core time series
// panel with this plugin right below it, in the same column and with the same width (so both land on the same sub-pixel
// x offset), the same query, field config and options. tests/parity.spec.ts compares them; tests/interaction.spec.ts and
// tests/savedJson.spec.ts use some of them. Run with `node scripts/generate-parity-dashboard.mjs` after changing a case.
//
// - parity.json and parity-swapped.json (the same with core and plugin swapped): every case but the annotations.
// - parity-annotations.json and parity-annotations-swapped.json: the annotation cases. Their annotations are created
//   through the HTTP API by tests/parityAnnotations.spec.ts, which runs alone on these two dashboards.
//
// Every case has a unique title; the tests look panels up by title (and type) in these files, never by id. The TestData
// CSV scenario has no relative time, so every timestamp and the dashboard time range are fixed (UTC), the range written
// as ISO strings (Grafana 13.2.3 shows "Invalid date" for epoch-millisecond strings): the 6 hours before END.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../provisioning/dashboards');
const DS = { type: 'grafana-testdata-datasource', uid: 'trlxrdZVk' };
export const END = Date.UTC(2025, 9, 2); // 2025-10-02T00:00:00Z
const MIN = 60_000;
const HOUR = 60 * MIN;
export const FROM = END - 6 * HOUR;
const STEP = 5 * MIN;
const ROWS = 72; // one row every 5 minutes: the 6 hours before END

const csv = (text, refId = 'A') => ({ refId, datasource: DS, scenarioId: 'csv_content', csvContent: text });
const raw = (frames, refId = 'A') => ({
  refId,
  datasource: DS,
  scenarioId: 'raw_frame',
  rawFrameContent: JSON.stringify(frames),
});

const names = (n) => Array.from({ length: n }, (_, i) => `s${i + 1}`);
// One frame with a time field and one number field per name; gen(i, k) is the value of series i in row k ('' is null).
// `count` rows, `step` apart, the last one at END (`offset` shifts them all).
const series = (seriesNames, gen, { count = ROWS, step = STEP, offset = 0 } = {}) => {
  const lines = ['time,' + seriesNames.join(',')];
  for (let k = 0; k < count; k++) {
    const t = END - (count - 1 - k) * step + offset;
    lines.push(t + ',' + seriesNames.map((_, i) => gen(i, k)).join(','));
  }
  return csv(lines.join('\n'));
};
// A wave per series, each at its own level (values stay positive)
const wave = (i, k) => (40 + i * 15 + 25 * Math.sin((k + i * 7) / 6)).toFixed(2);
// Around zero, for centred zero, symlog and negative values
const signed = (i, k) => (30 * Math.sin((k + i * 9) / 7) + (i - 1) * 4).toFixed(2);
// Fractions of 1, for percentunit
const fraction = (i, k) => (0.45 + 0.1 * i + 0.3 * Math.sin((k + i * 5) / 8)).toFixed(4);
// Growing over several decades, for log scales
const decades = (i, k) => (2 ** (k / 6 + i) + 1).toFixed(3);

const thresholds = (steps, mode = 'absolute') => ({ mode, steps: steps.map(([value, color]) => ({ value, color })) });
const custom = (c, extra = {}) => ({ defaults: { custom: c, ...extra }, overrides: [] });
const byName = (name, properties) => ({
  matcher: { id: 'byName', options: name },
  properties: Object.entries(properties).map(([id, value]) => ({ id, value })),
});

const WAVE_THRESHOLDS = thresholds([
  [null, 'green'],
  [50, 'orange'],
  [70, 'red'],
]);
// A transparent base step with yellow and red (core draws no line or area for the transparent step)
const TRANSPARENT_BASE_THRESHOLDS = thresholds([
  [null, 'transparent'],
  [55, 'yellow'],
  [70, 'red'],
]);

// Other steps, for a second series' thresholds
const OTHER_THRESHOLDS = thresholds([
  [null, 'green'],
  [40, 'blue'],
  [60, 'purple'],
]);

const DISK_IO = series(['read', 'write'], (i, k) => (20 + i * 10 + 15 * Math.sin((k + i * 11) / 5)).toFixed(2));

const cases = [
  // 1. Defaults
  { title: 'defaults, one series', targets: [series(['value'], wave)] },
  { title: 'defaults, three series', targets: [series(names(3), wave)] },

  // 2. Draw styles
  ...['linear', 'smooth', 'stepBefore', 'stepAfter'].map((lineInterpolation) => ({
    title: `line, interpolation ${lineInterpolation}`,
    targets: [series(names(2), wave, { count: 24, step: 15 * MIN })],
    fieldConfig: custom({ lineInterpolation }),
  })),
  ...[-1, 0, 1].flatMap((barAlignment) =>
    [0.3, 1].map((barWidthFactor) => ({
      title: `bars, alignment ${barAlignment}, width ${barWidthFactor}`,
      targets: [series(names(2), wave, { count: 12, step: 30 * MIN })],
      fieldConfig: custom({ drawStyle: 'bars', barAlignment, barWidthFactor, fillOpacity: 60 }),
    }))
  ),
  ...[3, 11].map((pointSize) => ({
    title: `points, size ${pointSize}`,
    targets: [series(names(3), wave)],
    fieldConfig: custom({ drawStyle: 'points', pointSize }),
  })),

  // 3. Line width and style, fill opacity
  ...[0, 1, 3].map((lineWidth) => ({
    title: `line width ${lineWidth}`,
    targets: [series(names(2), wave)],
    fieldConfig: custom({ lineWidth, fillOpacity: lineWidth === 0 ? 30 : 0 }),
  })),
  {
    title: 'line style dash',
    targets: [series(names(3), wave)],
    fieldConfig: custom({ lineStyle: { fill: 'dash', dash: [10, 10] }, lineWidth: 3 }),
  },
  {
    title: 'line style dots',
    targets: [series(names(3), wave)],
    fieldConfig: custom({ lineStyle: { fill: 'dot', dash: [0, 10] }, lineWidth: 3 }),
  },
  ...[0, 20, 80].map((fillOpacity) => ({
    title: `fill opacity ${fillOpacity}`,
    targets: [series(names(2), wave)],
    fieldConfig: custom({ fillOpacity }),
  })),

  // 4. Gradient modes
  {
    title: 'gradient opacity',
    targets: [series(names(2), wave)],
    fieldConfig: custom({ fillOpacity: 40, gradientMode: 'opacity' }),
  },
  {
    title: 'gradient hue',
    targets: [series(names(2), wave)],
    fieldConfig: custom({ fillOpacity: 40, gradientMode: 'hue' }),
  },
  {
    title: 'gradient scheme, thresholds colour mode',
    targets: [series(names(2), wave)],
    fieldConfig: custom(
      { fillOpacity: 40, gradientMode: 'scheme' },
      { color: { mode: 'thresholds' }, thresholds: WAVE_THRESHOLDS }
    ),
  },
  {
    title: 'gradient scheme, continuous scheme',
    targets: [series(names(2), wave)],
    fieldConfig: custom({ fillOpacity: 40, gradientMode: 'scheme' }, { color: { mode: 'continuous-GrYlRd' } }),
  },

  // 5. Points and show values
  {
    // gaps: at this density auto draws no points, except where the point filter (TimeSeries/utils.ts) shows them, such
    // as a single value between two gaps (rows 9n + 4, between the nulls of rows 9n + 3 and 9n + 5). Without such
    // values the case would draw no points at all.
    title: 'show points auto, with gaps',
    targets: [
      series(names(2), (i, k) => (k % 9 === 3 || k % 9 === 5 || (k > 30 && k < 36 && i === 0) ? '' : wave(i, k))),
    ],
    fieldConfig: custom({ showPoints: 'auto', pointSize: 6 }),
  },
  {
    title: 'show points always',
    targets: [series(names(2), wave, { count: 36, step: 10 * MIN })],
    fieldConfig: custom({ showPoints: 'always', pointSize: 6 }),
  },
  {
    title: 'show points never',
    targets: [series(names(2), wave, { count: 36, step: 10 * MIN })],
    fieldConfig: custom({ showPoints: 'never' }),
  },
  {
    title: 'show values on lines',
    targets: [series(['value'], wave, { count: 12, step: 30 * MIN })],
    fieldConfig: custom({ showValues: true, showPoints: 'always' }, { decimals: 0 }),
  },
  {
    // 12 bars: each has more than 30 px, so the values show
    title: 'show values on bars, wide bars',
    targets: [series(['value'], wave, { count: 12, step: 30 * MIN })],
    fieldConfig: custom({ showValues: true, drawStyle: 'bars', fillOpacity: 50 }, { decimals: 0 }),
  },
  {
    // 72 bars: less than 30 px each, so no values
    title: 'show values on bars, narrow bars',
    targets: [series(['value'], wave)],
    fieldConfig: custom({ showValues: true, drawStyle: 'bars', fillOpacity: 50 }, { decimals: 0 }),
  },

  // 6. Nulls
  ...[
    ['spanNulls false', false],
    ['spanNulls true', true],
    // connects gaps up to 20 minutes: the 15-minute gaps are spanned, the 40-minute one isn't
    ['spanNulls 20 minutes', 20 * MIN],
  ].map(([title, spanNulls]) => ({
    title,
    targets: [
      series(names(2), (i, k) => (((k % 12 === 5 || k % 12 === 6) && i === 0) || (k > 40 && k < 48) ? '' : wave(i, k))),
    ],
    fieldConfig: custom({ spanNulls, showPoints: 'never' }),
  })),
  {
    // rows every 5 minutes with two holes of 15 and 30 minutes; insertNulls at 10 minutes breaks the line at both
    title: 'insertNulls 10 minutes',
    targets: [
      csv(
        ['time,value']
          .concat(
            Array.from({ length: ROWS }, (_, k) => k)
              .filter((k) => !(k >= 20 && k < 22) && !(k >= 45 && k < 50))
              .map((k) => `${END - (ROWS - 1 - k) * STEP},${wave(0, k)}`)
          )
          .join('\n')
      ),
    ],
    fieldConfig: custom({ insertNulls: 10 * MIN, showPoints: 'never' }),
  },

  // 7. Stacking and transforms
  {
    title: 'stacking normal',
    targets: [series(names(3), wave)],
    fieldConfig: custom({ stacking: { mode: 'normal', group: 'A' }, fillOpacity: 30 }),
  },
  {
    title: 'stacking percent',
    targets: [series(names(3), wave)],
    fieldConfig: custom({ stacking: { mode: 'percent', group: 'A' }, fillOpacity: 30 }),
  },
  {
    title: 'stacking, two groups',
    targets: [series(names(4), wave)],
    fieldConfig: {
      defaults: { custom: { stacking: { mode: 'normal', group: 'A' }, fillOpacity: 30 } },
      overrides: [
        byName('s3', { 'custom.stacking': { mode: 'normal', group: 'B' } }),
        byName('s4', { 'custom.stacking': { mode: 'normal', group: 'B' } }),
      ],
    },
  },
  {
    // negative-Y by regex override, no axis label
    title: 'negative-Y by override, no stacking',
    targets: [DISK_IO],
    fieldConfig: {
      defaults: { unit: 'Bps', custom: { fillOpacity: 10, lineWidth: 1, showPoints: 'never' } },
      overrides: [
        {
          matcher: { id: 'byRegexp', options: '.*write' },
          properties: [{ id: 'custom.transform', value: 'negative-Y' }],
        },
      ],
    },
  },
  {
    title: 'negative-Y by override, stacked',
    targets: [DISK_IO],
    fieldConfig: {
      defaults: { unit: 'Bps', custom: { fillOpacity: 30, stacking: { mode: 'normal', group: 'A' } } },
      overrides: [byName('write', { 'custom.transform': 'negative-Y' })],
    },
  },
  {
    title: 'constant transform',
    targets: [series(['value', 'limit'], (i, k) => (i === 0 ? wave(0, k) : String(60 + (k % 5))))],
    fieldConfig: { defaults: {}, overrides: [byName('limit', { 'custom.transform': 'constant' })] },
  },
  {
    title: 'fillBelowTo',
    targets: [series(['max', 'min'], (i, k) => (Number(wave(0, k)) + (i === 0 ? 10 : -10)).toFixed(2))],
    fieldConfig: {
      defaults: {},
      overrides: [byName('max', { 'custom.fillBelowTo': 'min', 'custom.fillOpacity': 30 })],
    },
  },

  // 8. Axes
  ...['left', 'right', 'hidden'].map((axisPlacement) => ({
    title: `axis placement ${axisPlacement}`,
    targets: [series(names(2), wave)],
    // filled, so that the plot is painted enough without the axis (see tests/parity.ts)
    fieldConfig: custom({ axisPlacement, fillOpacity: 20 }),
  })),
  {
    title: 'two units on two axes',
    targets: [
      series(['load', 'memory'], (i, k) =>
        i === 0 ? (2 + Math.sin(k / 5)).toFixed(2) : String(2e9 + 4e8 * Math.sin(k / 7))
      ),
    ],
    fieldConfig: {
      defaults: { unit: 'short' },
      overrides: [byName('memory', { unit: 'bytes', 'custom.axisPlacement': 'right' })],
    },
  },
  {
    title: 'axis label and width',
    targets: [series(names(2), wave)],
    fieldConfig: custom({ axisLabel: 'Requests per second', axisWidth: 90 }),
  },
  {
    title: 'grid off',
    targets: [series(names(2), wave)],
    // filled, so that the plot is painted enough without the grid (see tests/parity.ts)
    fieldConfig: custom({ axisGridShow: false, fillOpacity: 20 }),
  },
  { title: 'axis border on', targets: [series(names(2), wave)], fieldConfig: custom({ axisBorderShow: true }) },
  {
    title: 'axis colour mode series',
    targets: [series(['value'], wave)],
    fieldConfig: custom({ axisColorMode: 'series' }, { color: { mode: 'fixed', fixedColor: 'purple' } }),
  },
  {
    // the axis takes the scheme's colours from the thresholds
    title: 'axis colour mode series, scheme with thresholds',
    targets: [series(['value'], wave)],
    fieldConfig: custom(
      { axisColorMode: 'series', gradientMode: 'scheme', fillOpacity: 20 },
      { color: { mode: 'thresholds' }, thresholds: WAVE_THRESHOLDS }
    ),
  },
  {
    title: 'soft min 0',
    targets: [series(names(2), (i, k) => (Number(wave(i, k)) + 30).toFixed(2))],
    fieldConfig: custom({ axisSoftMin: 0 }),
  },
  {
    title: 'hard min 0 and max 1, percentunit',
    targets: [series(names(2), fraction)],
    fieldConfig: custom({}, { unit: 'percentunit', min: 0, max: 1 }),
  },
  { title: 'centred zero', targets: [series(names(2), signed)], fieldConfig: custom({ axisCenteredZero: true }) },
  ...[2, 10].map((log) => ({
    title: `log ${log}`,
    targets: [series(names(2), decades)],
    fieldConfig: custom({ scaleDistribution: { type: 'log', log } }),
  })),
  {
    title: 'symlog, linear threshold 5',
    targets: [series(names(2), (i, k) => (Number(signed(i, k)) * (1 + (k % 24))).toFixed(2))],
    fieldConfig: custom({ scaleDistribution: { type: 'symlog', log: 10, linearThreshold: 5 } }),
  },
  {
    // binary increments on the axis
    title: 'IEC unit bytes',
    targets: [series(names(2), (i, k) => String(Math.round(3 * 2 ** 30 + (i + 1) * 2 ** 29 * Math.sin(k / 6))))],
    fieldConfig: custom({}, { unit: 'bytes' }),
  },
  {
    title: 'enum field',
    targets: [
      raw([
        {
          schema: {
            fields: [
              { name: 'time', type: 'time' },
              { name: 'state', type: 'enum', config: { type: { enum: { text: ['ok', 'warn', 'crit'] } } } },
            ],
          },
          data: {
            values: [
              Array.from({ length: 36 }, (_, k) => END - (35 - k) * 10 * MIN),
              Array.from({ length: 36 }, (_, k) => Math.floor(k / 4) % 3),
            ],
          },
        },
      ]),
    ],
  },

  // 9. Thresholds
  ...['line', 'dashed', 'area', 'line+area', 'dashed+area'].map((mode) => ({
    title: `thresholds ${mode}`,
    targets: [series(names(2), wave)],
    // `line` on a fixed 0-100 scale: tests/interaction.spec.ts checks where its lines are drawn
    fieldConfig: custom(
      { thresholdsStyle: { mode } },
      { thresholds: WAVE_THRESHOLDS, ...(mode === 'line' ? { min: 0, max: 100 } : {}) }
    ),
  })),
  {
    title: 'thresholds percentage, line+area',
    targets: [series(names(2), wave)],
    fieldConfig: custom(
      { thresholdsStyle: { mode: 'line+area' } },
      {
        min: 0,
        max: 100,
        thresholds: thresholds(
          [
            [null, 'green'],
            [40, 'yellow'],
            [80, 'red'],
          ],
          'percentage'
        ),
      }
    ),
  },
  {
    title: 'thresholds dashed, transparent base step',
    targets: [series(names(2), wave)],
    fieldConfig: custom({ thresholdsStyle: { mode: 'dashed' } }, { thresholds: TRANSPARENT_BASE_THRESHOLDS }),
  },
  // One set of threshold lines per scale: core draws those of the first series of a scale whose Show thresholds isn't
  // Off, hidden or not (UPlotConfigBuilder.addThresholds); the threshold line options rely on the same rule. Filled,
  // so that the panels count as painted (tests/parity.ts).
  {
    title: 'thresholds per series by override, one scale',
    targets: [series(names(2), wave)],
    fieldConfig: {
      defaults: { custom: { fillOpacity: 20 } },
      overrides: [
        byName('s1', { 'custom.thresholdsStyle': { mode: 'line' }, thresholds: WAVE_THRESHOLDS }),
        byName('s2', { 'custom.thresholdsStyle': { mode: 'dashed' }, thresholds: OTHER_THRESHOLDS }),
      ],
    },
  },
  {
    title: 'thresholds off on the first series, line on the second, one scale',
    targets: [series(names(2), wave)],
    fieldConfig: {
      defaults: { custom: { fillOpacity: 20, thresholdsStyle: { mode: 'off' } }, thresholds: WAVE_THRESHOLDS },
      overrides: [byName('s2', { 'custom.thresholdsStyle': { mode: 'line' }, thresholds: OTHER_THRESHOLDS })],
    },
  },
  {
    title: 'thresholds on two scales',
    targets: [series(names(2), wave)],
    fieldConfig: {
      defaults: { custom: { fillOpacity: 20, thresholdsStyle: { mode: 'line' } }, thresholds: WAVE_THRESHOLDS },
      overrides: [
        byName('s2', {
          unit: 'percent',
          'custom.axisPlacement': 'right',
          'custom.thresholdsStyle': { mode: 'dashed' },
          thresholds: OTHER_THRESHOLDS,
        }),
      ],
    },
  },
  {
    title: 'thresholds of a hidden first series',
    targets: [series(names(2), wave)],
    fieldConfig: {
      defaults: { custom: { fillOpacity: 20 } },
      overrides: [
        byName('s1', {
          'custom.hideFrom': { viz: true, legend: false, tooltip: false },
          'custom.thresholdsStyle': { mode: 'line' },
          thresholds: WAVE_THRESHOLDS,
        }),
        byName('s2', { 'custom.thresholdsStyle': { mode: 'dashed' }, thresholds: OTHER_THRESHOLDS }),
      ],
    },
  },
  {
    // the first transparent step at index 2: the lines at 50 and 70 take the previous step's colour
    title: 'thresholds line, transparent mid step',
    targets: [series(names(2), wave)],
    fieldConfig: custom(
      { fillOpacity: 20, thresholdsStyle: { mode: 'line' } },
      {
        min: 0,
        max: 100,
        thresholds: thresholds([
          [null, 'green'],
          [50, 'red'],
          [70, 'transparent'],
          [90, 'blue'],
        ]),
      }
    ),
  },
  {
    title: 'thresholds line, rgba step',
    targets: [series(names(2), wave)],
    fieldConfig: custom(
      { fillOpacity: 20, thresholdsStyle: { mode: 'line' } },
      {
        thresholds: thresholds([
          [null, 'green'],
          [60, 'rgba(255, 0, 0, 0.4)'],
        ]),
      }
    ),
  },

  // 10. Colour modes
  ...[
    ['classic palette', { mode: 'palette-classic' }],
    ['classic palette by name', { mode: 'palette-classic-by-name' }],
    ['fixed', { mode: 'fixed', fixedColor: 'purple' }],
    ['shades', { mode: 'shades', fixedColor: 'blue' }],
    ['thresholds (dynamic series colour)', { mode: 'thresholds' }],
    ['continuous scheme', { mode: 'continuous-BlPu' }],
  ].map(([name, color]) => ({
    title: `colour ${name}`,
    targets: [series(names(3), wave)],
    fieldConfig: custom({ fillOpacity: 10 }, { color, thresholds: WAVE_THRESHOLDS }),
  })),
  {
    // the community form: fixed colours by override, hex and named
    title: 'colour overrides, hex and named',
    targets: [series(names(3), wave)],
    fieldConfig: {
      defaults: { custom: { fillOpacity: 10 } },
      overrides: [
        byName('s1', { color: { mode: 'fixed', fixedColor: '#7EB26D' } }),
        byName('s2', { color: { mode: 'fixed', fixedColor: 'dark-orange' } }),
      ],
    },
  },

  // 11. Overrides
  ...['viz', 'legend', 'tooltip'].map((hide) => ({
    title: `hideFrom ${hide} by override`,
    targets: [series(names(3), wave)],
    fieldConfig: {
      defaults: {},
      overrides: [
        byName('s2', {
          'custom.hideFrom': { viz: hide === 'viz', legend: hide === 'legend', tooltip: hide === 'tooltip' },
        }),
      ],
    },
  })),
  {
    title: 'bars and a line by override',
    targets: [series(['count', 'trend'], wave, { count: 24, step: 15 * MIN })],
    fieldConfig: {
      defaults: { custom: { drawStyle: 'bars', fillOpacity: 80 } },
      overrides: [byName('trend', { 'custom.drawStyle': 'line', 'custom.fillOpacity': 0, 'custom.lineWidth': 2 })],
    },
  },
  {
    title: 'axis placement right by override',
    targets: [series(names(2), wave)],
    fieldConfig: { defaults: {}, overrides: [byName('s2', { 'custom.axisPlacement': 'right' })] },
  },

  // 12. Legend
  ...['list', 'table', 'hidden'].map((displayMode) => ({
    title: `legend ${displayMode}`,
    targets: [series(names(3), wave)],
    options: {
      legend: { showLegend: displayMode !== 'hidden', displayMode, placement: 'bottom', calcs: [] },
    },
  })),
  {
    title: 'legend table on the right, width 260',
    targets: [series(names(3), wave)],
    options: { legend: { showLegend: true, displayMode: 'table', placement: 'right', width: 260, calcs: ['mean'] } },
  },
  {
    title: 'legend lastNotNull and max, sorted by max descending',
    targets: [series(names(5), wave)],
    // two decimals, as in the CSV: tests/interaction.spec.ts checks the legend values against values worked out by hand
    fieldConfig: custom({}, { decimals: 2 }),
    options: {
      legend: {
        showLegend: true,
        displayMode: 'table',
        placement: 'bottom',
        calcs: ['lastNotNull', 'max'],
        sortBy: 'Max',
        sortDesc: true,
      },
      tooltip: { mode: 'multi', sort: 'desc' },
    },
    h: 10,
  },
  {
    title: 'legend limit 3, overflow wrap',
    targets: [series(['a rather long series name number one', ...names(6)], wave)],
    options: {
      legend: {
        showLegend: true,
        displayMode: 'table',
        placement: 'bottom',
        calcs: ['max'],
        limit: 3,
        overflow: 'wrap',
      },
    },
    h: 10,
  },
  {
    title: 'legend series visibility filter',
    targets: [
      raw([
        ...['web-1', 'web-2', 'db-1'].map((host, i) => ({
          schema: {
            fields: [
              { name: 'time', type: 'time' },
              { name: 'requests', type: 'number', labels: { host, role: host.split('-')[0] } },
            ],
          },
          data: {
            values: [
              Array.from({ length: ROWS }, (_, k) => END - (ROWS - 1 - k) * STEP),
              Array.from({ length: ROWS }, (_, k) => Number(wave(i, k))),
            ],
          },
        })),
      ]),
    ],
    options: {
      legend: { showLegend: true, displayMode: 'list', placement: 'bottom', calcs: [], enableFacetedFilter: true },
    },
  },

  // 13. Tooltip modes (saved as set; tests/interaction.spec.ts hovers them)
  ...[
    ['single', { mode: 'single', sort: 'none' }],
    ['all, sorted descending', { mode: 'multi', sort: 'desc' }],
    ['all, hide zeros', { mode: 'multi', sort: 'none', hideZeros: true }],
    ['all, max height 100', { mode: 'multi', sort: 'none', maxHeight: 100 }],
    ['hidden', { mode: 'none', sort: 'none' }],
  ].map(([name, tooltip]) => ({
    title: `tooltip ${name}`,
    targets: [
      series(
        names(name.includes('max height') ? 8 : 3),
        (i, k) => (name.includes('zeros') && i === 1 ? '0' : wave(i, k)),
        { count: 24, step: 15 * MIN }
      ),
    ],
    // one decimal: tests/interaction.spec.ts checks the tooltip text against values worked out by hand
    fieldConfig: custom({}, { unit: 'reqps', decimals: 1 }),
    options: { tooltip },
  })),
  {
    // one link and one action, shown in a pinned tooltip
    title: 'data link and action',
    targets: [series(['value'], wave, { count: 24, step: 15 * MIN })],
    fieldConfig: custom(
      {},
      {
        links: [{ title: 'Details', url: 'https://example.com/details?value=${__value.raw}' }],
        actions: [{ title: 'Restart', type: 'fetch', fetch: { method: 'POST', url: 'https://example.com/restart' } }],
      }
    ),
  },

  // 14. Time zones
  {
    title: 'two time zones',
    targets: [series(names(2), wave)],
    options: { timezone: ['utc', 'Asia/Tokyo'] },
  },

  // 16. Exemplars: TestData's Exemplars scenario, seeded by the time range; maxDataPoints fixes the interval, which
  // places them, whatever the panel's width. The series needs labels (TestData's CSV reads them from `{...}` in the
  // header): ExemplarsPlugin's getVisibleLabels counts only series with labels, and shows every marker when that count
  // equals the number of series; with a label-less series it counts none of one, and hides every marker. tests/parity.ts
  // checks that both panels show all `exemplarCount` markers.
  {
    title: 'exemplars',
    targets: [
      series(['value{job=parity}'], (_i, k) => (50 + 20 * Math.sin(k / 6)).toFixed(2)),
      { refId: 'B', datasource: DS, scenarioId: 'exemplars', min: 30, max: 70, exemplarCount: 12 },
    ],
    maxDataPoints: 72,
  },

  // 17. Outside the time range: the banner and its button
  {
    title: 'data outside the time range',
    targets: [series(names(2), wave, { offset: -12 * HOUR })],
  },

  // 18. Long data: the error view, with core's message and without the "Transform to wide" button (plan decision 5)
  {
    title: 'long data',
    targets: [
      raw([
        {
          schema: {
            meta: { type: 'timeseries-long', typeVersion: [0, 1] },
            fields: [
              { name: 'time', type: 'time' },
              { name: 'host', type: 'string' },
              { name: 'value', type: 'number' },
            ],
          },
          data: {
            values: [
              Array.from({ length: 24 }, (_, k) => END - (11 - Math.floor(k / 2)) * 30 * MIN),
              Array.from({ length: 24 }, (_, k) => (k % 2 ? 'web-2' : 'web-1')),
              Array.from({ length: 24 }, (_, k) => Number(wave(k % 2, k))),
            ],
          },
        },
      ]),
    ],
    // small, so that the message covers enough of the panel to count as painted (see tests/parity.ts)
    w: 6,
    h: 4,
  },

  // 20. Load: 50 series × 2,000 points
  {
    title: 'load, 50 series of 2000 points',
    targets: [
      series(names(50), (i, k) => (50 + i + 20 * Math.sin((k + i * 37) / 40)).toFixed(1), {
        count: 2000,
        step: 10_800,
      }),
    ],
    options: { legend: { showLegend: false, displayMode: 'list', placement: 'bottom', calcs: [] } },
    w: 24,
    h: 10,
  },
];

// 15. Annotations (their own dashboards, see the top). Point and region annotations come from the dashboard
// (created by the test), a second lane from an annotation query by tag.
// filled, so that the plot is painted enough with multi-lane (no annotation lines or regions on the plot)
const FILLED = custom({ fillOpacity: 20 });
const annotationCases = [
  { title: 'annotations, point and region', targets: [series(names(2), wave)], fieldConfig: FILLED },
  {
    title: 'annotations, multi-lane',
    targets: [series(names(2), wave)],
    fieldConfig: FILLED,
    options: { annotations: { multiLane: true } },
  },
  {
    title: 'annotations, clustering on',
    targets: [series(names(2), wave)],
    fieldConfig: FILLED,
    options: { annotations: { clustering: 24 } },
  },
];
export const ANNOTATION_TAG_LANE2 = 'pjan-timeseries-parity-lane2';
const ANNOTATION_LAYERS_BUILT_IN = {
  builtIn: 1,
  datasource: { type: 'grafana', uid: '-- Grafana --' },
  enable: true,
  hide: true,
  iconColor: 'rgba(0, 211, 255, 1)',
  name: 'Annotations & Alerts',
  type: 'dashboard',
};
const ANNOTATION_LAYERS = [
  ANNOTATION_LAYERS_BUILT_IN,
  {
    datasource: { type: 'grafana', uid: '-- Grafana --' },
    enable: true,
    hide: false,
    iconColor: 'purple',
    name: 'Lane 2',
    target: { type: 'tags', tags: [ANNOTATION_TAG_LANE2], limit: 100, matchAny: true },
  },
];

const CORE = 'timeseries';
const PLUGIN = 'pjan-timeseries-panel';

// Pack the cases into rows of the 24-column grid; each case is a column of two panels, one above the other.
// `order` is the panel type at the top and at the bottom of each case. Ids follow the order of the cases.
const layout = (caseList, order) => {
  const panels = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  caseList.forEach((c, n) => {
    const w = c.w ?? 12;
    const h = c.h ?? 8;
    if (x + w > 24) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    order.forEach((type, k) => {
      panels.push({
        id: 2 * n + k + 1,
        type,
        title: c.title,
        datasource: DS,
        targets: c.targets,
        gridPos: { x, y: y + k * h, w, h },
        fieldConfig: c.fieldConfig ?? { defaults: {}, overrides: [] },
        options: c.options ?? {},
        ...(c.maxDataPoints ? { maxDataPoints: c.maxDataPoints } : {}),
      });
    });
    x += w;
    rowHeight = Math.max(rowHeight, 2 * h);
  });
  return panels;
};

// Grafana's dashboard uids are at most 40 characters long.
const dashboards = [
  {
    uid: 'pjan-timeseries-parity',
    file: 'parity.json',
    caseList: cases,
    order: [CORE, PLUGIN],
  },
  {
    uid: 'pjan-timeseries-parity-swapped',
    file: 'parity-swapped.json',
    caseList: cases,
    order: [PLUGIN, CORE],
  },
  {
    uid: 'pjan-ts-parity-annotations',
    file: 'parity-annotations.json',
    caseList: annotationCases,
    order: [CORE, PLUGIN],
    annotations: ANNOTATION_LAYERS,
  },
  {
    uid: 'pjan-ts-parity-annotations-swapped',
    file: 'parity-annotations-swapped.json',
    caseList: annotationCases,
    order: [PLUGIN, CORE],
    annotations: ANNOTATION_LAYERS,
  },
];

for (const { uid, file, caseList, order, annotations } of dashboards) {
  const titles = caseList.map((c) => c.title);
  if (new Set(titles).size !== titles.length) {
    throw new Error(`${file}: case titles must be unique`);
  }
  const dashboard = {
    uid,
    title: `Time series parity: ${order[0] === CORE ? 'core' : 'plugin'} on top${caseList === cases ? '' : ', annotations'}`,
    tags: [PLUGIN],
    editable: true,
    schemaVersion: 42,
    timezone: 'utc',
    // Crosshair shared between panels (the crosshair sync tests in tests/interaction.spec.ts)
    graphTooltip: 1,
    // ISO strings: Grafana does not parse epoch-millisecond strings as an absolute dashboard time range.
    time: { from: new Date(FROM).toISOString(), to: new Date(END).toISOString() },
    ...(annotations ? { annotations: { list: annotations } } : {}),
    panels: layout(caseList, order),
  };
  const out = path.join(DIR, file);
  // Formatted as `npx prettier --check .` expects
  const json = await prettier.format(JSON.stringify(dashboard), {
    ...(await prettier.resolveConfig(out)),
    filepath: out,
  });
  fs.writeFileSync(out, json);
  console.log(`${out}: ${caseList.length} cases, ${dashboard.panels.length} panels`);
}
