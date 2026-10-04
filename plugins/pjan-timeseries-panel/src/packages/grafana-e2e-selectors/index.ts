// Plugin stand-in for `@grafana/e2e-selectors` v13.2.3 (grafana/grafana: packages/grafana-e2e-selectors, Apache-2.0).
// The copied runtime code only uses the selectors below as `data-testid` values. Bundling the real package would add
// it and its `semver` dependency (~330 KiB unminified) for four strings, so these are the values that
// `selectors.pages.Dashboard.Annotations` (packages/grafana-e2e-selectors/src/selectors/pages.ts) and
// `selectors.components.DataSource.Prometheus.exemplarMarker` (components.ts) resolve to in v13.2.3.
// The ported AnnotationsPlugin and ExemplarsPlugin tests query with the real package, which cross-checks these values.
export const selectors = {
  components: {
    DataSource: {
      Prometheus: {
        exemplarMarker: 'data-testid Exemplar marker',
      },
    },
  },
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
