// Copied from grafana/grafana v13.2.3: public/app/plugins/panel/state-timeline/StateTimelinePanel.tsx. AGPL-3.0 (Copyright Grafana Labs). Changes: imports; AnnotationsPlugin rendered through StateTimelineAnnotations from src/pjan/ (per-row annotations, off by default), with alignedFrame, frames and panelOptions as extra props; opt-in styling (src/pjan/styling/): legend items and tooltip swatches in the colours drawn, and the canvas behind a transparent panel; onFieldConfigChange passed to useApplyFieldConfigChangedInPlace (@pjan/grafana-panel-utils), which applies the field config again after the panel-change handler restored it in place.
import { useCallback, useMemo, useState } from 'react';

import { DashboardCursorSync, type DataFrame, type PanelProps, useDataLinksContext } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import {
  AxisPlacement,
  EventBusPlugin,
  TooltipDisplayMode,
  TooltipPlugin2,
  usePanelContext,
  useTheme2,
  XAxisInteractionAreaPlugin,
} from '@grafana/ui';
import { type TimeRange2, TooltipHoverMode } from 'packages/grafana-ui/internal';
import { TimelineChart } from 'core/components/TimelineChart/TimelineChart';
import {
  prepareTimelineFields,
  prepareTimelineLegendItems,
  TimelineMode,
} from 'core/components/TimelineChart/utils';
import { getFilterByGroupedLabels } from 'features/panel/filters/adhoc';
// pjan-statetimeline-panel: applies the field config again after the panel-change handler restored it (shared package).
import { useApplyFieldConfigChangedInPlace } from '@pjan/grafana-panel-utils';

// pjan-statetimeline-panel: per-row annotations (src/pjan/); renders core's AnnotationsPlugin unchanged when off.
import { StateTimelineAnnotations } from '../../../pjan/rowAnnotations/StateTimelineAnnotations';
// pjan-statetimeline-panel: opt-in styling (src/pjan/styling/); the legend shows the colours drawn.
import { getStylingOptions } from '../../../pjan/styling/options';
import { getLegendItemsWithDrawnColors } from '../../../pjan/styling/swatches';
import { OutsideRangePlugin } from '../timeseries/plugins/OutsideRangePlugin';
import { getXAnnotationFrames } from '../timeseries/plugins/utils';
import { getTimezones } from '../timeseries/utils';

import { StateTimelineTooltip } from './StateTimelineTooltip';
import { usePagination } from './hooks';
import { type Options } from './panelcfg.gen';
import { containerStyles } from './styles';

interface TimelinePanelProps extends PanelProps<Options> {}

export const StateTimelinePanel = ({
  data,
  timeRange,
  timeZone,
  options,
  width,
  height,
  fieldConfig,
  replaceVariables,
  onChangeTimeRange,
  id: panelId,
  transparent, // pjan-statetimeline-panel: what is behind the boxes (opt-in styling)
  onFieldConfigChange, // pjan-statetimeline-panel
}: TimelinePanelProps) => {
  useApplyFieldConfigChangedInPlace(fieldConfig, onFieldConfigChange); // pjan-statetimeline-panel
  const theme = useTheme2();

  // temp range set for adding new annotation set by TooltipPlugin2, consumed by AnnotationPlugin2
  const [newAnnotationRange, setNewAnnotationRange] = useState<TimeRange2 | null>(null);
  const {
    sync,
    eventsScope,
    canAddAnnotations,
    eventBus,
    canExecuteActions,
    getFiltersBasedOnGrouping,
    onAddAdHocFilters,
  } = usePanelContext();

  const { dataLinkPostProcessor } = useDataLinksContext();

  const userCanExecuteActions = useMemo(() => canExecuteActions?.() ?? false, [canExecuteActions]);
  const cursorSync = sync?.() ?? DashboardCursorSync.Off;

  const getFilterByGroupedLabelsModel = useCallback(
    (frame: DataFrame, seriesIdx: number | null | undefined) =>
      getFilterByGroupedLabels(frame, seriesIdx, getFiltersBasedOnGrouping, onAddAdHocFilters),
    [getFiltersBasedOnGrouping, onAddAdHocFilters]
  );

  const { frames, warn } = useMemo(
    () => prepareTimelineFields(data.series, options.mergeValues ?? true, timeRange, theme),
    [data.series, options.mergeValues, timeRange, theme]
  );

  const { paginatedFrames, paginationRev, paginationElement, paginationHeight } = usePagination(
    frames,
    options.perPage
  );

  const styling = getStylingOptions(options); // pjan-statetimeline-panel
  const legendItems = useMemo(
    // pjan-statetimeline-panel: was prepareTimelineLegendItems(paginatedFrames, options.legend, theme)
    () =>
      getLegendItemsWithDrawnColors(
        prepareTimelineLegendItems(paginatedFrames, options.legend, theme),
        paginatedFrames,
        theme,
        styling
      ),
    [paginatedFrames, options.legend, theme, styling] // pjan-statetimeline-panel: styling added
  );

  const timezones = useMemo(() => getTimezones(options.timezone, timeZone), [options.timezone, timeZone]);

  if (!paginatedFrames || typeof warn === 'string') {
    return <PanelDataErrorView panelId={panelId} fieldConfig={fieldConfig} data={data} message={warn} needsTimeField />;
  }

  const enableAnnotationCreation = Boolean(canAddAnnotations && canAddAnnotations());

  return (
    <div className={containerStyles}>
      <TimelineChart
        theme={theme}
        frames={paginatedFrames}
        structureRev={data.structureRev}
        paginationRev={paginationRev}
        timeRange={timeRange}
        timeZone={timezones}
        width={width}
        height={height - paginationHeight}
        legendItems={legendItems}
        annotations={options.annotations}
        {...options}
        mode={TimelineMode.Changes}
        replaceVariables={replaceVariables}
        dataLinkPostProcessor={dataLinkPostProcessor}
        cursorSync={cursorSync}
        annotationLanes={options.annotations?.multiLane ? getXAnnotationFrames(data.annotations).length : undefined}
        pjanPanelBackground={transparent ? theme.colors.background.canvas : undefined} // pjan-statetimeline-panel
      >
        {(builder, alignedFrame) => {
          return (
            <>
              {cursorSync !== DashboardCursorSync.Off && (
                <EventBusPlugin config={builder} eventBus={eventBus} frame={alignedFrame} />
              )}
              <XAxisInteractionAreaPlugin config={builder} queryZoom={onChangeTimeRange} />
              {options.tooltip.mode !== TooltipDisplayMode.None && (
                <TooltipPlugin2
                  config={builder}
                  hoverMode={
                    options.tooltip.mode === TooltipDisplayMode.Multi ? TooltipHoverMode.xAll : TooltipHoverMode.xOne
                  }
                  queryZoom={onChangeTimeRange}
                  syncMode={cursorSync}
                  syncScope={eventsScope}
                  getDataLinks={(seriesIdx, dataIdx) =>
                    alignedFrame.fields[seriesIdx].getLinks?.({ valueRowIndex: dataIdx }) ?? []
                  }
                  render={(u, dataIdxs, seriesIdx, isPinned, dismiss, timeRange2, viaSync, dataLinks) => {
                    if (enableAnnotationCreation && timeRange2 != null) {
                      setNewAnnotationRange(timeRange2);
                      dismiss();
                      return;
                    }

                    const annotate = () => {
                      let xVal = u.posToVal(u.cursor.left!, 'x');

                      setNewAnnotationRange({ from: xVal, to: xVal });
                      dismiss();
                    };

                    return (
                      <StateTimelineTooltip
                        series={alignedFrame}
                        dataIdxs={dataIdxs}
                        seriesIdx={seriesIdx}
                        mode={viaSync ? TooltipDisplayMode.Multi : options.tooltip.mode}
                        sortOrder={options.tooltip.sort}
                        isPinned={isPinned}
                        timeRange={timeRange}
                        annotate={enableAnnotationCreation ? annotate : undefined}
                        withDuration={true}
                        maxHeight={options.tooltip.maxHeight}
                        replaceVariables={replaceVariables}
                        dataLinks={dataLinks}
                        filterByGroupedLabels={getFilterByGroupedLabelsModel(alignedFrame, seriesIdx)}
                        canExecuteActions={userCanExecuteActions}
                        styling={styling} // pjan-statetimeline-panel
                      />
                    );
                  }}
                  maxWidth={options.tooltip.maxWidth}
                />
              )}
              {alignedFrame.fields[0].config.custom?.axisPlacement !== AxisPlacement.Hidden && (
                // pjan-statetimeline-panel: was <AnnotationsPlugin>; the last three props are plugin-only.
                <StateTimelineAnnotations
                  replaceVariables={replaceVariables}
                  options={options.annotations}
                  annotations={data.annotations}
                  config={builder}
                  timeZone={timeZone}
                  newRange={newAnnotationRange}
                  setNewRange={setNewAnnotationRange}
                  canvasRegionRendering={false}
                  alignedFrame={alignedFrame}
                  frames={frames}
                  panelOptions={options}
                />
              )}
              <OutsideRangePlugin config={builder} onChangeTimeRange={onChangeTimeRange} />
            </>
          );
        }}
      </TimelineChart>
      {paginationElement}
    </div>
  );
};
