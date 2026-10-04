// Copied from grafana/grafana v13.2.3: packages/grafana-data/src/transformations/transformers/joinDataFrames.ts. Apache-2.0 (Copyright Grafana Labs, see UPSTREAM.md). Changes: partial copy (maybeSortFrame, NULL_REMOVE, NULL_RETAIN, NULL_EXPAND, isLikelyAscendingVector); imports from the public @grafana/data API.
import { type DataFrame, FieldType, sortDataFrame } from '@grafana/data';

export function maybeSortFrame(frame: DataFrame, fieldIdx: number) {
  if (fieldIdx >= 0) {
    let sortByField = frame.fields[fieldIdx];

    if (sortByField.type !== FieldType.string && !isLikelyAscendingVector(sortByField.values)) {
      frame = sortDataFrame(frame, fieldIdx);
    }
  }

  return frame;
}

export const NULL_REMOVE = 0; // nulls are converted to undefined (e.g. for spanGaps: true)
export const NULL_RETAIN = 1; // nulls are retained, with alignment artifacts set to undefined (default)
export const NULL_EXPAND = 2; // nulls are expanded to include any adjacent alignment artifacts

export function isLikelyAscendingVector(data: unknown[], samples = 50) {
  const len = data.length;

  // empty or single value
  if (len <= 1) {
    return true;
  }

  // skip leading & trailing nullish
  let firstIdx = 0;
  let lastIdx = len - 1;

  while (firstIdx <= lastIdx && data[firstIdx] == null) {
    firstIdx++;
  }

  while (lastIdx >= firstIdx && data[lastIdx] == null) {
    lastIdx--;
  }

  // all nullish or one value surrounded by nullish
  if (lastIdx <= firstIdx) {
    return true;
  }

  const stride = Math.max(1, Math.floor((lastIdx - firstIdx + 1) / samples));

  for (let prevVal = data[firstIdx], i = firstIdx + stride; i <= lastIdx; i += stride) {
    const v = data[i];

    if (v != null && prevVal != null) {
      if (v <= prevVal) {
        return false;
      }

      prevVal = v;
    }
  }

  return true;
}
