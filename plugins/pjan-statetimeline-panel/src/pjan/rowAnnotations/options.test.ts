import { arrayToDataFrame, DataTopic, FieldMatcherID, FieldType, toDataFrame } from '@grafana/data';

import { plugin } from '../../plugins/panel/state-timeline/module';
import { LIGHT, processFrame } from '../styling/testdata/fixtures';

import { getRowKeys } from './matchRowAnnotations';
import { getAnnotationFieldOptions, getRowLabelOptions } from './options';

describe('getAnnotationFieldOptions', () => {
  it('lists the fields of annotation frames, without layout fields', () => {
    const annotations = arrayToDataFrame([
      { time: 1, timeEnd: 2, isRegion: true, color: 'red', title: 'deploy', tags: ['web'], service: 'web' },
    ]);
    annotations.meta = { dataTopic: DataTopic.Annotations };
    const series = toDataFrame({ fields: [{ name: 'notAnAnnotation', values: [1] }] });

    expect(getAnnotationFieldOptions([annotations, series]).map((o) => o.value)).toEqual(['title', 'tags', 'service']);
  });

  it('ignores exemplar and xymark frames', () => {
    const exemplar = arrayToDataFrame([{ time: 1, traceId: 'abc' }]);
    exemplar.name = 'exemplar';
    exemplar.meta = { dataTopic: DataTopic.Annotations };
    const xymark = arrayToDataFrame([{ xMin: 1, xMax: 2, label: 'x' }]);
    xymark.name = 'xymark';
    xymark.meta = { dataTopic: DataTopic.Annotations };
    expect(getAnnotationFieldOptions([exemplar, xymark])).toEqual([]);
  });
});

describe('getRowLabelOptions', () => {
  it('lists the label names of the series fields, sorted', () => {
    const series = [
      toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1] },
          { name: 'a', type: FieldType.number, values: [1], labels: { job: 'web', instance: 'a' } },
        ],
      }),
      toDataFrame({
        fields: [{ name: 'b', type: FieldType.number, values: [1], labels: { job: 'api', env: 'prod' } }],
      }),
    ];
    expect(getRowLabelOptions(series).map((o) => o.value)).toEqual(['env', 'instance', 'job']);
    expect(getRowLabelOptions(undefined)).toEqual([]);
  });
});

describe('the "Annotation key" field option', () => {
  it('is `custom.rowAnnotations.annotationKey`, mirroring the panel options, offered in overrides only', () => {
    const item = plugin.fieldConfigRegistry.get('custom.rowAnnotations.annotationKey');
    expect(item.path).toBe('rowAnnotations.annotationKey');
    expect(item.hideFromDefaults).toBe(true);
    expect(item.override).toBeDefined();
    expect(item.process).toBeDefined();
    expect(item.defaultValue).toBeUndefined();
    expect(item.shouldApply({ type: FieldType.time } as never)).toBe(false);
    expect(item.shouldApply({ type: FieldType.string } as never)).toBe(true);
  });

  it('an override replaces the key of its row only', () => {
    const frame = processFrame(LIGHT, ['web', 'db'], ['up'], {
      defaults: {},
      overrides: [
        {
          matcher: { id: FieldMatcherID.byName, options: 'db' },
          properties: [{ id: 'custom.rowAnnotations.annotationKey', value: 'database' }],
        },
      ],
    });
    expect(frame.fields.map((field) => field.config.custom?.rowAnnotations)).toEqual([
      undefined,
      undefined,
      { annotationKey: 'database' },
    ]);
    expect(getRowKeys(frame, {})).toEqual(['web', 'database']);
  });
});
