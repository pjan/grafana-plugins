import { arrayToDataFrame, type DataFrame, DataTopic, FieldType, toDataFrame } from '@grafana/data';

import { getOtherRowKeys, getRowKeys, splitRowAnnotations, valueMatchesKey } from './matchRowAnnotations';

const annotationFrame = (rows: Array<Record<string, unknown>>): DataFrame => {
  const frame = arrayToDataFrame(rows);
  frame.meta = { dataTopic: DataTopic.Annotations };
  return frame;
};

const values = (frame: DataFrame, name: string) => frame.fields.find((f) => f.name === name)?.values;

const deploys = () =>
  annotationFrame([
    { time: 3000, title: 'maintenance', tags: ['maintenance'] },
    { time: 2000, title: 'deploy api', tags: ['DeployStack', 'api'] },
    { time: 1000, title: 'deploy web', tags: ['DeployStack', 'web'] },
    { time: 4000, title: 'web again', tags: ['web'] },
  ]);

const timeline = (
  rows: Array<{ name: string; labels?: Record<string, string>; custom?: object; displayName?: string }>
) =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1] },
      ...rows.map(({ name, labels, custom, displayName }) => ({
        name,
        type: FieldType.number,
        values: [1],
        labels,
        config: { custom, displayName },
      })),
    ],
  });

describe('valueMatchesKey', () => {
  it('compares scalar values as strings', () => {
    expect(valueMatchesKey('web', 'web')).toBe(true);
    expect(valueMatchesKey(42, '42')).toBe(true);
    expect(valueMatchesKey('web-1', 'web')).toBe(false);
    expect(valueMatchesKey(null, 'null')).toBe(false);
    expect(valueMatchesKey(undefined, 'undefined')).toBe(false);
  });

  it('matches a list value when any item equals the key', () => {
    expect(valueMatchesKey(['DeployStack', 'web'], 'web')).toBe(true);
    expect(valueMatchesKey(['DeployStack', 'web'], 'api')).toBe(false);
    expect(valueMatchesKey([null, 'web'], 'web')).toBe(true);
    expect(valueMatchesKey([], 'web')).toBe(false);
  });
});

describe('getRowKeys', () => {
  it('uses the display name of every row by default', () => {
    const frame = timeline([{ name: 'web' }, { name: 'api', displayName: 'API' }]);
    expect(getRowKeys(frame, {})).toEqual(['web', 'API']);
    expect(getRowKeys(frame, { rowKey: 'displayName' })).toEqual(['web', 'API']);
  });

  it('uses the chosen label, and no key for rows without it', () => {
    const frame = timeline([
      { name: 'a', labels: { job: 'web', instance: 'a:9100' } },
      { name: 'b', labels: { instance: 'b:9100' } },
    ]);
    expect(getRowKeys(frame, { rowKey: 'label', label: 'job' })).toEqual(['web', undefined]);
    expect(getRowKeys(frame, { rowKey: 'label' })).toEqual([undefined, undefined]);
  });

  it('lets a row’s "Annotation key" field option replace its key', () => {
    const frame = timeline([
      { name: 'web' },
      { name: 'tools', labels: { job: 'tools' }, custom: { rowAnnotations: { annotationKey: 'toolbox' } } },
      { name: 'media', custom: { rowAnnotations: { annotationKey: '' } } },
    ]);
    expect(getRowKeys(frame, {})).toEqual(['web', 'toolbox', 'media']);
    expect(getRowKeys(frame, { rowKey: 'label', label: 'job' })).toEqual([undefined, 'toolbox', undefined]);
  });
});

describe('getRowKeys with empty values', () => {
  it('treats an empty label value as no key', () => {
    const frame = timeline([
      { name: 'a', labels: { job: '' } },
      { name: 'b', labels: { job: 'web' } },
    ]);
    expect(getRowKeys(frame, { rowKey: 'label', label: 'job' })).toEqual([undefined, 'web']);
  });
});

describe('getOtherRowKeys', () => {
  it('lists the keys of rows the timeline does not draw, except keys a drawn row has too', () => {
    const page = timeline([{ name: 'web' }, { name: 'media' }]);
    const other = timeline([{ name: 'tools' }, { name: 'web' }]);
    expect(getOtherRowKeys([page, other], getRowKeys(page, {}), {})).toEqual(['tools']);
    expect(getOtherRowKeys(undefined, [], {})).toEqual([]);
  });

  it('uses the same key as the drawn rows: override, label', () => {
    const other = timeline([
      { name: 'a', labels: { job: 'tools' } },
      { name: 'b', labels: { job: 'db' }, custom: { rowAnnotations: { annotationKey: 'database' } } },
    ]);
    expect(getOtherRowKeys([other], [], { rowKey: 'label', label: 'job' })).toEqual(['tools', 'database']);
  });
});

describe('splitRowAnnotations', () => {
  it('places annotations whose tags contain a row key on that row, sorted by time, and keeps the others', () => {
    const frame = deploys();
    const { rows, unmatched } = splitRowAnnotations([frame], ['web', 'api', 'tools'], 'tags');

    expect(rows.map(({ key, rowIdx, frame }) => ({ key, rowIdx, titles: values(frame, 'title') }))).toEqual([
      { key: '0:0', rowIdx: 0, titles: ['deploy web', 'web again'] },
      { key: '0:1', rowIdx: 1, titles: ['deploy api'] },
    ]);
    expect(rows[0].frame.length).toBe(2);
    expect(rows[0].frame.meta?.dataTopic).toBe(DataTopic.Annotations);

    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].length).toBe(1);
    expect(values(unmatched[0], 'title')).toEqual(['maintenance']);
    expect(unmatched[0].meta?.dataTopic).toBe(DataTopic.Annotations);
  });

  it('matches the chosen field, such as the title', () => {
    const frame = annotationFrame([
      { time: 1000, title: 'web', tags: ['api'] },
      { time: 2000, title: 'other' },
    ]);
    const { rows, unmatched } = splitRowAnnotations([frame], ['web', 'api'], 'title');
    expect(rows.map((r) => r.rowIdx)).toEqual([0]);
    expect(values(unmatched[0], 'title')).toEqual(['other']);
  });

  it('matches a field added by a transformation', () => {
    const frame = annotationFrame([{ time: 1000, text: 'service=web', service: 'web' }]);
    expect(splitRowAnnotations([frame], ['web'], 'service').rows.map((r) => r.rowIdx)).toEqual([0]);
  });

  it('places an annotation on every row it matches', () => {
    const frame = annotationFrame([{ time: 1000, tags: ['web', 'api'] }]);
    const { rows, unmatched } = splitRowAnnotations([frame], ['web', 'api'], 'tags');
    expect(rows.map((r) => r.rowIdx)).toEqual([0, 1]);
    expect(unmatched[0].length).toBe(0);
  });

  it('never matches rows without a key', () => {
    const frame = annotationFrame([{ time: 1000, title: 'undefined' }]);
    const { rows, unmatched } = splitRowAnnotations([frame], [undefined], 'title');
    expect(rows).toEqual([]);
    expect(unmatched[0]).toBe(frame);
  });

  it('keeps frames without a match, or without the field, unchanged', () => {
    const frame = deploys();
    const other = annotationFrame([{ time: 1000, text: 'no tags here' }]);
    const { rows, unmatched } = splitRowAnnotations([frame, other], ['tools'], 'tags');
    expect(rows).toEqual([]);
    expect(unmatched[0]).toBe(frame);
    expect(unmatched[1]).toBe(other);
  });

  it('keys rows by source frame, so each annotation query is clustered on its own', () => {
    const a = annotationFrame([{ time: 1000, tags: ['web'] }]);
    const b = annotationFrame([{ time: 1000, tags: ['web'] }]);
    expect(splitRowAnnotations([a, b], ['web'], 'tags').rows.map((r) => r.key)).toEqual(['0:0', '1:0']);
  });

  it('never matches frames that are not time annotations (exemplars, xymark)', () => {
    const xymark = annotationFrame([{ xMin: 1, xMax: 2, tags: ['web'] }]);
    xymark.name = 'xymark';
    const { rows, unmatched } = splitRowAnnotations([xymark], ['web'], 'tags');
    expect(rows).toEqual([]);
    expect(unmatched[0]).toBe(xymark);
  });

  it('keeps data links pointing at the original annotation', () => {
    const frame = deploys();
    const getLinks = jest.fn().mockReturnValue([]);
    frame.fields.find((f) => f.name === 'title')!.getLinks = getLinks;

    const { rows, unmatched } = splitRowAnnotations([frame], ['web'], 'tags');
    // remaining: original rows 0, 1 (row 1 of the copy is original row 1)
    unmatched[0].fields.find((f) => f.name === 'title')!.getLinks!({ valueRowIndex: 1 });
    expect(getLinks).toHaveBeenLastCalledWith({ valueRowIndex: 1 });
    // on the web row, sorted by time: original rows 2 (1000) and 3 (4000)
    rows[0].frame.fields.find((f) => f.name === 'title')!.getLinks!({ valueRowIndex: 0 });
    expect(getLinks).toHaveBeenLastCalledWith({ valueRowIndex: 2 });
  });

  it('leaves out annotations that match only rows not drawn, and keeps the ones also matching a drawn row', () => {
    const frame = annotationFrame([
      { time: 1000, tags: ['tools'] },
      { time: 2000, tags: ['tools', 'web'] },
      { time: 3000, tags: ['other'] },
    ]);
    const { rows, unmatched } = splitRowAnnotations([frame], ['web'], 'tags', ['tools']);
    expect(rows.map((r) => values(r.frame, 'time'))).toEqual([[2000]]);
    expect(values(unmatched[0], 'time')).toEqual([3000]);
  });

  it('returns no annotations when the panel has none', () => {
    expect(splitRowAnnotations(undefined, ['web'], 'tags')).toEqual({ rows: [], unmatched: [] });
  });
});
