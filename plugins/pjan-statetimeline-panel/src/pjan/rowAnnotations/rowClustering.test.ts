import { renderHook } from '@testing-library/react';

import { arrayToDataFrame, type DataFrame, DataTopic } from '@grafana/data';

import {
  ClusteringMode,
  useAnnotationClustering,
} from '../../plugins/panel/timeseries/plugins/annotations/useAnnotationClustering';

import { splitRowAnnotations } from './matchRowAnnotations';

// RowAnnotationsPlugin clusters the per-row frames from splitRowAnnotations with core's useAnnotationClustering.
const clusterRows = (annotations: DataFrame[], rowKeys: string[], clusteringMode: ClusteringMode | null) => {
  const { rows } = splitRowAnnotations(annotations, rowKeys, 'tags');
  const { result } = renderHook(() =>
    useAnnotationClustering({
      annotations: rows.map((row) => row.frame),
      clusteringMode,
      plotWidth: 1000,
      timeRange: { from: 0, to: 1_000_000 },
    })
  );
  return rows.map((row, i) => ({ rowIdx: row.rowIdx, frame: result.current.annotations[i] }));
};

const isCluster = (frame: DataFrame) => frame.fields.find((f) => f.name === 'isCluster')?.values ?? [];

describe('clustering on rows', () => {
  // 1000 ms per pixel: annotations 5 px apart are within core's 24 px clustering spacing, 500 px apart are not.
  const annotations = () => {
    const frame = arrayToDataFrame([
      { time: 100_000, tags: ['web'] },
      { time: 105_000, tags: ['web'] },
      { time: 600_000, tags: ['web'] },
      { time: 102_000, tags: ['api'] },
    ]);
    frame.meta = { dataTopic: DataTopic.Annotations };
    return [frame];
  };

  it('clusters close annotations of the same row, and never across rows', () => {
    const rows = clusterRows(annotations(), ['web', 'api'], ClusteringMode.Render);

    const web = rows.find((r) => r.rowIdx === 0)!.frame;
    // the three web annotations plus one cluster region for the first two
    expect(web.length).toBe(4);
    expect(isCluster(web).filter(Boolean)).toHaveLength(1);
    const clusterIdx = web.fields.find((f) => f.name === 'clusterIdx')?.values ?? [];
    const time = web.fields.find((f) => f.name === 'time')?.values ?? [];
    const members = time.filter((_, i) => !isCluster(web)[i] && clusterIdx[i] === 0);
    expect(members).toEqual([100_000, 105_000]);

    // the api annotation is as close in time, but on another row: not clustered
    const api = rows.find((r) => r.rowIdx === 1)!.frame;
    expect(api.length).toBe(1);
    expect(isCluster(api)).toEqual([]);
  });

  it('does not cluster while core’s clustering switch is off', () => {
    const rows = clusterRows(annotations(), ['web', 'api'], null);
    expect(rows.map((r) => r.frame.length)).toEqual([3, 1]);
    expect(rows.every((r) => isCluster(r.frame).length === 0)).toBe(true);
  });
});
