// Plugin stand-in for `@grafana/data/internal` (grafana/grafana v13.2.3: packages/grafana-data/src/internal/index.ts).
// `@grafana/data/internal` is not shared with plugins at runtime, so the copied core code imports this module instead.
// Every export is an Apache-2.0 copy from packages/grafana-data (see UPSTREAM.md). Only the names the copied code uses
// are provided.
export { findNumericFieldMinMax } from './src/field/fieldOverrides';
