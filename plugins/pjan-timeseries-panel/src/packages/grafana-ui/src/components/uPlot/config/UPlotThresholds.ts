// Copied from grafana/grafana v13.2.3: packages/grafana-ui/src/components/uPlot/config/UPlotThresholds.ts. Apache-2.0 (Copyright Grafana Labs, see UPSTREAM.md). Changes: the threshold line options (src/pjan/styling/thresholdLines.ts): an optional `lines` option sets each line's colour (or leaves the line out) and its width, with uPlot's half-pixel shift (across the line) for an odd width; without it, upstream's lines.
import tinycolor from 'tinycolor2';
import type uPlot from 'uplot';

import { type GrafanaTheme2, type Threshold, type ThresholdsConfig, ThresholdsMode } from '@grafana/data';
import { type GraphThresholdsStyleConfig, GraphThresholdsStyleMode, ScaleOrientation } from '@grafana/schema';

import { getGradientRange, scaleGradient } from './gradientFills';
// pjan-timeseries-panel: the threshold line options
import type { ThresholdLineStyle } from '../../../../../../pjan/styling/thresholdLines';

export interface UPlotThresholdOptions {
  scaleKey: string;
  thresholds: ThresholdsConfig;
  config: GraphThresholdsStyleConfig;
  theme: GrafanaTheme2;
  hardMin?: number | null;
  hardMax?: number | null;
  softMin?: number | null;
  softMax?: number | null;
  /** pjan-timeseries-panel: the threshold line options' colours and width; unset, upstream's lines */
  lines?: ThresholdLineStyle;
}

export function getThresholdsDrawHook(options: UPlotThresholdOptions) {
  const dashSegments =
    options.config.mode === GraphThresholdsStyleMode.Dashed ||
    options.config.mode === GraphThresholdsStyleMode.DashedAndArea
      ? [10, 10]
      : [];

  function addLines(u: uPlot, yScaleKey: string, steps: Threshold[], theme: GrafanaTheme2) {
    let ctx = u.ctx;

    // Thresholds below a transparent threshold is treated like "less than", and line drawn previous threshold
    let transparentIndex = 0;

    for (let idx = 0; idx < steps.length; idx++) {
      const step = steps[idx];
      if (step.color === 'transparent') {
        transparentIndex = idx;
        break;
      }
    }

    // pjan-timeseries-panel: the Threshold line width option (canvas pixels), with uPlot's half-pixel shift for an odd
    // width (uPlot.esm.js, drawSeries), so that the line stays crisp; across the line only, so that dash ends stay crisp
    const lineWidth = options.lines?.width() ?? 2;
    const offset = (lineWidth % 2) / 2;
    if (offset) {
      const horizontal = u.scales.x!.ori === ScaleOrientation.Horizontal;
      ctx.translate(horizontal ? 0 : offset, horizontal ? offset : 0);
    }
    ctx.lineWidth = lineWidth; // pjan-timeseries-panel: was 2
    ctx.setLineDash(dashSegments);

    // Ignore the base -Infinity threshold by always starting on index 1
    for (let idx = 1; idx < steps.length; idx++) {
      const step = steps[idx];
      let color: tinycolor.Instance;

      // if we are below a transparent index treat this a less then threshold, use previous thresholds color
      if (transparentIndex >= idx && idx > 0) {
        color = tinycolor(theme.visualization.getColorByName(steps[idx - 1].color));
      } else {
        color = tinycolor(theme.visualization.getColorByName(step.color));
      }

      // Unless alpha specififed set to default value
      if (color.getAlpha() === 1) {
        color.setAlpha(0.7);
      }

      // pjan-timeseries-panel: the Threshold line color and opacity options, from the colour drawn here and the step
      // colour it was resolved from; undefined: the line is not drawn (a line upstream draws at alpha 0)
      const strokeStyle = options.lines
        ? options.lines.color(color, transparentIndex >= idx && idx > 0 ? steps[idx - 1].color : step.color)
        : color.toString();
      if (strokeStyle === undefined) {
        continue;
      }

      const isHorizontal = u.scales.x!.ori === ScaleOrientation.Horizontal;
      const scaleVal = u.valToPos(step.value, yScaleKey, true);

      let x0 = Math.round(isHorizontal ? u.bbox.left : scaleVal);
      let y0 = Math.round(isHorizontal ? scaleVal : u.bbox.top);
      let x1 = Math.round(isHorizontal ? u.bbox.left + u.bbox.width : scaleVal);
      let y1 = Math.round(isHorizontal ? scaleVal : u.bbox.top + u.bbox.height);

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);

      ctx.strokeStyle = strokeStyle; // pjan-timeseries-panel: was color.toString()
      ctx.stroke();
    }
  }

  function addAreas(u: uPlot, yScaleKey: string, steps: Threshold[], theme: GrafanaTheme2) {
    let ctx = u.ctx;

    let grd = scaleGradient(
      u,
      yScaleKey,
      steps.map((step) => {
        let color = tinycolor(theme.visualization.getColorByName(step.color));

        if (color.getAlpha() === 1) {
          color.setAlpha(0.15);
        }

        return [step.value, color.toString()];
      }),
      true
    );

    ctx.fillStyle = grd;
    ctx.fillRect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
  }

  const { scaleKey, thresholds, theme, config, hardMin, hardMax, softMin, softMax } = options;

  return (u: uPlot) => {
    const ctx = u.ctx;
    const { min: xMin, max: xMax } = u.scales.x;
    const { min: yMin, max: yMax } = u.scales[scaleKey];

    if (xMin == null || xMax == null || yMin == null || yMax == null) {
      return;
    }

    let { steps, mode } = thresholds;

    if (mode === ThresholdsMode.Percentage) {
      let [min, max] = getGradientRange(u, scaleKey, hardMin, hardMax, softMin, softMax);
      let range = max - min;

      steps = steps.map((step) => ({
        ...step,
        value: min + range * (step.value / 100),
      }));
    }

    ctx.save();

    switch (config.mode) {
      case GraphThresholdsStyleMode.Line:
      case GraphThresholdsStyleMode.Dashed:
        addLines(u, scaleKey, steps, theme);
        break;
      case GraphThresholdsStyleMode.Area:
        addAreas(u, scaleKey, steps, theme);
        break;
      case GraphThresholdsStyleMode.LineAndArea:
      case GraphThresholdsStyleMode.DashedAndArea:
        addAreas(u, scaleKey, steps, theme);
        addLines(u, scaleKey, steps, theme);
    }

    ctx.restore();
  };
}
