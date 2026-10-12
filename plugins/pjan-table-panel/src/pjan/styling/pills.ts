import { type CSSProperties } from 'react';
import tinycolor from 'tinycolor2';

import { type Field, type GrafanaTheme2 } from '@grafana/data';
import { getStylingColor, getValueShadeColor, type StylingColor } from '@pjan/grafana-styling';

import { cached, colorNamesFor, getFillStops, getTextFont, getTextOnFill } from './cellColors';
import {
  getFieldStyling,
  MAX_PILL_CORNER_RADIUS,
  MAX_PILL_LINE_WIDTH,
  MIN_PILL_LINE_WIDTH,
  PILL_FILL_COLOR_MODES,
  PILL_LINE_COLOR_MODES,
  type TableLook,
  TEXT_COLOR_MODES,
  validNumber,
} from './options';

// Pill cells (plan step 7, build 2; decision 10): Pill fill color, Pill line color, Pill line width, Pill corner radius,
// the Pill look (panel option) and Text color (build 1) on pills. Each column hands its cells a text function
// (render-hooks.tsx, marked: build 1's hook); with a pill option set, that function carries the column's pill style
// (`pjanPillStyle`), which the copied PillCell.tsx (marked) applies to each pill. With nothing set the column hands its
// cells core's own function, and PillCell draws as core. UPSTREAM.md, "Plugin addition: pill options and Look".

/** Core's colour for a transparent pill (PillCell.tsx `TRANSPARENT`), the only one core draws a border on. */
export const CORE_TRANSPARENT_PILL = 'rgba(0,0,0,0)';

/**
 * What the Pill look sets for the pill options left unset: State timeline plus's `PILL_LOOK` (softest shade as fill, a
 * line in the base shade, Automatic text), with a 1 px line. It sets no corner radius.
 */
export const PILL_LOOK = {
  fillColor: { mode: 'shade', shade: 'softer' } as StylingColor,
  lineColor: { mode: 'shade', shade: 'base' } as StylingColor,
  textColor: { mode: 'automatic' } as StylingColor,
};

/** A pill's line width when a line is drawn and Pill line width is not set (State timeline plus's Pill look: 1 px). */
export const UNSET_LINE_WIDTH = 1;

/** A column's pill settings: its own, then the look's for those left unset. Undefined parts are core's. */
export interface PillSettings {
  fillColor?: StylingColor;
  lineColor?: StylingColor;
  lineWidth?: number;
  cornerRadius?: number;
  textColor?: StylingColor;
}

/** The settings of a pill column (complete, in range, or unset), with the panel's look filling the unset ones. */
export function getPillSettings(field: Field, look: TableLook | undefined): PillSettings {
  const styling = getFieldStyling(field.config.custom);
  const pill = look === 'pill' ? PILL_LOOK : undefined;
  return {
    fillColor: getStylingColor(styling.fillColor, PILL_FILL_COLOR_MODES) ?? pill?.fillColor,
    lineColor: getStylingColor(styling.lineColor, PILL_LINE_COLOR_MODES) ?? pill?.lineColor,
    lineWidth: getLineWidth(styling.lineWidth),
    cornerRadius: validNumber(styling.cornerRadius, 0, MAX_PILL_CORNER_RADIUS),
    textColor: getStylingColor(styling.textColor, TEXT_COLOR_MODES) ?? pill?.textColor,
  };
}

/**
 * Pill line width: a number from 1; above the cap (3, a width saved before the cap) it draws at the cap. Anything else
 * (below 1, not a number) is unset.
 */
export function getLineWidth(value: unknown): number | undefined {
  const width = validNumber(value, MIN_PILL_LINE_WIDTH, Number.POSITIVE_INFINITY);
  return width === undefined ? undefined : Math.min(width, MAX_PILL_LINE_WIDTH);
}

const isSet = (s: PillSettings) =>
  Boolean(s.fillColor || s.lineColor || s.textColor) || s.lineWidth !== undefined || s.cornerRadius !== undefined;

/** A colour's alpha (tinycolor: 1 for an opaque or unreadable colour). */
const alphaOf = (color: string) => tinycolor(color).getAlpha();

/**
 * `top` drawn over the opaque `bottom`: the opaque colour you see, rounded to whole channels as the shared package's
 * Automatic composites a translucent colour (`toDrawnRgb`), as `rgb(r,g,b)`.
 */
export function composite(top: string, bottom: string): string {
  const t = tinycolor(top).toRgb();
  const b = tinycolor(bottom).toRgb();
  const mix = (c: number, d: number) => Math.round(c * t.a + d * (1 - t.a));
  return `rgb(${mix(t.r, b.r)},${mix(t.g, b.g)},${mix(t.b, b.b)})`;
}

/**
 * A colour option for a part of the pill: a shade of the pill's colour (of its name's hue, or its nearest hue), or a
 * fixed colour; `noHue` when the shade has no hue (Stat plus's rule: the pill's colour itself).
 */
function resolvePart(
  theme: GrafanaTheme2,
  setting: StylingColor,
  pillColor: string,
  colorName: string | undefined,
  noHue: string
): string {
  if (setting.mode === 'fixed') {
    return theme.visualization.getColorByName(setting.fixedColor!);
  }
  return getValueShadeColor(theme, pillColor, colorName, setting.shade!) ?? noHue;
}

/**
 * The inline style of one pill, from its colour as core picks it (mappings, the fixed colour or the string hash) and
 * the text colour core picks for it; `rowIdx` reads the row's fill (Apply to entire row) the pill is drawn on.
 */
export type PillStyleFn = (pillColor: string, coreTextColor: string, rowIdx: number) => CSSProperties;

/** What a column hands its cells as `getTextColorForBackground`: core's function, with the column's pill style. */
export type PillTextColorFn = ((color: string) => string) & { pjanPillStyle?: PillStyleFn };

export interface PillColumn {
  field: Field;
  theme: GrafanaTheme2;
  /** The panel's look (`options.styling.look`) */
  look: TableLook | undefined;
  /** What the pills are drawn on without a row fill: the table background, or Tooltip from field's */
  background: string;
  /** The row's styles Apply to entire row gives (core's `applyToRowBgFn`), or undefined: no coloured rows */
  applyToRowBgFn: ((rowIdx: number) => CSSProperties) | undefined;
}

/**
 * The pill style of a column, or undefined when no pill option applies (nothing set, and the look not Pill): PillCell
 * then draws core's style. Each setting changes only its own part (Stat plus's rule); every part left unset is core's:
 * - **Fill:** Pill fill color, a shade of the pill's colour (without a hue: the pill's colour) or a fixed colour; the
 *   look's Softer. Unset: the pill's colour.
 * - **Text:** Text color on the fill as drawn (`getTextOnFill`, at the pill's 12 px): unset, Automatic where the plugin
 *   draws the fill (Pill fill color or the look), otherwise core's. A translucent fill is measured as drawn on what is
 *   behind it: the row's fill on a row coloured by Apply to entire row (a gradient row: both of its colours), otherwise
 *   the table's (or the tooltip's) background.
 * - **Line,** inside the edge, at Pill line width (1 px when only a Pill line color, or the look, asks for a line): Pill
 *   line color, a shade of the pill's colour or a fixed colour; with only a width, the pill's colour. A fully
 *   transparent pill's colour is Grafana's border colour for transparent pills (`border.strong`), so its line shows.
 *   Drawn as an inset box shadow, so the pill keeps its size; where core draws its 1 px border (a pill of exactly
 *   `rgba(0,0,0,0)`, Grafana dark's `transparent`) the line replaces it: the border in the line's colour and the rest of
 *   the width inset. Without a line, core's border stays, also under a Pill fill color (the edge isn't the fill's).
 * - **Corner radius:** Pill corner radius; unset, the theme's default (PillCell's class).
 *
 * Built per column each time the columns are built (they are rebuilt when the theme or the look changes), so its
 * cache is keyed on the theme.
 */
export function getPillStyleFn({
  field,
  theme,
  look,
  background,
  applyToRowBgFn,
}: PillColumn): PillStyleFn | undefined {
  const settings = getPillSettings(field, look);
  if (!isSet(settings)) {
    return undefined;
  }
  const { fillColor, lineColor, cornerRadius, textColor } = settings;
  const lineWidth = settings.lineWidth ?? (lineColor ? UNSET_LINE_WIDTH : undefined);
  const font = getTextFont(theme, 'pill', field);
  const colorNameOf = colorNamesFor(theme);
  const cache = new Map<string, CSSProperties>();

  return (pillColor, coreTextColor, rowIdx) => {
    const rowFill = applyToRowBgFn?.(rowIdx).background;
    // What the pill is drawn on: the row's fill (its colours, a translucent one as drawn on the table), or the background
    const behind = (typeof rowFill === 'string' && rowFill !== '' ? getFillStops(rowFill) : undefined)?.map((c) =>
      alphaOf(c) < 1 ? composite(c, background) : c
    ) ?? [background];
    return cached(cache, `${pillColor}|${coreTextColor}|${behind.join(';')}`, () => {
      const colorName = colorNameOf(field, pillColor);
      const fill = fillColor ? resolvePart(theme, fillColor, pillColor, colorName, pillColor) : pillColor;
      // A translucent fill as drawn on each colour behind it (opaque colours, so nothing else composites them)
      const stops = alphaOf(fill) < 1 ? behind.map((b) => composite(fill, b)) : [fill];
      const color =
        getTextOnFill(
          theme,
          textColor,
          pillColor,
          colorName,
          { stops, drawnByPlugin: fillColor !== undefined },
          font,
          behind[0]
        ) ?? coreTextColor;

      // core's border, which core draws on its transparent pill, is the pill's edge: it stays unless a line replaces it
      const coreBorder = pillColor === CORE_TRANSPARENT_PILL;
      const style: CSSProperties = {
        backgroundColor: fill,
        color,
        border: coreBorder ? `1px solid ${theme.colors.border.strong}` : undefined,
      };
      if (lineWidth !== undefined) {
        const pillLine = alphaOf(pillColor) === 0 ? theme.colors.border.strong : pillColor;
        const line = lineColor ? resolvePart(theme, lineColor, pillColor, colorName, pillLine) : pillLine;
        if (coreBorder) {
          style.border = `1px solid ${line}`;
          style.boxShadow = lineWidth > 1 ? `inset 0 0 0 ${lineWidth - 1}px ${line}` : undefined;
        } else {
          style.boxShadow = `inset 0 0 0 ${lineWidth}px ${line}`;
        }
      }
      if (cornerRadius !== undefined) {
        style.borderRadius = cornerRadius;
      }
      return style;
    });
  };
}

/**
 * The text function a pill column hands its cells (render-hooks.tsx, marked; build 1's hook): core's own
 * `getTextColorForBackground` itself when no pill option applies (so PillCell's memo keeps its value), otherwise a
 * function giving core's text, carrying the column's pill style as `pjanPillStyle`. Only PillCell calls it.
 */
export function withPillStyle(
  getTextColorForBackground: (color: string) => string,
  column: PillColumn
): PillTextColorFn {
  const pjanPillStyle = getPillStyleFn(column);
  if (!pjanPillStyle) {
    return getTextColorForBackground;
  }
  const fn: PillTextColorFn = (color: string) => getTextColorForBackground(color);
  fn.pjanPillStyle = pjanPillStyle;
  return fn;
}

/** PillCell's side of the hook (marked in the copy): the pill style its text function carries, if any. */
export const getPillStyle = (getTextColorForBackground: (color: string) => string): PillStyleFn | undefined =>
  (getTextColorForBackground as PillTextColorFn).pjanPillStyle;
