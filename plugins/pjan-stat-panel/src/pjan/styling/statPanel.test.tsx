// Color mode Custom in the copied StatPanel: the styling reaches the tiles only with Custom.
import { render } from '@testing-library/react';

import {
  type FieldConfigSource,
  FieldType,
  getDefaultTimeRange,
  LoadingState,
  toDataFrame,
  VizOrientation,
} from '@grafana/data';

import { getPanelProps } from '../../plugins/panel/test-utils';
import { StatPanel } from '../../plugins/panel/stat/StatPanel';
import { defaultOptions, type Options } from '../../plugins/panel/stat/panelcfg.gen';

import { CUSTOM_COLOR_MODE, type StatStyling } from './options';

const STYLING: StatStyling = {
  backgroundColor: { mode: 'fixed', fixedColor: 'black' },
  textColor: { mode: 'fixed', fixedColor: 'purple' },
  sparklineLineWidth: 3,
};

function renderPanel(options: Partial<Options> & { styling?: StatStyling }, custom?: object) {
  const frame = toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1, 2, 3] },
      { name: 'value', type: FieldType.number, values: [10, 20, 30], config: custom ? { custom } : {} },
    ],
  });
  const props = getPanelProps<Options>(
    {
      ...defaultOptions,
      reduceOptions: { calcs: ['lastNotNull'], values: false },
      orientation: VizOrientation.Auto,
      text: {},
      ...options,
    } as Options,
    {
      data: { state: LoadingState.Done, series: [frame], timeRange: getDefaultTimeRange() },
      fieldConfig: { defaults: {}, overrides: [] } as FieldConfigSource,
      replaceVariables: (v: string) => v,
    }
  );
  return render(<StatPanel {...props} />).container;
}

const tileStyle = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[style*="padding"]')!.getAttribute('style');

describe('StatPanel with Color mode Custom', () => {
  it.each(['none', 'value', 'background', 'background_solid'])(
    'with core’s %s mode, styling options and overrides change nothing',
    (colorMode) => {
      const plain = renderPanel({ colorMode } as never).innerHTML;
      const withStyling = renderPanel({ colorMode, styling: STYLING } as never, STYLING).innerHTML;
      expect(withStyling).toBe(plain);
    }
  );

  it('with Custom, the panel options style the tile', () => {
    const container = renderPanel({ colorMode: CUSTOM_COLOR_MODE, styling: STYLING } as never);
    expect(tileStyle(container)).toContain('background: rgb(0, 0, 0)');
  });

  it('with Custom, a series’ override wins over the panel option', () => {
    const container = renderPanel({ colorMode: CUSTOM_COLOR_MODE, styling: STYLING } as never, {
      backgroundColor: { mode: 'fixed', fixedColor: 'white' },
    });
    expect(tileStyle(container)).toContain('background: rgb(255, 255, 255)');
  });
});
