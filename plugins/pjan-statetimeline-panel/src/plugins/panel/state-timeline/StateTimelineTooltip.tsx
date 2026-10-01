// Copied from grafana/grafana v13.2.3: public/app/plugins/panel/state-timeline/StateTimelineTooltip.tsx. AGPL-3.0 (Copyright Grafana Labs). Changes: imports; opt-in styling (src/pjan/styling/): `styling` prop, the swatches show the colours drawn.
import { type ReactNode } from 'react';

import { FieldType, type TimeRange, usePluginContext } from '@grafana/data';
import { SortOrder } from '@grafana/schema';
import {
  TooltipDisplayMode,
  type VizTooltipItem,
  VizTooltipContent,
  VizTooltipFooter,
  VizTooltipHeader,
  VizTooltipWrapper,
  getFieldDisplayItems,
  isTooltipScrollable,
} from '@grafana/ui';
import { findNextStateIndex, fmtDuration } from 'core/components/TimelineChart/utils';

// pjan-statetimeline-panel: opt-in styling (src/pjan/styling/); the swatches show the colours drawn.
import { type TimelineStylingOptions } from '../../../pjan/styling/options';
import { useFieldsWithDrawnColors } from '../../../pjan/styling/swatches';
import { getFieldActions } from '../status-history/utils';
import { type TimeSeriesTooltipProps } from '../timeseries/TimeSeriesTooltip';

interface StateTimelineTooltipProps extends TimeSeriesTooltipProps {
  timeRange: TimeRange;
  withDuration: boolean;
  styling?: TimelineStylingOptions; // pjan-statetimeline-panel
}

export const StateTimelineTooltip = ({
  series,
  dataIdxs,
  seriesIdx,
  mode = TooltipDisplayMode.Single,
  sortOrder = SortOrder.None,
  isPinned,
  annotate,
  timeRange,
  withDuration,
  maxHeight,
  replaceVariables,
  dataLinks,
  filterByGroupedLabels,
  styling, // pjan-statetimeline-panel
}: StateTimelineTooltipProps) => {
  const pluginContext = usePluginContext();
  const fields = useFieldsWithDrawnColors(series, styling); // pjan-statetimeline-panel
  const xField = series.fields[0];

  const dataIdx = seriesIdx != null ? dataIdxs[seriesIdx] : dataIdxs.find((idx) => idx != null);

  const xVal = xField.display!(xField.values[dataIdx!]).text;

  mode = isPinned ? TooltipDisplayMode.Single : mode;

  // pjan-statetimeline-panel: `fields` was series.fields
  const contentItems = getFieldDisplayItems(fields, xField, dataIdxs, seriesIdx, mode, sortOrder);
  let endTime = null;

  // append duration in single mode
  if (withDuration && mode === TooltipDisplayMode.Single) {
    const field = series.fields[seriesIdx!];
    const nextStateIdx = findNextStateIndex(field, dataIdx!);
    let nextStateTs;
    if (nextStateIdx != null) {
      nextStateTs = xField.values[nextStateIdx];
    }

    const stateTs = xField.values[dataIdx!];
    let duration: string;

    if (nextStateTs) {
      duration = nextStateTs && fmtDuration(nextStateTs - stateTs);
      endTime = nextStateTs;
    } else {
      const to = timeRange.to.valueOf();
      duration = fmtDuration(to - stateTs);
      endTime = to;
    }

    contentItems.push({ label: 'Duration', value: duration });
  }

  let footer: ReactNode;

  if (seriesIdx != null) {
    const field = series.fields[seriesIdx];
    const hasOneClickLink = dataLinks.some((dataLink) => dataLink.oneClick === true);

    if (isPinned || hasOneClickLink) {
      const visualizationType = pluginContext?.meta?.id ?? 'state-timeline';
      const dataIdx = dataIdxs[seriesIdx]!;
      const actions = getFieldActions(series, field, replaceVariables!, dataIdx, visualizationType);

      footer = (
        <VizTooltipFooter
          dataLinks={dataLinks}
          actions={actions}
          annotate={annotate}
          filterByGroupedLabels={filterByGroupedLabels}
        />
      );
    }
  }

  const headerItem: VizTooltipItem = {
    label: xField.type === FieldType.time ? '' : (xField.state?.displayName ?? xField.name),
    value: endTime ? xVal + ' - \n' + xField.display!(endTime).text : xVal,
  };

  return (
    <VizTooltipWrapper>
      <VizTooltipHeader item={headerItem} isPinned={isPinned} />
      <VizTooltipContent
        items={contentItems}
        isPinned={isPinned}
        scrollable={isTooltipScrollable({ mode, maxHeight })}
        maxHeight={maxHeight}
      />
      {footer}
    </VizTooltipWrapper>
  );
};
