// Copied from grafana/grafana v13.2.3: public/app/plugins/panel/stat/StatPanel.tsx. AGPL-3.0 (Copyright Grafana Labs). Changes: imports; renders the copied BigValue (packages/grafana-ui/src/components/BigValue/BigValue) instead of @grafana/ui's; DataLinksContextMenuApi from the public @grafana/ui export instead of @grafana/ui/internal; onFieldConfigChange passed to useApplyFieldConfigChangedInPlace (src/pjan/), which applies the field config again after the panel-change handler restored its colour.
import { isNumber } from 'lodash';
import { memo, useCallback, type JSX } from 'react';

import {
  type DisplayValueAlignmentFactors,
  type FieldDisplay,
  FieldType,
  getDisplayValueAlignmentFactors,
  getFieldDisplayValues,
  type NumericRange,
  type PanelProps,
} from '@grafana/data';
import { findNumericFieldMinMax } from 'packages/grafana-data/internal';
import { BigValueTextMode, BigValueGraphMode } from '@grafana/schema';
import {
  DataLinksContextMenu,
  type DataLinksContextMenuApi,
  useTheme2,
  VizRepeater,
  type VizRepeaterRenderValueProps,
} from '@grafana/ui';
// pjan-stat-panel: the copied BigValue (src/packages/grafana-ui/), instead of @grafana/ui's.
import { BigValue } from 'packages/grafana-ui/src/components/BigValue/BigValue';

import { type Options } from './panelcfg.gen';
// pjan-stat-panel: applies the field config again after the panel-change handler restored its colour (src/pjan/).
import { useApplyFieldConfigChangedInPlace } from '../../../pjan/fieldConfigRefresh';

export const StatPanel = memo(
  ({
    timeRange,
    options,
    fieldConfig,
    title,
    data,
    replaceVariables,
    timeZone,
    height,
    width,
    renderCounter,
    onFieldConfigChange, // pjan-stat-panel
  }: PanelProps<Options>) => {
    const theme = useTheme2();
    useApplyFieldConfigChangedInPlace(fieldConfig, onFieldConfigChange); // pjan-stat-panel

    const getTextMode = useCallback(() => {
      // If we have manually set displayName or panel title switch text mode to value and name
      if (options.textMode === BigValueTextMode.Auto && (fieldConfig.defaults.displayName || !title)) {
        return BigValueTextMode.ValueAndName;
      }

      return options.textMode;
    }, [options.textMode, fieldConfig.defaults.displayName, title]);

    const renderComponent = useCallback(
      (
        valueProps: VizRepeaterRenderValueProps<FieldDisplay, DisplayValueAlignmentFactors>,
        menuProps: DataLinksContextMenuApi
      ): JSX.Element => {
        const { value, alignmentFactors, width, height, count } = valueProps;
        const { openMenu, targetClassName } = menuProps;
        let sparkline = value.sparkline;
        if (sparkline) {
          sparkline.timeRange = timeRange;
        }

        return (
          <BigValue
            value={value.display}
            count={count}
            sparkline={sparkline}
            colorMode={options.colorMode}
            graphMode={options.graphMode}
            justifyMode={options.justifyMode}
            textMode={getTextMode()}
            alignmentFactors={alignmentFactors}
            text={options.text}
            width={width}
            height={height}
            theme={theme}
            onClick={openMenu}
            className={targetClassName}
            disableWideLayout={!options.wideLayout}
            percentChangeColorMode={options.percentChangeColorMode}
          />
        );
      },
      [theme, timeRange, options, getTextMode]
    );

    const renderValue = useCallback(
      (valueProps: VizRepeaterRenderValueProps<FieldDisplay, DisplayValueAlignmentFactors>): JSX.Element => {
        const { value } = valueProps;
        const { getLinks, hasLinks } = value;

        if (hasLinks && getLinks) {
          return (
            <DataLinksContextMenu links={getLinks}>
              {(api) => {
                return renderComponent(valueProps, api);
              }}
            </DataLinksContextMenu>
          );
        }

        return renderComponent(valueProps, {});
      },
      [renderComponent]
    );

    const getValues = useCallback((): FieldDisplay[] => {
      let globalRange: NumericRange | undefined = undefined;

      for (let frame of data.series) {
        for (let field of frame.fields) {
          let { config } = field;
          // mostly copied from fieldOverrides, since they are skipped during streaming
          // Set the Min/Max value automatically
          if (field.type === FieldType.number) {
            if (field.state?.range) {
              continue;
            }
            if (!globalRange && (!isNumber(config.min) || !isNumber(config.max))) {
              globalRange = findNumericFieldMinMax(data.series);
            }
            const min = config.min ?? globalRange!.min;
            const max = config.max ?? globalRange!.max;
            field.state = field.state ?? {};
            field.state.range = { min, max, delta: max! - min! };
          }
        }
      }

      return getFieldDisplayValues({
        fieldConfig,
        reduceOptions: options.reduceOptions,
        replaceVariables,
        theme,
        data: data.series,
        sparkline: options.graphMode !== BigValueGraphMode.None,
        percentChange: options.showPercentChange,
        timeZone,
      });
    }, [data, fieldConfig, theme, options, replaceVariables, timeZone]);

    return (
      <VizRepeater
        getValues={getValues}
        getAlignmentFactors={getDisplayValueAlignmentFactors}
        renderValue={renderValue}
        width={width}
        height={height}
        source={data}
        itemSpacing={3}
        renderCounter={renderCounter}
        autoGrid={true}
        orientation={options.orientation}
      />
    );
  }
);
StatPanel.displayName = 'StatPanel';
