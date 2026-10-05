// Plugin stand-in for `@grafana/runtime/internal` (grafana/grafana v13.2.3: packages/grafana-runtime/src/internal/index.ts).
// `@grafana/runtime/internal` is not shared with plugins at runtime, so the copied core code imports this module instead.
// Only the names the copied table code uses are provided: the two table feature flags, read as core reads them
// (plan decision 5; UPSTREAM.md, "Feature flags").
//
// Core evaluates its OpenFeature flags on the client of the domain 'internal-grafana-core', which core reserves for
// itself. Its provider is a MultiProvider of Grafana's localStorage provider (overrides under `grafana.openfeature.`)
// and its OFREP web provider (the server's flags), first match wins, with the evaluation context
// `{ targetingKey: config.namespace, ...config.openFeatureContext }`
// (packages/grafana-runtime/src/internal/openFeature/index.ts). `@grafana/runtime` gives plugins read-only proxies of
// those same two provider instances. This plugin sets a MultiProvider of the two proxies, in core's order and with
// core's context, on its own domain, so its flags resolve from the same sources as core's.
import { config, createOpenFeatureLocalStorageProvider, createOpenFeatureOFREPWebProvider } from '@grafana/runtime';
import { type EventDetails, MultiProvider, OpenFeature, ProviderEvents } from '@openfeature/web-sdk';
import { useEffect, useState } from 'react';

/** The plugin's OpenFeature domain (core's is 'internal-grafana-core', which plugins must not use). */
export const OPEN_FEATURE_DOMAIN = 'pjan-table-panel';

// packages/grafana-runtime/src/internal/openFeature/openfeature.gen.ts: the two keys the copied table code reads.
export const FlagKeys = {
  /** Sizes TableNG auto-width columns to fit their content instead of distributing evenly */
  TableAutoColumnWidths: 'table.autoColumnWidths',
  /** Enables configuring a fixed page size for paginated tables instead of deriving it from the panel height */
  TablePaginationPageSize: 'table.paginationPageSize',
} as const;

/**
 * Sets the plugin's flag provider; the counterpart of core's `initOpenFeature()`, which `app.ts` awaits before Grafana
 * renders. `module.ts` awaits this one before it exports the plugin, so the flags are ready before the first panel or
 * panel editor renders. Until then (and in tests, where nothing sets it) the domain has no provider and every flag
 * evaluates to its default, `false`.
 */
export async function initOpenFeature(): Promise<void> {
  await OpenFeature.setProviderAndWait(
    OPEN_FEATURE_DOMAIN,
    new MultiProvider([
      { provider: createOpenFeatureLocalStorageProvider() },
      { provider: createOpenFeatureOFREPWebProvider() },
    ]),
    {
      targetingKey: config.namespace,
      ...config.openFeatureContext,
    }
  );
}

/** The plugin's OpenFeature client. As in core: evaluate just in time, don't keep the result. */
export function getFeatureFlagClient() {
  return OpenFeature.getClient(OPEN_FEATURE_DOMAIN);
}

/**
 * A boolean flag as a React value, defaulting to `false` (both table flags' default). Re-evaluates when the domain's
 * provider becomes ready, its context changes, or its configuration changes for this flag: the same events core's
 * `useFlag` (@openfeature/react-sdk, with Grafana's default options) listens to.
 */
function useBooleanFlag(flagKey: string): boolean {
  // getClient() returns a new client object on every call (all of the domain's clients share its provider and
  // events), so keep one per component, as core's React provider keeps one for the app.
  const [client] = useState(getFeatureFlagClient);
  const [value, setValue] = useState(() => client.getBooleanValue(flagKey, false));

  useEffect(() => {
    const update = () => setValue(client.getBooleanValue(flagKey, false));
    const onConfigurationChanged = (details?: EventDetails<ProviderEvents.ConfigurationChanged>) => {
      if (!details?.flagsChanged || details.flagsChanged.includes(flagKey)) {
        update();
      }
    };
    client.addHandler(ProviderEvents.Ready, update);
    client.addHandler(ProviderEvents.ContextChanged, update);
    client.addHandler(ProviderEvents.ConfigurationChanged, onConfigurationChanged);
    // A change between the first render and this effect has no event left to wait for.
    update();
    return () => {
      client.removeHandler(ProviderEvents.Ready, update);
      client.removeHandler(ProviderEvents.ContextChanged, update);
      client.removeHandler(ProviderEvents.ConfigurationChanged, onConfigurationChanged);
    };
  }, [client, flagKey]);

  return value;
}

export const useFlagTableAutoColumnWidths = (): boolean => useBooleanFlag(FlagKeys.TableAutoColumnWidths);

export const useFlagTablePaginationPageSize = (): boolean => useBooleanFlag(FlagKeys.TablePaginationPageSize);
