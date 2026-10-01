import { type Field, type GrafanaTheme2 } from '@grafana/data';
import {
  getBestContrastText,
  getColorNameLookup,
  getReadableText,
  getRelativeShadeColor,
  getStylingColor,
  type StylingColor,
  toCanvasColor,
} from '@pjan/grafana-styling';

import {
  FILL_COLOR_MODES,
  type FieldConfigWithStyling,
  LINE_COLOR_MODES,
  type TimelineStylingOptions,
  VALUE_COLOR_MODES,
} from './options';

type BoxColorOptions = Required<Pick<FieldConfigWithStyling, 'fillColor' | 'lineColor' | 'valueColor'>>;

/** What the Pill look sets, for the options left unset. It also hides values that don't fit. */
export const PILL_LOOK: BoxColorOptions = {
  fillColor: { mode: 'shade', shade: 'softer' },
  lineColor: { mode: 'shade', shade: 'base' },
  valueColor: { mode: 'shade', shade: 'stronger' },
};

/** The Pill look's line width, in CSS pixels, for every row. */
export const PILL_LINE_WIDTH = 1;

export const isPillLook = (styling: TimelineStylingOptions) => styling.look === 'pill';

/**
 * The box colours of one row (field), from its own field options, then the look's. Every colour it returns is a
 * canvas colour (see `toCanvasColor`); undefined means core's colour.
 */
export interface RowStyle {
  /** The fill of a state, before Fill opacity; undefined: the state colour */
  getFill: (stateColor: string) => string | undefined;
  /** The line of a state; undefined: the state colour */
  getLine: (stateColor: string) => string | undefined;
  /** Whether the row (or the look) sets a value colour */
  hasValueColor: boolean;
  /** The value text of a state on its fill as drawn; undefined: core's automatic contrast */
  getValueText: (stateColor: string, fill: string) => string | undefined;
}

const getCustom = (field: Field) => (field.config.custom ?? {}) as FieldConfigWithStyling;

const memoize = <T>(fn: (key: string) => T) => {
  const cache = new Map<string, T>();
  return (key: string) => {
    if (!cache.has(key)) {
      cache.set(key, fn(key));
    }
    return cache.get(key)!;
  };
};

/** Undefined when neither the row nor the look sets a box colour, so core's code draws the row. */
export function getRowStyle(field: Field, theme: GrafanaTheme2, styling: TimelineStylingOptions): RowStyle | undefined {
  const custom = getCustom(field);
  const look = isPillLook(styling) ? PILL_LOOK : undefined;
  const fill = getStylingColor(custom.fillColor, FILL_COLOR_MODES) ?? look?.fillColor;
  const line = getStylingColor(custom.lineColor, LINE_COLOR_MODES) ?? look?.lineColor;
  const value = getStylingColor(custom.valueColor, VALUE_COLOR_MODES) ?? look?.valueColor;
  if (!fill && !line && !value) {
    return undefined;
  }

  // The colour names behind the state colours, for the relative shades. A colour without a name (hex, continuous
  // schemes, a palette of hex colours) has no shades.
  const names = getColorNameLookup(field, theme);
  const resolve = (setting: StylingColor, stateColor: string): string | undefined => {
    if (setting.mode === 'fixed') {
      return toCanvasColor(theme, setting.fixedColor!);
    }
    const name = setting.mode === 'shade' ? names.get(stateColor) : undefined;
    const shade = name && getRelativeShadeColor(theme, name, setting.shade!);
    return shade ? toCanvasColor(theme, shade) : undefined;
  };

  const getValueText = memoize((key: string) => {
    const [stateColor, fillColor] = key.split('\n');
    if (value?.mode === 'contrast') {
      return getBestContrastText(theme, fillColor);
    }
    // A shade or a fixed colour that is unreadable on the fill, or a shade the state colour doesn't have: best contrast
    return value ? getReadableText(theme, resolve(value, stateColor), fillColor) : undefined;
  });

  return {
    hasValueColor: Boolean(value),
    getFill: memoize((stateColor) => (fill ? resolve(fill, stateColor) : undefined)),
    getLine: memoize((stateColor) => (line ? resolve(line, stateColor) : undefined)),
    getValueText: (stateColor, fillColor) => getValueText(`${stateColor}\n${fillColor}`),
  };
}
