import { type CSSProperties } from 'react';

import {
  FALLBACK_COLOR,
  type Field,
  FieldColorModeId,
  FieldType,
  getDisplayProcessor,
  type GrafanaTheme2,
  MappingType,
  ThresholdsMode,
} from '@grafana/data';
import { TableCellDisplayMode } from '@grafana/schema';
import { getTextColorForBackground } from '@grafana/ui';
import { makeField, THEMES } from '@pjan/grafana-styling/src/testdata/themes';

import { getGridBackground, getTooltipBackground } from './cellColors';
import { type FieldStyling, type TableLook } from './options';
import {
  composite,
  CORE_TRANSPARENT_PILL,
  getLineWidth,
  getPillSettings,
  getPillStyle,
  getPillStyleFn,
  PILL_LOOK,
  type PillStyleFn,
  withPillStyle,
} from './pills';

const LIGHT = THEMES['Grafana light'];
const DARK = THEMES['Grafana dark'];
const ATLAS_LIGHT = THEMES['Atlas light'];
const ATLAS_DARK = THEMES['Atlas dark'];

// Expected colours are hand-computed, separately from the shared package and the plugin (job tmp
// table-plan/build2/oracle_b2.py, its output oracle_b2.json): the theme's shades ranked by contrast with the panel
// background (Grafana's 3-digit luminance), the nearest hue in OKLCH for colours without a name, Automatic in 1 % sRGB
// steps towards the theme's canvas or maxContrast (4.5:1 at the pills' 12 px), translucent colours composited with
// Math.round(c * a + b * (1 - a)).
// Grafana light: green #56A64B (Softer #96D98D, Stronger #19730E), red #E02F44 (Softer #FF7383), primary #ffffff,
// canvas #fbfbfb, border.strong rgba(36, 41, 46, 0.4). Grafana dark: green #73BF69 (Softer #37872D, Base #73BF69),
// primary #181b1f, canvas #111217, border.strong rgba(204, 204, 220, 0.30).

const AUTOMATIC = { mode: 'automatic' } as const;
const SOFTER = { mode: 'shade', shade: 'softer' } as const;
const SOFT = { mode: 'shade', shade: 'soft' } as const;
const BASE = { mode: 'shade', shade: 'base' } as const;
const STRONGER = { mode: 'shade', shade: 'stronger' } as const;
const fixed = (fixedColor: string) => ({ mode: 'fixed', fixedColor }) as const;

const TRAFFIC = {
  mode: ThresholdsMode.Absolute,
  steps: [
    { value: -Infinity, color: 'green' },
    { value: 50, color: 'red' },
  ],
};
const MAPPED = {
  type: MappingType.ValueToText,
  options: {
    up: { color: 'green', index: 0 },
    down: { color: 'red', index: 1 },
    none: { color: 'transparent', index: 2 },
  },
} as const;

/** A pill column, after render-hooks.tsx has replaced the colour config of a mapped pill field (as it does). */
function pillField(theme: GrafanaTheme2, styling?: FieldStyling, mapped = true): Field {
  const field = makeField(theme, {
    name: 'status',
    type: FieldType.string,
    values: ['up', 'down', 'none'],
    config: {
      thresholds: TRAFFIC,
      color: { mode: FieldColorModeId.Thresholds },
      mappings: mapped ? [MAPPED] : [],
      custom: { cellOptions: { type: TableCellDisplayMode.Pill }, ...(styling ? { styling } : {}) },
    },
  });
  if (!mapped) {
    return field;
  }
  // render-hooks.tsx (copied): "make sure we use mappings exclusively if they exist"
  const replaced: Field = {
    ...field,
    config: {
      ...field.config,
      color: { ...field.config.color, mode: FieldColorModeId.Fixed, fixedColor: FALLBACK_COLOR },
    },
  };
  replaced.display = getDisplayProcessor({ field: replaced, theme });
  return replaced;
}

interface Options {
  look?: TableLook;
  mapped?: boolean;
  background?: string;
  rows?: Record<number, CSSProperties>;
}

/** The pill style function of a column (it must exist), with core's text worked out by core's function. */
function styler(theme: GrafanaTheme2, styling: FieldStyling | undefined, options: Options = {}) {
  const fn = getPillStyleFn({
    field: pillField(theme, styling, options.mapped ?? true),
    theme,
    look: options.look,
    background: options.background ?? getGridBackground(theme),
    applyToRowBgFn: options.rows ? (rowIdx) => options.rows![rowIdx] ?? {} : undefined,
  });
  expect(fn).toBeDefined();
  return (pillColor: string, rowIdx = 0) =>
    (fn as PillStyleFn)(pillColor, getTextColorForBackground(pillColor), rowIdx);
}

/** Core's style for a pill (PillCell.tsx): its colour, core's text, and a border on a transparent pill only. */
const core = (theme: GrafanaTheme2, pillColor: string): CSSProperties => ({
  backgroundColor: pillColor,
  color: getTextColorForBackground(pillColor),
  border: pillColor === CORE_TRANSPARENT_PILL ? `1px solid ${theme.colors.border.strong}` : undefined,
});

describe('nothing set: core, exactly', () => {
  it.each([
    ['nothing', undefined, undefined],
    ['an empty styling', {}, undefined],
    ['incomplete settings', { fillColor: { mode: 'shade' }, lineColor: { mode: 'fixed' } }, undefined],
    ['out of range numbers', { lineWidth: 0, cornerRadius: 13 }, undefined],
    ['numbers that aren’t', { lineWidth: '2', cornerRadius: Number.NaN }, undefined],
    ['the options of other cell types', { backgroundColor: SOFT }, undefined],
    ['the Grafana look', {}, 'grafana'],
  ] as Array<[string, FieldStyling | undefined, TableLook | undefined]>)(
    '%s: no pill style, and core’s own text function itself',
    (_, styling, look) => {
      const column = {
        field: pillField(LIGHT, styling),
        theme: LIGHT,
        look,
        background: '#ffffff',
        applyToRowBgFn: undefined,
      };
      expect(getPillStyleFn(column)).toBeUndefined();
      const fn = withPillStyle(getTextColorForBackground, column);
      expect(fn).toBe(getTextColorForBackground);
      expect(getPillStyle(fn)).toBeUndefined();
    }
  );

  it('with an option set: a new function that gives core’s text and carries the pill style', () => {
    const fn = withPillStyle(getTextColorForBackground, {
      field: pillField(LIGHT, { cornerRadius: 4 }),
      theme: LIGHT,
      look: undefined,
      background: '#ffffff',
      applyToRowBgFn: undefined,
    });
    expect(fn).not.toBe(getTextColorForBackground);
    expect(fn('#56A64B')).toBe(getTextColorForBackground('#56A64B'));
    expect(getPillStyle(fn)!('#56A64B', 'rgb(1, 2, 3)', 0)).toEqual({
      backgroundColor: '#56A64B',
      color: 'rgb(1, 2, 3)',
      border: undefined,
      borderRadius: 4,
    });
  });
});

describe('each setting changes only its own part (Stat plus’s rule)', () => {
  it('Pill fill color alone: the fill, and unset text Automatic on it; no line, core’s radius', () => {
    expect(styler(LIGHT, { fillColor: SOFTER })('#56A64B')).toEqual({
      backgroundColor: '#96D98D',
      color: 'rgb(63,91,59)',
      border: undefined,
    });
    expect(styler(LIGHT, { fillColor: SOFT })('#56A64B').color).toBe('rgb(43,71,39)');
    expect(styler(DARK, { fillColor: SOFTER })('#73BF69')).toEqual({
      backgroundColor: '#37872D',
      color: 'rgb(255,255,255)',
      border: undefined,
    });
    // Fixed: the colour, Automatic text on it
    expect(styler(LIGHT, { fillColor: fixed('purple') })('#56A64B')).toEqual({
      backgroundColor: '#A352CC',
      color: 'rgb(7,3,8)',
      border: undefined,
    });
    expect(styler(DARK, { fillColor: fixed('purple') })('#73BF69').backgroundColor).toBe('#B877D9');
    expect(styler(DARK, { fillColor: fixed('purple') })('#73BF69').color).toBe('rgb(50,38,62)');
  });

  it('Pill line color alone: a 1 px line inside the edge; core’s fill and text', () => {
    expect(styler(LIGHT, { lineColor: STRONGER })('#56A64B')).toEqual({
      ...core(LIGHT, '#56A64B'),
      boxShadow: 'inset 0 0 0 1px #19730E',
    });
    expect(styler(LIGHT, { lineColor: fixed('blue') })('#E02F44')).toEqual({
      ...core(LIGHT, '#E02F44'),
      boxShadow: 'inset 0 0 0 1px #3274D9',
    });
  });

  it('Pill line width alone: the line in the pill’s colour, at that width', () => {
    expect(styler(LIGHT, { lineWidth: 3 })('#56A64B')).toEqual({
      ...core(LIGHT, '#56A64B'),
      boxShadow: 'inset 0 0 0 3px #56A64B',
    });
  });

  it('Pill line width is capped at 3: a wider width saved before the cap draws 3 px; below 1 is unset', () => {
    for (const lineWidth of [4, 5, 12]) {
      expect(styler(LIGHT, { lineWidth })('#56A64B').boxShadow).toBe('inset 0 0 0 3px #56A64B');
    }
    expect(getLineWidth(2.5)).toBe(2.5);
    expect(getLineWidth(3)).toBe(3);
    expect(getLineWidth(0.5)).toBeUndefined();
    expect(getLineWidth(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(getLineWidth('4')).toBeUndefined();
    // on a transparent pill in dark: core's border plus 2 px inside
    expect(styler(DARK, { lineWidth: 5 })('rgba(0,0,0,0)')).toMatchObject({
      border: '1px solid rgba(204, 204, 220, 0.30)',
      boxShadow: 'inset 0 0 0 2px rgba(204, 204, 220, 0.30)',
    });
  });

  it('Pill line width with a line color: that width', () => {
    expect(styler(DARK, { lineColor: BASE, lineWidth: 2 })('#73BF69').boxShadow).toBe('inset 0 0 0 2px #73BF69');
  });

  it('Pill corner radius alone: only the radius', () => {
    expect(styler(LIGHT, { cornerRadius: 4 })('#56A64B')).toEqual({ ...core(LIGHT, '#56A64B'), borderRadius: 4 });
    expect(styler(LIGHT, { cornerRadius: 0 })('#56A64B').borderRadius).toBe(0);
    expect(styler(LIGHT, { cornerRadius: 12 })('#56A64B').borderRadius).toBe(12);
  });

  it('Text color alone (build 1): on core’s fill, core’s fill', () => {
    expect(styler(LIGHT, { textColor: STRONGER })('#56A64B')).toEqual({
      backgroundColor: '#56A64B',
      color: '#19730E',
      border: undefined,
    });
    expect(styler(LIGHT, { textColor: AUTOMATIC })('#56A64B').color).toBe('rgb(27,51,23)');
    expect(styler(DARK, { textColor: AUTOMATIC })('#73BF69').color).toBe('rgb(46,70,48)');
    expect(styler(LIGHT, { textColor: { mode: 'value' } })('#56A64B').color).toBe('#56A64B');
    expect(styler(LIGHT, { textColor: fixed('blue') })('#56A64B').color).toBe('#3274D9');
    // a mapped pill's shade is of its mapping colour's hue (the field's colour config was replaced with Fixed)
    expect(pillField(LIGHT).display!('down').color).toBe('#E02F44');
    expect(styler(LIGHT, { textColor: STRONGER })('#E02F44').color).toBe('#AD0317');
    // string-hash pills: the nearest hue's shade; without a hue, Automatic
    const hash = styler(LIGHT, { textColor: STRONGER }, { mapped: false });
    expect(hash('#7EB26D').color).toBe('#19730E');
    expect(hash('#808080').color).toBe('rgb(24,24,24)');
  });

  it('all of them together, as the CONVENTIONS pill: Softer fill, Base 1 px line, radius 4, Automatic text', () => {
    const styling = { fillColor: SOFTER, lineColor: BASE, cornerRadius: 4, textColor: AUTOMATIC };
    expect(styler(LIGHT, styling)('#E02F44')).toEqual({
      backgroundColor: '#FF7383',
      color: 'rgb(89,40,46)',
      border: undefined,
      boxShadow: 'inset 0 0 0 1px #E02F44',
      borderRadius: 4,
    });
    // a Text color of its own on a Pill fill color: drawn as chosen
    expect(styler(LIGHT, { ...styling, textColor: STRONGER })('#56A64B').color).toBe('#19730E');
  });
});

describe('Text weight on pills (build 3)', () => {
  it('a weight alone sets no pill style: the pills are core’s, and inherit the cell’s weight', () => {
    const column = {
      field: pillField(LIGHT, { textWeight: 600 }),
      theme: LIGHT,
      look: undefined,
      background: '#ffffff',
      applyToRowBgFn: undefined,
    };
    expect(getPillStyleFn(column)).toBeUndefined();
    expect(withPillStyle(getTextColorForBackground, column)).toBe(getTextColorForBackground);
  });

  it.each([undefined, 400, 500, 600])(
    'Automatic at the pills’ 12 px is the same at weight %s (hand-computed; 4.5:1 at every weight)',
    (textWeight) => {
      const weight = textWeight ? { textWeight } : {};
      expect(styler(LIGHT, { textColor: AUTOMATIC, ...weight })('#56A64B').color).toBe('rgb(27,51,23)');
      expect(styler(DARK, { textColor: AUTOMATIC, ...weight })('#73BF69').color).toBe('rgb(46,70,48)');
      expect(styler(LIGHT, { ...weight }, { look: 'pill' })('#56A64B').color).toBe('rgb(63,91,59)');
      expect(styler(DARK, { ...weight }, { look: 'pill' })('#F2495C').color).toBe('rgb(246,218,221)');
    }
  );

  it('the pill style carries no weight of its own', () => {
    expect(styler(LIGHT, { fillColor: SOFTER, textWeight: 600 })('#56A64B')).not.toHaveProperty('fontWeight');
  });
});

describe('the Pill look (panel option)', () => {
  it('fills only the unset pill options: Softer fill, Base 1 px line, Automatic text, no radius', () => {
    expect(getPillSettings(pillField(LIGHT), 'pill')).toEqual({
      fillColor: PILL_LOOK.fillColor,
      lineColor: PILL_LOOK.lineColor,
      lineWidth: undefined,
      cornerRadius: undefined,
      textColor: PILL_LOOK.textColor,
    });
    expect(styler(LIGHT, undefined, { look: 'pill' })('#56A64B')).toEqual({
      backgroundColor: '#96D98D',
      color: 'rgb(63,91,59)',
      border: undefined,
      boxShadow: 'inset 0 0 0 1px #56A64B',
    });
    expect(styler(DARK, undefined, { look: 'pill' })('#F2495C')).toEqual({
      backgroundColor: '#C4162A',
      color: 'rgb(246,218,221)',
      border: undefined,
      boxShadow: 'inset 0 0 0 1px #F2495C',
    });
  });

  it('a column’s own options win', () => {
    const look = { look: 'pill' as const };
    expect(styler(LIGHT, { fillColor: fixed('purple') }, look)('#56A64B')).toEqual({
      backgroundColor: '#A352CC',
      color: 'rgb(7,3,8)', // the look's Automatic, on the column's fill
      border: undefined,
      boxShadow: 'inset 0 0 0 1px #56A64B',
    });
    expect(styler(LIGHT, { lineColor: STRONGER, lineWidth: 3 }, look)('#56A64B').boxShadow).toBe(
      'inset 0 0 0 3px #19730E'
    );
    expect(styler(LIGHT, { textColor: STRONGER }, look)('#56A64B').color).toBe('#19730E');
    expect(styler(LIGHT, { cornerRadius: 2 }, look)('#56A64B')).toMatchObject({
      backgroundColor: '#96D98D',
      borderRadius: 2,
    });
  });

  it('applies to string-hash pills (classic hex colours) through their nearest hue', () => {
    const hash = styler(LIGHT, undefined, { look: 'pill', mapped: false });
    expect(hash('#7EB26D')).toMatchObject({ backgroundColor: '#96D98D', boxShadow: 'inset 0 0 0 1px #56A64B' });
    expect(hash('#EAB839')).toMatchObject({ backgroundColor: '#FFEE52', color: 'rgb(115,107,37)' });
    expect(hash('#99440A')).toMatchObject({ backgroundColor: '#FFB357', boxShadow: 'inset 0 0 0 1px #FF780A' });
    // no hue near enough: the colour itself (fill and line), Automatic text on it
    expect(hash('#808080')).toEqual({
      backgroundColor: '#808080',
      color: 'rgb(24,24,24)',
      border: undefined,
      boxShadow: 'inset 0 0 0 1px #808080',
    });
    expect(styler(DARK, undefined, { look: 'pill', mapped: false })('#EAB839')).toMatchObject({
      backgroundColor: '#EAB839', // no hue in Grafana dark (two hues too close)
      color: 'rgb(93,76,35)',
    });
  });
});

describe('transparent pills', () => {
  // Grafana's `transparent` is rgba(0,0,0,0) in dark (core's TRANSPARENT: a 1 px border) and rgba(255, 255, 255, 0)
  // in light (no border)
  const DARK_T = 'rgba(0,0,0,0)';
  const LIGHT_T = 'rgba(255, 255, 255, 0)';

  it('the theme’s transparent is what a mapping to `transparent` gives', () => {
    expect(pillField(DARK).display!('none').color).toBe(DARK_T);
    expect(pillField(LIGHT).display!('none').color).toBe(LIGHT_T);
  });

  it('a line replaces core’s 1 px border: the border in the line’s colour, the rest of the width inside it', () => {
    expect(core(DARK, DARK_T).border).toBe('1px solid rgba(204, 204, 220, 0.30)');
    expect(styler(DARK, { lineColor: fixed('blue') })(DARK_T)).toMatchObject({
      border: '1px solid #5794F2',
      boxShadow: undefined,
    });
    expect(styler(DARK, { lineColor: fixed('blue'), lineWidth: 3 })(DARK_T)).toMatchObject({
      border: '1px solid #5794F2',
      boxShadow: 'inset 0 0 0 2px #5794F2',
    });
  });

  it('a width alone, or a shade of no hue: Grafana’s border colour for transparent pills', () => {
    expect(styler(DARK, { lineWidth: 2 })(DARK_T)).toMatchObject({
      border: '1px solid rgba(204, 204, 220, 0.30)',
      boxShadow: 'inset 0 0 0 1px rgba(204, 204, 220, 0.30)',
    });
    expect(styler(LIGHT, { lineWidth: 2 })(LIGHT_T)).toMatchObject({
      border: undefined, // core draws none in light
      boxShadow: 'inset 0 0 0 2px rgba(36, 41, 46, 0.4)',
    });
    expect(styler(DARK, { lineColor: BASE })(DARK_T).border).toBe('1px solid rgba(204, 204, 220, 0.30)');
  });

  it('a fill shade keeps it transparent (`transparent` has no shades); Fixed fills it; core’s border stays', () => {
    expect(styler(DARK, { fillColor: SOFTER })(DARK_T)).toMatchObject({
      backgroundColor: DARK_T,
      border: '1px solid rgba(204, 204, 220, 0.30)',
    });
    // the border is the pill's edge, not its fill (and keeps the pill's size)
    expect(styler(DARK, { fillColor: fixed('blue') })(DARK_T)).toEqual({
      backgroundColor: '#5794F2',
      color: 'rgb(32,45,69)',
      border: '1px solid rgba(204, 204, 220, 0.30)',
    });
  });

  it('Automatic text on a transparent pill: against what it shows, the table or the tooltip', () => {
    expect(styler(LIGHT, { textColor: AUTOMATIC })(LIGHT_T).color).toBe('rgb(117,117,117)');
    expect(styler(LIGHT, { textColor: AUTOMATIC }, { background: '#fbfbfb' })(LIGHT_T).color).toBe('rgb(115,115,115)');
    expect(styler(DARK, { textColor: AUTOMATIC })(DARK_T).color).toBe('rgb(130,132,134)');
    expect(styler(DARK, { textColor: AUTOMATIC }, { background: '#111217' })(DARK_T).color).toBe('rgb(124,125,127)');
    expect(getTooltipBackground(DARK)).toBe('#181b1f');
  });

  it('the look on a transparent pill: stays transparent, Automatic text, core’s border as its line', () => {
    expect(styler(DARK, undefined, { look: 'pill' })(DARK_T)).toEqual({
      backgroundColor: DARK_T,
      color: 'rgb(130,132,134)',
      border: '1px solid rgba(204, 204, 220, 0.30)',
      boxShadow: undefined,
    });
  });
});

describe('translucent pills on a row coloured by Apply to entire row: measured on the row’s fill', () => {
  const GREEN_ROW = { background: '#56A64B', color: 'rgb(247, 248, 250)' };
  const rows = { 1: GREEN_ROW };

  it('a transparent pill on core’s green row: Automatic on the green; on a row without a fill, on the table', () => {
    const style = styler(LIGHT, { textColor: AUTOMATIC }, { rows });
    expect(style('rgba(255, 255, 255, 0)', 1).color).toBe('rgb(27,51,23)');
    expect(style('rgba(255, 255, 255, 0)', 0).color).toBe('rgb(117,117,117)');
    expect(
      styler(DARK, { textColor: AUTOMATIC }, { rows: { 1: { background: '#73BF69' } } })('rgba(0,0,0,0)', 1).color
    ).toBe('rgb(46,70,48)');
  });

  it('a half-transparent fill: as drawn over the row’s fill', () => {
    const half = '#3274D980';
    expect(composite(half, '#ffffff')).toBe('rgb(152,185,236)');
    expect(composite(half, '#56A64B')).toBe('rgb(68,141,146)');
    const style = styler(LIGHT, { textColor: AUTOMATIC }, { rows });
    expect(style(half, 0).color).toBe('rgb(59,72,92)');
    expect(style(half, 1).color).toBe('rgb(14,28,29)');
  });

  it('on a gradient row, against both of its colours; an opaque pill doesn’t look at the row', () => {
    // core's light gradient for green: from rgb(98, 182, 94) to #56A64B
    const gradientRow = { 1: { background: 'linear-gradient(120deg, rgb(98, 182, 94), #56A64B)' } };
    const style = styler(LIGHT, { textColor: AUTOMATIC }, { rows: gradientRow });
    // from the start colour, measured against both (on the start alone rgb(34,64,33), on the green alone rgb(27,51,23))
    expect(style('rgba(255, 255, 255, 0)', 1).color).toBe('rgb(27,51,26)');
    expect(style('#E02F44', 1)).toEqual(style('#E02F44', 0));
  });

  it('a translucent row fill is itself drawn on the table first', () => {
    const style = styler(LIGHT, { textColor: AUTOMATIC }, { rows: { 1: { background: '#56A64B00' } } });
    // a fully transparent row fill shows the table: as no row fill
    expect(style('rgba(255, 255, 255, 0)', 1).color).toBe('rgb(117,117,117)');
  });
});

describe('the Atlas theme (rule A with its hues, lemon included)', () => {
  it('the look on mapped pills: Atlas’s own shades', () => {
    expect(styler(ATLAS_LIGHT, undefined, { look: 'pill' })('#6fc686')).toEqual({
      backgroundColor: '#bfe3c7',
      color: 'rgb(83,99,89)',
      border: undefined,
      boxShadow: 'inset 0 0 0 1px #6fc686',
    });
    expect(styler(ATLAS_DARK, undefined, { look: 'pill' })('#ea5a53')).toEqual({
      backgroundColor: '#8c4943',
      color: 'rgb(222,210,212)',
      border: undefined,
      boxShadow: 'inset 0 0 0 1px #ea5a53',
    });
  });

  it('string-hash pills take their nearest Atlas hue: classic yellow is lemon, gray is gray', () => {
    const light = styler(ATLAS_LIGHT, undefined, { look: 'pill', mapped: false });
    expect(light('#EAB839')).toMatchObject({
      backgroundColor: '#e6dbae',
      boxShadow: 'inset 0 0 0 1px #ceb346',
      color: 'rgb(99,95,78)',
    });
    expect(light('#808080')).toMatchObject({ backgroundColor: '#dadad9', boxShadow: 'inset 0 0 0 1px #b1b5b2' });
    expect(light('#0A437C')).toMatchObject({ backgroundColor: '#0A437C', color: 'rgb(153,177,201)' }); // no hue
    const dark = styler(ATLAS_DARK, undefined, { look: 'pill', mapped: false });
    expect(dark('#EAB839')).toMatchObject({ backgroundColor: '#6c5c15', boxShadow: 'inset 0 0 0 1px #a28a23' });
    expect(dark('#EAB839').color).toBe('rgb(215,214,202)');
  });
});

describe('caching', () => {
  it('is keyed on the theme and the row’s fill: a function per theme, and per fill behind a translucent pill', () => {
    const light = styler(LIGHT, { textColor: AUTOMATIC });
    const dark = styler(DARK, { textColor: AUTOMATIC });
    expect(light('#56A64B').color).toBe('rgb(27,51,23)');
    expect(dark('#56A64B').color).not.toBe(light('#56A64B').color);
    // the same result object for the same pill colour and row fill
    expect(light('#56A64B', 0)).toBe(light('#56A64B', 0));
  });
});
