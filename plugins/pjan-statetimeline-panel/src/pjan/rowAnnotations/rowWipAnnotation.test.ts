import { DataTopic } from '@grafana/data';

import { buildRowWipFrame, getNewAnnotationRow } from './rowWipAnnotation';

describe('buildRowWipFrame', () => {
  it('is an annotation being added, tagged with the row key', () => {
    const point = buildRowWipFrame({ from: 1000, to: 1000 }, 'media');
    expect(point.meta).toEqual({ dataTopic: DataTopic.Annotations, custom: { isWip: true } });
    expect(point.fields.find((f) => f.name === 'tags')?.values).toEqual([['media']]);
    expect(point.fields.find((f) => f.name === 'isRegion')?.values).toEqual([false]);

    const region = buildRowWipFrame({ from: 1000, to: 2000 }, 'media');
    expect(region.fields.find((f) => f.name === 'isRegion')?.values).toEqual([true]);
    expect(region.fields.find((f) => f.name === 'timeEnd')?.values).toEqual([2000]);
  });
});

describe('getNewAnnotationRow', () => {
  const rowKeys = ['web', undefined, 'tools'];

  it('is the pressed row and its key, with the switch on and the tags field', () => {
    expect(getNewAnnotationRow(true, 'tags', 2, rowKeys)).toEqual({ rowIdx: 2, rowKey: 'tools' });
    expect(getNewAnnotationRow(true, 'tags', 0, rowKeys)).toEqual({ rowIdx: 0, rowKey: 'web' });
  });

  it('leaves the annotation to core between rows, on a row without a key, with the switch off, or another field', () => {
    expect(getNewAnnotationRow(true, 'tags', null, rowKeys)).toBeNull();
    expect(getNewAnnotationRow(true, 'tags', 1, rowKeys)).toBeNull();
    expect(getNewAnnotationRow(false, 'tags', 0, rowKeys)).toBeNull();
    expect(getNewAnnotationRow(true, 'title', 0, rowKeys)).toBeNull();
    expect(getNewAnnotationRow(true, 'tags', 5, rowKeys)).toBeNull();
  });
});
