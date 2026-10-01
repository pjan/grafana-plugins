import tinycolor from 'tinycolor2';

import { arrayToDataFrame, type DataFrame, DataTopic } from '@grafana/data';
import { DEFAULT_ANNOTATION_COLOR } from '@grafana/ui';

import { type TimeRange2 } from '../../packages/grafana-ui/internal';

/**
 * The annotation being added on a row (Ctrl/Cmd-click, or "Add annotation" in the tooltip). Same frame as
 * `buildWipAnnoFrame` in plugins/panel/timeseries/plugins/annotations/useAnnotations.tsx (not exported there), with
 * the row's key as its first tag, so the annotation editor opens with it.
 */
export function buildRowWipFrame(range: TimeRange2, rowKey: string): DataFrame {
  const isRegion = range.to > range.from;
  const frame = arrayToDataFrame([
    {
      time: range.from,
      timeEnd: isRegion ? range.to : null,
      isRegion,
      color: tinycolor(DEFAULT_ANNOTATION_COLOR).toHex8String(),
      tags: [rowKey],
    },
  ]);
  frame.meta = { dataTopic: DataTopic.Annotations, custom: { isWip: true } };
  return frame;
}

export interface NewAnnotationRow {
  rowIdx: number;
  rowKey: string;
}

/**
 * The row a new annotation is added on, or null to leave it to core (full height, untagged): the option is off, the
 * annotation field is not `tags` (a tag would not make it match its row), the pointer was not on a row (between
 * rows), or that row has no key. `rowIdx` is the row under the pointer when the click or drag started.
 */
export function getNewAnnotationRow(
  enabled: boolean,
  fieldName: string,
  rowIdx: number | null,
  rowKeys: Array<string | undefined>
): NewAnnotationRow | null {
  if (!enabled || fieldName !== 'tags' || rowIdx == null) {
    return null;
  }
  const rowKey = rowKeys[rowIdx];
  return rowKey ? { rowIdx, rowKey } : null;
}
