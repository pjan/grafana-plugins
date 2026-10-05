// Plugin stand-in for grafana/grafana v13.2.3: packages/grafana-ui/src/utils/floating.ts.
// The copied table code imports this module by relative path; it re-exports the same public @grafana/ui names,
// so they are Grafana's runtime instances (UPSTREAM.md, "Relative-path stand-ins").
import { floatingUtils } from '@grafana/ui';

export const getPositioningMiddleware = floatingUtils.getPositioningMiddleware;
