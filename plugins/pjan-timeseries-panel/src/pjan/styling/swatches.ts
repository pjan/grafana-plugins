import { type DataFrame, FieldColorModeId, type GrafanaTheme2 } from '@grafana/data';

import { getSeriesColors } from './seriesColors';

// The legend and the tooltip take a series' swatch from the field's colour, not from the line drawn: with a Line color
// set they would show the series colour. These give them the drawn line colour, as State timeline plus does for its
// fills (its swatches.ts). Nothing changes for series without one.

/** The frames for the legend, with each series' line colour as its fixed colour. `frames` itself when none is set. */
export function withLineSwatches(frames: DataFrame[], theme: GrafanaTheme2): DataFrame[] {
  let styled = false;
  const result = frames.map((frame) => ({
    ...frame,
    fields: frame.fields.map((field) => {
      const line = getSeriesColors(field, theme)?.line;
      if (!line) {
        return field;
      }
      styled = true;
      return { ...field, config: { ...field.config, color: { mode: FieldColorModeId.Fixed, fixedColor: line } } };
    }),
  }));
  return styled ? result : frames;
}

// The tooltip renders on every cursor move: its frame is worked out once per aligned frame and theme
const tooltipFrames = new WeakMap<DataFrame, { theme: GrafanaTheme2; frame: DataFrame }>();

/**
 * The tooltip's frame, with each series' line colour as its display colour. `frame` itself when none is set. Cached
 * per aligned frame and theme.
 */
export function withLineSwatchDisplay(frame: DataFrame, theme: GrafanaTheme2): DataFrame {
  const cached = tooltipFrames.get(frame);
  if (cached?.theme === theme) {
    return cached.frame;
  }
  const result = lineSwatchDisplay(frame, theme);
  tooltipFrames.set(frame, { theme, frame: result });
  return result;
}

function lineSwatchDisplay(frame: DataFrame, theme: GrafanaTheme2): DataFrame {
  let styled = false;
  const fields = frame.fields.map((field) => {
    const line = getSeriesColors(field, theme)?.line;
    const display = field.display;
    if (!line || !display) {
      return field;
    }
    styled = true;
    return { ...field, display: (value: unknown) => ({ ...display(value), color: line }) };
  });
  return styled ? { ...frame, fields } : frame;
}
