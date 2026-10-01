import { RELATIVE_SHADES, type RelativeShade } from './shades';

/**
 * - `shade`: a relative shade of the state colour (`shade`);
 * - `fixed`: a colour from Grafana's colour picker (`fixedColor`);
 * - `contrast`: black or white, whichever contrasts more with the box (value text only);
 * - `state`: the row's current state colour (row names only).
 */
export type StylingColorMode = 'shade' | 'fixed' | 'contrast' | 'state';

/** A colour option of the styling. Like Grafana's own field colour, a mode and what that mode needs. */
export interface StylingColor {
  mode: StylingColorMode;
  shade?: RelativeShade;
  fixedColor?: string;
}

/**
 * The option if it is complete and one of the allowed modes; otherwise undefined, which counts as unset. The editor
 * saves `{ mode: 'fixed' }` until a colour is picked, for example.
 */
export function getStylingColor(value: unknown, modes: StylingColorMode[]): StylingColor | undefined {
  const color = value as StylingColor | undefined;
  if (!color || !modes.includes(color.mode)) {
    return undefined;
  }
  switch (color.mode) {
    case 'shade':
      return color.shade && RELATIVE_SHADES.includes(color.shade) ? color : undefined;
    case 'fixed':
      return color.fixedColor ? color : undefined;
    default:
      return color;
  }
}
