// Plugin stand-in for `@grafana/data/internal` (grafana/grafana v13.2.3: packages/grafana-data/src/internal/index.ts).
// `@grafana/data/internal` is not shared with plugins at runtime, so the copied core code imports this module instead.
// Only the names the copied code uses are provided.
import { type MatcherConfig, type ReducerID } from '@grafana/data';

// packages/grafana-data/src/transformations/transformers/reduce.ts (Apache-2.0). A type only (the copied table
// migration builds these options for the Angular table's transforms). `ReduceTransformerMode`, the type of `mode`, is
// not public, so `mode` is typed by that enum's two values.
export interface ReduceTransformerOptions {
  reducers: ReducerID[];
  fields?: MatcherConfig; // Assume all fields
  mode?: 'seriesToRows' | 'reduceFields';
  includeTimeField?: boolean;
  labelsToFields?: boolean;
}
