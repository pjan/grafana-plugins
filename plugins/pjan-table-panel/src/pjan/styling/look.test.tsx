import { render } from '@testing-library/react';

import { createDataFrame, FieldType, LoadingState, type PanelProps, toUtc } from '@grafana/data';
import { type TableOptions } from '@grafana/schema';

import { TablePanel } from '../../plugins/panel/table/TablePanel';

// The copied TablePanel hands the panel's look (options.styling.look) to TableNG as `pjanLook` (its marked hook); what
// TableNG does with it is in tableColors.test.tsx. TableNG is replaced by a stand-in that records its props.
const tableNG = jest.fn((_props: Record<string, unknown>) => null);
jest.mock('packages/grafana-ui/unstable', () => ({
  TableNG: (props: Record<string, unknown>) => tableNG(props),
}));

const props = (options: object) =>
  ({
    id: 1,
    data: {
      state: LoadingState.Done,
      series: [createDataFrame({ fields: [{ name: 'state', type: FieldType.string, values: ['up'] }] })],
      timeRange: { from: toUtc(0), to: toUtc(1), raw: { from: 'now-1h', to: 'now' } },
    },
    timeRange: { from: toUtc(0), to: toUtc(1), raw: { from: 'now-1h', to: 'now' } },
    timeZone: 'utc',
    options: { showHeader: true, cellHeight: 'sm', ...options },
    fieldConfig: { defaults: {}, overrides: [] },
    transparent: false,
    width: 400,
    height: 300,
    renderCounter: 0,
    title: 'table',
    eventBus: { subscribe: jest.fn(), getStream: jest.fn(), publish: jest.fn() },
    onOptionsChange: jest.fn(),
    onFieldConfigChange: jest.fn(),
    replaceVariables: (value: string) => value,
    onChangeTimeRange: jest.fn(),
  }) as unknown as PanelProps<TableOptions>;

describe('the panel’s look reaches TableNG', () => {
  beforeEach(() => tableNG.mockClear());

  it.each([
    ['pill', { styling: { look: 'pill' } }],
    ['grafana', { styling: { look: 'grafana' } }],
    [undefined, {}],
  ])('look %s', (look, options) => {
    render(<TablePanel {...props(options)} />);
    expect(tableNG).toHaveBeenCalled();
    expect(tableNG.mock.calls.at(-1)![0].pjanLook).toBe(look);
  });
});
