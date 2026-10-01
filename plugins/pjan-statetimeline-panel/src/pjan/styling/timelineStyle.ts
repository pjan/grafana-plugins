import uPlot from 'uplot';

import { type DataFrame, type GrafanaTheme2 } from '@grafana/data';

import { toFillColor } from './canvasColors';
import { type TimelineStylingOptions } from './options';
import { getRowStyle, isPillLook, PILL_LINE_WIDTH } from './rowStyle';

// timeline.ts's space between a box's edge (after its line) and its value, in canvas pixels.
const TEXT_PADDING = 2;

/** Rows lower than this (in CSS pixels) show no values when values that don't fit are hidden. */
export const MIN_VALUE_ROW_HEIGHT = 16;

/** The colours of a box, where the styling sets them. */
export interface BoxColors {
  /** The fill before core applies Fill opacity (hex, see `toFillColor`) */
  fill?: string;
  /** The fill as drawn, without Fill opacity (the Pill look) */
  opaqueFill?: string;
  line?: string;
}

/** A box as timeline.ts keeps it for its value: canvas pixels, x relative to the plot. */
export interface ValueBox {
  x: number;
  w: number;
  h: number;
}

/**
 * What timeline.ts asks the styling for, per row by the row's own field index (timeline.ts's `seriesIdx + 1`, or
 * `sidx`). Core's `getFieldConfig` reads the field before it (see UPSTREAM.md), so these don't reuse it.
 */
export interface TimelineStyleHooks {
  /** Line width of every row in CSS pixels, set by the look; undefined: each row's Line width */
  lineWidth?: number;
  /** Undefined: core's colours for the box */
  getBoxColors: (fieldIdx: number, valueColor: string) => BoxColors | undefined;
  /**
   * Undefined: core's automatic contrast. `getStateColor` (the state colour, through the field's display processor)
   * is only called for rows with a value colour.
   */
  getValueTextColor: (fieldIdx: number, getStateColor: () => string, fillColor: string) => string | undefined;
  /**
   * The text to draw for a value, or null to draw none. `ctx.textAlign` is the alignment `drawPoints` draws it with
   * (Align values, or centre for samples).
   */
  getValueLabel: (
    ctx: CanvasRenderingContext2D,
    text: string,
    maxChars: number,
    box: ValueBox,
    plotWidth: number,
    strokeWidth: number
  ) => string | null;
}

/**
 * The box and value styling of the rows of `frame` (the aligned frame: field 0 is time, field N is row N). Undefined
 * when nothing that affects the boxes is set, so core's code runs unchanged.
 */
export function getTimelineStyleHooks(
  frame: DataFrame,
  theme: GrafanaTheme2,
  styling: TimelineStylingOptions = {}
): TimelineStyleHooks | undefined {
  const pill = isPillLook(styling);
  const hideOverflow = (styling.valueOverflow ?? (pill ? 'hide' : 'truncate')) === 'hide';
  const rows = frame.fields.map((field, i) => (i === 0 ? undefined : getRowStyle(field, theme, styling)));
  if (!pill && !hideOverflow && !rows.some(Boolean)) {
    return undefined;
  }

  return {
    lineWidth: pill ? PILL_LINE_WIDTH : undefined,

    getBoxColors: (fieldIdx, valueColor) => {
      const row = rows[fieldIdx];
      if (!row) {
        return undefined;
      }
      const fill = row.getFill(valueColor);
      const line = row.getLine(valueColor);
      return pill ? { opaqueFill: fill ?? valueColor, line } : { fill: fill && toFillColor(fill), line };
    },

    getValueTextColor: (fieldIdx, getStateColor, fillColor) => {
      const row = rows[fieldIdx];
      return row?.hasValueColor ? row.getValueText(getStateColor(), fillColor) : undefined;
    },

    getValueLabel: (ctx, text, maxChars, box, plotWidth, strokeWidth) => {
      if (!hideOverflow) {
        return text.slice(0, maxChars);
      }
      if (box.h < MIN_VALUE_ROW_HEIGHT * uPlot.pxRatio) {
        return null;
      }
      // Where drawPoints draws the text (its x for each alignment), relative to the plot. It must lie within the box,
      // less the space timeline.ts leaves at either end, and within the plot.
      const width = ctx.measureText(text).width;
      const inset = strokeWidth + TEXT_PADDING;
      let start: number;
      if (ctx.textAlign === 'left') {
        start = Math.round(Math.max(box.x, 0) + inset);
      } else if (ctx.textAlign === 'right') {
        start = Math.round(box.x + box.w - inset) - width;
      } else {
        start = Math.round(box.x + box.w / 2) - width / 2;
      }
      const end = start + width;
      const fits = start >= box.x + inset && end <= box.x + box.w - inset && start >= 0 && end <= plotWidth;
      return fits ? text : null;
    },
  };
}
