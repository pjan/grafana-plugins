import tinycolor from 'tinycolor2';

import { colorManipulator, type GrafanaTheme2 } from '@grafana/data';

/** WCAG 2 AA: 4.5:1 for normal text, 3:1 for large text. */
const MIN_CONTRAST_NORMAL_TEXT = 4.5;
const MIN_CONTRAST_LARGE_TEXT = 3;
// Large text: 18 pt, or 14 pt bold (WCAG 2), in CSS pixels (1 pt = 4/3 px)
const LARGE_TEXT_PX = 24;
const LARGE_BOLD_TEXT_PX = 18.66;
const BOLD = 700;

/**
 * The contrast a text colour of the styling must reach against what it is drawn on, for text of this size and weight
 * (WCAG 2 AA): 3:1 for large text (at least 24 px, or 18.66 px at weight 700 and above), 4.5:1 otherwise.
 */
export function getMinTextContrast(fontSize: number, fontWeight: number | string = 400): number {
  const weight = typeof fontWeight === 'number' ? fontWeight : fontWeight === 'bold' ? BOLD : Number(fontWeight) || 400;
  const large = fontSize >= LARGE_TEXT_PX || (fontSize >= LARGE_BOLD_TEXT_PX && weight >= BOLD);
  return large ? MIN_CONTRAST_LARGE_TEXT : MIN_CONTRAST_NORMAL_TEXT;
}

/**
 * The contrast text that needs 4.5:1 may fall back to when no colour reaches 4.5:1 (pjan, 2026-10-03). With a theme's
 * page colours as the end points, mid-tone fills can't always reach 4.5:1 (Atlas: at least 4.41:1).
 */
export const FALLBACK_TEXT_CONTRAST = 4.2;

// The search moves in 1 % steps from the start colour to an end point.
const AUTOMATIC_TEXT_STEPS = 100;

/**
 * A colour the styling sets, as drawn on the canvas: `rgb()`/`rgba()` without spaces (Fill color shades excepted, see
 * `toFillColor`). Theme plugins that recolour canvases by matching Grafana's exact colour strings (the Atlas theme
 * matches its hex shades and Grafana's grid and text colours) leave it alone, while the colours the styling doesn't
 * set keep Grafana's strings. Undefined for a colour the theme doesn't resolve.
 */
export function toCanvasColor(theme: GrafanaTheme2, color: string): string | undefined {
  const c = tinycolor(theme.visualization.getColorByName(color));
  return c.isValid() ? c.toRgbString().replace(/\s+/g, '') : undefined;
}

/**
 * A Fill color shade, in the form core's timeline.ts applies Fill opacity to: lowercase hex, as Grafana's colours are
 * hex (colorManipulator.alpha mangles rgb() without spaces). With its opacity applied it is drawn as `#rrggbbaa`,
 * like core's own fills, not as an rgb() colour; the Atlas theme plugin doesn't recolour fills.
 */
export function toFillColor(color: string): string {
  const c = tinycolor(color);
  return c.getAlpha() < 1 ? c.toHex8String() : c.toHexString();
}

/**
 * A colour as colorManipulator composites it: `rgba(...)`. Core's Fill opacity (colorManipulator.alpha) turns a state
 * colour given as `rgb(r, g, b)` (the continuous schemes) into `rgb(r, g, b, a)`, which colorManipulator's luminance
 * reads as opaque. (tinycolor can't be used: its rgb() matcher isn't anchored and drops the alpha.)
 */
function asRgba(color: string): string {
  const decomposed = colorManipulator.decomposeColor(color);
  return decomposed.type === 'rgb' && decomposed.values.length === 4
    ? colorManipulator.recomposeColor({ ...decomposed, type: 'rgba' })
    : color;
}

/** `top` drawn over the opaque `bottom`: the opaque `rgb()` colour you see, rounded to whole channels as drawn. */
function composite(top: string, bottom: string): string {
  const t = colorManipulator.decomposeColor(top).values;
  const b = colorManipulator.decomposeColor(bottom).values;
  const a = t.length === 4 ? t[3] : 1;
  return colorManipulator.recomposeColor({
    type: 'rgb',
    values: [0, 1, 2].map((i) => Math.round(t[i] * a + b[i] * (1 - a))),
  });
}

const isTranslucent = (color: string) => {
  const parts = colorManipulator.decomposeColor(color);
  return parts.values.length === 4 && parts.values[3] < 1;
};

/**
 * The contrast of a text colour on a fill, as drawn: a translucent fill composited over the panel background, and a
 * translucent text over that fill. `background` is what is behind the fill (the panel background unless given; a
 * transparent panel shows the dashboard's canvas).
 */
export function getTextContrast(
  theme: GrafanaTheme2,
  text: string,
  fill: string,
  background: string = theme.colors.background.primary
): number {
  const textRgba = asRgba(text);
  if (!isTranslucent(textRgba)) {
    // Grafana's own composition of the fill over the background (getLuminance), unchanged
    return colorManipulator.getContrastRatio(text, asRgba(fill), background);
  }
  const fillRgba = asRgba(fill);
  const behind = isTranslucent(fillRgba) ? composite(fillRgba, background) : fillRgba;
  return colorManipulator.getContrastRatio(composite(textRgba, behind), behind);
}

type Rgb = [number, number, number];

/**
 * A colour's channels as drawn: a translucent colour composited over `background`, rounded to whole channels.
 * Undefined for a colour that can't be read (a name the theme doesn't resolve, for example), so callers never throw.
 * Grafana's parser first (it reads `rgb(r, g, b, a)`, which core's Fill opacity produces), tinycolor for the rest
 * (hsl(), CSS names).
 */
function toDrawnRgb(color: string, background: Rgb): Rgb | undefined {
  let rgba: number[] | undefined;
  try {
    const parts = colorManipulator.decomposeColor(asRgba(color));
    if (parts.type === 'rgb' || parts.type === 'rgba') {
      rgba = parts.values;
    }
  } catch {
    // not a colour Grafana's parser reads
  }
  if (!rgba) {
    const t = tinycolor(color);
    if (!t.isValid()) {
      return undefined;
    }
    const { r, g, b, a } = t.toRgb();
    rgba = [r, g, b, a];
  }
  const alpha = rgba.length > 3 ? rgba[3] : 1;
  return [0, 1, 2].map((i) => Math.round(rgba![i] * alpha + background[i] * (1 - alpha))) as Rgb;
}

/** Relative luminance as Grafana's `colorManipulator.getLuminance` computes it, rounded to 3 digits as it is. */
function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return Number((0.2126 * lr + 0.7152 * lg + 0.0722 * lb).toFixed(3));
}

const contrastOf = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** `from` mixed towards `to` by `amount` (0–1) in sRGB, rounded to whole channels. */
const mix = (from: Rgb, to: Rgb, amount: number): Rgb =>
  [0, 1, 2].map((i) => Math.round(from[i] + (to[i] - from[i]) * amount)) as Rgb;

const toRgbString = ([r, g, b]: Rgb) => `rgb(${r},${g},${b})`;

// Results per theme object (a theme plugin that changes its colours builds a new theme); bounded, because a
// continuous scheme can ask for many fills
const automaticCache = new WeakMap<GrafanaTheme2, Map<string, string>>();
const AUTOMATIC_CACHE_SIZE = 2000;

export interface AutomaticTextOptions {
  /** The colour the search starts from; the colour drawn on unless given (State timeline plus row names: the state colour) */
  from?: string;
  /** What is behind a translucent `drawnOn`; the panel background unless given (a transparent panel shows the page) */
  background?: string;
  /**
   * Other colours the text is drawn on as well, such as the other stops of a gradient (Table plus's Colored
   * background): every step is measured against `drawnOn` and each of these, and the lowest contrast counts.
   */
  alsoOn?: string[];
}

/**
 * "Automatic" text: a colour of the same hue that is readable on what it is drawn on (pjan, 2026-10-03).
 *
 * The search starts from `from` (the colour drawn on, as drawn, unless given) and mixes it towards each of the theme's
 * two extremes, its page colour (`colors.background.canvas`) and `colors.text.maxContrast`, in 1 % steps. The first
 * colour that reaches `minContrast` (see `getMinTextContrast`) with `drawnOn` wins, on whichever side gets there in
 * fewer steps (the page colour's side on a tie). When neither side reaches it, the same with FALLBACK_TEXT_CONTRAST,
 * for text that needs more than that; when even that fails, the extreme with the higher contrast. A colour that can't
 * be read (a name the active theme doesn't resolve) gives the theme's text colour instead of throwing. With `alsoOn`,
 * the contrast of a step is its lowest with `drawnOn` and those colours (a gradient's stops). Results are cached per
 * theme object.
 */
export function getAutomaticText(
  theme: GrafanaTheme2,
  drawnOn: string,
  minContrast: number,
  options: AutomaticTextOptions = {}
): string {
  const key = `${drawnOn}|${minContrast}|${options.from ?? ''}|${options.background ?? ''}|${options.alsoOn?.join(';') ?? ''}`;
  let cache = automaticCache.get(theme);
  if (!cache) {
    cache = new Map();
    automaticCache.set(theme, cache);
  }
  let text = cache.get(key);
  if (text === undefined) {
    text = searchAutomaticText(theme, drawnOn, minContrast, options);
    if (cache.size >= AUTOMATIC_CACHE_SIZE) {
      cache.clear();
    }
    cache.set(key, text);
  }
  return text;
}

function searchAutomaticText(
  theme: GrafanaTheme2,
  drawnOn: string,
  minContrast: number,
  options: AutomaticTextOptions
): string {
  const fallback = theme.colors.text.primary;
  const background = toDrawnRgb(options.background ?? theme.colors.background.primary, [255, 255, 255]);
  const behind = background && toDrawnRgb(drawnOn, background);
  const start = behind && (options.from ? toDrawnRgb(options.from, background) : behind);
  const alsoBehind = (options.alsoOn ?? []).map((color) => background && toDrawnRgb(color, background));
  if (!background || !behind || !start || alsoBehind.some((color) => !color)) {
    return fallback;
  }
  const ends = [theme.colors.background.canvas, theme.colors.text.maxContrast]
    .map((end) => toDrawnRgb(end, background))
    .filter((end): end is Rgb => end !== undefined);
  if (ends.length === 0) {
    return fallback;
  }
  // The lowest contrast with what the text is drawn on (one colour, or several with `alsoOn`)
  const behindLuminances = [behind, ...(alsoBehind as Rgb[])].map(luminance);
  const contrast = (color: Rgb) => {
    const l = luminance(color);
    return Math.min(...behindLuminances.map((b) => contrastOf(l, b)));
  };
  const thresholds = minContrast > FALLBACK_TEXT_CONTRAST ? [minContrast, FALLBACK_TEXT_CONTRAST] : [minContrast];

  for (const threshold of thresholds) {
    let found: { steps: number; color: Rgb } | undefined;
    for (const end of ends) {
      for (let steps = 0; steps <= AUTOMATIC_TEXT_STEPS && (!found || steps < found.steps); steps++) {
        const color = mix(start, end, steps / AUTOMATIC_TEXT_STEPS);
        if (contrast(color) >= threshold) {
          found = { steps, color };
          break;
        }
      }
    }
    if (found) {
      return toRgbString(found.color);
    }
  }
  return toRgbString(ends.reduce((best, end) => (contrast(end) > contrast(best) ? end : best)));
}
