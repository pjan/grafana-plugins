// Copied from grafana/grafana v13.2.3: public/app/plugins/panel/state-timeline/module.tsx. AGPL-3.0 (Copyright Grafana Labs). Changes: imports; panel suggestions (setSuggestionsSupplier/showDefaultSuggestion) left off; setPanelChangeHandler(panelChangedHandler from src/pjan/, which keeps options when switching from core state-timeline and otherwise calls timelinePanelChangedHandler).
import {
  FieldColorModeId,
  FieldConfigProperty,
  FieldType,
  identityOverrideProcessor,
  PanelPlugin,
} from '@grafana/data';
import { t } from '@grafana/i18n';
import { AxisPlacement, VisibilityMode } from '@grafana/schema';
import { commonOptionsBuilder } from '@grafana/ui';
import { addAnnotationOptions } from 'features/panel/options/builder/annotations';

import { InsertNullsEditor } from '../timeseries/InsertNullsEditor';
import { SpanNullsEditor } from '../timeseries/SpanNullsEditor';
import { type NullEditorSettings } from '../timeseries/config';

import { StateTimelinePanel } from './StateTimelinePanel';
import { defaultFieldConfig, defaultOptions, type FieldConfig, type Options } from './panelcfg.gen';
// pjan-statetimeline-panel: plugin-only panel-change handler (src/pjan/), wraps timelinePanelChangedHandler.
import { panelChangedHandler } from '../../../pjan/panelChangedHandler';

export const plugin = new PanelPlugin<Options, FieldConfig>(StateTimelinePanel)
  .setPanelChangeHandler(panelChangedHandler)
  .useFieldConfig({
    standardOptions: {
      [FieldConfigProperty.Color]: {
        settings: {
          byValueSupport: true,
        },
        defaultValue: {
          mode: FieldColorModeId.ContinuousGrYlRd,
        },
      },
      [FieldConfigProperty.Links]: {
        settings: {
          showOneClick: true,
        },
      },
      [FieldConfigProperty.Actions]: {
        hideFromDefaults: false,
      },
    },
    useCustomConfig: (builder) => {
      const category = [t('state-timeline.category-state-timeline', 'State timeline')];
      builder
        .addSliderInput({
          path: 'lineWidth',
          name: t('state-timeline.name-line-width', 'Line width'),
          category,
          defaultValue: defaultFieldConfig.lineWidth,
          settings: {
            min: 0,
            max: 10,
            step: 1,
          },
        })
        .addSliderInput({
          path: 'fillOpacity',
          name: t('state-timeline.name-fill-opacity', 'Fill opacity'),
          category,
          defaultValue: defaultFieldConfig.fillOpacity,
          settings: {
            min: 0,
            max: 100,
            step: 1,
          },
        })
        .addCustomEditor<NullEditorSettings, boolean>({
          id: 'spanNulls',
          path: 'spanNulls',
          name: t('state-timeline.name-connect-null-values', 'Connect null values'),
          category,
          defaultValue: false,
          editor: SpanNullsEditor,
          override: SpanNullsEditor,
          shouldApply: (field) => field.type !== FieldType.time,
          process: identityOverrideProcessor,
          settings: { isTime: true },
        })
        .addCustomEditor<NullEditorSettings, boolean>({
          id: 'insertNulls',
          path: 'insertNulls',
          name: t('state-timeline.name-disconnect-values', 'Disconnect values'),
          category,
          defaultValue: false,
          editor: InsertNullsEditor,
          override: InsertNullsEditor,
          shouldApply: (field) => field.type !== FieldType.time,
          process: identityOverrideProcessor,
          settings: { isTime: true },
        });

      commonOptionsBuilder.addHideFrom(builder);
      commonOptionsBuilder.addAxisPlacement(
        builder,
        (placement) => placement === AxisPlacement.Auto || placement === AxisPlacement.Hidden
      );
      commonOptionsBuilder.addAxisWidth(builder);
    },
  })
  .setPanelOptions((builder) => {
    const category = [t('state-timeline.category-state-timeline', 'State timeline')];
    builder
      .addBooleanSwitch({
        path: 'mergeValues',
        name: t('state-timeline.name-merge-equal-consecutive-values', 'Merge equal consecutive values'),
        category,
        defaultValue: defaultOptions.mergeValues,
      })
      .addRadio({
        path: 'showValue',
        name: t('state-timeline.name-show-values', 'Show values'),
        category,
        settings: {
          options: [
            { value: VisibilityMode.Auto, label: t('state-timeline.show-values-options.label-auto', 'Auto') },
            { value: VisibilityMode.Always, label: t('state-timeline.show-values-options.label-always', 'Always') },
            { value: VisibilityMode.Never, label: t('state-timeline.show-values-options.label-never', 'Never') },
          ],
        },
        defaultValue: defaultOptions.showValue,
      })
      .addRadio({
        path: 'alignValue',
        name: t('state-timeline.name-align-values', 'Align values'),
        category,
        settings: {
          options: [
            { value: 'left', label: t('state-timeline.align-values-options.label-left', 'Left') },
            { value: 'center', label: t('state-timeline.align-values-options.label-center', 'Center') },
            { value: 'right', label: t('state-timeline.align-values-options.label-right', 'Right') },
          ],
        },
        defaultValue: defaultOptions.alignValue,
      })
      .addSliderInput({
        path: 'rowHeight',
        name: t('state-timeline.name-row-height', 'Row height'),
        category,
        settings: {
          min: 0,
          max: 1,
          step: 0.01,
        },
        defaultValue: defaultOptions.rowHeight,
      })
      .addNumberInput({
        path: 'perPage',
        name: t('state-timeline.name-page-size', 'Page size (enable pagination)'),
        category,
        settings: {
          min: 1,
          step: 1,
          integer: true,
        },
      });

    commonOptionsBuilder.addLegendOptions(builder, false, true);
    commonOptionsBuilder.addTooltipOptions(builder);
    addAnnotationOptions(builder);
  })
  .setDataSupport({ annotations: true });
