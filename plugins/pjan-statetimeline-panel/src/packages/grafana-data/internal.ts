// Plugin stand-in for `@grafana/data/internal` (grafana/grafana v13.2.3: packages/grafana-data/src/internal/index.ts).
// `@grafana/data/internal` is not shared with plugins at runtime, so the copied core code imports this module instead.
// Every export is an Apache-2.0 copy from packages/grafana-data or a thin wrapper over the public `@grafana/data`
// API (see UPSTREAM.md). Only the names the copied code uses are provided.
import { ensureTimeField, type Field, FieldType } from '@grafana/data';

export { nullToUndefThreshold } from './src/transformations/transformers/nulls/nullToUndefThreshold';
export {
  NULL_EXPAND,
  NULL_REMOVE,
  NULL_RETAIN,
  maybeSortFrame,
} from './src/transformations/transformers/joinDataFrames';

// Upstream: packages/grafana-data/src/transformations/transformers/convertFieldType.ts (Apache-2.0).
// The copied code only calls `convertFieldType(field, { destinationType: FieldType.time })`, which upstream resolves to
// `ensureTimeFieldWithTimeZone(field, undefined, undefined)`; the public `ensureTimeField(field, dateFormat)` is that
// same function without a time zone. Other conversions are not needed and fail loudly instead of guessing.
interface ConvertFieldTypeOptions {
  destinationType: FieldType;
  dateFormat?: string;
  timezone?: string;
}

export function convertFieldType(field: Field, opts: ConvertFieldTypeOptions): Field {
  if (opts.destinationType === FieldType.time && opts.timezone == null) {
    return ensureTimeField(field, opts.dateFormat);
  }

  throw new Error(`convertFieldType to ${opts.destinationType} is not available in pjan-statetimeline-panel`);
}
