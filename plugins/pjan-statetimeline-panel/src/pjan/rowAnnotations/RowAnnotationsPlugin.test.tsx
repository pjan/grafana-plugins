import { act, render } from '@testing-library/react';
import type uPlot from 'uplot';

import { arrayToDataFrame, DataTopic } from '@grafana/data';
import { type UPlotConfigBuilder } from '@grafana/ui';

import { splitRowAnnotations } from './matchRowAnnotations';
import { RowAnnotationsPlugin } from './RowAnnotationsPlugin';
import { getRowBands } from './rowLayout';

type Hook = (u: uPlot) => void;

// A plot config that records hooks, and a uPlot instance with what the plugin reads (pixel ratio 1 in jsdom).
const setup = () => {
  const hooks: Record<string, Hook[]> = {};
  const config = {
    addHook: (type: string, hook: Hook) => (hooks[type] ??= []).push(hook),
  } as unknown as UPlotConfigBuilder;

  const wrap = document.createElement('div');
  const over = document.createElement('div');
  wrap.appendChild(over);
  document.body.appendChild(wrap);
  const u = {
    over,
    bbox: { left: 0, top: 0, width: 1000, height: 200 },
    scales: { x: { min: 0, max: 1000 } },
    valToPos: (value: number) => value,
    redraw: jest.fn(),
  };
  const fire = (type: string) => act(() => hooks[type]?.forEach((hook) => hook(u as unknown as uPlot)));
  return { config, u, fire, wrap };
};

const annotations = () => {
  const frame = arrayToDataFrame([
    { time: 100, timeEnd: null, isRegion: false, tags: ['media'] },
    { time: 300, timeEnd: 500, isRegion: true, tags: ['tools'] },
  ]);
  frame.meta = { dataTopic: DataTopic.Annotations };
  return [frame];
};

const markerStyles = (wrap: HTMLElement) =>
  [...wrap.querySelectorAll<HTMLElement>('[data-testid="pjan-row-annotations"] button')].map((b) => ({
    label: b.getAttribute('aria-label'),
    left: b.style.left,
    top: b.style.top,
    height: b.style.height,
  }));

describe('RowAnnotationsPlugin', () => {
  const { rows } = splitRowAnnotations(annotations(), ['web', 'media', 'tools'], 'tags');
  const bands = getRowBands(3, 0.9);

  const renderPlugin = (config: UPlotConfigBuilder) =>
    render(
      <RowAnnotationsPlugin
        config={config}
        rows={rows}
        bands={bands}
        options={{}}
        timeZone="utc"
        replaceVariables={(v) => v}
        wip={null}
        exitWipEdit={jest.fn()}
      />
    );

  it('puts a point marker at the top of its row and a region bar along its row', () => {
    const { config, fire, wrap } = setup();
    renderPlugin(config);
    fire('ready');
    fire('drawAxes');

    // rows of 60px with 10px gaps: media at 70, tools at 140
    expect(markerStyles(wrap)).toEqual([
      { label: 'Annotation', left: '100px', top: '70px', height: '' },
      { label: 'Annotation region', left: '300px', top: '140px', height: '5px' },
    ]);
  });

  it('moves the markers when only the plot height changes', () => {
    const { config, u, fire, wrap } = setup();
    renderPlugin(config);
    fire('ready');
    fire('drawAxes');

    u.bbox = { ...u.bbox, height: 400 };
    fire('drawAxes');
    expect(markerStyles(wrap).map((m) => m.top)).toEqual(['140px', '280px']);
  });

  it('draws nothing before the plot is ready', () => {
    const { config, wrap } = setup();
    renderPlugin(config);
    expect(markerStyles(wrap)).toEqual([]);
  });
});
