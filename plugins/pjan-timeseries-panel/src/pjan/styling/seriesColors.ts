import {
  colorManipulator,
  type Field,
  FieldType,
  getFieldColorModeForField,
  getFieldSeriesColor,
  type GrafanaTheme2,
} from '@grafana/data';
import { GraphGradientMode } from '@grafana/schema';
import { type UPlotConfigBuilder } from '@grafana/ui';
import { getColorNameLookup, getShadeColor, getStylingColor, type StylingColorMode } from '@pjan/grafana-styling';
import type uPlot from 'uplot';

import {
  getHueGradientFn,
  getOpacityGradientFn,
} from '../../packages/grafana-ui/src/components/uPlot/config/gradientFills';

import {
  FILL_COLOR_MODES,
  LINE_COLOR_MODES,
  POINT_COLOR_MODES,
  type SeriesStyling,
  showFillColor,
  showLineColor,
  showPointColor,
} from './options';

/** The colours a series' styling resolves to; unset parts draw as core. */
export interface SeriesColors {
  line?: string;
  fill?: string;
  point?: string;
}

/**
 * The colours of a series' colour options, or undefined when none applies.
 *
 * - Only with colours by series (plan decision 2): with a by-value color scheme (thresholds, continuous schemes)
 *   Grafana computes the line's colours itself, and the options are ignored.
 * - An option the editor hides is ignored (options.ts): no line colour without a line, no fill colour without a fill,
 *   no point colour without points, no line or fill colour with the Scheme gradient (plan decision 1).
 * - A shade is of the series colour: of its Grafana name's hue, or of the nearest theme hue for a colour without a name
 *   (decision 7); without a hue, the series colour itself. "Series color" is the series colour; a fixed colour is
 *   resolved by name as Grafana does.
 *
 * `fillOpacity` is the opacity the series is drawn with (core raises 0 to 35 for `fillBelowTo`).
 */
export function getSeriesColors(
  field: Field,
  theme: GrafanaTheme2,
  fillOpacity: number | undefined = field.config.custom?.fillOpacity
): SeriesColors | undefined {
  const custom = field.config.custom;
  const styling = custom?.styling as SeriesStyling | undefined;
  // number and enum fields are drawn as series (core's prepareGraphableFields)
  const drawn = field.type === FieldType.number || field.type === FieldType.enum;
  if (!styling || !drawn || getFieldColorModeForField(field).isByValue) {
    return undefined;
  }
  const seriesColor = getFieldSeriesColor(field, theme).color;
  let colorName: string | undefined;
  const resolve = (option: unknown, modes: StylingColorMode[]): string | undefined => {
    const color = getStylingColor(option, modes);
    switch (color?.mode) {
      case 'series':
        return seriesColor;
      case 'fixed':
        return theme.visualization.getColorByName(color.fixedColor!);
      case 'shade':
        colorName ??= getColorNameLookup(field, theme).get(seriesColor) ?? '';
        return getShadeColor(theme, seriesColor, colorName || undefined, color.shade!) ?? seriesColor;
      default:
        return undefined;
    }
  };
  const visible = { ...custom, fillOpacity };
  const colors: SeriesColors = {
    line: showLineColor(visible) ? resolve(styling.lineColor, LINE_COLOR_MODES) : undefined,
    fill: showFillColor(visible) ? resolve(styling.fillColor, FILL_COLOR_MODES) : undefined,
    point: showPointColor(visible) ? resolve(styling.pointColor, POINT_COLOR_MODES) : undefined,
  };
  return colors.line || colors.fill || colors.point ? colors : undefined;
}

/**
 * The fill of a series with a fill colour of its own, built as Grafana's UPlotSeriesBuilder.getFill builds it from
 * the line colour in the cases where the option applies (colours by series, no Scheme gradient). Grafana can't be
 * given the fill colour instead: it returns a `fillColor` as is, without the opacity or the gradient.
 */
export function getFill(
  fill: string,
  gradientMode: GraphGradientMode | undefined,
  fillOpacity: number | undefined,
  theme: GrafanaTheme2
): uPlot.Series.Fill | undefined {
  const opacity = (fillOpacity ?? 0) / 100;
  switch (gradientMode ?? GraphGradientMode.None) {
    case GraphGradientMode.Opacity:
      return getOpacityGradientFn(fill, opacity);
    case GraphGradientMode.Hue:
      return getHueGradientFn(fill, opacity, theme);
    default:
      return opacity > 0 ? colorManipulator.alpha(fill, opacity) : undefined;
  }
}

/**
 * Gives the series last added to the builder its fill and point colour. Grafana's series builder ties both to the
 * line colour, so the series' config is post-processed (the public `getSeries()` and `getConfig()`): its `fill`, and
 * its points' stroke and fill, are replaced; everything else is Grafana's.
 */
export function applyFillAndPointColors(
  builder: UPlotConfigBuilder,
  colors: SeriesColors,
  gradientMode: GraphGradientMode | undefined,
  fillOpacity: number | undefined,
  theme: GrafanaTheme2
) {
  const { fill, point } = colors;
  if (!fill && !point) {
    return;
  }
  const series = builder.getSeries()[builder.getSeries().length - 1];
  const getConfig = series.getConfig.bind(series);
  series.getConfig = () => {
    const config = getConfig();
    return {
      ...config,
      ...(fill ? { fill: getFill(fill, gradientMode, fillOpacity, theme) } : {}),
      ...(point ? { points: { ...config.points, stroke: point, fill: point } } : {}),
    };
  };
}
