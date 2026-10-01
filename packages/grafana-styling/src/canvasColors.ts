import tinycolor from 'tinycolor2';

import { colorManipulator, type GrafanaTheme2 } from '@grafana/data';

/** The contrast a text colour of the styling must reach against what it is drawn on (WCAG AA for normal text). */
export const MIN_TEXT_CONTRAST = 4.5;

const BLACK = 'rgb(0,0,0)';
const WHITE = 'rgb(255,255,255)';

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

/** The contrast of a text colour on a fill, with a translucent fill composited over the panel background. */
export function getTextContrast(theme: GrafanaTheme2, text: string, fill: string): number {
  return colorManipulator.getContrastRatio(text, asRgba(fill), theme.colors.background.primary);
}

/** "Best contrast": black or white, whichever contrasts more with the fill (composited over the panel background). */
export function getBestContrastText(theme: GrafanaTheme2, fill: string): string {
  return getTextContrast(theme, WHITE, fill) >= getTextContrast(theme, BLACK, fill) ? WHITE : BLACK;
}

/** A text colour if it reaches MIN_TEXT_CONTRAST on the fill; otherwise best contrast. */
export function getReadableText(theme: GrafanaTheme2, text: string | undefined, fill: string): string {
  return text && getTextContrast(theme, text, fill) >= MIN_TEXT_CONTRAST ? text : getBestContrastText(theme, fill);
}
