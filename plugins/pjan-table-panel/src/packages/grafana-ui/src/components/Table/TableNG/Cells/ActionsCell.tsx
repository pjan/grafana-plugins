// Copied from grafana/grafana v13.2.3: packages/grafana-ui/src/components/Table/TableNG/Cells/ActionsCell.tsx. Apache-2.0 (Copyright Grafana Labs, see UPSTREAM.md). Changes: none.
import { css } from '@emotion/css';
import memoize from 'micro-memoize';

import { ActionButton } from '../../../Actions/ActionButton';
import { type ActionCellProps, type TableCellStyles } from '../types';

export const ActionsCell = ({ field, rowIdx, getActions }: ActionCellProps) => {
  const actions = getActions(field, rowIdx);

  if (actions.length === 0) {
    return null;
  }

  return actions.map((action, i) => <ActionButton key={i} action={action} variant="secondary" />);
};

export const getStyles: TableCellStyles = memoize((theme) => css({ gap: theme.spacing(0.75) }));
