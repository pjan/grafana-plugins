import { css } from '@emotion/css';
import { type CSSProperties, type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import tinycolor from 'tinycolor2';
import uPlot from 'uplot';

import { type DataFrame, type InterpolateFunction } from '@grafana/data';
import { type TimeZone, type VizAnnotations } from '@grafana/schema';
import {
  DEFAULT_ANNOTATION_COLOR,
  getPortalContainer,
  type UPlotConfigBuilder,
  usePanelContext,
  useStyles2,
  useTheme2,
} from '@grafana/ui';

import { AnnotationMarker } from '../../plugins/panel/timeseries/plugins/annotations/AnnotationMarker';
import { type AnnotationVals } from '../../plugins/panel/timeseries/plugins/annotations/types';
import {
  ClusteringMode,
  useAnnotationClustering,
} from '../../plugins/panel/timeseries/plugins/annotations/useAnnotationClustering';
import {
  getAnnoRegionBoxStyle,
  shouldRenderAnnotationLine,
  shouldRenderAnnotationRegion,
} from '../../plugins/panel/timeseries/plugins/utils';

import { type RowAnnotationFrame } from './matchRowAnnotations';
import { getMarkerSize, getRowBox, type RowBand } from './rowLayout';

/** The annotation being added on a row */
export interface RowWip {
  rowIdx: number;
  frame: DataFrame;
}

interface RowAnnotationsPluginProps {
  config: UPlotConfigBuilder;
  rows: RowAnnotationFrame[];
  bands: RowBand[];
  options: VizAnnotations | undefined;
  timeZone: TimeZone;
  replaceVariables: InterpolateFunction;
  wip: RowWip | null;
  exitWipEdit: () => void;
}

interface Entry {
  key: string;
  rowIdx: number;
  frame: DataFrame;
  vals: AnnotationVals;
  isWip: boolean;
}

/**
 * What the markers are positioned from. Kept in state from the `drawAxes` hook (uPlot draws outside React), so a
 * change of the x range, the plot area (also when only its height changes) or the pixel ratio re-renders them.
 */
interface PlotLayout {
  from: number;
  to: number;
  /** uPlot's bbox, in canvas pixels */
  left: number;
  top: number;
  width: number;
  height: number;
  pxRatio: number;
}

const DEFAULT_ANNOTATION_COLOR_HEX8 = tinycolor(DEFAULT_ANNOTATION_COLOR).toHex8String();

const NO_LAYOUT: PlotLayout = { from: -1, to: -1, left: 0, top: 0, width: 0, height: 0, pxRatio: 1 };

const sameLayout = (a: PlotLayout, b: PlotLayout) =>
  (Object.keys(a) as Array<keyof PlotLayout>).every((key) => a[key] === b[key]);

// Same as getVals() in plugins/panel/timeseries/plugins/AnnotationsPlugin.tsx (not exported there).
function getVals(frame: DataFrame): AnnotationVals {
  const vals: Record<string, unknown[]> = {};
  for (const field of frame.fields) {
    vals[field.name] = field.values;
  }
  return vals as unknown as AnnotationVals;
}

// Same as skipClusteredAnno() in AnnotationsPlugin.tsx: an annotation that is drawn as part of a cluster.
function isInCluster(vals: AnnotationVals, i: number) {
  return !vals.isCluster?.[i] && vals.clusterIdx?.[i] != null && vals.clusterIdx[i] >= 0;
}

// Same as renderLine() in AnnotationsPlugin.tsx (not exported there).
function renderLine(ctx: CanvasRenderingContext2D, y0: number, y1: number, x: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.strokeStyle = color;
  ctx.stroke();
}

/**
 * Draws the annotations that matched a row, on that row only. Mirrors core's AnnotationsPlugin: dashed lines on the
 * canvas (start and end of regions; core's state timeline draws regions without a fill), clustering per row and
 * annotation frame with core's useAnnotationClustering, and core's AnnotationMarker for markers, tooltips, links,
 * actions and the editor. Point markers sit inside the row at its top edge, pointing down; regions are a bar along the
 * row's top edge.
 */
export const RowAnnotationsPlugin = ({
  config,
  rows,
  bands,
  options,
  timeZone,
  replaceVariables,
  wip,
  exitWipEdit,
}: RowAnnotationsPluginProps) => {
  const styles = useStyles2(getStyles);
  const [plot, setPlot] = useState<uPlot | null>(null);
  const [layout, setLayout] = useState<PlotLayout>(NO_LAYOUT);
  const [portalRoot] = useState(() => getPortalContainer());
  const [pinnedKey, setPinnedKey] = useState<string | undefined>();
  const getColorByName = useTheme2().visualization.getColorByName;
  const { canExecuteActions } = usePanelContext();
  const userCanExecuteActions = canExecuteActions?.() ?? false;

  const clusteringMode = options?.clustering && options.clustering > 0 ? ClusteringMode.Render : null;
  const frames = useMemo(() => rows.map((row) => row.frame), [rows]);
  const timeRange = useMemo(() => ({ from: layout.from, to: layout.to }), [layout.from, layout.to]);
  // Returns no frames until the plot has a width, like core's.
  const { annotations: clustered } = useAnnotationClustering({
    annotations: frames,
    clusteringMode,
    plotWidth: layout.width,
    timeRange,
  });

  const entries = useMemo(() => {
    const result: Entry[] = clustered.map((frame, i) => ({
      key: rows[i].key,
      rowIdx: rows[i].rowIdx,
      frame,
      vals: getVals(frame),
      isWip: false,
    }));
    if (wip) {
      result.push({ key: 'wip', rowIdx: wip.rowIdx, frame: wip.frame, vals: getVals(wip.frame), isWip: true });
    }
    return result;
  }, [clustered, rows, wip]);

  // Read by the draw hook, which uPlot calls outside React.
  const drawState = useRef<{ entries: Entry[]; bands: RowBand[] }>({ entries: [], bands: [] });

  useLayoutEffect(() => {
    drawState.current = { entries, bands };
    plot?.redraw(false, true);
  }, [plot, entries, bands]);

  // Hooks stay registered on the plot config after this component unmounts (for example when the panel option is
  // switched off in the editor); with no entries left they draw nothing.
  useLayoutEffect(
    () => () => {
      drawState.current = { entries: [], bands: [] };
    },
    []
  );

  const lineWidth = options?.lines?.width;
  const regionOpacity = options?.regions?.opacity;

  useLayoutEffect(() => {
    config.addHook('ready', (u) => {
      setPlot(u);
    });

    config.addHook('drawAxes', (u) => {
      const next: PlotLayout = {
        from: u.scales.x?.min ?? -1,
        to: u.scales.x?.max ?? -1,
        left: u.bbox.left,
        top: u.bbox.top,
        width: u.bbox.width,
        height: u.bbox.height,
        pxRatio: uPlot.pxRatio,
      };
      setLayout((prev) => (sameLayout(prev, next) ? prev : next));
    });

    config.addHook('draw', (u) => {
      // As core's AnnotationsPlugin, which draws lines only when both of these hold ("Hide lines and areas" sets
      // both). Row annotations are never in multi-row lanes.
      if (
        !shouldRenderAnnotationLine(lineWidth, undefined) ||
        !shouldRenderAnnotationRegion(regionOpacity, undefined)
      ) {
        return;
      }
      const { entries, bands } = drawState.current;
      const ctx = u.ctx;

      ctx.save();
      ctx.beginPath();
      ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
      ctx.clip();
      ctx.lineWidth = lineWidth ?? 2;
      ctx.setLineDash([5, 5]);

      for (const { rowIdx, vals } of entries) {
        const band = bands[rowIdx];
        if (!band) {
          continue;
        }
        const box = getRowBox(band, u.bbox, uPlot.pxRatio);
        const y0 = u.bbox.top + box.top * uPlot.pxRatio;
        const y1 = y0 + box.height * uPlot.pxRatio;

        for (let i = 0; i < vals.time.length; i++) {
          if (isInCluster(vals, i)) {
            continue;
          }
          const color = getColorByName(vals.color?.[i] ?? DEFAULT_ANNOTATION_COLOR_HEX8);
          const timeEnd = vals.timeEnd?.[i];
          renderLine(ctx, y0, y1, u.valToPos(vals.time[i], 'x', true), color);
          if (vals.isRegion?.[i] && timeEnd) {
            renderLine(ctx, y0, y1, u.valToPos(timeEnd, 'x', true), color);
          }
        }
      }

      ctx.restore();
    });
  }, [config, getColorByName, lineWidth, regionOpacity]);

  // The markers go next to uPlot's overlay (.u-over), not inside it: hovering a marker then leaves the plot, so the
  // state tooltip closes and only the annotation tooltip shows.
  const container = plot?.over.parentElement;
  if (!plot || !container || layout.width === 0) {
    return null;
  }

  const plotWidth = layout.width / layout.pxRatio;
  const showTooltipOnHover = !pinnedKey && !wip;

  const markers: ReactNode[] = [];
  for (const { key, rowIdx, frame, vals, isWip } of entries) {
    const band = bands[rowIdx];
    if (!band) {
      continue;
    }
    const box = getRowBox(band, layout, layout.pxRatio);
    const size = getMarkerSize(box);

    for (let i = 0; i < vals.time.length; i++) {
      if (isInCluster(vals, i)) {
        continue;
      }
      const color = getColorByName(vals.color?.[i] || DEFAULT_ANNOTATION_COLOR);
      const left = Math.round(plot.valToPos(vals.time[i], 'x')) || 0; // handles -0
      const timeEnd = vals.timeEnd?.[i];

      let style: CSSProperties | null = null;
      if (vals.isRegion?.[i] && timeEnd != null) {
        const right = Math.round(plot.valToPos(timeEnd, 'x') ?? 0) || 0;
        if (left < plotWidth && right > 0) {
          style = { ...getAnnoRegionBoxStyle(plotWidth, right, left), top: box.top, height: size, background: color };
        }
      } else if (left >= 0 && left <= plotWidth) {
        // AnnotationMarker's triangle points up from its bottom border; this turns it to point down from the top.
        style = {
          left,
          top: box.top,
          borderBottomWidth: 0,
          borderTop: `${size}px solid ${color}`,
          borderLeftWidth: size,
          borderRightWidth: size,
        };
      }

      if (style) {
        const markerKey = `${key}:${i}`;
        markers.push(
          <AnnotationMarker
            key={markerKey}
            frame={frame}
            annoIdx={i}
            annoVals={vals}
            style={style}
            timeZone={timeZone}
            exitWipEdit={isWip ? exitWipEdit : null}
            portalRoot={portalRoot}
            canExecuteActions={userCanExecuteActions}
            replaceVariables={replaceVariables}
            isPinned={pinnedKey === markerKey}
            setPinned={(active) => setPinnedKey(active ? markerKey : undefined)}
            showTooltipOnHover={showTooltipOnHover}
          />
        );
      }
    }
  }

  return createPortal(
    <div
      className={styles.container}
      style={{ left: plot.over.offsetLeft, top: plot.over.offsetTop }}
      data-testid="pjan-row-annotations"
    >
      {markers}
    </div>,
    container
  );
};

const getStyles = () => ({
  // Positioned at the plot area's top left, so marker positions are relative to the plot like uPlot's own.
  container: css({
    position: 'absolute',
    width: 0,
    height: 0,
  }),
});
