import { type FieldConfigSource, MappingType } from '@grafana/data';
import { LegendDisplayMode, SortOrder, TooltipDisplayMode, VisibilityMode } from '@grafana/schema';

import { timelinePanelChangedHandler } from '../plugins/panel/state-timeline/migrations';

import { panelChangedHandler } from './panelChangedHandler';

const coreOptions = {
  mergeValues: false,
  rowHeight: 0.6,
  showValue: VisibilityMode.Always,
  alignValue: 'center',
  perPage: 5,
  legend: { showLegend: true, displayMode: LegendDisplayMode.Table, placement: 'right', calcs: ['lastNotNull'] },
  tooltip: { mode: TooltipDisplayMode.Multi, sort: SortOrder.Descending },
};

const coreFieldConfig: FieldConfigSource = {
  defaults: {
    unit: 'short',
    custom: { fillOpacity: 40, lineWidth: 2, spanNulls: true },
    mappings: [{ type: MappingType.ValueToText, options: { '1': { text: 'ok', color: 'green' } } }],
  },
  overrides: [
    {
      matcher: { id: 'byName', options: 'a' },
      properties: [{ id: 'custom.hideFrom', value: { legend: true, tooltip: false, viz: false } }],
    },
  ],
};

// What Grafana's panel editor passes after switching: custom config cleared, then this plugin's defaults applied.
const editorPanel = () => ({
  options: {},
  fieldConfig: {
    defaults: { unit: 'short', custom: { fillOpacity: 70, lineWidth: 0 } },
    overrides: [],
  } as FieldConfigSource,
});

describe('panelChangedHandler', () => {
  it('keeps every option when switching from the core state timeline', () => {
    const options = panelChangedHandler(editorPanel(), 'state-timeline', coreOptions, coreFieldConfig);

    expect(options).toEqual(coreOptions);
    expect(options).not.toBe(coreOptions);
  });

  it('restores the custom field config and overrides on the panel field config', () => {
    const panel = editorPanel();

    panelChangedHandler(panel, 'state-timeline', coreOptions, coreFieldConfig);

    expect(panel.fieldConfig.defaults.custom).toEqual({ fillOpacity: 40, lineWidth: 2, spanNulls: true });
    expect(panel.fieldConfig.overrides).toEqual(coreFieldConfig.overrides);
    expect(panel.fieldConfig.overrides).not.toBe(coreFieldConfig.overrides);
    expect(panel.fieldConfig.defaults.mappings).toBeUndefined();
  });

  it('still returns the options when no previous field config is passed', () => {
    const panel = editorPanel();

    expect(panelChangedHandler(panel, 'state-timeline', coreOptions)).toEqual(coreOptions);
    expect(panel.fieldConfig.defaults.custom).toEqual({ fillOpacity: 70, lineWidth: 0 });
  });

  it('uses the core handler for any other previous panel type', () => {
    const angular = { angular: { units: 'ms', colorMaps: [], valueMaps: [], rangeMaps: [] } };

    expect(panelChangedHandler({}, 'natel-discrete-panel', angular)).toEqual(
      timelinePanelChangedHandler({}, 'natel-discrete-panel', angular)
    );
    expect(panelChangedHandler({ options: { rowHeight: 0.5 } }, 'timeseries', { legend: {} })).toEqual({
      rowHeight: 0.5,
    });
  });
});
