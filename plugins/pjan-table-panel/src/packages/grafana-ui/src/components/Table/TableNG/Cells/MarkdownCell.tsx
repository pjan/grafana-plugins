// Copied from grafana/grafana v13.2.3: packages/grafana-ui/src/components/Table/TableNG/Cells/MarkdownCell.tsx. Apache-2.0 (Copyright Grafana Labs, see UPSTREAM.md). Changes: none.
import { css } from '@emotion/css';
import memoize from 'micro-memoize';

import { renderMarkdown } from '@grafana/data';

import { MaybeWrapWithLink } from '../components/MaybeWrapWithLink';
import { getActiveCellSelector, isTableCellStylesKeyEqual } from '../styles';
import { type MarkdownCellProps, type TableCellStyles } from '../types';

export function MarkdownCell({ field, rowIdx, disableSanitizeHtml }: MarkdownCellProps) {
  const rawValue = field.values[rowIdx];
  if (rawValue == null) {
    return null;
  }

  const renderValue = field.display!(rawValue);

  return (
    <MaybeWrapWithLink field={field} rowIdx={rowIdx}>
      <div
        className="markdown-container"
        dangerouslySetInnerHTML={{
          __html: renderMarkdown(renderValue.text, { noSanitize: disableSanitizeHtml }).trim(),
        }}
      />
    </MaybeWrapWithLink>
  );
}

export const getStyles: TableCellStyles = memoize(
  (theme, { maxHeight }) =>
    css({
      [`&, ${getActiveCellSelector(Boolean(maxHeight))}`]: {
        whiteSpace: 'normal',
      },

      '.markdown-container': {
        width: '100%',
        // for elements like `p`, `h*`, etc. which have an inherent margin,
        // we want to remove the bottom margin for the last one in the container.
        '> *:last-child': {
          marginBottom: 0,
        },
      },

      'ol, ul': {
        paddingLeft: theme.spacing(2.5),
      },
      p: {
        whiteSpace: 'pre-line',
      },
    }),
  { isMatchingKey: isTableCellStylesKeyEqual }
);
