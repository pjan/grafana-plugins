import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  applyFieldOverrides,
  type DataFrame,
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
import { getAutomaticText } from '@pjan/grafana-styling';
import { THEMES } from '@pjan/grafana-styling/src/testdata/themes';

import { TableNG } from '../../packages/grafana-ui/src/components/Table/TableNG/TableNG';

// The hooks in the copied TableNG, end to end in jsdom: the field reaches getCellColorInlineStyles at the cell, at the
// row (Apply to entire row) and in Tooltip from field; each pill column gets its own text function; the table
// background follows `transparent`, in flat and nested tables; Styling from field still wins; a theme switch
// recomputes. Expected colours are the hand-computed ones of cellColors.test.ts (Grafana light and dark). jsdom
// normalises inline colours to `rgb(r, g, b)` (with spaces), and drops a `linear-gradient` background (its CSS parser
// doesn't take it): gradient cells are checked here by their text, which differs from a solid fill's in dark (the
// gradient strings are checked in cellColors.test.ts and, as drawn, in tests/styling.spec.ts).

const LIGHT = THEMES['Grafana light'];
const DARK = THEMES['Grafana dark'];
const AUTOMATIC = { mode: 'automatic' };
const SOFT = { mode: 'shade', shade: 'soft' };
const STRONGER = { mode: 'shade', shade: 'stronger' };
const TRAFFIC = {
  mode: ThresholdsMode.Absolute,
  steps: [
    { value: -Infinity, color: 'green' },
    { value: 50, color: 'red' },
  ],
};
const UP_DOWN = [
  {
    type: MappingType.ValueToText,
    options: { up: { color: 'green', index: 0 }, down: { color: 'red', index: 1 } },
  },
];
const basic = { type: TableCellDisplayMode.ColorBackground, mode: TableCellBackgroundDisplayMode.Basic };
// A pill mapped to transparent, Text color Automatic
const TRANSPARENT_PILL = {
  name: 'pill',
  type: FieldType.string,
  values: ['none'],
  config: {
    mappings: [{ type: MappingType.ValueToText, options: { none: { color: 'transparent', index: 0 } } }],
    custom: { cellOptions: { type: TableCellDisplayMode.Pill }, styling: { textColor: AUTOMATIC } },
  },
};
const colorText = { type: TableCellDisplayMode.ColorText };

// Thresholds on each field (applyFieldOverrides here has no editor registry to apply the defaults' standard options)
const colored = { thresholds: TRAFFIC, color: { mode: FieldColorModeId.Thresholds } };

const process = (theme: GrafanaTheme2, frame: DataFrame) =>
  applyFieldOverrides({
    data: [frame],
    fieldConfig: { defaults: {}, overrides: [] },
    replaceVariables: (value) => value,
    timeZone: 'utc',
    theme,
  })[0];

function frame(theme: GrafanaTheme2): DataFrame {
  return process(
    theme,
    toDataFrame({
      fields: [
        // Colored background, Automatic; with Styling from field on the second row
        {
          name: 'state',
          type: FieldType.number,
          values: [10, 90],
          config: { ...colored, custom: { cellOptions: basic, styleField: 'css', styling: { textColor: AUTOMATIC } } },
        },
        // Colored background, unset: core
        {
          name: 'core',
          type: FieldType.number,
          values: [10, 90],
          config: { ...colored, custom: { cellOptions: basic } },
        },
        // Colored text, Stronger
        {
          name: 'level',
          type: FieldType.number,
          values: [10, 90],
          config: { ...colored, custom: { cellOptions: colorText, styling: { textColor: STRONGER } } },
        },
        // Mapped pills (render-hooks replaces their colour config with Fixed), Stronger
        {
          name: 'pill',
          type: FieldType.string,
          values: ['up', 'down'],
          config: {
            mappings: UP_DOWN,
            ...colored,
            custom: { cellOptions: { type: TableCellDisplayMode.Pill }, styling: { textColor: STRONGER } },
          },
        },
        // String-hash pills, Automatic
        {
          name: 'hash',
          type: FieldType.string,
          values: ['alpha', 'bravo'],
          config: { custom: { cellOptions: { type: TableCellDisplayMode.Pill }, styling: { textColor: AUTOMATIC } } },
        },
        // An Auto column with both options set: nothing changes
        {
          name: 'auto',
          type: FieldType.number,
          values: [10, 90],
          config: {
            ...colored,
            custom: { styling: { textColor: { mode: 'fixed', fixedColor: 'purple' }, backgroundColor: SOFT } },
          },
        },
        { name: 'css', type: FieldType.string, values: ['{}', '{"color": "rgb(1, 2, 3)"}'], config: {} },
        // Colored background, gradient mode, Background color Soft, Text color unset (a status cell)
        {
          name: 'status',
          type: FieldType.number,
          values: [10, 90],
          config: {
            ...colored,
            custom: { cellOptions: { type: TableCellDisplayMode.ColorBackground }, styling: { backgroundColor: SOFT } },
          },
        },
        // Colored background, basic, Background color Fixed
        {
          name: 'fixed',
          type: FieldType.number,
          values: [10, 90],
          config: {
            ...colored,
            custom: { cellOptions: basic, styling: { backgroundColor: { mode: 'fixed', fixedColor: 'blue' } } },
          },
        },
        // Colored text, Automatic: measured against the table background
        {
          name: 'text',
          type: FieldType.number,
          values: [10, 90],
          config: { ...colored, custom: { cellOptions: colorText, styling: { textColor: AUTOMATIC } } },
        },
      ],
    })
  );
}
const COL = { state: 0, core: 1, level: 2, pill: 3, hash: 4, auto: 5, css: 6, status: 7, fixed: 8, text: 9 };

const table = (theme: GrafanaTheme2, data: DataFrame, transparent = false) => (
  <ThemeContext.Provider value={theme}>
    <TableNG enableVirtualization={false} data={data} width={1600} height={400} transparent={transparent} />
  </ThemeContext.Provider>
);

/** The body rows' cells; nested sub-tables' rows too, after their parent's. */
function cells(container: HTMLElement) {
  const rows = [...container.querySelectorAll('[role="row"]')].filter((row) => row.querySelector('[role="gridcell"]'));
  return rows.map((row) => [...row.querySelectorAll<HTMLElement>('[role="gridcell"]')]);
}
const pills = (cell: HTMLElement) => [...cell.querySelectorAll<HTMLElement>('span')];

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

describe('Text color and Background color in the copied TableNG', () => {
  it('Text color applies to Colored background, Colored text and Pill cells, and to nothing else', () => {
    const { container } = render(table(LIGHT, frame(LIGHT)));
    const [up, down] = cells(container);
    expect(up[COL.state].style.color).toBe('rgb(27, 51, 23)'); // Automatic on green
    expect(up[COL.state].style.background).toBe('rgb(86, 166, 75)'); // core's fill, unchanged
    expect(up[COL.core].style.color).toBe('rgb(247, 248, 250)'); // core's near-white
    expect(up[COL.level].style.color).toBe('rgb(25, 115, 14)'); // dark-green
    expect(down[COL.level].style.color).toBe('rgb(173, 3, 23)'); // dark-red
    expect(up[COL.text].style.color).toBe('rgb(68, 131, 59)'); // green against the table background (white)
    expect(up[COL.auto].style.color).toBe(''); // Auto cells get no colour, set or not
    expect(up[COL.auto].style.background).toBe('');
    expect(pills(up[COL.pill])[0].style.backgroundColor).toBe('rgb(86, 166, 75)'); // the mapping's green
    expect(pills(up[COL.pill])[0].style.color).toBe('rgb(25, 115, 14)'); // Stronger of the mapping's hue
    expect(pills(down[COL.pill])[0].style.color).toBe('rgb(173, 3, 23)');
    for (const cell of [up[COL.hash], down[COL.hash]]) {
      const pill = pills(cell)[0];
      // a classic-palette hex fill; Automatic on it at 12 px
      const fill = pill.style.backgroundColor.replace(/\s+/g, '');
      expect(pill.style.color.replace(/\s+/g, '')).toBe(getAutomaticText(LIGHT, fill, 4.5, { background: '#ffffff' }));
    }
  });

  it('Background color: gradient cells keep a gradient built from the shade, basic cells a solid colour', () => {
    const { container } = render(table(DARK, frame(DARK)));
    const [up] = cells(container);
    // semi-dark-green (#56A64B) and its start rgb(62, 131, 59): unset text Automatic on both stops, the canvas
    // (on #56A64B alone it would be rgb(31, 49, 34))
    expect(up[COL.status].style.color).toBe('rgb(17, 18, 23)');
    expect(up[COL.fixed].style.background).toBe('rgb(87, 148, 242)'); // blue (#5794F2)
    expect(up[COL.fixed].style.color).toBe('rgb(32, 45, 69)');
  });

  it('Styling from field’s CSS still wins over Text color', () => {
    const { container } = render(table(LIGHT, frame(LIGHT)));
    const [up, down] = cells(container);
    expect(up[COL.state].style.color).toBe('rgb(27, 51, 23)'); // `{}`: Text color
    expect(down[COL.state].style.color).toBe('rgb(1, 2, 3)'); // the user's colour
  });

  it('a transparent panel: Colored text is measured against the dashboard canvas the table shows', () => {
    const { container } = render(table(LIGHT, frame(LIGHT), true));
    expect(cells(container)[0][COL.text].style.color).toBe('rgb(67, 129, 59)'); // green on #fbfbfb
  });

  it('recomputes after a live theme switch (cells and pills)', () => {
    const { container, rerender } = render(table(LIGHT, frame(LIGHT)));
    rerender(table(DARK, frame(DARK)));
    const [up] = cells(container);
    expect(up[COL.state].style.color).toBe('rgb(46, 70, 48)'); // Automatic on dark green #73BF69
    expect(up[COL.level].style.color).toBe('rgb(200, 242, 194)'); // Stronger in dark: super-light-green
    expect(pills(up[COL.pill])[0].style.color).toBe('rgb(200, 242, 194)');
    expect(up[COL.status].style.color).toBe('rgb(17, 18, 23)'); // on the shaded gradient
    // the same field objects (only the theme changes): the plugin's caches are per theme
    const data = frame(LIGHT);
    rerender(table(LIGHT, data));
    rerender(table(DARK, data));
    rerender(table(LIGHT, data));
    expect(pills(cells(container)[0][COL.pill])[0].style.color).toBe('rgb(25, 115, 14)');
    expect(cells(container)[0][COL.state].style.color).toBe('rgb(27, 51, 23)');
  });
});

/** A row coloured by Apply to entire row (green), with a Colored text column (red) set to Automatic. */
function rowFrame(theme: GrafanaTheme2, rowStyling: object, mode = TableCellBackgroundDisplayMode.Basic): DataFrame {
  return process(
    theme,
    toDataFrame({
      fields: [
        {
          name: 'row',
          type: FieldType.number,
          values: [10],
          config: {
            ...colored,
            custom: {
              cellOptions: { type: TableCellDisplayMode.ColorBackground, mode, applyToRow: true },
              styling: rowStyling,
            },
          },
        },
        {
          name: 'level',
          type: FieldType.number,
          values: [90],
          config: { ...colored, custom: { cellOptions: colorText, styling: { textColor: AUTOMATIC } } },
        },
        { name: 'plain', type: FieldType.string, values: ['x'], config: {} },
      ],
    })
  );
}

describe('Apply to entire row in the copied TableNG', () => {
  const row = (theme: GrafanaTheme2, data: DataFrame) => cells(render(table(theme, data)).container)[0];

  it('Colored text on a coloured row is measured against the row’s fill (core’s, hand-computed)', () => {
    const [rowCell, level, plain] = row(LIGHT, rowFrame(LIGHT, {}));
    expect(rowCell.style.background).toBe('rgb(86, 166, 75)'); // core's green row
    expect(plain.style.color).toBe('rgb(247, 248, 250)'); // core's row text
    expect(level.style.color).toBe('rgb(90, 19, 27)'); // red, 60 % towards black: 4.52:1 on the green
  });

  it('on core’s gradient row, against both stops (Grafana dark, hand-computed)', () => {
    const [, level] = row(DARK, rowFrame(DARK, {}, TableCellBackgroundDisplayMode.Gradient));
    expect(level.style.color).toBe('rgb(82, 34, 43)');
  });

  it('the row-colouring field’s Background color fills the row; the row’s text and the Colored text follow it', () => {
    const [rowCell, level, plain] = row(LIGHT, rowFrame(LIGHT, { backgroundColor: SOFT }));
    expect(rowCell.style.background).toBe('rgb(115, 191, 105)');
    expect(plain.style.background).toBe('rgb(115, 191, 105)');
    expect(plain.style.color).toBe('rgb(43, 71, 39)'); // unset text: Automatic on the plugin's fill
    expect(level.style.color).toBe('rgb(125, 26, 38)'); // red on #73BF69: 44 % towards black, 4.60:1
  });

  it('a shaded gradient row (dark): the row’s gradient, Colored text against both of its stops', () => {
    const [, level, plain] = row(
      DARK,
      rowFrame(DARK, { backgroundColor: SOFT }, TableCellBackgroundDisplayMode.Gradient)
    );
    expect(plain.style.color).toBe('rgb(17, 18, 23)'); // unset text: Automatic on both stops
    expect(level.style.color).toBe('rgb(17, 18, 23)'); // no step reaches 4.2:1 on both stops: the canvas
  });
});

describe('nested tables in the copied TableNG', () => {
  // A nested sub-table with a Colored text column set to Automatic, on a transparent panel: the sub-table is drawn on
  // the same table background as its parent (TableNested's hook)
  const nested = (theme: GrafanaTheme2) => {
    const sub = process(
      theme,
      toDataFrame({
        name: 'sub',
        fields: [
          {
            name: 'level',
            type: FieldType.number,
            values: [10],
            config: { ...colored, custom: { cellOptions: colorText, styling: { textColor: AUTOMATIC } } },
          },
          {
            name: 'state',
            type: FieldType.number,
            values: [10],
            config: { ...colored, custom: { cellOptions: basic, styling: { backgroundColor: SOFT } } },
          },
          TRANSPARENT_PILL,
        ],
      })
    );
    return process(
      theme,
      toDataFrame({
        name: 'top',
        meta: { custom: { expandAllRows: true } },
        fields: [
          { name: 'name', type: FieldType.string, values: ['a'], config: { custom: {} } },
          {
            name: 'text',
            type: FieldType.number,
            values: [10],
            config: { ...colored, custom: { cellOptions: colorText, styling: { textColor: AUTOMATIC } } },
          },
          { name: '__depth', type: FieldType.number, values: [0], config: { custom: { hideFrom: { viz: true } } } },
          { name: '__index', type: FieldType.number, values: [0], config: { custom: { hideFrom: { viz: true } } } },
          { name: '__nestedFrames', type: FieldType.nestedFrames, values: [[sub]], config: { custom: {} } },
        ],
      })
    );
  };

  it.each([
    [false, 'rgb(68, 131, 59)'],
    [true, 'rgb(67, 129, 59)'],
  ])('parent and sub-table cells are styled (transparent %s)', (transparent, green) => {
    const { container } = render(table(LIGHT, nested(LIGHT), transparent));
    const all = [...new Set(cells(container).flat())];
    const colored = all.filter((cell) => cell.style.color !== '');
    // the parent's Colored text, the sub-table's Colored text and its Background color cell
    expect(colored.map((cell) => [cell.style.color, cell.style.background])).toEqual([
      [green, ''],
      [green, ''],
      ['rgb(43, 71, 39)', 'rgb(115, 191, 105)'],
    ]);
    // the sub-table's transparent pill: Automatic against the table background (hand-computed, cellColors.test.ts)
    const pill = all.flatMap(pills).find((span) => span.textContent === 'none')!;
    expect(pill.style.color).toBe(transparent ? 'rgb(115, 115, 115)' : 'rgb(117, 117, 117)');
  });
});

describe('pills on the table background, and in Tooltip from field', () => {
  it.each([
    [false, 'rgb(117, 117, 117)'],
    [true, 'rgb(115, 115, 115)'],
  ])('a transparent pill: Automatic against the table background (transparent %s)', (transparent, gray) => {
    const data = process(LIGHT, toDataFrame({ fields: [TRANSPARENT_PILL] }));
    const { container } = render(table(LIGHT, data, transparent));
    const pill = cells(container)[0].flatMap(pills)[0];
    expect(pill.style.backgroundColor).toBe('rgba(255, 255, 255, 0)'); // the theme's `transparent`, as core draws it
    expect(pill.style.color).toBe(gray);
  });

  it('a Pill tooltip field: its pills take its Text color', async () => {
    const user = userEvent.setup();
    const data = process(
      LIGHT,
      toDataFrame({
        fields: [
          { name: 'name', type: FieldType.string, values: ['a'], config: { custom: { tooltip: { field: 'pill' } } } },
          {
            name: 'pill',
            type: FieldType.string,
            values: ['up'],
            config: {
              mappings: UP_DOWN,
              ...colored,
              custom: { cellOptions: { type: TableCellDisplayMode.Pill }, styling: { textColor: STRONGER } },
            },
          },
        ],
      })
    );
    render(table(LIGHT, data));
    await user.hover(screen.getAllByRole('button', { name: 'Toggle tooltip' })[0]);
    const wrapper = await screen.findByTestId(selectors.components.Panels.Visualization.TableNG.Tooltip.Wrapper);
    const pill = wrapper.querySelector<HTMLElement>('span[style]')!;
    expect(pill.style.backgroundColor).toBe('rgb(86, 166, 75)'); // the mapping's green
    expect(pill.style.color).toBe('rgb(25, 115, 14)'); // Stronger: dark-green
  });
});

describe('Tooltip from field in the copied TableNG', () => {
  // A string column whose tooltip shows a Colored text field with Text color Automatic
  const withTooltip = (theme: GrafanaTheme2, applyToRow: boolean) =>
    process(
      theme,
      toDataFrame({
        fields: [
          {
            name: 'name',
            type: FieldType.string,
            values: ['a'],
            config: { custom: { tooltip: { field: 'level' } } },
          },
          {
            name: 'level',
            type: FieldType.number,
            values: [10],
            config: { ...colored, custom: { cellOptions: colorText, styling: { textColor: AUTOMATIC } } },
          },
          ...(applyToRow
            ? [
                {
                  name: 'row',
                  type: FieldType.number,
                  values: [90],
                  config: {
                    ...colored,
                    custom: {
                      cellOptions: { ...basic, applyToRow: true },
                      styling: { backgroundColor: SOFT },
                    },
                  },
                },
              ]
            : []),
        ],
      })
    );

  const tooltipContent = async (theme: GrafanaTheme2, applyToRow: boolean) => {
    const user = userEvent.setup();
    // a transparent panel, so the table background (the canvas) differs from the tooltip's (primary)
    render(table(theme, withTooltip(theme, applyToRow), true));
    await user.hover(screen.getAllByRole('button', { name: 'Toggle tooltip' })[0]);
    const wrapper = await screen.findByTestId(selectors.components.Panels.Visualization.TableNG.Tooltip.Wrapper);
    return [wrapper, ...wrapper.querySelectorAll<HTMLElement>('*')].find((el) => el.style.color !== '')!;
  };

  it('Colored text in the tooltip is measured against the tooltip’s background (hand-computed)', async () => {
    // green on the tooltip's background (#ffffff): 21 % towards black (on the table's canvas it would be
    // rgb(67, 129, 59))
    expect((await tooltipContent(LIGHT, false)).style.color).toBe('rgb(68, 131, 59)');
  });

  it('on a coloured row, the tooltip shows the row’s fill, and Colored text is measured against it', async () => {
    const content = await tooltipContent(LIGHT, true);
    expect(content.style.background).toBe('rgb(242, 73, 92)'); // the row's Soft red (#F2495C)
    // green (#56A64B) on #F2495C: hand-computed
    expect(content.style.color).toBe('rgb(19, 37, 17)'); // 78 % towards black, 4.52:1
  });
});
