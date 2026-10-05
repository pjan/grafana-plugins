import { type GrafanaTheme2 } from '@grafana/data';
import { type UPlotConfigBuilder } from '@grafana/ui';
import { getShadeColor, getStylingColor, type StylingColor } from '@pjan/grafana-styling';
import tinycolor from 'tinycolor2';
import uPlot from 'uplot';

import {
  getThresholdsDrawHook,
  type UPlotThresholdOptions,
} from '../../packages/grafana-ui/src/components/uPlot/config/UPlotThresholds';

import { type SeriesStyling, showThresholdLines, THRESHOLD_LINE_COLOR_MODES } from './options';

/**
 * How the copied threshold hook (`UPlotThresholds.ts`, its marked `lines` option) draws the lines of a series with
 * threshold line options.
 */
export interface ThresholdLineStyle {
  /**
   * The colour of a line, from the colour Grafana draws it in (the step colour, or the previous step's below the first
   * transparent step, at alpha 0.7 when the colour has none of its own) and the step colour it was resolved from (a
   * Grafana colour name or a colour). Undefined: the line is not drawn.
   */
  color: (color: tinycolor.Instance, colorName: string) => string | undefined;
  /** The line width in canvas pixels, read when drawing; undefined: Grafana's 2 */
  width: () => number | undefined;
}

/** The custom field config the threshold line options are read from: the series' own, defaults and overrides. */
interface ThresholdLineConfig {
  thresholdsStyle?: { mode?: string };
  styling?: SeriesStyling;
}

// Grafana's alpha for a threshold line whose colour has none of its own (UPlotThresholds.ts)
const DEFAULT_LINE_ALPHA = 0.7;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * The colour of one threshold line with the options set (`color` as Grafana draws it, see `ThresholdLineStyle`):
 * - a line Grafana draws at alpha 0 (a later transparent step, a `#rrggbb00` or `rgba(…, 0)` colour) is not drawn;
 * - a shade is of that line's colour: of its Grafana name's hue, else of the nearest theme hue; without a hue, the
 *   colour itself. It keeps the line's alpha;
 * - Fixed is drawn at 0.7, unless the fixed colour has an alpha of its own;
 * - Opacity, when set, replaces the alpha in every case.
 */
export function getThresholdLineColor(
  color: tinycolor.Instance,
  colorName: string,
  option: StylingColor | undefined,
  opacity: number | undefined,
  theme: GrafanaTheme2
): string | undefined {
  if (color.getAlpha() === 0) {
    return undefined;
  }
  let line: tinycolor.Instance;
  switch (option?.mode) {
    case 'fixed': {
      line = tinycolor(theme.visualization.getColorByName(option.fixedColor!));
      if (line.getAlpha() === 1) {
        line.setAlpha(DEFAULT_LINE_ALPHA);
      }
      break;
    }
    case 'shade': {
      const shade = getShadeColor(theme, theme.visualization.getColorByName(colorName), colorName, option.shade!);
      line = shade ? tinycolor(shade).setAlpha(color.getAlpha()) : color.clone();
      break;
    }
    default:
      line = color.clone();
  }
  if (opacity !== undefined) {
    line.setAlpha(Math.min(100, Math.max(0, opacity)) / 100);
  }
  return line.toString();
}

/** A width in CSS pixels in canvas pixels (as the copied AnnotationsPlugin.tsx), at least one. */
export const toCanvasWidth = (width: number, pxRatio = uPlot.pxRatio) => Math.max(1, Math.round(width * pxRatio));

/**
 * The threshold line options of a series, or undefined when none applies: Show thresholds doesn't draw lines (the
 * editor hides the options then), or no option is set (an incomplete colour counts as unset).
 */
export function getThresholdLineStyle(
  custom: ThresholdLineConfig | undefined,
  theme: GrafanaTheme2
): ThresholdLineStyle | undefined {
  if (!custom || !showThresholdLines(custom)) {
    return undefined;
  }
  const option = getStylingColor(custom.styling?.thresholdLineColor, THRESHOLD_LINE_COLOR_MODES);
  const opacity = finite(custom.styling?.thresholdLineOpacity) ? custom.styling.thresholdLineOpacity : undefined;
  const width = finite(custom.styling?.thresholdLineWidth) ? custom.styling.thresholdLineWidth : undefined;
  if (!option && opacity === undefined && width === undefined) {
    return undefined;
  }
  return {
    color: (color, colorName) => getThresholdLineColor(color, colorName, option, opacity, theme),
    width: () => (width === undefined ? undefined : toCanvasWidth(width)),
  };
}

// The scales whose threshold lines are already added, per config builder (a new builder per prepared config)
const claimedScales = new WeakMap<UPlotConfigBuilder, Set<string>>();

/**
 * Adds a series' threshold lines and areas, in place of Grafana's `builder.addThresholds` (a marked line in the
 * copied TimeSeries/utils.ts, called for every series whose Show thresholds isn't Off, hidden series included).
 *
 * One set per scale, as Grafana: the first series of a scale claims it, and later series of that scale add nothing.
 * If the claiming series has threshold line options that apply, the copied hook draws them; otherwise Grafana's own
 * `addThresholds` runs, unchanged (so with nothing set the panel draws as core).
 */
export function addThresholdLines(
  builder: UPlotConfigBuilder,
  custom: ThresholdLineConfig | undefined,
  options: UPlotThresholdOptions
) {
  let claimed = claimedScales.get(builder);
  if (!claimed) {
    claimed = new Set();
    claimedScales.set(builder, claimed);
  }
  if (claimed.has(options.scaleKey)) {
    return;
  }
  claimed.add(options.scaleKey);
  const lines = getThresholdLineStyle(custom, options.theme);
  if (lines) {
    builder.addHook('drawClear', getThresholdsDrawHook({ ...options, lines }));
  } else {
    builder.addThresholds(options);
  }
}
