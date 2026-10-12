import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  applyFieldOverrides,
  type DataFrame,
  type Field,
  FieldColorModeId,
  FieldType,
  type GrafanaTheme2,
  MappingType,
  ThresholdsMode,
  toDataFrame,
} from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { TableCellBackgroundDisplayMode, TableCellDisplayMode } from '@grafana/schema';
import { ThemeContext } from '@grafana/ui';
import { THEMES } from '@pjan/grafana-styling/src/testdata/themes';

import { TableNG } from '../../packages/grafana-ui/src/components/Table/TableNG/TableNG';
import { TABLE } from '../../packages/grafana-ui/src/components/Table/TableNG/constants';
import { type TableRow } from '../../packages/grafana-ui/src/components/Table/TableNG/types';
import {
  buildCellHeightMeasurers,
  computeContentAwareColWidths,
  createTypographyContext,
  getRowHeight,
} from '../../packages/grafana-ui/src/components/Table/TableNG/utils';
import { type TableCellOptions } from '../../packages/grafana-ui/src/components/Table/types';

import { getMeasuredTextWeight, getTextWeight, getWeightedTypographyCtx } from './textWeight';

// The copied tests stub uwrap (TableNG/__mocks__/uwrap.ts: every text one line; the package itself is an ES module
// Jest can't load). Here a stand-in breaks lines between words, measuring them with the canvas context core hands it, so
// the line count follows the font of that context.
jest.mock('uwrap', () => ({
  varPreLine: (ctx: CanvasRenderingContext2D) => ({
    count: (text: string, width: number) => {
      let lines = 1;
      let used = 0;
      for (const word of text.split(' ')) {
        const w = ctx.measureText(used === 0 ? word : ` ${word}`).width;
        if (used > 0 && used + w > width) {
          lines++;
          used = ctx.measureText(word).width;
        } else {
          used += w;
        }
      }
      return lines;
    },
  }),
}));

// Text weight (build 3): which cells take it (getTextWeight), the copied TableNG drawing it (render-hooks.tsx), and core's
// measurement at it (utils.ts: wrapped row heights, content-aware widths).

const LIGHT = THEMES['Grafana light'];
const TEXT: TableCellOptions = { type: TableCellDisplayMode.ColorText };
const BASIC: TableCellOptions = {
  type: TableCellDisplayMode.ColorBackground,
  mode: TableCellBackgroundDisplayMode.Basic,
};
const PILL: TableCellOptions = { type: TableCellDisplayMode.Pill };
const AUTO: TableCellOptions = { type: TableCellDisplayMode.Auto };

const weighted = (cellOptions: TableCellOptions, textWeight?: unknown, extra: object = {}) => ({
  cellOptions,
  ...(textWeight !== undefined ? { styling: { textWeight } } : {}),
  ...extra,
});
const fieldWith = (custom: object, values: unknown[] = ['x'], type = FieldType.string): Field => ({
  name: 'f',
  type,
  values,
  config: { custom },
});

describe('getTextWeight: the cells it applies to', () => {
  it.each([
    [TableCellDisplayMode.ColorText, 600],
    [TableCellDisplayMode.ColorBackground, 400],
    [TableCellDisplayMode.Pill, 500],
  ])('%s takes the column’s weight', (type, weight) => {
    const cellType = type as TableCellOptions['type'];
    expect(getTextWeight(fieldWith(weighted({ type: cellType } as TableCellOptions, weight)), cellType)).toBe(weight);
  });

  it.each([
    TableCellDisplayMode.Auto,
    TableCellDisplayMode.JSONView,
    TableCellDisplayMode.Markdown,
    TableCellDisplayMode.DataLinks,
    TableCellDisplayMode.Actions,
    TableCellDisplayMode.Image,
    TableCellDisplayMode.Gauge,
    TableCellDisplayMode.Sparkline,
    TableCellDisplayMode.Geo,
    TableCellDisplayMode.Custom,
  ])('%s: nothing, set or not', (type) => {
    const cellType = type as TableCellOptions['type'];
    expect(getTextWeight(fieldWith(weighted({ type: cellType } as TableCellOptions, 600)), cellType)).toBeUndefined();
  });

  it('unset, or anything but the three weights (700 included): nothing (as core)', () => {
    for (const value of [undefined, 300, 550, 700, 800, 900, '600', 'bold', null, Number.NaN]) {
      expect(getTextWeight(fieldWith(weighted(TEXT, value)), TableCellDisplayMode.ColorText)).toBeUndefined();
    }
    expect(getTextWeight(fieldWith({}), TableCellDisplayMode.ColorText)).toBeUndefined();
    expect(getTextWeight({ ...fieldWith({}), config: {} }, TableCellDisplayMode.ColorText)).toBeUndefined();
    for (const value of [400, 500, 600]) {
      expect(getTextWeight(fieldWith(weighted(TEXT, value)), TableCellDisplayMode.ColorText)).toBe(value);
    }
  });
});

// --- Measurement ---------------------------------------------------------------------------------------------------

// jest-canvas-mock measures every character as 1 px whatever the font. Here a character is half the font size wide,
// and wider by a tenth for each 100 of weight above 400 (600: 1.2 times), so measurement sees the weight it is given.
function fontOf(font: string) {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);
  const named = /\bbold\b/.test(font) ? 700 : 400;
  const weight = Number(/(?:^|\s)([1-9]00)\s/.exec(font)?.[1] ?? named);
  return { size, weight };
}
const charWidth = (font: string) => {
  const { size, weight } = fontOf(font);
  return (size / 2) * (1 + (weight - 400) / 1000);
};

describe('measurement at the Text weight (utils.ts hooks)', () => {
  let measureText: jest.SpyInstance;
  beforeAll(() => {
    measureText = jest.spyOn(CanvasRenderingContext2D.prototype, 'measureText').mockImplementation(function (
      this: CanvasRenderingContext2D,
      text: string
    ) {
      return { width: String(text).length * charWidth(this.font) } as TextMetrics;
    });
  });
  afterAll(() => {
    measureText.mockRestore();
  });

  // The table's body context, as useTypographyCtx makes it (14 px)
  const body = () => createTypographyContext(14, 'sans-serif', 0.15);

  describe('getWeightedTypographyCtx', () => {
    it('without a weight: the context itself', () => {
      const base = body();
      expect(getWeightedTypographyCtx(base, undefined, createTypographyContext)).toBe(base);
    });

    it('at a weight: core’s createTypographyContext with the same size, family and letter spacing, made once', () => {
      const base = body();
      const create = jest.fn(createTypographyContext);
      const bold = getWeightedTypographyCtx(base, 600, create);
      expect(create).toHaveBeenCalledWith(14, 'sans-serif', 0.15, 600);
      expect(bold.ctx.font).toBe('600 14px sans-serif');
      expect(base.ctx.font).toBe('14px sans-serif');
      expect(bold.avgCharWidth).toBeCloseTo(7 * 1.2 + 0.15, 6);
      expect(base.avgCharWidth).toBeCloseTo(7 + 0.15, 6);
      expect(getWeightedTypographyCtx(base, 600, create)).toBe(bold);
      expect(getWeightedTypographyCtx(base, 500, create)).not.toBe(bold);
      expect(create).toHaveBeenCalledTimes(2);
      // per context: another theme's context gets its own
      expect(getWeightedTypographyCtx(body(), 600, create)).not.toBe(bold);
    });

    it('a context that doesn’t say its size (made outside createTypographyContext): the context itself', () => {
      const { pjanFontSize, ...base } = body();
      expect(pjanFontSize).toBe(14);
      expect(getWeightedTypographyCtx(base, 600, createTypographyContext)).toBe(base);
    });
  });

  // A table of wrapped columns: their widths, and the rows' values
  const WIDTH = 170;
  const SENTENCE = 'abcde fghij klmno pqrst'; // 23 characters: 161 px at 400, 193.2 px at 600 (14 px)
  const PILLS = 'alpha,bravo'; // two 12 px pills: 30 + 12 px each at 400, 36 + 12 px at 600

  const wrapped = (name: string, cellOptions: TableCellOptions, textWeight?: number, value = SENTENCE): Field => ({
    name,
    type: FieldType.string,
    values: [value],
    config: { custom: { wrapText: true, ...weighted(cellOptions, textWeight) } },
  });
  const fieldsOf = (weightOf: (name: string) => number | undefined) => [
    wrapped('plain', AUTO, weightOf('plain')),
    wrapped('text', TEXT, weightOf('text')),
    wrapped('fill', BASIC, weightOf('fill')),
    wrapped('pill', PILL, weightOf('pill'), PILLS),
    wrapped('pill400', PILL, undefined, PILLS),
  ];
  const ROW: TableRow = {
    __depth: 0,
    __index: 0,
    plain: SENTENCE,
    text: SENTENCE,
    fill: SENTENCE,
    pill: PILLS,
    pill400: PILLS,
  };
  const rowOf = (name: string): TableRow => ({ __depth: 0, __index: 0, [name]: ROW[name] });
  const widths = (n: number) => Array(n).fill(WIDTH);
  const PADDING = TABLE.CELL_PADDING * 2;

  it('columns at a Text weight get a measurer of their own per weight; other columns share core’s', () => {
    const weights: Record<string, number> = { plain: 600, text: 600, fill: 600, pill: 500 };
    const measurers = buildCellHeightMeasurers(
      fieldsOf((name) => weights[name]),
      body()
    )!;
    // core's Auto (plain: Auto takes no weight), Auto at 600 (Colored text, Colored background), Pill at 500, Pill
    expect(measurers.map((m) => m.fieldIdxs)).toEqual([[0], [1, 2], [3], [4]]);
  });

  it('wrapped Colored text and Colored background: more lines at a heavier weight (row heights grow)', () => {
    const at = (weight?: number) => {
      const fields = fieldsOf((name) => (name === 'text' || name === 'fill' ? weight : undefined));
      const measurers = buildCellHeightMeasurers(fields, body())!;
      const entry = measurers.find((m) => m.fieldIdxs.includes(1))!;
      return {
        measured: entry.measure(SENTENCE, WIDTH, fields[1], 0, 22),
        estimated: entry.estimate!(SENTENCE, WIDTH, fields[1], 0, 22),
        rowText: getRowHeight(fields.slice(1, 2), rowOf('text'), widths(1), 36, [{ ...entry, fieldIdxs: [0] }]),
        rowFill: getRowHeight(fields.slice(2, 3), rowOf('fill'), widths(1), 36, [{ ...entry, fieldIdxs: [0] }]),
      };
    };
    // at 400 the 23 characters fit on one line (161 px); at 600 they take two (193.2 px)
    expect(at(undefined)).toEqual({ measured: 22, estimated: 22, rowText: 36, rowFill: 36 });
    expect(at(400)).toEqual(at(undefined));
    expect(at(600)).toEqual({ measured: 44, estimated: 44, rowText: 44 + PADDING, rowFill: 44 + PADDING });
  });

  it('wrapped pills: measured at their 12 px and the column’s weight (the pills wrap to a second line)', () => {
    const height = (weight?: number) => {
      const fields = [wrapped('pill', PILL, weight, PILLS)];
      // 95 px for the pills: two at 400 need 42 + 4 + 42 = 88 px, at 600 48 + 4 + 48 = 100 px
      return getRowHeight(fields, rowOf('pill'), [95], 36, buildCellHeightMeasurers(fields, body()));
    };
    expect(height(undefined)).toBe(36); // one line: the default height
    expect(height(500)).toBe(36); // 45 + 4 + 45 = 94 px: still one line
    expect(height(600)).toBe(22 * 2 + 4 + PADDING);
    // 700 isn't a weight: as unset
    expect(height(700)).toBe(36);
  });

  it('an explicit 400 is measured as core (core measures at the regular weight): core’s measurers, no context of its own', () => {
    const create = jest.spyOn(CanvasRenderingContext2D.prototype, 'measureText');
    const base = body();
    create.mockClear();
    const measurers = buildCellHeightMeasurers(
      fieldsOf(() => 400),
      base
    )!;
    expect(measurers.map((m) => m.fieldIdxs)).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
    // only core's pill context is made (its 12 px font): nothing is measured at "400 …"
    const fonts = new Set(create.mock.contexts.map((ctx) => (ctx as CanvasRenderingContext2D).font));
    expect([...fonts].some((font) => font.startsWith('400 '))).toBe(false);
    expect(getMeasuredTextWeight(fieldWith(weighted(TEXT, 400)), TableCellDisplayMode.ColorText)).toBeUndefined();
    expect(getMeasuredTextWeight(fieldWith(weighted(TEXT, 500)), TableCellDisplayMode.ColorText)).toBe(500);
    expect(getMeasuredTextWeight(fieldWith(weighted(AUTO, 600)), TableCellDisplayMode.Auto)).toBeUndefined();
  });

  it('nothing set: the same measurers and row heights as without any styling', () => {
    const unset = fieldsOf(() => undefined);
    const plain = unset.map((f) => ({ ...f, config: { custom: { ...f.config.custom, styling: undefined } } }));
    const a = buildCellHeightMeasurers(unset, body())!;
    const b = buildCellHeightMeasurers(plain, body())!;
    expect(a.map((m) => m.fieldIdxs)).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
    expect(b.map((m) => m.fieldIdxs)).toEqual(a.map((m) => m.fieldIdxs));
    expect(getRowHeight(unset, ROW, widths(5), 36, a)).toBe(getRowHeight(plain, ROW, widths(5), 36, b));
    expect(getRowHeight(unset, ROW, widths(5), 36, a)).toBe(36);
  });

  it('the Text weight’s measurement still stops at Max row height', () => {
    const fields = [wrapped('text', TEXT, 600, `${SENTENCE} ${SENTENCE} ${SENTENCE}`)];
    const row: TableRow = { __depth: 0, __index: 0, text: fields[0].values[0] };
    // four lines at 600 (88 px), stopped at 50
    expect(getRowHeight(fields, row, [WIDTH], 36, buildCellHeightMeasurers(fields, body()))).toBe(88 + PADDING);
    expect(getRowHeight(fields, row, [WIDTH], 36, buildCellHeightMeasurers(fields, body(), 50))).toBe(50 + PADDING);
  });

  describe('content-aware column widths (the table.autoColumnWidths flag)', () => {
    const contentWidths = (fields: Field[]) =>
      computeContentAwareColWidths(fields, 0, { typographyCtx: body(), headerTypographyCtx: body() });
    const column = (cellOptions: TableCellOptions, textWeight?: number) => ({
      name: 'c',
      type: FieldType.string,
      values: ['a long enough value to measure'],
      config: { custom: weighted(cellOptions, textWeight) },
    });

    it('a Colored text, Colored background or Pill column’s content is measured at its weight', () => {
      for (const cellOptions of [TEXT, BASIC, PILL]) {
        const [regular, bold] = contentWidths([column(cellOptions), column(cellOptions, 600)]);
        expect(bold).toBeGreaterThan(regular);
      }
      // 30 characters: 30 × (7 + 0.15) = 214.5 px at 400, 30 × (8.4 + 0.15) = 256.5 px at 600, plus the cell's
      // chrome and a string's slack, the same for both: 42 px wider (± 1 for rounding)
      const [regular] = contentWidths([column(TEXT)]);
      const [bold] = contentWidths([column(TEXT, 600)]);
      expect(Math.abs(bold - regular - 42)).toBeLessThanOrEqual(1);
    });

    it('other cell types, and nothing set: core’s widths', () => {
      expect(contentWidths([column(AUTO, 600), column(TEXT)])).toEqual(contentWidths([column(AUTO), column(TEXT)]));
      // 700 isn't a weight: as unset
      expect(contentWidths([column(TEXT, 700)])).toEqual(contentWidths([column(TEXT)]));
    });
  });
});

// --- Drawing (render-hooks.tsx hooks) --------------------------------------------------------------------------------

const TRAFFIC = {
  mode: ThresholdsMode.Absolute,
  steps: [
    { value: -Infinity, color: 'green' },
    { value: 50, color: 'red' },
  ],
};
const colored = { thresholds: TRAFFIC, color: { mode: FieldColorModeId.Thresholds } };
const UP_DOWN = [
  { type: MappingType.ValueToText, options: { up: { color: 'green', index: 0 }, down: { color: 'red', index: 1 } } },
];

const process = (theme: GrafanaTheme2, frame: DataFrame) =>
  applyFieldOverrides({
    data: [frame],
    fieldConfig: { defaults: {}, overrides: [] },
    replaceVariables: (value) => value,
    timeZone: 'utc',
    theme,
  })[0];

const numberColumn = (name: string, custom: object) => ({
  name,
  type: FieldType.number,
  values: [10, 90],
  config: { ...colored, custom },
});

/** One column per cell type, each with a weight of its own, and the same without (`weights: false`). */
function frame(theme: GrafanaTheme2, weights = true) {
  const w = (cellOptions: TableCellOptions, weight: number, extra: object = {}) =>
    weighted(cellOptions, weights ? weight : undefined, extra);
  return process(
    theme,
    toDataFrame({
      fields: [
        numberColumn('text', w(TEXT, 600)),
        numberColumn('fill', w(BASIC, 500, { styleField: 'css' })),
        {
          name: 'pill',
          type: FieldType.string,
          values: ['up', 'down'],
          config: { mappings: UP_DOWN, ...colored, custom: w(PILL, 600) },
        },
        numberColumn('auto', w(AUTO, 600)),
        {
          name: 'json',
          type: FieldType.string,
          values: ['{"a":1}', '{"b":2}'],
          config: { custom: w({ type: TableCellDisplayMode.JSONView }, 600) },
        },
        {
          name: 'md',
          type: FieldType.string,
          values: ['**a**', 'b'],
          config: { custom: w({ type: TableCellDisplayMode.Markdown }, 600) },
        },
        // Styling from field on the second row: its CSS wins over the weight
        { name: 'css', type: FieldType.string, values: ['{}', '{"fontWeight": 300}'], config: {} },
        // Colored text and a weight with Text color: both
        numberColumn(
          'both',
          w(TEXT, 600, { styling: { textWeight: weights ? 600 : undefined, textColor: { mode: 'automatic' } } })
        ),
        // Colored text saved at 700, which isn't a weight: as unset
        numberColumn('invalid', w(TEXT, 700)),
      ],
    })
  );
}
const COL = { text: 0, fill: 1, pill: 2, auto: 3, json: 4, md: 5, css: 6, both: 7, invalid: 8 };

const NO_ACTIONS = () => [];
const table = (theme: GrafanaTheme2, data: DataFrame) => (
  <ThemeContext.Provider value={theme}>
    <TableNG getActions={NO_ACTIONS} enableVirtualization={false} data={data} width={1600} height={400} />
  </ThemeContext.Provider>
);
function cells(container: HTMLElement) {
  const rows = [...container.querySelectorAll('[role="row"]')].filter((row) => row.querySelector('[role="gridcell"]'));
  return rows.map((row) => [...row.querySelectorAll<HTMLElement>('[role="gridcell"]')]);
}

const originalResizeObserver = global.ResizeObserver;
beforeAll(() => {
  // jsdom has no ResizeObserver (the copied TableNG.test.tsx stubs it the same way)
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterAll(() => {
  global.ResizeObserver = originalResizeObserver;
});

describe('Text weight in the copied TableNG', () => {
  it('on Colored text, Colored background and Pill cells (their pills inherit it), and on nothing else', () => {
    const { container } = render(table(LIGHT, frame(LIGHT)));
    const [up] = cells(container);
    expect(up[COL.text].style.fontWeight).toBe('600');
    expect(up[COL.fill].style.fontWeight).toBe('500');
    expect(up[COL.pill].style.fontWeight).toBe('600');
    // the pills carry no weight of their own: they inherit the cell's
    expect(up[COL.pill].querySelector<HTMLElement>('span')!.style.fontWeight).toBe('');
    for (const column of [COL.auto, COL.json, COL.md, COL.css, COL.invalid]) {
      expect(up[column].style.fontWeight).toBe('');
    }
    // with Text color too: the colour as without a weight (Automatic needs 4.5:1 at 14 px at every weight)
    expect(up[COL.both].style.fontWeight).toBe('600');
    expect(up[COL.both].style.color).toBe('rgb(68, 131, 59)'); // green against white, as at 400 (hand-computed)
  });

  it('Styling from field’s CSS still wins over it', () => {
    const { container } = render(table(LIGHT, frame(LIGHT)));
    const [up, down] = cells(container);
    expect(up[COL.fill].style.fontWeight).toBe('500'); // `{}`
    expect(down[COL.fill].style.fontWeight).toBe('300'); // the user's weight
  });

  it('nothing set: every cell’s style is core’s', () => {
    const plain = render(table(LIGHT, frame(LIGHT, false))).container;
    const styles = cells(plain).map((row) => row.map((cell) => cell.getAttribute('style')));
    // no weight anywhere, but Styling from field's (the second row's `fill`)
    expect(
      styles.flatMap((row, r) => row.flatMap((style, c) => ((style ?? '').includes('font-weight') ? [[r, c]] : [])))
    ).toEqual([[1, COL.fill]]);
    // and the same table without the styling key at all
    const bare = process(
      LIGHT,
      toDataFrame({
        fields: frame(LIGHT, false).fields.map((f) => {
          const { styling, ...custom } = f.config.custom ?? {};
          return { ...f, config: { ...f.config, custom: { ...custom, ...(styling?.textColor ? { styling } : {}) } } };
        }),
      })
    );
    const core = render(table(LIGHT, bare)).container;
    expect(cells(core).map((row) => row.map((cell) => cell.getAttribute('style')))).toEqual(styles);
  });

  it('Apply to entire row: on the row-colouring column’s own cells, not on the row’s other cells', () => {
    const data = process(
      LIGHT,
      toDataFrame({
        fields: [
          numberColumn('row', weighted({ ...BASIC, applyToRow: true }, 600)),
          numberColumn('level', weighted(TEXT, 500)),
          { name: 'plain', type: FieldType.string, values: ['x', 'y'], config: {} },
        ],
      })
    );
    const [row, level, plain] = cells(render(table(LIGHT, data)).container)[0];
    expect(row.style.background).toBe('rgb(86, 166, 75)'); // core's green row
    expect(plain.style.background).toBe('rgb(86, 166, 75)');
    expect(row.style.fontWeight).toBe('600');
    expect(level.style.fontWeight).toBe('500'); // its own
    expect(plain.style.fontWeight).toBe(''); // the row's other cells keep theirs
  });

  it('in nested sub-tables', () => {
    const sub = process(
      LIGHT,
      toDataFrame({ name: 'sub', fields: [numberColumn('level', weighted(TEXT, 600)), numberColumn('n', {})] })
    );
    const data = process(
      LIGHT,
      toDataFrame({
        name: 'top',
        meta: { custom: { expandAllRows: true } },
        fields: [
          { name: 'name', type: FieldType.string, values: ['a'], config: { custom: {} } },
          { name: '__depth', type: FieldType.number, values: [0], config: { custom: { hideFrom: { viz: true } } } },
          { name: '__index', type: FieldType.number, values: [0], config: { custom: { hideFrom: { viz: true } } } },
          { name: '__nestedFrames', type: FieldType.nestedFrames, values: [[sub]], config: { custom: {} } },
        ],
      })
    );
    const all = [...new Set(cells(render(table(LIGHT, data)).container).flat())];
    expect(all.filter((cell) => cell.style.fontWeight === '600').map((cell) => cell.textContent)).toEqual(['10', '90']);
    expect(all.filter((cell) => cell.style.fontWeight !== '' && cell.style.fontWeight !== '600')).toEqual([]);
  });

  it('Tooltip from field: the tooltip field’s weight on the tooltip’s content', async () => {
    const user = userEvent.setup();
    const data = process(
      LIGHT,
      toDataFrame({
        fields: [
          { name: 'name', type: FieldType.string, values: ['a'], config: { custom: { tooltip: { field: 'level' } } } },
          numberColumn('level', weighted(TEXT, 600)),
        ],
      })
    );
    render(table(LIGHT, data));
    await user.hover(screen.getAllByRole('button', { name: 'Toggle tooltip' })[0]);
    const wrapper = await screen.findByTestId(selectors.components.Panels.Visualization.TableNG.Tooltip.Wrapper);
    const content = [wrapper, ...wrapper.querySelectorAll<HTMLElement>('*')].find((el) => el.style.fontWeight !== '');
    expect(content?.style.fontWeight).toBe('600');
    expect(content?.textContent).toBe('10');
  });
});
