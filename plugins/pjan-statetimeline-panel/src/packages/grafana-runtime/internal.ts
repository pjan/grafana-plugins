// Plugin stand-in for `@grafana/runtime/internal` (grafana/grafana v13.2.3: packages/grafana-runtime/src/internal/index.ts).
// Core evaluates OpenFeature flags through a client bound to the domain 'internal-grafana-core', which core
// explicitly reserves for itself ("Plugins should not use this client or domain"). This plugin therefore cannot
// read core's flags and evaluates every flag as its default value. The only flag the copied code reads is
// `grafana.filterablePanels` (default false), so the plugin behaves like core with that flag in its default state.
export const FlagKeys = {
  GrafanaFilterablePanels: 'grafana.filterablePanels',
} as const;

interface FlagClient {
  getBooleanValue: (flagKey: string, defaultValue: boolean) => boolean;
}

const defaultValueClient: FlagClient = {
  getBooleanValue: (_flagKey, defaultValue) => defaultValue,
};

export function getFeatureFlagClient(): FlagClient {
  return defaultValueClient;
}
