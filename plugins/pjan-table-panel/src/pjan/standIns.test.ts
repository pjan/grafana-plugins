import { selectors as e2eSelectors } from '@grafana/e2e-selectors';
import { config } from '@grafana/runtime';
import {
  BarAlignment,
  GraphDrawStyle,
  GraphGradientMode,
  LineInterpolation,
  TableCellDisplayMode,
  VisibilityMode,
} from '@grafana/schema';
import { getConfig } from 'core/config';
import { selectors } from 'packages/grafana-e2e-selectors';
import { defaultSparklineCellConfig } from 'packages/grafana-ui/internal';
import { TableNG } from 'packages/grafana-ui/unstable';

import { TableNG as CopiedTableNG } from '../packages/grafana-ui/src/components/Table/TableNG/TableNG';

// The plugin's stand-ins for core modules and Grafana entry points the copied table code imports (UPSTREAM.md,
// "Stand-ins"). The OpenFeature flag stand-in has its own test (featureFlags.test.tsx).
describe('stand-ins', () => {
  it('@grafana/ui/unstable gives the copied TableNG, not Grafana’s', () => {
    expect(TableNG).toBe(CopiedTableNG);
  });

  it('core/config gives the public config, which disableSanitizeHtml is read from', () => {
    expect(getConfig()).toBe(config);
    const before = config.disableSanitizeHtml;
    try {
      config.disableSanitizeHtml = true;
      expect(getConfig().disableSanitizeHtml).toBe(true);
    } finally {
      config.disableSanitizeHtml = before;
    }
  });

  it('defaultSparklineCellConfig has the values of core’s (TableRT/Cells/SparklineCell.tsx, v13.2.3)', () => {
    expect(defaultSparklineCellConfig).toEqual({
      type: TableCellDisplayMode.Sparkline,
      drawStyle: GraphDrawStyle.Line,
      lineInterpolation: LineInterpolation.Smooth,
      lineWidth: 1,
      fillOpacity: 17,
      gradientMode: GraphGradientMode.Hue,
      pointSize: 2,
      barAlignment: BarAlignment.Center,
      showPoints: VisibilityMode.Never,
      hideValue: false,
    });
  });

  it('the e2e selectors are the values @grafana/e2e-selectors 13.2.3 resolves', () => {
    // the package this plugin declares (package.json), not a copy hoisted for another workspace
    expect(require('@grafana/e2e-selectors/package.json').version).toBe('13.2.3');
    const tableNG = e2eSelectors.components.Panels.Visualization.TableNG;
    expect(selectors.components.Panels.Visualization.TableNG).toEqual({
      RowExpander: tableNG.RowExpander,
      cellActions: {
        inspectButton: tableNG.cellActions.inspectButton,
        filterForButton: tableNG.cellActions.filterForButton,
        filterOutButton: tableNG.cellActions.filterOutButton,
      },
      Filters: {
        HeaderButton: tableNG.Filters.HeaderButton,
        Container: tableNG.Filters.Container,
        SelectAll: tableNG.Filters.SelectAll,
      },
      Tooltip: { Wrapper: tableNG.Tooltip.Wrapper, Caret: tableNG.Tooltip.Caret },
      Footer: { ReducerLabel: tableNG.Footer.ReducerLabel, Value: tableNG.Footer.Value },
    });
    expect(selectors.components.DataLinksActionsTooltip.tooltipWrapper).toBe(
      e2eSelectors.components.DataLinksActionsTooltip.tooltipWrapper
    );
    expect(selectors.components.DataLinksContextMenu.singleLink).toBe(
      e2eSelectors.components.DataLinksContextMenu.singleLink
    );
    expect(selectors.components.PanelEditor.OptionsPane.fieldLabel('Enable pagination')).toBe(
      e2eSelectors.components.PanelEditor.OptionsPane.fieldLabel('Enable pagination')
    );
  });
});
