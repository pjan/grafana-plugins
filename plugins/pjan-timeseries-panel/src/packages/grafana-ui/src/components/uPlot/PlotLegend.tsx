// Copied from grafana/grafana v13.2.3: packages/grafana-ui/src/components/uPlot/PlotLegend.tsx. Apache-2.0 (Copyright Grafana Labs). Changes: partial copy (hasVisibleLegendSeries only, exported from @grafana/ui/internal; PlotLegend itself is public in @grafana/ui); imports from the public @grafana/* APIs.
import { type DataFrame } from '@grafana/data';
import { type UPlotConfigBuilder } from '@grafana/ui';

/**
 * mostly duplicates logic in PlotLegend below :(
 *
 * @internal
 */
export function hasVisibleLegendSeries(config: UPlotConfigBuilder, data: DataFrame[]) {
  return config.getSeries().some((s) => {
    const fieldIndex = s.props.dataFrameFieldIndex;

    if (!fieldIndex) {
      return false;
    }

    const field = data[fieldIndex.frameIndex]?.fields[fieldIndex.fieldIndex];

    if (!field || field.config.custom?.hideFrom?.legend) {
      return false;
    }

    return true;
  });
}
