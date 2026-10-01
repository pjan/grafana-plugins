import uPlot from 'uplot';

import { type DataFrame, type GrafanaTheme2 } from '@grafana/data';
import { toFillColor } from '@pjan/grafana-styling';

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

/** uPlot's rect function, as `uPlot.orient` passes it to timeline.ts: adds a box to a path or the context. */
export type BoxRect = (path: Path2D | CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;

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
  /**
   * A row's line width in CSS pixels, from its Line width (`custom.lineWidth`): the Pill look's 1 px where Line width
   * is 0 (core's default, which core saves on new panels) or not set; undefined: the row's Line width, as core
   */
  getLineWidth: (lineWidth: number | undefined) => number | undefined;
  /** With Corner radius: adds a box's fill with rounded corners (uPlot's rect arguments); undefined: square */
  fillRect?: BoxRect;
  /**
   * With Corner radius: the stroke rect for a line of `strokeWidth` canvas pixels, given (as timeline.ts does) the box
   * inset by half the line width; undefined: square
   */
  getStrokeRect?: (strokeWidth: number) => BoxRect;
  /** The CSS border radius of the hover highlight (uPlot's cursor points); undefined: core's square */
  hoverRadius?: string;
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
  const radius = styling.cornerRadius ?? 0;
  const rows = frame.fields.map((field, i) => (i === 0 ? undefined : getRowStyle(field, theme, styling)));
  if (!pill && !hideOverflow && radius <= 0 && !rows.some(Boolean)) {
    return undefined;
  }
  const corners = radius > 0 ? getRoundedBoxRects(radius) : undefined;

  return {
    getLineWidth: (lineWidth) => (pill ? getPillLineWidth(lineWidth) : undefined),
    fillRect: corners?.fillRect,
    getStrokeRect: corners?.getStrokeRect,
    hoverRadius: radius > 0 ? `${radius}px` : undefined,

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

/**
 * The Pill look's line width: a row's Line width when it is above 0, otherwise Pill's 1 px. Core's Line width defaults
 * to 0 and core saves that 0 on every new panel, so 0 counts as unset: under Pill, a line can't be turned off.
 */
export function getPillLineWidth(lineWidth: number | undefined): number {
  return lineWidth != null && lineWidth > 0 ? lineWidth : PILL_LINE_WIDTH;
}

/**
 * The corner radius of a box in canvas pixels: Corner radius scaled for the pixel ratio, at most half the box's width
 * and height.
 */
export function clampCornerRadius(radius: number, width: number, height: number, pxRatio = uPlot.pxRatio): number {
  return Math.max(0, Math.min(radius * pxRatio, width / 2, height / 2));
}

const addBox = (path: Path2D | CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  // roundRect is in every browser Grafana 13 supports; square where it is missing
  if (r > 0 && typeof path.roundRect === 'function') {
    path.roundRect(x, y, w, h, r);
  } else {
    path.rect(x, y, w, h);
  }
};

/**
 * Rounded boxes for timeline.ts's fill and line. The fill gets the clamped radius; the line, which timeline.ts strokes
 * inset by half its width, gets that radius less half the line width, so it follows the fill's edge.
 */
function getRoundedBoxRects(radius: number) {
  const fillRect: BoxRect = (path, x, y, w, h) => addBox(path, x, y, w, h, clampCornerRadius(radius, w, h));
  const strokeRects = new Map<number, BoxRect>();
  const getStrokeRect = (strokeWidth: number) => {
    let strokeRect = strokeRects.get(strokeWidth);
    if (!strokeRect) {
      strokeRect = (path, x, y, w, h) => {
        const outer = clampCornerRadius(radius, w + strokeWidth, h + strokeWidth);
        addBox(path, x, y, w, h, Math.max(0, outer - strokeWidth / 2));
      };
      strokeRects.set(strokeWidth, strokeRect);
    }
    return strokeRect;
  };
  return { fillRect, getStrokeRect };
}
