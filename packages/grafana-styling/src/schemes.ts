import tinycolor from 'tinycolor2';

import { type Field, getFieldColorModeForField, type GrafanaTheme2 } from '@grafana/data';

import { getShadeColor, type RelativeShade } from './shades';

// Shades of colours that come from a continuous colour scheme (pjan, 2026-10-10: "no exception"). Grafana colours a
// value from a continuous scheme by interpolating the scheme's colour stops at the value's position (Grafana 13.2.3
// @grafana/data fieldColor.ts: `FieldColorSchemeMode.getCalculator` → `interpolateRgbBasis(getColors(theme))(percent)`,
// with `getColors` the scheme's colour names resolved through `theme.visualization.getColorByName`). Such a colour
// usually has no name, and its nearest hue changes along the scheme, so shading it on its own breaks the transition.
// Instead, each stop is shaded (named stops by their name's hue, others by their nearest hue, without a hue the stop
// itself; Grafana's special names `panel-bg`, `transparent` and `text` keep their colour) and the shaded stops are
// interpolated at the same position.

/** A continuous colour scheme's stops, as Grafana resolves them for a theme. */
export interface ColorScheme {
  stops: string[];
}

/**
 * The continuous, by-value colour scheme a field's colours come from (Green-Yellow-Red by value, Blues, Viridis, …):
 * its stops as Grafana resolves them, through the public `getFieldColorModeForField` and the mode's `getColors`, which
 * is what Grafana's own calculator interpolates. Undefined for every other colour mode (thresholds, fixed, palettes,
 * shades), and when the stops can't be read: shades then follow the nearest-hue rule.
 */
export function getColorScheme(field: Field, theme: GrafanaTheme2): ColorScheme | undefined {
  const mode = getFieldColorModeForField(field);
  if (!mode.isContinuous || !mode.isByValue || !mode.getColors) {
    return undefined;
  }
  const stops = mode.getColors(theme);
  return stops.length >= 2 ? { stops } : undefined;
}

/** The Grafana colour name of a theme colour (a hue's shade), or undefined. */
function getShadeNameOf(theme: GrafanaTheme2, color: string): string | undefined {
  const target = tinycolor(color).toHex8String();
  for (const hue of theme.visualization.hues) {
    for (const shade of hue.shades) {
      if (tinycolor(theme.visualization.getColorByName(shade.name)).toHex8String() === target) {
        return shade.name;
      }
    }
  }
  return undefined;
}

// Grafana's special colour names a scheme's stops can be (the "from background" schemes start at `panel-bg`): they
// keep their colour, as everywhere in the shared rules (README, "Shades"), not the nearest hue's shade
const SPECIAL_NAMES = ['panel-bg', 'transparent', 'text'];

/** Whether a stop is the colour of one of Grafana's special names in this theme. */
function isSpecialColor(theme: GrafanaTheme2, color: string): boolean {
  const target = tinycolor(color).toHex8String();
  return SPECIAL_NAMES.some((name) => tinycolor(theme.visualization.getColorByName(name)).toHex8String() === target);
}

// Per theme object (a theme plugin that changes its colours builds a new theme), by stops and shade
const shadedSchemes = new WeakMap<GrafanaTheme2, Map<string, ColorScheme>>();

/**
 * Each stop of a scheme in a relative shade of its own hue (without a hue, the stop itself). A stop that is the colour
 * of `panel-bg`, `transparent` or `text` keeps its colour (the "from background" schemes fade into the panel).
 */
export function shadeColorScheme(theme: GrafanaTheme2, scheme: ColorScheme, shade: RelativeShade): ColorScheme {
  let byKey = shadedSchemes.get(theme);
  if (!byKey) {
    byKey = new Map();
    shadedSchemes.set(theme, byKey);
  }
  const key = `${shade}|${scheme.stops.join(';')}`;
  let shaded = byKey.get(key);
  if (!shaded) {
    shaded = {
      stops: scheme.stops.map((stop) =>
        isSpecialColor(theme, stop) ? stop : (getShadeColor(theme, stop, getShadeNameOf(theme, stop), shade) ?? stop)
      ),
    };
    byKey.set(key, shaded);
  }
  return shaded;
}

// A uniform cubic B-spline through the stops, per channel, the end points mirrored: the curve d3-interpolate 3.0.1's
// `interpolateRgbBasis` draws, which Grafana's continuous schemes use. Re-implemented here (it is a few lines of
// arithmetic, and the shared package takes no dependencies beyond the public @grafana/* APIs); `schemes.test.ts`
// checks it against Grafana's own calculator.
function basis(t1: number, v0: number, v1: number, v2: number, v3: number): number {
  const t2 = t1 * t1;
  const t3 = t2 * t1;
  return (
    ((1 - 3 * t1 + 3 * t2 - t3) * v0 + (4 - 6 * t2 + 3 * t3) * v1 + (1 + 3 * t1 + 3 * t2 - 3 * t3) * v2 + t3 * v3) / 6
  );
}

function spline(values: number[], t: number): number {
  const n = values.length - 1;
  let i: number;
  if (t <= 0) {
    t = 0;
    i = 0;
  } else if (t >= 1) {
    t = 1;
    i = n - 1;
  } else {
    i = Math.floor(t * n);
  }
  const v1 = values[i];
  const v2 = values[i + 1];
  const v0 = i > 0 ? values[i - 1] : 2 * v1 - v2;
  const v3 = i < n - 1 ? values[i + 2] : 2 * v2 - v1;
  return basis((t - i / n) * n, v0, v1, v2, v3);
}

const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value) || 0));

/**
 * The colour of a scheme at a position (0–1), as Grafana's continuous calculator draws it: `rgb(r, g, b)` with whole
 * channels, as d3-color formats it.
 */
export function interpolateColorScheme(scheme: ColorScheme, position: number): string {
  const rgb = scheme.stops.map((stop) => tinycolor(stop).toRgb());
  const [r, g, b] = (['r', 'g', 'b'] as const).map((key) =>
    channel(
      spline(
        rgb.map((c) => c[key]),
        position
      )
    )
  );
  return `rgb(${r}, ${g}, ${b})`;
}

/** Where a value sits in a scheme: the display value's `percent`, which Grafana's calculator interpolates at. */
export interface SchemePosition {
  scheme: ColorScheme;
  position: number;
}

/**
 * The shade of a value's colour (one resolver for every shaded colour of the plus plugins that colour by value): with a
 * continuous scheme and the value's position, the scheme's stops shaded and interpolated there (`shadeColorScheme`,
 * `interpolateColorScheme`); otherwise the shade of the colour's name's hue or nearest hue (`getShadeColor`).
 * Undefined when the colour has no hue (the caller draws the colour itself, or Automatic for text).
 */
export function getValueShadeColor(
  theme: GrafanaTheme2,
  color: string,
  colorName: string | undefined,
  shade: RelativeShade,
  scheme?: SchemePosition
): string | undefined {
  // An infinite position is the scheme's end, as Grafana's interpolator clamps it; only NaN has no position
  if (scheme && !Number.isNaN(scheme.position)) {
    return interpolateColorScheme(shadeColorScheme(theme, scheme.scheme, shade), scheme.position);
  }
  return getShadeColor(theme, color, colorName, shade);
}
