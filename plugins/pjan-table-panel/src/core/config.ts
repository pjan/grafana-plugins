// Plugin stand-in for grafana/grafana v13.2.3: public/app/core/config.ts. AGPL-3.0 (derived from code Copyright Grafana Labs).
// Upstream keeps core's boot config (the public `config` of @grafana/runtime, replaceable by `updateConfig`) and returns
// it from `getConfig()`. Plugins can't update core's config, so `getConfig()` returns the public `config` itself. The
// copied table code reads `disableSanitizeHtml` from it (features/table/hooks.ts).
import { config, type GrafanaBootConfig } from '@grafana/runtime';

export const getConfig = (): GrafanaBootConfig => {
  return config;
};
