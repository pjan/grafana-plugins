// Plugin stand-in for `@grafana/ui/internal` (grafana/grafana v13.2.3: packages/grafana-ui/src/internal/index.ts).
// `@grafana/ui/internal` is not shared with plugins at runtime, so the copied core code imports this module instead.
// Only the names the copied code uses are provided.
import {
  BarAlignment,
  GraphDrawStyle,
  GraphGradientMode,
  LineInterpolation,
  TableCellDisplayMode,
  type TableSparklineCellOptions,
  VisibilityMode,
} from '@grafana/schema';

// Public in @grafana/ui (the same type as the internal export: both come from components/Table/types.ts).
export { type TableSortByFieldState } from '@grafana/ui';

// packages/grafana-ui/src/components/Table/Cells/SparklineCell.tsx (Apache-2.0): `/internal` exports the constant of the
// older TableRT sparkline cell. The copied TableNG sparkline cell (TableNG/Cells/SparklineCell.tsx) keeps a private
// constant with the same values, so the editor's defaults and the cell's agree, as in core.
export const defaultSparklineCellConfig: TableSparklineCellOptions = {
  type: TableCellDisplayMode.Sparkline,
  drawStyle: GraphDrawStyle.Line,
  lineInterpolation: LineInterpolation.Smooth,
  lineWidth: 1,
  fillOpacity: 17,
  gradientMode: GraphGradientMode.Hue,
  pointSize: 2,
  barAlignment: BarAlignment.Center,
  showPoints: VisibilityMode.Never,
  hideValue: false,
};
