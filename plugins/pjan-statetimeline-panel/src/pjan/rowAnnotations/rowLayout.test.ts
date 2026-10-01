import type uPlot from 'uplot';

import { createTheme, getDefaultTimeRange } from '@grafana/data';
import { VisibilityMode } from '@grafana/schema';

import { getConfig } from '../../core/components/TimelineChart/timeline';
import { TimelineMode } from '../../core/components/TimelineChart/utils';

import { getMarkerSize, getRowAtPosition, getRowBands, getRowBox } from './rowLayout';

describe('getRowBands', () => {
  it('uses the full height for a single row', () => {
    expect(getRowBands(1, 1)).toEqual([{ top: 0, height: 1 }]);
  });

  it('spreads rows like the timeline: first at the top, last at the bottom, equal gaps between', () => {
    const bands = getRowBands(3, 0.9);
    expect(bands.map((b) => b.height)).toEqual([0.3, 0.3, 0.3]);
    expect(bands[0].top).toBe(0);
    expect(bands[1].top).toBeCloseTo(0.35);
    expect(bands[2].top + bands[2].height).toBeCloseTo(1);
  });
});

describe('getRowBox', () => {
  // The boxes core's timeline.ts actually draws: its drawPaths, run on a minimal uPlot instance, fills one Path2D per
  // colour; each row has one value, so each fill has one rect (x, y, width, height), in canvas pixels.
  const drawnRows = (numRows: number, rowHeight: number, bbox: { top: number; height: number }) => {
    const { drawClear, drawPaths } = getConfig({
      mode: TimelineMode.Changes,
      numSeries: numRows,
      rowHeight,
      theme: createTheme(),
      showValue: VisibilityMode.Never,
      mergeValues: true,
      isDiscrete: () => true,
      hasMappedNull: () => false,
      hasMappedNaN: () => false,
      getValueColor: () => '#ff0000',
      label: () => '',
      getTimeRange: () => getDefaultTimeRange(),
      getFieldConfig: () => ({ fillOpacity: 100 }),
      hoverMulti: false,
    });
    const ctx = document.createElement('canvas').getContext('2d')!;
    const fill = jest.spyOn(ctx, 'fill');
    const data = [[0], ...Array.from({ length: numRows }, () => [1])];
    const u = {
      ctx,
      bbox: { left: 0, top: bbox.top, width: 100, height: bbox.height },
      data,
      _data: data,
      series: [{ scale: 'x' }, ...Array.from({ length: numRows }, () => ({ scale: 'y', width: 0 }))],
      scales: { x: { ori: 0 }, y: { ori: 1 } },
      valToPosH: (value: number, _scale: unknown, _dim: number, offset: number) => offset + value,
    } as unknown as uPlot;

    drawClear(u);
    return Array.from({ length: numRows }, (_, i) => {
      fill.mockClear();
      drawPaths(u, i + 1, 0, 0);
      const path = fill.mock.calls[0][0] as unknown as { rect: jest.Mock };
      const [, y, , height] = path.rect.mock.calls[0] as number[];
      return { y, height };
    });
  };

  it.each([
    [3, 0.9, { top: 10, height: 200 }, 1],
    [3, 0.9, { top: 10, height: 205 }, 1],
    [4, 0.77, { top: 7.5, height: 391 }, 2],
    [7, 0.83, { top: 10.5, height: 333 }, 1],
    [5, 0.6, { top: 21, height: 467 }, 2],
    [1, 1, { top: 0, height: 120 }, 1],
  ])(
    'is where timeline.ts draws the rows (%d rows, row height %d, bbox %o, pixel ratio %d)',
    (numRows, rowHeight, bbox, pxRatio) => {
      const drawn = drawnRows(numRows, rowHeight, bbox);
      getRowBands(numRows, rowHeight).forEach((band, i) => {
        const box = getRowBox(band, bbox, pxRatio);
        expect(bbox.top + box.top * pxRatio).toBe(drawn[i].y);
        expect(box.height * pxRatio).toBe(drawn[i].height);
      });
    }
  );
});

describe('getRowAtPosition', () => {
  const bands = getRowBands(3, 0.9);
  const bbox = { top: 0, height: 200 };

  it('finds the row under a position, and none between rows or outside', () => {
    expect(getRowAtPosition(bands, bbox, 1, 0)).toBe(0);
    expect(getRowAtPosition(bands, bbox, 1, 59)).toBe(0);
    expect(getRowAtPosition(bands, bbox, 1, 65)).toBeNull();
    expect(getRowAtPosition(bands, bbox, 1, 100)).toBe(1);
    expect(getRowAtPosition(bands, bbox, 1, 199)).toBe(2);
    expect(getRowAtPosition(bands, bbox, 1, 200)).toBeNull();
    expect(getRowAtPosition(bands, bbox, 1, -1)).toBeNull();
  });
});

describe('getMarkerSize', () => {
  it('is Grafana’s 5px marker, but never higher than the row', () => {
    expect(getMarkerSize({ top: 0, height: 40 })).toBe(5);
    expect(getMarkerSize({ top: 0, height: 3 })).toBe(3);
  });
});
