// Copied from grafana/grafana v13.2.3: packages/grafana-ui/src/components/Table/TableNG/Cells/GeoCell.tsx. Apache-2.0 (Copyright Grafana Labs, see UPSTREAM.md). Changes: none.
import { css } from '@emotion/css';

import { useOpenLayersContext, isGeometry } from '../../geo';
import type { GeoCellProps, TableCellStyles } from '../types';

export function GeoCell({ value }: GeoCellProps) {
  const { formatGeometry } = useOpenLayersContext();
  let disp = null;

  if (formatGeometry && isGeometry(value)) {
    disp = formatGeometry(value);
  } else if (value != null) {
    disp = `${value}`;
  }

  return disp;
}

const styles = css({
  fontFamily: 'monospace',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const getStyles: TableCellStyles = () => styles;
