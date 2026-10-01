// Copied from grafana/grafana v13.2.3: public/app/core/components/GraphNG/types.ts. AGPL-3.0 (Copyright Grafana Labs). Changes: imports only.
import { type DataFrameFieldIndex, type FieldMatcher } from '@grafana/data';
import { type SeriesVisibilityChangeMode } from '@grafana/ui';

/**
 * Event being triggered when the user interact with the Graph legend.
 */
export interface GraphNGLegendEvent {
  fieldIndex: DataFrameFieldIndex;
  mode: SeriesVisibilityChangeMode;
}

export interface XYFieldMatchers {
  x: FieldMatcher; // first match
  y: FieldMatcher;
}
