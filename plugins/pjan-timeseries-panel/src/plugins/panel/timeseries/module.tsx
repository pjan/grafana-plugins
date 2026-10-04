// Copied from grafana/grafana v13.2.3: public/app/plugins/panel/timeseries/module.tsx. AGPL-3.0 (Copyright Grafana Labs). Changes: imports; setPanelChangeHandler(panelChangedHandler from src/pjan/, which keeps options and field config when switching from core timeseries and otherwise calls graphPanelChangedHandler); panel suggestions (setSuggestionsSupplier/timeseriesSuggestionsSupplier) left off.
import { PanelPlugin } from '@grafana/data';
import { t } from '@grafana/i18n';
import { commonOptionsBuilder } from '@grafana/ui';
import { optsWithHideZeros } from 'packages/grafana-ui/internal';
import { addAnnotationOptions } from 'features/panel/options/builder/annotations';

import { TimeSeriesPanel } from './TimeSeriesPanel';
import { TimezonesEditor } from './TimezonesEditor';
import { defaultGraphConfig, getGraphFieldConfig } from './config';
import { type FieldConfig, type Options } from './panelcfg.gen';
import { timeseriesPresetsSupplier } from './presets';
// pjan-timeseries-panel: plugin-only panel-change handler (src/pjan/), wraps graphPanelChangedHandler; it replaces the
// imports of graphPanelChangedHandler and timeseriesSuggestionsSupplier (suggestions are left off).
import { panelChangedHandler } from '../../../pjan/panelChangedHandler';

export const plugin = new PanelPlugin<Options, FieldConfig>(TimeSeriesPanel)
  .setPanelChangeHandler(panelChangedHandler) // pjan-timeseries-panel: instead of graphPanelChangedHandler
  .useFieldConfig(getGraphFieldConfig(defaultGraphConfig))
  .setPanelOptions((builder) => {
    commonOptionsBuilder.addTooltipOptions(builder, false, true, optsWithHideZeros);
    commonOptionsBuilder.addLegendOptions(builder, true, true);

    const legendCategory = [t('timeseries.legend.category', 'Legend')];

    builder.addBooleanSwitch({
      path: 'legend.enableFacetedFilter',
      name: t('timeseries.legend.name-faceted-filter', 'Series visibility'),
      category: legendCategory,
      description: t(
        'timeseries.legend.description-faceted-filter',
        'Enable filter to display series based on labels or names'
      ),
      showIf: (c) => c.legend.showLegend,
    });

    builder.addCustomEditor({
      id: 'timezone',
      name: t('timeseries.name-time-zone', 'Time zone'),
      path: 'timezone',
      category: [t('timeseries.category-axis', 'Axis')],
      editor: TimezonesEditor,
      defaultValue: undefined,
    });

    addAnnotationOptions(builder);
  })
  // pjan-timeseries-panel: .setSuggestionsSupplier(timeseriesSuggestionsSupplier) left off (no second Time series card)
  .setPresetsSupplier(timeseriesPresetsSupplier)
  .setViewPanelOptions({
    fanout: { enabled: true },
    quickToggles: {
      optionProperties: ['legend.showLegend', 'legend.placement'],
      fieldConfigProperties: ['custom.stacking', 'custom.scaleDistribution'],
    },
  })
  .setDataSupport({ annotations: true, alertStates: true });
