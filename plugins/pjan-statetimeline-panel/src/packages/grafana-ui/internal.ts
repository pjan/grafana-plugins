// Plugin stand-in for `@grafana/ui/internal` (grafana/grafana v13.2.3: packages/grafana-ui/src/internal/index.ts).
// `@grafana/ui/internal` is not shared with plugins at runtime, so the copied core code imports this module instead.
// Every export is either a re-export of the public `@grafana/ui` API, a type derived from it, or an Apache-2.0
// copy from packages/grafana-ui (see UPSTREAM.md). Only the names the copied code uses are provided.
import { type UPlotConfigBuilder, type UPlotConfigPrepFn } from '@grafana/ui';

// Public in @grafana/ui (same implementation as the internal export).
export { UPlotChart, UPlotConfigBuilder, type UPlotConfigPrepFn } from '@grafana/ui';

// Types: derived from the public UPlotConfigBuilder signatures, identical to the internal declarations.
export type AxisProps = Parameters<UPlotConfigBuilder['addAxis']>[0];
export type ScaleProps = Parameters<UPlotConfigBuilder['addScale']>[0];
export type Renderers = NonNullable<Parameters<UPlotConfigPrepFn>[0]['renderers']>;

// packages/grafana-ui/src/components/uPlot/plugins/TooltipPlugin2.tsx (Apache-2.0)
export interface TimeRange2 {
  from: number;
  to: number;
}

// packages/grafana-ui/src/components/uPlot/plugins/TooltipPlugin2.tsx (Apache-2.0).
// Upstream is `export const enum TooltipHoverMode { xOne, xAll, xyOne }`. A plugin-local enum would be a distinct
// type from the one in TooltipPlugin2's props, so the same values are declared as literal constants instead.
export const TooltipHoverMode = {
  // Single mode in TimeSeries, Candlestick, Trend, StateTimeline, Heatmap?
  xOne: 0,
  // All mode in TimeSeries, Candlestick, Trend, StateTimeline, Heatmap?
  xAll: 1,
  // Single mode in XYChart, Heatmap?
  xyOne: 2,
} as const;

// packages/grafana-ui/src/components/Table/types.ts (Apache-2.0)
export const FILTER_FOR_OPERATOR = '=';
export const FILTER_OUT_OPERATOR = '!=';

// packages/grafana-ui/src/components/uPlot/utils.ts (Apache-2.0)
export { pluginLog, preparePlotData2, getStackingGroups } from './src/components/uPlot/utils';

// packages/grafana-ui/src/components/uPlot/internal.ts (Apache-2.0). Copied instead of re-exporting the public
// `buildScaleKey`, which @grafana/ui only exports from its deprecated graveyard/GraphNG/utils.ts.
export { buildScaleKey } from './src/components/uPlot/internal';

// packages/grafana-ui/src/components/uPlot/config/gradientFills.ts (Apache-2.0)
export { getScaleGradientFn } from './src/components/uPlot/config/gradientFills';
