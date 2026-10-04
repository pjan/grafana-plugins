// Copied from grafana/grafana v13.2.3: public/app/features/panel/suggestions/utils.ts. AGPL-3.0 (Copyright Grafana Labs). Changes: partial copy (SUGGESTIONS_LEGEND_OPTIONS only, which TIMESERIES_CARD_OPTIONS in suggestions.ts uses for the preset cards).
import { type VizLegendOptions } from '@grafana/schema';

/**
 * @internal
 * Hidden legend config for previewing suggestion cards.
 * This should only be used in previewModifier.
 */
export const SUGGESTIONS_LEGEND_OPTIONS: VizLegendOptions = {
  calcs: [],
  placement: 'right',
  showLegend: false,
};
