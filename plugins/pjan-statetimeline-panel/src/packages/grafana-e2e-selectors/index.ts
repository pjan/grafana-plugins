// Plugin stand-in for `@grafana/e2e-selectors` v13.2.3 (grafana/grafana: packages/grafana-e2e-selectors, Apache-2.0).
// The copied runtime code only uses the selectors below as `data-testid` values. Bundling the real package would add
// it and its `semver` dependency (~330 KiB unminified) for three strings, so these are the values that
// `selectors.pages.Dashboard.Annotations` resolves to in v13.2.3 (packages/grafana-e2e-selectors/src/selectors/pages.ts).
// The ported AnnotationsPlugin tests query with the real package, which cross-checks these values.
export const selectors = {
  pages: {
    Dashboard: {
      Annotations: {
        tooltip: 'annotation-marker',
        marker: 'data-testid annotation-marker',
        clusterTooltip: 'data-testid annotation-cluster-tooltip',
      },
    },
  },
} as const;
