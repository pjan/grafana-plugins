import { distribute, SPACE_BETWEEN } from '../../plugins/panel/barchart/distribute';

/** Vertical position of a timeline row, as fractions of the plot height (0 is the top). */
export interface RowBand {
  top: number;
  height: number;
}

/** A row band in CSS pixels, relative to the top of the plot area (uPlot's `.u-over`). */
export interface RowBox {
  top: number;
  height: number;
}

// Height of Grafana's annotation markers (AnnotationMarker.tsx: 5px point triangle and 5px region bar).
export const MARKER_SIZE = 5;

/**
 * The bands the state timeline draws its rows in: the same `distribute(..., SPACE_BETWEEN)` call as `walk()` in
 * core/components/TimelineChart/timeline.ts. `rowHeight` is the panel's "Row height" option; the timeline uses the
 * full height when there is a single row (TimelineChart.tsx), and so must the caller.
 */
export function getRowBands(numRows: number, rowHeight: number): RowBand[] {
  const bands: RowBand[] = [];
  distribute(numRows, rowHeight, SPACE_BETWEEN, null, (idx, offPct, dimPct) => {
    bands[idx] = { top: offPct, height: dimPct };
  });
  return bands;
}

/** uPlot's plot area in canvas pixels (`u.bbox`). */
export interface PlotBox {
  top: number;
  height: number;
}

/**
 * A band in CSS pixels relative to the plot area, exactly where the timeline draws the row: `putBox` in timeline.ts
 * fills from `round(bbox.top + top)` with height `round(height)`, in canvas pixels. Divided by uPlot's pixel ratio.
 */
export function getRowBox(band: RowBand, bbox: PlotBox, pxRatio: number): RowBox {
  return {
    top: (Math.round(bbox.top + band.top * bbox.height) - bbox.top) / pxRatio,
    height: Math.round(band.height * bbox.height) / pxRatio,
  };
}

/** The row at `y` (CSS pixels from the top of the plot area), or null between rows and outside the plot. */
export function getRowAtPosition(bands: RowBand[], bbox: PlotBox, pxRatio: number, y: number): number | null {
  for (let rowIdx = 0; rowIdx < bands.length; rowIdx++) {
    const box = getRowBox(bands[rowIdx], bbox, pxRatio);
    if (y >= box.top && y < box.top + box.height) {
      return rowIdx;
    }
  }
  return null;
}

/** Marker height on a row: Grafana's 5px, or less on a row lower than that. */
export function getMarkerSize(box: RowBox): number {
  return Math.min(MARKER_SIZE, box.height);
}
