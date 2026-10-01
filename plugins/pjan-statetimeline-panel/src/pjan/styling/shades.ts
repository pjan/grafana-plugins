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

/**
 * The softest shade of a colour name's hue that reaches `minContrast` against the panel background, or undefined when
 * no shade does, or the name has no ranked hue.
 */
export function getSoftestReadableShadeColor(
  theme: GrafanaTheme2,
  colorName: string,
  minContrast: number
): string | undefined {
  const ranked = rankHue(theme, getHueOfColorName(colorName));
  const index = ranked?.contrasts.findIndex((contrast) => contrast >= minContrast) ?? -1;
  return index === -1 ? undefined : ranked!.colors[index];
}
