import { render } from '@testing-library/react';
import { type ComponentProps } from 'react';

import { arrayToDataFrame, DataTopic, FieldType, toDataFrame } from '@grafana/data';
import { UPlotConfigBuilder } from '@grafana/ui';

import { AnnotationsPlugin } from '../../plugins/panel/timeseries/plugins/AnnotationsPlugin';

import { RowAnnotationsPlugin } from './RowAnnotationsPlugin';
import { StateTimelineAnnotations } from './StateTimelineAnnotations';

jest.mock('../../plugins/panel/timeseries/plugins/AnnotationsPlugin', () => ({
  AnnotationsPlugin: jest.fn(() => null),
}));
jest.mock('./RowAnnotationsPlugin', () => ({
  RowAnnotationsPlugin: jest.fn(() => null),
}));

const corePlugin = jest.mocked(AnnotationsPlugin);
const rowPlugin = jest.mocked(RowAnnotationsPlugin);

const alignedFrame = toDataFrame({
  fields: [
    { name: 'time', type: FieldType.time, values: [1] },
    { name: 'web', type: FieldType.number, values: [1] },
    { name: 'api', type: FieldType.number, values: [1] },
  ],
});

const annotations = () => {
  const frame = arrayToDataFrame([
    { time: 1000, tags: ['web'] },
    { time: 2000, tags: ['other'] },
  ]);
  frame.meta = { dataTopic: DataTopic.Annotations };
  return [frame];
};

const coreProps = (): ComponentProps<typeof AnnotationsPlugin> => ({
  config: new UPlotConfigBuilder(),
  options: { multiLane: false },
  annotations: annotations(),
  timeZone: 'utc',
  newRange: null,
  setNewRange: jest.fn(),
  canvasRegionRendering: false,
  replaceVariables: (v: string) => v,
});

beforeEach(() => {
  corePlugin.mockClear();
  rowPlugin.mockClear();
});

describe('StateTimelineAnnotations', () => {
  it.each([undefined, {}, { enabled: false, field: 'title' }])(
    'renders core’s AnnotationsPlugin with exactly core’s props while the option is off (%o)',
    (rowAnnotations) => {
      const props = coreProps();
      const addHook = jest.spyOn(props.config, 'addHook');
      render(
        <StateTimelineAnnotations
          {...props}
          alignedFrame={alignedFrame}
          frames={[alignedFrame]}
          panelOptions={{ rowAnnotations }}
        />
      );

      expect(corePlugin).toHaveBeenCalledTimes(1);
      const received = corePlugin.mock.calls[0][0];
      expect(Object.keys(received).sort()).toEqual(Object.keys(props).sort());
      for (const key of Object.keys(props) as Array<keyof typeof props>) {
        expect(received[key]).toBe(props[key]);
      }
      expect(rowPlugin).not.toHaveBeenCalled();
      expect(addHook).not.toHaveBeenCalled();
    }
  );

  it('gives the matched annotations to the row plugin and the rest to core’s', () => {
    const props = coreProps();
    render(
      <StateTimelineAnnotations
        {...props}
        alignedFrame={alignedFrame}
        frames={[alignedFrame]}
        panelOptions={{ rowHeight: 0.9, rowAnnotations: { enabled: true } }}
      />
    );

    const unmatched = corePlugin.mock.calls[0][0].annotations!;
    expect(unmatched[0].fields.find((f) => f.name === 'tags')?.values).toEqual([['other']]);

    const { rows, bands } = rowPlugin.mock.calls[0][0];
    expect(rows.map((row) => row.rowIdx)).toEqual([0]);
    expect(bands).toHaveLength(2);
  });

  it('leaves out annotations that match only rows not drawn (another page, or hidden)', () => {
    const props = coreProps();
    const tools = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1] },
        { name: 'tools', type: FieldType.number, values: [1] },
      ],
    });
    const frame = arrayToDataFrame([
      { time: 1000, tags: ['web'] },
      { time: 2000, tags: ['tools'] },
      { time: 3000, tags: ['other'] },
    ]);
    frame.meta = { dataTopic: DataTopic.Annotations };
    render(
      <StateTimelineAnnotations
        {...props}
        annotations={[frame]}
        alignedFrame={alignedFrame}
        frames={[alignedFrame, tools]}
        panelOptions={{ rowAnnotations: { enabled: true } }}
      />
    );

    expect(corePlugin.mock.calls[0][0].annotations![0].fields.find((f) => f.name === 'tags')?.values).toEqual([
      ['other'],
    ]);
    expect(rowPlugin.mock.calls[0][0].rows.map((row) => row.rowIdx)).toEqual([0]);
  });
});
