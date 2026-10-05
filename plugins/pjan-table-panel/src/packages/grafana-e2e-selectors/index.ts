// Plugin stand-in for `@grafana/e2e-selectors` v13.2.3 (grafana/grafana: packages/grafana-e2e-selectors, Apache-2.0).
// The copied runtime code only uses the selectors below as `data-testid` values. Bundling the real package would add
// it and its `semver` dependency for a few strings, so these are the values that `selectors.components` resolves them
// to in v13.2.3 (packages/grafana-e2e-selectors/src/selectors/components.ts: `Panels.Visualization.TableNG`,
// `DataLinksActionsTooltip`, `DataLinksContextMenu` and `PanelEditor.OptionsPane`). The ported tests query with the
// real package (DataLinksActionsTooltip, TableNG, RowExpander, FilterList and TableCellTooltip tests), which
// cross-checks these values.
export const selectors = {
  components: {
    Panels: {
      Visualization: {
        TableNG: {
          RowExpander: 'data-testid tableng row expander',
          cellActions: {
            inspectButton: 'data-testid tableng cell-actions inspect-button',
            filterForButton: 'data-testid tableng cell-actions filter-for-button',
            filterOutButton: 'data-testid tableng cell-actions filter-out-button',
          },
          Filters: {
            HeaderButton: 'data-testid tableng header filter',
            Container: 'data-testid tablenf filter container',
            SelectAll: 'data-testid tableng filter select-all',
          },
          Tooltip: {
            Wrapper: 'data-testid tableng tooltip wrapper',
            Caret: 'data-testid tableng tooltip caret',
          },
          Footer: {
            ReducerLabel: 'data-testid tableng footer reducer-label',
            Value: 'data-testid tableng footer value',
          },
        },
      },
    },
    DataLinksActionsTooltip: {
      tooltipWrapper: 'data-testid Data links actions tooltip wrapper',
    },
    DataLinksContextMenu: {
      singleLink: 'data-testid Data link',
    },
    PanelEditor: {
      OptionsPane: {
        fieldLabel: (type: string) => `data-testid ${type} field property editor`,
      },
    },
  },
} as const;
