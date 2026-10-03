import tinycolor from 'tinycolor2';

import { colorManipulator, type GrafanaTheme2 } from '@grafana/data';

/** Relative shades of a state colour, from the least to the most contrast with the panel background. */
export const RELATIVE_SHADES = ['softer', 'soft', 'base', 'strong', 'stronger'] as const;
export type RelativeShade = (typeof RELATIVE_SHADES)[number];

// Grafana's shade names of a hue, in its own order (lightest to darkest in the stock themes).
const SHADE_PREFIXES = ['super-light-', 'light-', '', 'semi-dark-', 'dark-'];
// Longest prefix first: 'super-light-' before 'light-', 'semi-dark-' before 'dark-'.
const PREFIXES_BY_LENGTH = ['super-light-', 'semi-dark-', 'light-', 'dark-'];

/** The hue of a Grafana colour name: `super-light-green` -> `green`. */
export function getHueOfColorName(name: string): string {
  const prefix = PREFIXES_BY_LENGTH.find((p) => name.startsWith(p));
  return prefix ? name.slice(prefix.length) : name;
}

export interface RankedHue {
  hue: string;
  /** The five shade names, softer to stronger */
  names: string[];
  /** Their colours in the theme, softer to stronger */
  colors: string[];
  /** Their contrast ratios with the panel background (`theme.colors.background.primary`), softer to stronger */
  contrasts: number[];
}

// Per theme object: a theme plugin that changes its colours builds a new theme, so nothing goes stale.
const cache = new WeakMap<GrafanaTheme2, Map<string, RankedHue | null>>();

/**
 * The five shades of a hue, ranked by contrast with the panel background in this theme: index 0 is the softest (the
 * shade nearest the background), index 4 the strongest. The rank doesn't depend on Grafana's shade names, so it means
 * the same in a light theme, a dark theme, and a theme that defines the names in another order.
 *
 * Undefined when the theme doesn't resolve all five shade names: a hue the theme doesn't have, a hex colour, `text`,
 * `transparent`, or a CSS name such as `gray` in Grafana's stock themes. Ties keep Grafana's shade order, read from the
 * background towards the text (light to dark on a light background, dark to light on a dark one).
 */
export function rankHue(theme: GrafanaTheme2, hue: string): RankedHue | undefined {
  let byHue = cache.get(theme);
  if (!byHue) {
    byHue = new Map();
    cache.set(theme, byHue);
  }
  let ranked = byHue.get(hue);
  if (ranked === undefined) {
    ranked = computeRankedHue(theme, hue);
    byHue.set(hue, ranked);
  }
  return ranked ?? undefined;
}

function computeRankedHue(theme: GrafanaTheme2, hue: string): RankedHue | null {
  const names = SHADE_PREFIXES.map((prefix) => prefix + hue);
  const colors = names.map((name) => theme.visualization.getColorByName(name));
  // getColorByName returns an unknown name unchanged
  if (colors.some((color, i) => color === names[i])) {
    return null;
  }
  const background = theme.colors.background.primary;
  const contrasts = colors.map((color) => colorManipulator.getContrastRatio(color, background));
  const tieOrder = theme.isDark ? -1 : 1;
  const order = [0, 1, 2, 3, 4].sort((a, b) => contrasts[a] - contrasts[b] || (a - b) * tieOrder);
  return {
    hue,
    names: order.map((i) => names[i]),
    colors: order.map((i) => colors[i]),
    contrasts: order.map((i) => contrasts[i]),
  };
}

/** The colour of a relative shade of a Grafana colour name, or undefined when the name has no ranked hue. */
export function getRelativeShadeColor(
  theme: GrafanaTheme2,
  colorName: string,
  shade: RelativeShade
): string | undefined {
  return rankHue(theme, getHueOfColorName(colorName))?.colors[RELATIVE_SHADES.indexOf(shade)];
}

// Grafana's names for a theme's own colours (createVisualizationColors.ts): never a hue's shade.
const SPECIAL_COLOR_NAMES = new Set(['transparent', 'text', 'panel-bg']);

/**
 * The colour of a relative shade of a colour: of its name's hue when it has a Grafana colour name (a hue's shade name
 * the theme ranks), otherwise of its nearest theme hue (`getNearestHue`): a hex or rgb() colour, or a CSS name such as
 * `lime` in a theme without a lime hue. Grafana's special names (`transparent`, `text`, `panel-bg`) have no shades.
 * Undefined when there is no hue: the caller then draws the colour itself.
 */
export function getShadeColor(
  theme: GrafanaTheme2,
  color: string,
  colorName: string | undefined,
  shade: RelativeShade
): string | undefined {
  const index = RELATIVE_SHADES.indexOf(shade);
  const named = colorName ? rankHue(theme, getHueOfColorName(colorName)) : undefined;
  if (named) {
    return named.colors[index];
  }
  if (colorName && SPECIAL_COLOR_NAMES.has(colorName)) {
    return undefined;
  }
  const hue = getNearestHue(theme, color);
  return hue ? rankHue(theme, hue)?.colors[index] : undefined;
}

/** OKLCH chroma below this is gray: such colours and shades don't take part in hue matching. */
export const HUE_CHROMA_FLOOR = 0.04;
/** The nearest hue's closest shade must be within this many degrees of the colour's hue angle, … */
export const HUE_MAX_DISTANCE = 15;
/** … and the second-nearest hue at least this many degrees further away. */
export const HUE_MIN_MARGIN = 5;

interface Oklch {
  l: number;
  c: number;
  /** Hue angle in degrees, 0–360 */
  h: number;
}

const toLinear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/**
 * A colour in OKLCH (Björn Ottosson's OKLab), from its sRGB channels. Alpha is ignored, so a fully transparent colour
 * reads as its channels (`rgba(0,0,0,0)` as black). Undefined if unreadable.
 */
export function toOklch(color: string): Oklch | undefined {
  const parsed = tinycolor(color);
  if (!parsed.isValid()) {
    return undefined;
  }
  const { r, g, b } = parsed.toRgb();
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(okB, okA) * 180) / Math.PI;
  return { l: okL, c: Math.hypot(okA, okB), h: h < 0 ? h + 360 : h };
}

const angleBetween = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

interface HueAngles {
  /** The first hue whose shades are all gray, if any */
  gray?: string;
  /** Every other hue, with the angles of its shades that aren't gray */
  chromatic: Array<{ hue: string; angles: number[] }>;
  nearest: Map<string, string | null>;
}

// Per theme object, as the ranking.
const hueAngleCache = new WeakMap<GrafanaTheme2, HueAngles>();

function getHueAngles(theme: GrafanaTheme2): HueAngles {
  let angles = hueAngleCache.get(theme);
  if (!angles) {
    angles = { chromatic: [], nearest: new Map() };
    for (const { name, shades } of theme.visualization.hues) {
      const colors = shades.map((shade) => toOklch(shade.color)).filter((c): c is Oklch => c !== undefined);
      if (colors.length === 0) {
        continue; // no shade the rule can read
      }
      const chromatic = colors.filter((c) => c.c >= HUE_CHROMA_FLOOR);
      if (chromatic.length === 0) {
        angles.gray ??= name;
      } else {
        angles.chromatic.push({ hue: name, angles: chromatic.map((c) => c.h) });
      }
    }
    hueAngleCache.set(theme, angles);
  }
  return angles;
}

/**
 * The theme hue (`theme.visualization.hues`) a colour without a Grafana name belongs to, so it can take that hue's
 * named shades (pjan, 2026-10-03). In OKLCH:
 * - hues whose shades are all below the chroma floor are gray and don't take part in hue matching; nor do the shades
 *   of other hues below the floor, nor hues without a readable shade;
 * - a colour below the floor takes the theme's gray hue (the first), or none if the theme has none;
 * - otherwise the hue with the shade nearest the colour's hue angle wins, if that shade is within `HUE_MAX_DISTANCE`
 *   and the second-nearest hue's nearest shade is at least `HUE_MIN_MARGIN` further away; else none.
 *
 * Undefined when no hue wins, or the colour can't be read.
 */
export function getNearestHue(theme: GrafanaTheme2, color: string): string | undefined {
  const { gray, chromatic, nearest } = getHueAngles(theme);
  let hue = nearest.get(color);
  if (hue === undefined) {
    hue = findNearestHue(color, gray, chromatic);
    nearest.set(color, hue);
  }
  return hue ?? undefined;
}

function findNearestHue(color: string, gray: string | undefined, chromatic: HueAngles['chromatic']): string | null {
  const oklch = toOklch(color);
  if (!oklch) {
    return null;
  }
  if (oklch.c < HUE_CHROMA_FLOOR) {
    return gray ?? null;
  }
  const distances = chromatic
    .map(({ hue, angles }) => ({ hue, distance: Math.min(...angles.map((angle) => angleBetween(oklch.h, angle))) }))
    .sort((a, b) => a.distance - b.distance);
  const [first, second] = distances;
  if (!first || first.distance > HUE_MAX_DISTANCE) {
    return null;
  }
  return !second || second.distance - first.distance >= HUE_MIN_MARGIN ? first.hue : null;
}
