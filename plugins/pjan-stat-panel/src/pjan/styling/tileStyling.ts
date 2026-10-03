import tinycolor from 'tinycolor2';

import { type Field, type FieldDisplay, type GrafanaTheme2 } from '@grafana/data';
import {
  getAutomaticText,
  getColorNameLookup,
  getMinTextContrast,
  getRelativeShadeColor,
  getStylingColor,
  type StylingColor,
  type StylingColorMode,
} from '@pjan/grafana-styling';

import {
  BACKGROUND_COLOR_MODES,
  SPARKLINE_COLOR_MODES,
  type StatStyling,
  TEXT_COLOR_MODES,
  UNSET_SPARKLINE_FILL_OPACITY,
  UNSET_SPARKLINE_LINE_OPACITY,
  UNSET_SPARKLINE_LINE_WIDTH,
} from './options';

/** CSS `gray`, which core's BigValueLayout draws a value without a colour in */
export const GRAY = '#808080';

/** The sparkline fill core's Background modes draw (BigValueLayout.renderChart) */
export const CORE_BACKGROUND_SPARKLINE_FILL = 'rgba(255,255,255,0.4)';

/**
 * The smallest size the value is drawn at. Grafana's `FormattedValueDisplay` (@grafana/ui 13.2.3) draws a non-empty
 * suffix (a unit such as "%" or " ms") smaller than the number when the value's font size is a number: 0.9× below 20 px,
 * 0.8× from 20 px, 0.6× from 26 px. The prefix is drawn at the full size. Re-implemented here from that behaviour (not
 * copied), so Automatic measures the suffix at its own size.
 */
export function getSmallestValueFontSize(fontSize: number, suffix: string | undefined): number {
  if (!suffix) {
    return fontSize;
  }
  const factor = fontSize < 20 ? 0.9 : fontSize < 26 ? 0.8 : 0.6;
  return fontSize * factor;
}

/** The text elements of a tile, each with the minimum contrast of its own size for Automatic. */
export type TextElement = 'value' | 'name' | 'percent';

export interface SparklineStyle {
  lineColor: string;
  fillColor: string;
  lineWidth: number;
}

/** What a tile draws with Color mode Custom: its background, the colour of each text element, and its sparkline. */
export interface TileStyling {
  /** 'transparent' without a background (as core's Value mode) */
  background: string;
  hasBackground: boolean;
  /** Undefined: the element keeps core's colour (the name inherits the panel's text colour) */
  getTextColor(element: TextElement, fontSize: number, fontWeight: number): string | undefined;
  /** `textColor`: the value's colour as drawn, for "Same as text" */
  getSparkline(textColor: string | undefined): SparklineStyle;
}

const COLOR_KEYS = {
  backgroundColor: BACKGROUND_COLOR_MODES,
  textColor: TEXT_COLOR_MODES,
  sparklineColor: SPARKLINE_COLOR_MODES,
} satisfies Partial<Record<keyof StatStyling, StylingColorMode[]>>;

const NUMBER_KEYS = {
  sparklineLineOpacity: [0, 100],
  sparklineFillOpacity: [0, 100],
  sparklineLineWidth: [1, 5],
} satisfies Partial<Record<keyof StatStyling, [number, number]>>;

const validNumber = (value: unknown, [min, max]: [number, number]) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined;

/**
 * One tile's settings: its series' override (`custom.*`) wins over the panel option (`styling.*`). A setting that is
 * incomplete or out of range counts as unset (for example a Fixed color before a colour is picked).
 */
export function resolveStyling(fieldCustom: unknown, panelStyling: StatStyling | undefined): StatStyling {
  const custom = (fieldCustom ?? {}) as Record<string, unknown>;
  const panel = (panelStyling ?? {}) as Record<string, unknown>;
  const resolved: StatStyling = {};
  for (const [key, modes] of Object.entries(COLOR_KEYS)) {
    const color = getStylingColor(custom[key], modes) ?? getStylingColor(panel[key], modes);
    if (color) {
      resolved[key as keyof typeof COLOR_KEYS] = color;
    }
  }
  for (const [key, range] of Object.entries(NUMBER_KEYS)) {
    const value =
      validNumber(custom[key], range as [number, number]) ?? validNumber(panel[key], range as [number, number]);
    if (value !== undefined) {
      resolved[key as keyof typeof NUMBER_KEYS] = value;
    }
  }
  return resolved;
}

/**
 * A tile's colours with Color mode Custom. `valueColor` is the tile's display colour, `colorName` the Grafana colour
 * name behind it (undefined for a colour without one: hex colours, continuous schemes, a palette of hex colours).
 *
 * - Background: None (or not set) draws none; Value the value's colour; a shade of the value's colour (the value's
 *   colour without a name); a fixed colour.
 * - `panelBackground`: what is behind the tiles (the panel background, or the dashboard's canvas for a transparent
 *   panel).
 * - Text, for the value and the name (and percent change on a background): Automatic (`getAutomaticText`: the first
 *   shade of the background's hue, or without a background of the value colour's hue, that reaches the element's
 *   minimum contrast for its size and weight against what it is drawn on, `getMinTextContrast`), the value's colour, a shade of it, or a fixed colour. A value, shade or fixed colour is drawn
 *   as chosen (pjan, 2026-10-03); a shade of a colour without a name is Automatic. Not set: Automatic on a background;
 *   without one, the value in its colour and the name in the panel's text colour (core's Value mode).
 * - Sparkline: the value's colour, a shade of it (the value's colour without a name), the value text's colour, or a
 *   fixed colour; line opacity (not set: as the colour, opaque), fill opacity (set: the line's colour at that alpha),
 *   line width (not set: 1).
 * - Other unset parts follow core (pjan, 2026-10-02): without a background (or with None), core's Value mode
 *   (sparkline line in the value colour, fill at 20 % of the line colour); with one, core's Background Solid on that
 *   tile colour (sparkline line the tile colour brightened by 40, fill white at 40 % even when the sparkline colour is
 *   set).
 */
export function getTileStyling(
  theme: GrafanaTheme2,
  valueColor: string,
  colorName: string | undefined,
  styling: StatStyling,
  panelBackground: string = theme.colors.background.primary
): TileStyling {
  const shade = (setting: StylingColor) =>
    colorName && setting.shade ? getRelativeShadeColor(theme, colorName, setting.shade) : undefined;
  const fixed = (setting: StylingColor) => theme.visualization.getColorByName(setting.fixedColor!);

  const backgroundSetting = styling.backgroundColor;
  let background: string | undefined;
  switch (backgroundSetting?.mode) {
    case 'value':
      background = valueColor;
      break;
    case 'shade':
      background = shade(backgroundSetting) ?? valueColor;
      break;
    case 'fixed':
      background = fixed(backgroundSetting);
      break;
  }
  const hasBackground = background !== undefined;
  // What the text is drawn on: the tile's background (a translucent one over what is behind the panel), or what is
  // behind the text without one (the panel background; the dashboard's canvas for a transparent panel)
  const drawnOn = background ?? panelBackground;

  const textSetting = styling.textColor;
  const getTextColor = (element: TextElement, fontSize: number, fontWeight: number): string | undefined => {
    // Automatic starts from the background's colour, or without one from the value's own colour (pjan, 2026-10-03)
    const automatic = () =>
      getAutomaticText(theme, drawnOn, getMinTextContrast(fontSize, fontWeight), {
        background: panelBackground,
        from: hasBackground ? undefined : valueColor,
      });
    if (!textSetting) {
      if (hasBackground) {
        return automatic();
      }
      return element === 'value' ? valueColor : undefined;
    }
    // A value, shade or fixed colour is drawn as chosen; Automatic, and a shade of a colour without a name, is the
    // first readable shade of the background's hue
    switch (textSetting.mode) {
      case 'value':
        return valueColor;
      case 'shade':
        return shade(textSetting) ?? automatic();
      case 'fixed':
        return fixed(textSetting);
      default:
        return automatic();
    }
  };

  const getSparkline = (textColor: string | undefined): SparklineStyle => {
    const setting = styling.sparklineColor;
    // Not set: core's Value mode (the value colour) without a background; on one, core's Background Solid (the tile
    // colour brightened by 40, as BigValueLayout.renderChart does with the value colour)
    let color = hasBackground ? tinycolor(background).brighten(40).toRgbString() : valueColor;
    switch (setting?.mode) {
      case 'value':
        color = valueColor;
        break;
      case 'shade':
        color = shade(setting) ?? valueColor;
        break;
      case 'text':
        color = textColor ?? valueColor;
        break;
      case 'fixed':
        color = fixed(setting);
        break;
    }
    const lineOpacity = styling.sparklineLineOpacity;
    const fillOpacity = styling.sparklineFillOpacity;
    let fillColor: string;
    if (fillOpacity !== undefined) {
      fillColor = tinycolor(color)
        .setAlpha(fillOpacity / 100)
        .toRgbString();
    } else if (hasBackground) {
      // core's Background Solid fill, whatever the line's colour
      fillColor = CORE_BACKGROUND_SPARKLINE_FILL;
    } else {
      fillColor = tinycolor(color)
        .setAlpha(UNSET_SPARKLINE_FILL_OPACITY / 100)
        .toRgbString();
    }
    return {
      // Not set: the colour as given (opaque), as core draws it
      lineColor:
        lineOpacity === undefined || lineOpacity === UNSET_SPARKLINE_LINE_OPACITY
          ? color
          : tinycolor(color)
              .setAlpha(lineOpacity / 100)
              .toRgbString(),
      fillColor,
      lineWidth: styling.sparklineLineWidth ?? UNSET_SPARKLINE_LINE_WIDTH,
    };
  };

  return { background: background ?? 'transparent', hasBackground, getTextColor, getSparkline };
}

/**
 * The styling of one Stat tile with Color mode Custom: the colour name behind its colour (the tile's field, looked up
 * as State timeline plus does; series indexes as applyFieldOverrides set them, for the classic palette), and its settings
 * (the series' override over the panel option).
 */
export function getStatTileStyling(
  theme: GrafanaTheme2,
  tile: FieldDisplay,
  panelStyling: StatStyling | undefined,
  transparent = false
): TileStyling {
  // As core's BigValueLayout, a value without a colour is drawn gray: CSS `gray` as its hex value, which draws the
  // same and which the contrast helpers (colorManipulator.decomposeColor) can read
  const valueColor = tile.display.color ?? GRAY;
  const field: Field | undefined = tile.colIndex !== undefined ? tile.view?.dataFrame.fields[tile.colIndex] : undefined;
  const colorName = field && tile.display.color ? getColorNameLookup(field, theme).get(tile.display.color) : undefined;
  // Behind a transparent panel is the dashboard's canvas (Grafana 13.2.3 draws transparent panels without a background)
  const panelBackground = transparent ? theme.colors.background.canvas : theme.colors.background.primary;
  return getTileStyling(theme, valueColor, colorName, resolveStyling(tile.field.custom, panelStyling), panelBackground);
}
