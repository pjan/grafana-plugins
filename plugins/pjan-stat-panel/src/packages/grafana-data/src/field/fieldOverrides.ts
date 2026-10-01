// Copied from grafana/grafana v13.2.3: packages/grafana-data/src/field/fieldOverrides.ts. Apache-2.0 (Copyright Grafana Labs, see UPSTREAM.md). Changes: partial copy (findNumericFieldMinMax); imports from the public @grafana/data API.
import { type DataFrame, FieldType, type NumericRange, NullValueMode } from '@grafana/data';

export function findNumericFieldMinMax(data: DataFrame[]): NumericRange {
  let min: number | null = Infinity;
  let max: number | null = -Infinity;

  for (const frame of data) {
    for (const field of frame.fields) {
      if (field.type === FieldType.number) {
        const nullAsZero = field.config.nullValueMode === NullValueMode.AsZero;
        const vals = field.values;

        for (let i = 0; i < vals.length; i++) {
          let v = vals[i];

          if (v === null) {
            if (nullAsZero) {
              if (min! > 0) {
                min = 0;
              }
              if (max! < 0) {
                max = 0;
              }
            }
          } else if (!Number.isNaN(v)) {
            if (min! > v) {
              min = v;
            }
            if (max! < v) {
              max = v;
            }
          }
        }
      }
    }
  }

  if (min === Infinity) {
    min = null;
  }

  if (max === -Infinity) {
    max = null;
  }

  return { min, max, delta: (max ?? 0) - (min ?? 0) };
}
