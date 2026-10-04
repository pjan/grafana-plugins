// Copied from grafana/grafana v13.2.3: public/app/plugins/panel/timeseries/suggestions.ts. AGPL-3.0 (Copyright Grafana Labs). Changes: imports; partial copy (TIMESERIES_CARD_OPTIONS with MAX_PREVIEW_SERIES, which presets.ts uses, and getPrepareTimeseriesSuggestion, which TimeSeriesPanel.tsx uses; the suggestions supplier is left off); getDashboardSrv is the plugin's stand-in, whose getCurrent() is always undefined, so getPrepareTimeseriesSuggestion returns undefined.
import {
  DataTransformerID,
  type PanelPluginVisualizationSuggestion,
  type VisualizationSuggestion,
} from '@grafana/data';
import { GraphDrawStyle, type GraphFieldConfig } from '@grafana/schema';
import { getDashboardSrv } from 'features/dashboard/services/DashboardSrv';
import { SUGGESTIONS_LEGEND_OPTIONS } from 'features/panel/suggestions/utils';

import { type Options } from './panelcfg.gen';

const MAX_PREVIEW_SERIES = 8;

export const TIMESERIES_CARD_OPTIONS: VisualizationSuggestion<Options, GraphFieldConfig>['cardOptions'] = {
  maxSeries: MAX_PREVIEW_SERIES,
  previewModifier: (s) => {
    s.options!.disableKeyboardEvents = true;
    s.options!.legend = SUGGESTIONS_LEGEND_OPTIONS;
    if (s.fieldConfig?.defaults.custom?.drawStyle !== GraphDrawStyle.Bars) {
      s.fieldConfig!.defaults.custom!.lineWidth = Math.max(s.fieldConfig!.defaults.custom!.lineWidth ?? 1, 2);
    }
  },
};

// This will try to get a suggestion that will add a long to wide conversion
export function getPrepareTimeseriesSuggestion(panelId: number): PanelPluginVisualizationSuggestion | undefined {
  const panel = getDashboardSrv().getCurrent()?.getPanelById(panelId);
  if (panel) {
    const transformations = panel.transformations ? [...panel.transformations] : [];
    transformations.push({
      id: DataTransformerID.prepareTimeSeries,
      options: {
        format: 'wide',
      },
    });

    return {
      name: 'Transform to wide time series format',
      hash: 'timeseries-transform-prepare-wide',
      pluginId: 'timeseries',
      transformations,
    };
  }
  return undefined;
}
