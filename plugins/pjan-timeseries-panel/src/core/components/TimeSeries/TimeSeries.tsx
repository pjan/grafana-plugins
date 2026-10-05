// Copied from grafana/grafana v13.2.3: public/app/core/components/TimeSeries/TimeSeries.tsx. AGPL-3.0 (Copyright Grafana Labs). Changes: imports; the legend gets the frames with each series' Line color as its swatch colour (src/pjan/styling/swatches.ts).
import { useCallback, useMemo } from 'react'; // pjan-timeseries-panel: useMemo, for legendFrames

import { type DataFrame, type TimeRange } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { hasVisibleLegendSeries, PlotLegend, type UPlotConfigBuilder } from 'packages/grafana-ui/internal';
import { type TimeSeriesLegendOptions } from 'plugins/panel/timeseries/panelcfg.gen';

import { GraphNG, type GraphNGProps, type PropDiffFn } from '../GraphNG/GraphNG';

import { getXAxisConfig, preparePlotConfigBuilder } from './utils';
// pjan-timeseries-panel: the legend's swatches show the drawn line colour (the colour model)
import { withLineSwatches } from '../../../pjan/styling/swatches';

const propsToDiff: Array<string | PropDiffFn> = ['legend', 'options', 'annotationLanes', 'theme'];

type TimeSeriesProps = Omit<GraphNGProps, 'prepConfig' | 'propsToDiff' | 'renderLegend' | 'theme' | 'legend'> & {
  legend: TimeSeriesLegendOptions;
  onPinnedToSidebarChange?: (pinned: boolean) => void;
};

export function TimeSeries(props: TimeSeriesProps) {
  const { timeZone, options, renderers, tweakAxis, tweakScale, legend, frames, onPinnedToSidebarChange } = props;
  const theme = useTheme2();

  const prepConfig = useCallback(
    (alignedFrame: DataFrame, allFrames: DataFrame[], getTimeRange: () => TimeRange, annotationLanes?: number) => {
      return preparePlotConfigBuilder({
        frame: alignedFrame,
        theme,
        timeZones: Array.isArray(timeZone) ? timeZone : [timeZone],
        getTimeRange,
        allFrames,
        renderers,
        tweakScale,
        tweakAxis,
        hoverProximity: options?.tooltip?.hoverProximity,
        orientation: options?.orientation,
        xAxisConfig: getXAxisConfig(annotationLanes),
      });
    },
    [theme, timeZone, options, renderers, tweakAxis, tweakScale]
  );

  const legendFrames = useMemo(() => withLineSwatches(frames, theme), [frames, theme]); // pjan-timeseries-panel

  const renderLegend = useCallback(
    (uPlotConfig: UPlotConfigBuilder) => {
      if (!uPlotConfig || (legend && !legend.showLegend) || !hasVisibleLegendSeries(uPlotConfig, frames)) {
        return null;
      }

      return (
        // pjan-timeseries-panel: legendFrames instead of frames
        <PlotLegend
          data={legendFrames} // pjan-timeseries-panel
          config={uPlotConfig}
          {...legend}
          onPinnedToSidebarChange={onPinnedToSidebarChange}
        />
      );
    },
    [legend, frames, legendFrames, onPinnedToSidebarChange] // pjan-timeseries-panel: legendFrames
  );

  return (
    <GraphNG {...props} theme={theme} prepConfig={prepConfig} propsToDiff={propsToDiff} renderLegend={renderLegend} />
  );
}
