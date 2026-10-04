// Copied from grafana/grafana v13.2.3: packages/grafana-ui/src/options/builder/tooltip.tsx. Apache-2.0 (Copyright Grafana Labs). Changes: partial copy (optsWithHideZeros only, exported from @grafana/ui/internal; addTooltipOptions is public as commonOptionsBuilder.addTooltipOptions).
import { type OptionsWithTooltip, TooltipDisplayMode, SortOrder } from '@grafana/schema';

/** @internal */
export const optsWithHideZeros: OptionsWithTooltip = {
  tooltip: {
    mode: TooltipDisplayMode.Single,
    sort: SortOrder.None,
    hideZeros: false,
  },
};
