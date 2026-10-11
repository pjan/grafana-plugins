import { type CSSProperties } from 'react';

import { type Field, type GrafanaTheme2 } from '@grafana/data';
import { TableCellBackgroundDisplayMode, TableCellDisplayMode } from '@grafana/schema';
import {
  type ColorScheme,
  getAutomaticText,
  getColorNameLookup,
  getColorScheme,
  getMinTextContrast,
  getStylingColor,
  getValueShadeColor,
  type SchemePosition,
  type StylingColor,
} from '@pjan/grafana-styling';

// The copied table's cell options type (its union includes the Custom cell type)
import { type TableCellOptions } from '../../packages/grafana-ui/src/components/Table/types';

import { BACKGROUND_COLOR_MODES, getFieldStyling, TEXT_COLOR_MODES } from './options';

// Background color and Text color (`custom.styling.backgroundColor`, `custom.styling.textColor`, plan step 7, build 1).
// Hooked into the copied TableNG at two places, marked `pjan-table-panel:` (UPSTREAM.md, "Plugin addition: Text color
// and Background color"):
// - getCellColorInlineStylesFactory (utils.ts): Colored background (basic, gradient, Apply to entire row) and Colored
//   text, for the cell, Tooltip from field and the row (getCellColorsFactory);
// - the `getTextColorForBackground` function each column hands to its cells (render-hooks.tsx), which only PillCell
//   calls (getPillTextColorFn).
// With nothing set both return core's own result: the same object, or core's own function.
//
// The rule for every part (Stat plus's, pjan 2026-10-02/03): an unset part follows core, part by part; but where the
// plugin draws the fill (Background color), unset text is Automatic on that fill (`getTextOnFill`).

/**
 * The table's own background: what `getGridStyles` (copied `styles.ts`) sets as `--rdg-background-color`, by
 * `transparent` and the `visualDesignRefresh` flag. Rows and nested sub-tables are drawn on it.
 */
export function getGridBackground(theme: GrafanaTheme2, transparent?: boolean): string {
  if (theme.flags.visualDesignRefresh) {
    return transparent ? theme.colors.background.page : theme.components.panel.background;
  }
  return transparent ? theme.colors.background.canvas : theme.colors.background.primary;
}

/** The background of Tooltip from field's popover: `getTooltipStyles`' `tooltipWrapper` (copied `styles.ts`). */
export const getTooltipBackground = (theme: GrafanaTheme2): string => theme.colors.background.primary;

/**
 * The fill of a row coloured by Apply to entire row, from the styles a cell starts with (render-hooks.tsx copies the
 * row's styles into every cell of the row, and into Tooltip from field's content, first): what a Colored text cell of
 * that row is drawn on. Undefined on a row without a fill.
 */
export const getRowFill = (style: CSSProperties): string | undefined =>
  typeof style.background === 'string' && style.background !== '' ? style.background : undefined;

// Core's gradient (getCellColorInlineStylesFactory, copied utils.ts): `linear-gradient(120deg, <start>, <colour>)`.
const GRADIENT_PREFIX = 'linear-gradient(120deg, ';

/**
 * The colours of a fill as a cell's `background` gives it: one colour, or the two stops of core's gradient. A colour's
 * own commas (`rgb(…)`) are kept together. Undefined for anything else.
 */
export function getFillStops(background: string): string[] | undefined {
  if (!background.startsWith(GRADIENT_PREFIX)) {
    return background.includes('gradient(') ? undefined : [background];
  }
  const inner = background.slice(GRADIENT_PREFIX.length, -1);
  const stops: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth--;
    } else if (c === ',' && depth === 0) {
      stops.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  stops.push(inner.slice(start).trim());
  return stops;
}

/** What Automatic measures text at. */
export interface TextFont {
  /** CSS pixels */
  size: number;
  weight: number;
}

export type TextElement = 'cell' | 'pill';

const toPx = (theme: GrafanaTheme2, size: string | number): number =>
  typeof size === 'number'
    ? size
    : size.endsWith('rem')
      ? parseFloat(size) * (theme.typography.htmlFontSize ?? 14) // Grafana sets html's font-size to htmlFontSize px
      : parseFloat(size);

/**
 * The font a column's text is drawn in, the one place the size and weight Automatic measures come from: cells in the
 * grid's body font (14 px), pills in `bodySmall` (PillCell's `getStyles`, 12 px), both at the theme's regular weight.
 * Text weight (a later addition) sets the weight here, from the field's styling.
 */
export function getTextFont(theme: GrafanaTheme2, element: TextElement, _field: Field): TextFont {
  return {
    size: element === 'pill' ? toPx(theme, theme.typography.bodySmall.fontSize) : theme.typography.fontSize,
    weight: theme.typography.fontWeightRegular,
  };
}

/**
 * Automatic text on what it is drawn on: one colour, or a gradient's stops (every step measured against each, the
 * lower contrast counting: the shared option `alsoOn`), at the font's minimum contrast. From `from` (Colored text: the
 * value's colour), otherwise from the first stop; a translucent colour is composited over `background` (the table
 * background).
 */
function getAutomaticOn(
  theme: GrafanaTheme2,
  stops: string[],
  font: TextFont,
  background: string,
  from?: string
): string {
  const [first, ...rest] = stops;
  return getAutomaticText(theme, first, getMinTextContrast(font.size, font.weight), {
    background,
    from,
    alsoOn: rest.length > 0 ? rest : undefined,
  });
}

/**
 * A text colour of the option (the shared colour rules, `packages/grafana-styling/README.md`): Value is the value's
 * colour; a shade of its name's hue (a colour without a name: its nearest theme hue; a continuous scheme's colour: the
 * scheme's stops shaded and interpolated at the value's position, `scheme`); a fixed colour. All drawn as chosen (Value
 * on a fill of the same colour is invisible, as in Stat plus). Automatic, and a shade of a colour without a hue, is
 * `automatic()`.
 */
function resolveTextColor(
  theme: GrafanaTheme2,
  setting: StylingColor,
  valueColor: string,
  colorName: string | undefined,
  automatic: () => string,
  scheme?: SchemePosition
): string {
  switch (setting.mode) {
    case 'value':
      return valueColor;
    case 'shade':
      return getValueShadeColor(theme, valueColor, colorName, setting.shade!, scheme) ?? automatic();
    case 'fixed':
      return theme.visualization.getColorByName(setting.fixedColor!);
    default:
      return automatic();
  }
}

/**
 * The shade of the value's colour a fill takes (of its name's hue, or its nearest hue; without a hue, the value's
 * colour itself, Stat plus's rule; from a continuous scheme, the scheme's stops shaded and interpolated at the value's
 * position, `scheme`).
 */
function getFillShade(
  theme: GrafanaTheme2,
  setting: StylingColor,
  valueColor: string,
  colorName: string | undefined,
  scheme?: SchemePosition
): string {
  return getValueShadeColor(theme, valueColor, colorName, setting.shade!, scheme) ?? valueColor;
}

/** A fill text is drawn on. */
export interface Fill {
  /** One colour, or a gradient's stops */
  stops: string[];
  /** The plugin draws it (Background color): unset text is then Automatic on it */
  drawnByPlugin: boolean;
}

/**
 * Text on a fill, for cells, rows and pills alike: the Text color setting (Automatic on the fill, Value, a shade,
 * Fixed); unset, Automatic on a fill the plugin draws, and otherwise undefined: core's own text.
 */
export function getTextOnFill(
  theme: GrafanaTheme2,
  setting: StylingColor | undefined,
  valueColor: string,
  colorName: string | undefined,
  fill: Fill,
  font: TextFont,
  background: string,
  scheme?: SchemePosition
): string | undefined {
  const automatic = () => getAutomaticOn(theme, fill.stops, font, background);
  if (!setting) {
    return fill.drawnByPlugin ? automatic() : undefined;
  }
  return resolveTextColor(theme, setting, valueColor, colorName, automatic, scheme);
}

/** The column's settings, complete or unset (`getStylingColor`: an incomplete value counts as unset). */
export function getCellSettings(field: Field) {
  const styling = getFieldStyling(field.config.custom);
  return {
    textColor: getStylingColor(styling.textColor, TEXT_COLOR_MODES),
    backgroundColor: getStylingColor(styling.backgroundColor, BACKGROUND_COLOR_MODES),
  };
}

/**
 * The Grafana colour name behind a colour of the field (`getColorNameLookup`: mappings, thresholds, the fixed colour,
 * the classic palette), cached per field for one theme.
 */
function colorNamesFor(theme: GrafanaTheme2) {
  const lookups = new WeakMap<Field, Map<string, string>>();
  return (field: Field, color: string): string | undefined => {
    let lookup = lookups.get(field);
    if (!lookup) {
      lookup = getColorNameLookup(field, theme);
      lookups.set(field, lookup);
    }
    return lookup.get(color);
  };
}

/**
 * Where a value sits in its field's continuous colour scheme, for shades of it (`getValueShadeColor`): the scheme's
 * stops (read once per field for one theme) and the display value's `percent`, which Grafana's calculator interpolates
 * at (an infinite one is the scheme's end, as Grafana's interpolator clamps it). Undefined without a continuous by-value
 * scheme, or without a position (a mapped colour: its own name decides).
 */
function schemesFor(theme: GrafanaTheme2) {
  const schemes = new WeakMap<Field, ColorScheme | null>();
  return (field: Field, percent: number | undefined): SchemePosition | undefined => {
    let scheme = schemes.get(field);
    if (scheme === undefined) {
      scheme = getColorScheme(field, theme) ?? null;
      schemes.set(field, scheme);
    }
    return scheme && percent !== undefined && !Number.isNaN(percent) ? { scheme, position: percent } : undefined;
  };
}

// Results are cached per factory, which is made for one theme and table background; bounded, as a continuous scheme
// can give many colours.
const CACHE_SIZE = 1000;

function cached<T>(cache: Map<string, T>, key: string, compute: () => T): T {
  let value = cache.get(key);
  if (value === undefined) {
    value = compute();
    if (cache.size >= CACHE_SIZE) {
      cache.clear();
    }
    cache.set(key, value);
  }
  return value;
}

// A scheme position by the scheme's stops and the position: two columns with different schemes can draw the same value
// colour at the same position and must not share an entry
const schemeKey = (scheme: SchemePosition | undefined) =>
  scheme ? `${scheme.scheme.stops.join(';')}@${scheme.position}` : '';
const settingKey = (s: StylingColor | undefined) => (s ? `${s.mode}|${s.shade ?? ''}|${s.fixedColor ?? ''}` : '-');
const fontKey = (font: TextFont) => `${font.size}|${font.weight}`;

/**
 * Background color and Text color for the styles core's `getCellColorInlineStylesFactory` returns (copied
 * `utils.ts`). The returned function takes core's styles for a cell and gives them back unchanged (the same object)
 * unless the field sets one of them and core coloured the cell (Colored background and Colored text with a colour; a
 * transparent cell on a coloured row gets nothing from core and keeps the row's):
 * - Colored background (basic, gradient, and the row of Apply to entire row): Background color fills it. Basic: the
 *   shade or the fixed colour, solid. Gradient (variant B, pjan 2026-10-10): a shade keeps core's gradient, built from
 *   the shaded colour by core's own rule (`gradientStart`: darkened by 10 in dark, lightened by 7 in light, 5° hue
 *   spin); Fixed doesn't apply to gradient cells (core's gradient and text, as unset). Text color on the fill as drawn
 *   (`getTextOnFill`): on a gradient both stops; unset text is Automatic where the plugin draws the fill.
 * - Colored text: Text color only (Background color doesn't apply). Automatic starts from the value's colour, against
 *   what the text is drawn on: `drawnOn` when given (a row's fill, as its `background` gives it, or the tooltip's
 *   background), otherwise the table background (`gridBackground`).
 *
 * `percent` is the display value's position in a continuous colour scheme, for shades of a scheme's colour.
 *
 * `theme` and `gridBackground` are fixed per factory, so its cache is keyed on the theme; core's factory is rebuilt
 * when the theme changes (and, with this hook, when the panel's `transparent` changes), and so is this one. Nothing is
 * read from the theme until a field sets an option (`gridBackground` unset: the panel background).
 */
export function getCellColorsFactory(
  theme: GrafanaTheme2,
  gridBackgroundOrUnset: string | undefined,
  gradientStart: (color: string) => string
) {
  const colorNameOf = colorNamesFor(theme);
  const schemeAt = schemesFor(theme);
  const cache = new Map<string, { color: string; background?: string }>();

  return (
    styles: CSSProperties,
    cellOptions: TableCellOptions,
    valueColor: string,
    field: Field,
    drawnOn?: string,
    percent?: number
  ): CSSProperties => {
    const { textColor, backgroundColor } = getCellSettings(field);
    if ((!textColor && !backgroundColor) || styles.color === undefined) {
      return styles;
    }
    const gridBackground = gridBackgroundOrUnset ?? theme.colors.background.primary;
    const font = getTextFont(theme, 'cell', field);

    if (cellOptions.type === TableCellDisplayMode.ColorText) {
      if (!textColor) {
        return styles;
      }
      const stops = (drawnOn !== undefined ? getFillStops(drawnOn) : undefined) ?? [gridBackground];
      const colorName = colorNameOf(field, valueColor);
      const scheme = schemeAt(field, percent);
      const key = `text|${settingKey(textColor)}|${valueColor}|${colorName ?? ''}|${stops.join(';')}|${fontKey(font)}|${gridBackground}|${schemeKey(scheme)}`;
      const { color } = cached(cache, key, () => ({
        color: resolveTextColor(
          theme,
          textColor,
          valueColor,
          colorName,
          () => getAutomaticOn(theme, stops, font, gridBackground, valueColor),
          scheme
        ),
      }));
      return { ...styles, color };
    }

    if (cellOptions.type === TableCellDisplayMode.ColorBackground) {
      const gradient =
        (cellOptions.mode ?? TableCellBackgroundDisplayMode.Gradient) === TableCellBackgroundDisplayMode.Gradient;
      const colorName = colorNameOf(field, valueColor);
      const scheme = schemeAt(field, percent);
      const key = `fill|${settingKey(textColor)}|${settingKey(backgroundColor)}|${gradient}|${valueColor}|${colorName ?? ''}|${fontKey(font)}|${gridBackground}|${schemeKey(scheme)}`;
      const result = cached(cache, key, () => {
        let fill: Fill = {
          stops: gradient ? [valueColor, gradientStart(valueColor)] : [valueColor],
          drawnByPlugin: false,
        };
        let background: string | undefined;
        if (backgroundColor?.mode === 'shade') {
          const shaded = getFillShade(theme, backgroundColor, valueColor, colorName, scheme);
          if (gradient) {
            const start = gradientStart(shaded);
            fill = { stops: [shaded, start], drawnByPlugin: true };
            background = `${GRADIENT_PREFIX}${start}, ${shaded})`;
          } else {
            fill = { stops: [shaded], drawnByPlugin: true };
            background = shaded;
          }
        } else if (backgroundColor?.mode === 'fixed' && !gradient) {
          background = theme.visualization.getColorByName(backgroundColor.fixedColor!);
          fill = { stops: [background], drawnByPlugin: true };
        }
        const color = getTextOnFill(theme, textColor, valueColor, colorName, fill, font, gridBackground, scheme);
        return { color: color ?? String(styles.color), ...(background ? { background } : {}) };
      });
      return { ...styles, ...result };
    }
    return styles;
  };
}

export type CellColorsHook = ReturnType<typeof getCellColorsFactory>;

/**
 * Text color on Pill cells: the `getTextColorForBackground` a column hands to its cells (only PillCell calls it, with
 * each pill's fill). Unset: core's own function, unchanged (the same function, so PillCell's memo keeps its value).
 * Set: `getTextOnFill` on the pill's fill (at the pill's font; a translucent or transparent pill composited over the
 * table background): Automatic, the pill's colour (Value), a shade of it, or a fixed colour. Pills keep core's fill
 * (Pill fill color is a later addition; it will make the fill the plugin's and unset text Automatic, through the same
 * path). The pill's colour has a name when it comes from the field's mappings, thresholds or fixed colour (the field
 * PillCell gets: for a pill column with mappings, render-hooks.tsx has replaced its colour config with Fixed, but kept
 * the mappings, so their names are found); a string-hash pill's colour (Grafana's classic hex colours) has none and
 * takes its nearest hue's shades.
 *
 * Built per column each time the columns are built (they are rebuilt when the theme changes), so its cache is keyed on
 * the theme, unlike core's, which is keyed by colour only (its rule doesn't depend on the theme).
 */
export function getPillTextColorFn(
  getTextColorForBackground: (color: string) => string,
  field: Field,
  theme: GrafanaTheme2,
  gridBackground: string
): (color: string) => string {
  const { textColor } = getCellSettings(field);
  if (!textColor) {
    return getTextColorForBackground;
  }
  const font = getTextFont(theme, 'pill', field);
  const colorNameOf = colorNamesFor(theme);
  const cache = new Map<string, string>();
  return (pillColor: string) =>
    cached(
      cache,
      pillColor,
      () =>
        getTextOnFill(
          theme,
          textColor,
          pillColor,
          colorNameOf(field, pillColor),
          { stops: [pillColor], drawnByPlugin: false },
          font,
          gridBackground
        ) ?? getTextColorForBackground(pillColor)
    );
}
