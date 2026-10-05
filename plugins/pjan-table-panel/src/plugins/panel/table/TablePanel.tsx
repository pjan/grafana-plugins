// Copied from grafana/grafana v13.2.3: public/app/plugins/panel/table/TablePanel.tsx. AGPL-3.0 (Copyright Grafana Labs). Changes: imports; onFieldConfigChange to useApplyFieldConfigChangedInPlace from @pjan/grafana-panel-utils (applies the field config again after the panel-change handler restored it in place).
import { getFrameDisplayName, type PanelProps, type SelectableValue } from '@grafana/data';
import { t } from '@grafana/i18n';
import { PanelDataErrorView } from '@grafana/runtime';
import { type TableOptions } from '@grafana/schema';
import { Combobox, Field, Stack, usePanelContext, useTheme2 } from '@grafana/ui';
import { TableNG } from 'packages/grafana-ui/unstable';
import {
  useCacheFieldDisplayNames,
  useCellActions,
  useCommonTableProps,
  useTableSharedCrosshair,
} from 'features/table/hooks';
import { getCurrentFrameIndex, onColumnResize, onSortByChange } from 'features/table/utils';

import { hasDeprecatedParentRowIndex, migrateFromParentRowIndexToNestedFrames } from './migrations';
// pjan-table-panel: applies the field config again after the panel-change handler restored it (shared package).
import { useApplyFieldConfigChangedInPlace } from '@pjan/grafana-panel-utils';

interface Props extends PanelProps<TableOptions> {
  initialRowIndex?: number;
  sortByBehavior?: 'initial' | 'managed';
}

export function TablePanel(props: Props) {
  const {
    data,
    height,
    width,
    options,
    fieldConfig,
    id,
    timeRange,
    replaceVariables,
    transparent,
    initialRowIndex,
    sortByBehavior = 'initial',
  } = props;

  useApplyFieldConfigChangedInPlace(fieldConfig, props.onFieldConfigChange); // pjan-table-panel
  useCacheFieldDisplayNames(data.series);

  const theme = useTheme2();
  const panelContext = usePanelContext();
  const getActions = useCellActions(replaceVariables);
  const commonTableProps = useCommonTableProps(options, fieldConfig);
  const enableSharedCrosshair = useTableSharedCrosshair();
  const frames = hasDeprecatedParentRowIndex(data.series)
    ? migrateFromParentRowIndexToNestedFrames(data.series)
    : data.series;
  const count = frames?.length;
  const hasFields = frames.some((frame) => frame.fields.length > 0);
  const currentIndex = getCurrentFrameIndex(frames, options);
  const main = frames[currentIndex];

  let tableHeight = height;

  if (!count || !hasFields) {
    return <PanelDataErrorView panelId={id} fieldConfig={fieldConfig} data={data} />;
  }

  if (count > 1) {
    const inputHeight = theme.spacing.gridSize * theme.components.height.md;
    const padding = theme.spacing.gridSize;

    tableHeight = height - inputHeight - padding;
  }

  const tableElement = (
    <TableNG
      {...commonTableProps}
      initialRowIndex={initialRowIndex}
      height={tableHeight}
      width={width}
      data={main}
      sortByBehavior={sortByBehavior}
      onSortByChange={(sortBy) => onSortByChange(sortBy, props)}
      onColumnResize={(displayName, resizedWidth, fieldScope) =>
        onColumnResize(displayName, resizedWidth, fieldScope, props)
      }
      onCellFilterAdded={panelContext.onAddAdHocFilter}
      timeRange={timeRange}
      enableSharedCrosshair={enableSharedCrosshair}
      fieldConfig={fieldConfig}
      getActions={getActions}
      structureRev={data.structureRev}
      transparent={transparent}
    />
  );

  if (count === 1) {
    return tableElement;
  }

  const names = frames.map((frame, index) => {
    return {
      label: getFrameDisplayName(frame),
      value: index,
    };
  });

  return (
    <Stack direction="column" gap={1.5} justifyContent="space-between" height="100%">
      {tableElement}
      <Field noMargin>
        <Combobox
          aria-label={t('table.frame-picker.label', 'Query')}
          options={names}
          value={names[currentIndex]}
          onChange={(val) => onChangeTableSelection(val, props)}
        />
      </Field>
    </Stack>
  );
}

function onChangeTableSelection(val: SelectableValue<number>, props: Props) {
  props.onOptionsChange({
    ...props.options,
    frameIndex: val.value || 0,
  });
}
