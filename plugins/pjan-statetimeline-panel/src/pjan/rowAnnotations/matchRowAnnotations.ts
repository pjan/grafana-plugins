import { type DataFrame, type Field, FieldType, getFieldDisplayName } from '@grafana/data';

import { getXAnnotationFrames } from '../../plugins/panel/timeseries/plugins/utils';

import { DEFAULT_ROW_KEY, type FieldConfigWithRowAnnotations, type RowAnnotationsOptions } from './options';

/** The annotations of one annotation frame that matched one row, as a frame of their own (sorted by time). */
export interface RowAnnotationFrame {
  /** Stable React key: source frame and row */
  key: string;
  /** 0-based timeline row: the field at `rowIdx + 1` of the aligned frame */
  rowIdx: number;
  frame: DataFrame;
}

export interface SplitRowAnnotations {
  /** Every annotation frame without the annotations that matched a row (frames without a match are kept as is) */
  unmatched: DataFrame[];
  /** Per row and source frame, in source frame order, then row order */
  rows: RowAnnotationFrame[];
}

type RowKeyOptions = Pick<RowAnnotationsOptions, 'rowKey' | 'label'>;

/**
 * The key of a row (`undefined` when it has none, so nothing matches it): the row's "Annotation key" field option when
 * set, else its display name (as the y axis shows it) or the value of the chosen label. Empty strings are no key.
 */
function getRowKey(field: Field, frame: DataFrame, options: RowKeyOptions, frames?: DataFrame[]): string | undefined {
  const annotationKey = (field.config.custom as FieldConfigWithRowAnnotations | undefined)?.rowAnnotations
    ?.annotationKey;
  let key: string | undefined;
  if (annotationKey) {
    key = annotationKey;
  } else if ((options.rowKey ?? DEFAULT_ROW_KEY) === 'label') {
    key = options.label ? field.labels?.[options.label] : undefined;
  } else {
    key = getFieldDisplayName(field, frame, frames);
  }
  return key === '' ? undefined : key;
}

/** The key of every row the timeline draws: the fields 1..n of its aligned frame (current page, hidden rows removed). */
export function getRowKeys(alignedFrame: DataFrame, options: RowKeyOptions): Array<string | undefined> {
  return alignedFrame.fields.slice(1).map((field) => getRowKey(field, alignedFrame, options));
}

/**
 * The keys of the panel's rows that the timeline does not draw: on another page, or hidden with "Hide in area"
 * (`hideFrom.viz`). `frames` are all of the panel's prepared frames; a key that a drawn row also has is not included.
 */
export function getOtherRowKeys(
  frames: DataFrame[] | undefined,
  drawnKeys: Array<string | undefined>,
  options: RowKeyOptions
): string[] {
  const drawn = new Set(drawnKeys);
  const other = new Set<string>();
  for (const frame of frames ?? []) {
    for (const field of frame.fields) {
      if (field.type === FieldType.time) {
        continue;
      }
      const key = getRowKey(field, frame, options, frames);
      if (key !== undefined && !drawn.has(key)) {
        other.add(key);
      }
    }
  }
  return [...other];
}

/** A value matches a key when it equals it; a list value (such as `tags`) matches when any of its items does. */
export function valueMatchesKey(value: unknown, key: string): boolean {
  if (value == null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => item != null && String(item) === key);
  }
  return String(value) === key;
}

/**
 * Splits the panel's annotations into the ones drawn on matching rows and the rest, which keep core's placement.
 * Only time-based annotation frames are matched (the ones core's annotations plugin draws on the x axis). An
 * annotation that matches several rows is drawn on each of them. One that matches only rows the timeline does not
 * draw (`otherRowKeys`: other pages, hidden rows) is not drawn at all.
 */
export function splitRowAnnotations(
  annotations: DataFrame[] | undefined,
  rowKeys: Array<string | undefined>,
  fieldName: string,
  otherRowKeys: string[] = []
): SplitRowAnnotations {
  const rows: RowAnnotationFrame[] = [];
  const xFrames = new Set(getXAnnotationFrames(annotations));

  const unmatched = (annotations ?? []).map((frame, frameIdx) => {
    const field = frame.fields.find((f) => f.name === fieldName);
    if (!xFrames.has(frame) || !field) {
      return frame;
    }

    const keep: number[] = [];
    const byRow: number[][] = rowKeys.map(() => []);
    for (let annoIdx = 0; annoIdx < frame.length; annoIdx++) {
      let isMatched = false;
      rowKeys.forEach((key, rowIdx) => {
        if (key !== undefined && valueMatchesKey(field.values[annoIdx], key)) {
          byRow[rowIdx].push(annoIdx);
          isMatched = true;
        }
      });
      if (!isMatched && !otherRowKeys.some((key) => valueMatchesKey(field.values[annoIdx], key))) {
        keep.push(annoIdx);
      }
    }

    byRow.forEach((idxs, rowIdx) => {
      if (idxs.length > 0) {
        rows.push({ key: `${frameIdx}:${rowIdx}`, rowIdx, frame: selectRows(frame, sortByTime(frame, idxs)) });
      }
    });

    return keep.length === frame.length ? frame : selectRows(frame, keep);
  });

  return { unmatched, rows };
}

// Core's annotation code (and its clustering) expects frames sorted by time; see useAnnotations.tsx.
function sortByTime(frame: DataFrame, idxs: number[]): number[] {
  const time = frame.fields.find((f) => f.name === 'time');
  return time ? [...idxs].sort((a, b) => time.values[a] - time.values[b]) : idxs;
}

/** A copy of `frame` with only the rows at `idxs`; data links keep resolving against the original row. */
export function selectRows(frame: DataFrame, idxs: number[]): DataFrame {
  return {
    ...frame,
    length: idxs.length,
    fields: frame.fields.map((field) => selectFieldRows(field, idxs)),
  };
}

function selectFieldRows(field: Field, idxs: number[]): Field {
  const getLinks = field.getLinks;
  return {
    ...field,
    values: idxs.map((idx) => field.values[idx]),
    getLinks: getLinks
      ? (config) =>
          getLinks({
            ...config,
            valueRowIndex: config.valueRowIndex == null ? undefined : idxs[config.valueRowIndex],
          })
      : undefined,
  };
}
