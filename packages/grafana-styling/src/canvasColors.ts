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

const BLACK = 'rgb(0,0,0)';
const WHITE = 'rgb(255,255,255)';

/** Best contrast's two text colours by default: white and black (State timeline ++). */
export const BLACK_AND_WHITE: readonly string[] = [WHITE, BLACK];

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

/**
 * "Best contrast": of the candidate text colours (black and white unless given), the one that contrasts most with the
 * fill (composited over the panel background); the first on a tie.
 */
export function getBestContrastText(
  theme: GrafanaTheme2,
  fill: string,
  candidates: readonly string[] = BLACK_AND_WHITE,
  background?: string
): string {
  let best = candidates[0];
  let bestContrast = getTextContrast(theme, best, fill, background);
  for (const candidate of candidates.slice(1)) {
    const contrast = getTextContrast(theme, candidate, fill, background);
    if (contrast > bestContrast) {
      best = candidate;
      bestContrast = contrast;
    }
  }
  return best;
}

/**
 * A text colour if it reaches `minContrast` on the fill (see `getMinTextContrast`); otherwise best contrast of the
 * candidates.
 */
export function getReadableText(
  theme: GrafanaTheme2,
  text: string | undefined,
  fill: string,
  minContrast: number,
  candidates: readonly string[] = BLACK_AND_WHITE,
  background?: string
): string {
  return text && getTextContrast(theme, text, fill, background) >= minContrast
    ? text
    : getBestContrastText(theme, fill, candidates, background);
}
