import uPlot from 'uplot';

import { type DataFrame, dateTimeFormat, type Field, type GrafanaTheme2, type TimeRange } from '@grafana/data';
import { type TimeZone } from '@grafana/schema';
import { FIXED_UNIT, type UPlotConfigBuilder } from '@grafana/ui';

import { getTextContrast, MIN_TEXT_CONTRAST, toCanvasColor } from './canvasColors';
import { getColorNameLookup } from './colorNames';
import {
  type FieldConfigWithStyling,
  getStylingColor,
  ROW_NAME_COLOR_MODES,
  type TimelineStylingOptions,
} from './options';
import { getSoftestReadableShadeColor } from './shades';

/** The weight of the 00:00 labels with "Day boundaries" on. */
export const DAY_BOUNDARY_FONT_WEIGHT = 700;

const DAY = 24 * 60 * 60 * 1000;

// uPlot's axis object after init (functions instead of option values) and the layout fields it keeps (uPlot 1.6.32).
type InternalAxis = Omit<uPlot.Axis, 'values' | 'stroke' | 'grid' | 'ticks' | 'font' | 'gap'> & {
  _pos: number;
  _splits?: number[];
  _values?: Array<string | null>;
  font: [string, number];
  gap: number;
  values: (u: uPlot, splits: number[], axisIdx: number, space: number, incr: number) => Array<string | null>;
  stroke: (u: uPlot, axisIdx: number) => CanvasRenderingContext2D['fillStyle'];
  grid: uPlot.Axis.Grid & { filter?: (u: uPlot, splits: number[], ...rest: number[]) => Array<number | null> };
  ticks: uPlot.Axis.Ticks & { size: number };
};

/**
 * The value a row shows as its current state: its last non-null value in the time range. A value from before the range
 * counts when it is the last one before the range, because its box is drawn from the start of the range.
 */
export function getCurrentStateValue(times: number[], values: unknown[], from: number, to: number): unknown {
  for (let i = Math.min(times.length, values.length) - 1; i >= 0; i--) {
    if (times[i] > to) {
      continue;
    }
    if (values[i] != null) {
      return values[i];
    }
    if (times[i] < from) {
      return undefined;
    }
  }
  return undefined;
}

/**
 * A row name in its state's colour: the softest shade of the state colour's hue that reaches MIN_TEXT_CONTRAST
 * against the panel background. A colour without a name has no other shades, so it is used as is if it reaches that
 * contrast. Undefined (the axis text colour) otherwise.
 */
export function getRowNameStateColor(
  theme: GrafanaTheme2,
  names: Map<string, string>,
  stateColor: string
): string | undefined {
  const name = names.get(stateColor);
  if (name) {
    const shade = getSoftestReadableShadeColor(theme, name, MIN_TEXT_CONTRAST);
    return shade ? toCanvasColor(theme, shade) : undefined;
  }
  const readable = getTextContrast(theme, stateColor, theme.colors.background.primary) >= MIN_TEXT_CONTRAST;
  return readable ? toCanvasColor(theme, stateColor) : undefined;
}

/**
 * A row's name colour on the canvas when its axis is drawn, or undefined for the axis colour. It reads the plot's
 * current data: a refresh with the same structure gives the plot new data without building a new config.
 */
type RowNameColorFn = (u: uPlot, seriesIdx: number) => string | undefined;

function getRowNameColorFn(
  field: Field,
  theme: GrafanaTheme2,
  getTimeRange: () => TimeRange
): RowNameColorFn | undefined {
  const setting = getStylingColor((field.config.custom as FieldConfigWithStyling)?.rowNameColor, ROW_NAME_COLOR_MODES);
  if (!setting) {
    return undefined;
  }
  if (setting.mode === 'fixed') {
    const color = toCanvasColor(theme, setting.fixedColor!);
    return () => color;
  }
  const names = getColorNameLookup(field, theme);
  return (u, seriesIdx) => {
    const range = getTimeRange();
    const times = u.data[0] as number[];
    const values = u.data[seriesIdx] as unknown[];
    const value = getCurrentStateValue(times, values, range.from.valueOf(), range.to.valueOf());
    const stateColor = value != null ? field.display?.(value).color : undefined;
    return stateColor ? getRowNameStateColor(theme, names, stateColor) : undefined;
  };
}

/**
 * Grid, axis text, row-name and day-boundary styling of the timeline's axes. Adds plot hooks only for what is set, so
 * with nothing set uPlot draws the axes as in core.
 * - Grid and axis text: replaces the axes' stroke functions at `init` (uPlot styles whole axes).
 * - Row names: uPlot draws and lays out every name in the axis colour; a `drawAxes` hook clears the names that have a
 *   colour and draws them again in it, at uPlot's position and in its font.
 * - Day boundaries: the 00:00 ticks lose their grid line and label in uPlot's pass, and a `drawAxes` hook draws them
 *   again, the line in the stronger colour and the label bold, at uPlot's label position.
 */
export function addAxisStyling(
  builder: UPlotConfigBuilder,
  frame: DataFrame,
  theme: GrafanaTheme2,
  styling: TimelineStylingOptions = {},
  timeZone: TimeZone,
  getTimeRange: () => TimeRange
) {
  const rowNameColors = frame.fields.slice(1).map((field) => getRowNameColorFn(field, theme, getTimeRange));
  const hasRowNameColors = rowNameColors.some(Boolean);
  const gridColor = styling.gridColor ? toCanvasColor(theme, styling.gridColor) : undefined;
  const axisTextColor = styling.axisTextColor ? toCanvasColor(theme, styling.axisTextColor) : undefined;
  const dayBoundaries = styling.dayBoundaries === true;
  if (!gridColor && !axisTextColor && !hasRowNameColors && !dayBoundaries) {
    return;
  }
  const dayBoundaryColor =
    (styling.dayBoundaryColor && toCanvasColor(theme, styling.dayBoundaryColor)) ||
    toCanvasColor(theme, theme.colors.border.strong)!;
  // The 00:00 splits of the current draw -> their label
  const midnights = new Map<number, string>();
  const isMidnight = (v: number) => dateTimeFormat(v, { format: 'HH:mm:ss.SSS', timeZone }) === '00:00:00.000';

  builder.addHook('init', (u: uPlot) => {
    const axes = u.axes as unknown as InternalAxis[];
    const x = axes.find((a) => a.scale === 'x');
    const y = axes.find((a) => a.scale === FIXED_UNIT);
    if (x && gridColor) {
      x.grid.stroke = () => gridColor;
      x.ticks.stroke = () => gridColor;
    }
    if (axisTextColor) {
      [x, y].forEach((axis) => axis && (axis.stroke = () => axisTextColor));
    }
    if (x && dayBoundaries) {
      const values = x.values;
      x.values = (self, splits, axisIdx, space, incr) => {
        const out = values(self, splits, axisIdx, space, incr);
        midnights.clear();
        if (incr >= DAY) {
          return out; // every tick is a day: nothing to set apart
        }
        return out.map((text, i) => {
          if (splits[i] != null && isMidnight(splits[i])) {
            midnights.set(splits[i], text ?? '');
            return '';
          }
          return text;
        });
      };
      const filter = x.grid.filter;
      if (filter) {
        x.grid.filter = (self, splits, ...rest) =>
          filter(self, splits, ...rest).map((v) => (v != null && midnights.has(v) ? null : v));
      }
    }
  });

  if (hasRowNameColors) {
    builder.addHook('drawAxes', (u: uPlot) => redrawRowNames(u, rowNameColors));
  }

  if (dayBoundaries) {
    builder.addHook('drawAxes', (u: uPlot) => drawDayBoundaries(u, midnights, dayBoundaryColor));
  }
}

/**
 * Draws the names of the rows with a colour again, in that colour, over uPlot's names (cleared first). Rows without a
 * colour keep uPlot's pixels (and whatever a theme plugin does to them). Position and font are uPlot's for a left
 * axis (`drawAxesGrid` in uPlot).
 */
function redrawRowNames(u: uPlot, colorFns: Array<RowNameColorFn | undefined>) {
  const axisIdx = u.axes.findIndex((a) => a.scale === FIXED_UNIT);
  const axis = u.axes[axisIdx] as unknown as InternalAxis;
  if (!axis?.show || !axis._splits || !axis._values) {
    return;
  }
  const ctx = u.ctx;
  const pxRatio = uPlot.pxRatio;
  const tickSize = axis.ticks.show ? Math.round(axis.ticks.size * pxRatio) : 0;
  const right = Math.round(axis._pos * pxRatio) - tickSize - Math.round(axis.gap * pxRatio);
  const centers = axis._splits.map((v) => Math.round(u.valToPos(v, axis.scale!, true)));
  const sorted = [...centers].sort((a, b) => a - b);
  // A name's band: halfway to its neighbours' centres, and within the plot's height, so clearing it touches no other
  // name and no time label
  const bandOf = (center: number) => {
    const i = sorted.indexOf(center);
    return [
      i === 0 ? u.bbox.top : (sorted[i - 1] + center) / 2,
      i === sorted.length - 1 ? u.bbox.top + u.bbox.height : (center + sorted[i + 1]) / 2,
    ];
  };
  ctx.save();
  ctx.font = axis.font[0];
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  axis._splits.forEach((_, i) => {
    const text = axis._values![i];
    // the name of row i is the plot's series i + 1 (series 0 is time)
    const color = text != null ? colorFns[i]?.(u, i + 1) : undefined;
    if (!color) {
      return;
    }
    const [top, bottom] = bandOf(centers[i]);
    ctx.clearRect(0, Math.ceil(top), right + 1, Math.floor(bottom) - Math.ceil(top));
    ctx.fillStyle = color;
    ctx.fillText(String(text), right, centers[i]);
  });
  ctx.restore();
}

/** The 00:00 grid lines (as uPlot's `drawOrthoLines` draws them) and their labels, bold (as uPlot's `drawAxesGrid`). */
function drawDayBoundaries(u: uPlot, midnights: Map<number, string>, color: string) {
  const axisIdx = u.axes.findIndex((a) => a.scale === 'x');
  const axis = u.axes[axisIdx] as unknown as InternalAxis;
  if (!midnights.size || !axis?.show) {
    return;
  }
  const ctx = u.ctx;
  const pxRatio = uPlot.pxRatio;
  ctx.save();
  const width = Math.round((axis.grid.width ?? 1) * pxRatio * 1000) / 1000;
  const offset = (width % 2) / 2;
  ctx.translate(offset, offset);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.beginPath();
  midnights.forEach((_, v) => {
    const px = Math.round(u.valToPos(v, 'x', true));
    ctx.moveTo(px, u.bbox.top);
    ctx.lineTo(px, u.bbox.top + u.bbox.height);
  });
  ctx.stroke();
  ctx.translate(-offset, -offset);
  // A bottom axis: below the ticks and the gap
  const tickSize = axis.ticks.show ? Math.round(axis.ticks.size * pxRatio) : 0;
  const top = Math.round(axis._pos * pxRatio) + tickSize + Math.round(axis.gap * pxRatio);
  ctx.font = `${DAY_BOUNDARY_FONT_WEIGHT} ${axis.font[0]}`;
  ctx.fillStyle = axis.stroke(u, axisIdx);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  midnights.forEach((text, v) => ctx.fillText(text, Math.round(u.valToPos(v, 'x', true)), top));
  ctx.restore();
}
