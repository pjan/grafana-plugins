import { type ComponentProps, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';

import { type DataFrame } from '@grafana/data';

import { type TimeRange2 } from '../../packages/grafana-ui/internal';
import { defaultOptions } from '../../plugins/panel/state-timeline/panelcfg.gen';
import { AnnotationsPlugin } from '../../plugins/panel/timeseries/plugins/AnnotationsPlugin';

import { getOtherRowKeys, getRowKeys, splitRowAnnotations } from './matchRowAnnotations';
import { DEFAULT_ROW_ANNOTATION_FIELD, type OptionsWithRowAnnotations } from './options';
import { RowAnnotationsPlugin, type RowWip } from './RowAnnotationsPlugin';
import { getRowAtPosition, getRowBands } from './rowLayout';
import { buildRowWipFrame, getNewAnnotationRow, type NewAnnotationRow } from './rowWipAnnotation';

type Props = ComponentProps<typeof AnnotationsPlugin> & {
  /** The aligned frame the timeline draws (current page, hidden rows removed): its fields 1..n are the rows */
  alignedFrame: DataFrame;
  /** All of the panel's prepared frames (every page, hidden rows included) */
  frames: DataFrame[] | undefined;
  panelOptions: OptionsWithRowAnnotations & { rowHeight?: number };
};

interface LatchedWip extends NewAnnotationRow {
  range: TimeRange2;
  /** The drawn rows when the annotation was started; a new page or row set cancels it */
  rowsSignature: string;
}

/**
 * Stands in for core's AnnotationsPlugin in StateTimelinePanel. With "Show on matching rows" off (the default) it
 * renders AnnotationsPlugin with exactly the props core passes, and adds nothing to the plot. When on, annotations
 * that match a drawn row go to RowAnnotationsPlugin, ones that match only rows not drawn (other pages, hidden rows)
 * are left out, and everything else goes to AnnotationsPlugin as before. An annotation added on a row (core's
 * Ctrl/Cmd-click or -drag, or "Add annotation" in the tooltip) is drawn on that row and tagged with its key.
 *
 * AnnotationsPlugin stays at the same place in the tree in both modes, so switching the option in the editor does
 * not remount it.
 */
export const StateTimelineAnnotations = ({ alignedFrame, frames, panelOptions, ...props }: Props) => {
  const { config, options, annotations, timeZone, newRange, setNewRange, canvasRegionRendering, replaceVariables } =
    props;
  const rowOptions = panelOptions.rowAnnotations;
  const enabled = rowOptions?.enabled === true;
  const fieldName = rowOptions?.field || DEFAULT_ROW_ANNOTATION_FIELD;
  const rowKeySource = rowOptions?.rowKey;
  const rowLabel = rowOptions?.label;

  const numRows = alignedFrame.fields.length - 1;
  // TimelineChart.tsx: "When there is only one row, use the full space"
  const rowHeight = numRows > 1 ? (panelOptions.rowHeight ?? defaultOptions.rowHeight ?? 1) : 1;
  const bands = useMemo(() => getRowBands(numRows, rowHeight), [numRows, rowHeight]);

  const rowKeys = useMemo(
    () => (enabled ? getRowKeys(alignedFrame, { rowKey: rowKeySource, label: rowLabel }) : []),
    [enabled, alignedFrame, rowKeySource, rowLabel]
  );
  const split = useMemo(() => {
    if (!enabled) {
      return null;
    }
    const otherRowKeys = getOtherRowKeys(frames, rowKeys, { rowKey: rowKeySource, label: rowLabel });
    return splitRowAnnotations(annotations, rowKeys, fieldName, otherRowKeys);
  }, [enabled, annotations, frames, rowKeys, rowKeySource, rowLabel, fieldName]);

  // The row under the pointer when the last click or drag on the plot started (null between rows).
  const [pressedRow, setPressedRow] = useState<number | null>(null);
  const pointerState = useRef({ enabled, bands });
  useLayoutEffect(() => {
    pointerState.current = { enabled, bands };
  }, [enabled, bands]);
  useLayoutEffect(() => {
    // Nothing is added to core's plot config while the option is off.
    if (!enabled) {
      return;
    }
    config.addHook('ready', (u) => {
      u.over.addEventListener('mousedown', (e) => {
        if (pointerState.current.enabled) {
          const top = e.clientY - u.over.getBoundingClientRect().top;
          setPressedRow(getRowAtPosition(pointerState.current.bands, u.bbox, uPlot.pxRatio, top));
        }
      });
    });
  }, [config, enabled]);

  // A new annotation range is drawn on the pressed row when it qualifies (getNewAnnotationRow); else core draws it.
  const rowsSignature = rowKeys.join('\u0000');
  const [latchedRange, setLatchedRange] = useState<TimeRange2 | null>(newRange);
  const [latchedWip, setLatchedWip] = useState<LatchedWip | null>(null);
  if (newRange !== latchedRange) {
    setLatchedRange(newRange);
    const row = newRange ? getNewAnnotationRow(enabled, fieldName, pressedRow, rowKeys) : null;
    setLatchedWip(row && newRange ? { ...row, range: newRange, rowsSignature } : null);
  }
  const isStale = latchedWip != null && latchedWip.rowsSignature !== rowsSignature;
  useEffect(() => {
    if (isStale) {
      setNewRange(null);
    }
  }, [isStale, setNewRange]);

  const wip: RowWip | null = useMemo(
    () =>
      latchedWip && !isStale
        ? { rowIdx: latchedWip.rowIdx, frame: buildRowWipFrame(latchedWip.range, latchedWip.rowKey) }
        : null,
    [latchedWip, isStale]
  );
  const exitWipEdit = useCallback(() => setNewRange(null), [setNewRange]);

  const coreAnnotations = split ? split.unmatched : annotations;
  const coreNewRange = latchedWip ? null : newRange;
  const corePlugin = useMemo(
    () => (
      <AnnotationsPlugin
        config={config}
        options={options}
        annotations={coreAnnotations}
        timeZone={timeZone}
        newRange={coreNewRange}
        setNewRange={setNewRange}
        canvasRegionRendering={canvasRegionRendering}
        replaceVariables={replaceVariables}
      />
    ),
    [config, options, coreAnnotations, timeZone, coreNewRange, setNewRange, canvasRegionRendering, replaceVariables]
  );
  const rowPlugin = useMemo(
    () =>
      split && (
        <RowAnnotationsPlugin
          config={config}
          rows={split.rows}
          bands={bands}
          options={options}
          timeZone={timeZone}
          replaceVariables={replaceVariables}
          wip={wip}
          exitWipEdit={exitWipEdit}
        />
      ),
    [split, config, bands, options, timeZone, replaceVariables, wip, exitWipEdit]
  );

  return (
    <>
      {corePlugin}
      {rowPlugin}
    </>
  );
};
