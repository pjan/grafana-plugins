// Copied from grafana/grafana v13.2.3: public/app/plugins/panel/stat/suggestions.ts. AGPL-3.0 (Copyright Grafana Labs). Changes: partial copy (MAX_STAT_PREVIEW_SERIES and STAT_CARD_OPTIONS, which presets.ts uses; the suggestions supplier is left off).
import { type VisualizationSuggestion } from '@grafana/data';

import { type Options } from './panelcfg.gen';

export const MAX_STAT_PREVIEW_SERIES = 6;

export const STAT_CARD_OPTIONS: VisualizationSuggestion<Options>['cardOptions'] = {
  maxSeries: MAX_STAT_PREVIEW_SERIES,
  previewModifier: (s) => {
    if (s.options?.reduceOptions?.values) {
      s.options.reduceOptions.limit = 1;
    }
  },
};
