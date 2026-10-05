// Plugin stand-in for `@grafana/test-utils/unstable` (grafana/grafana v13.2.3: packages/grafana-test-utils/src/unstable.ts
// and src/utilities/featureFlags.ts, Apache-2.0). Tests only; jest.config.js and tsconfig.json map the package name here.
// Upstream sets an OpenFeature `InMemoryProvider` on core's domain ('internal-grafana-core'), which core's flag hooks
// read. The plugin's flag hooks read the plugin's own domain (packages/grafana-runtime/internal.ts), so this stand-in
// sets the same in-memory provider there; otherwise it is upstream's code. `InMemoryProvider` comes from
// `@openfeature/web-sdk` (upstream imports it through `@openfeature/react-sdk`, which re-exports it).
import { InMemoryProvider, type JsonValue, OpenFeature } from '@openfeature/web-sdk';

import { OPEN_FEATURE_DOMAIN } from '../grafana-runtime/internal';

let ofProvider: InMemoryProvider;

function initTestOpenFeatureClient(): void {
  ofProvider ??= new InMemoryProvider();
  OpenFeature.setProvider(OPEN_FEATURE_DOMAIN, ofProvider);
}

/**
 * Returns an OpenFeature client configured for use in tests. Not intended for general use im tests - prefer setting mock
 * flag values via `setTestFlags` instead.
 */
export function getTestFeatureFlagClient() {
  if (!ofProvider) {
    initTestOpenFeatureClient();
  }

  return OpenFeature.getClient(OPEN_FEATURE_DOMAIN);
}

type FlagSet = Record<string, boolean | string | number | JsonValue>;

/**
 * Sets OpenFeature flag values for tests. Call it with an object of flag names and their values.
 * This modifies the global environment, so be sure to reset flags in `after` / `afterEach`.
 */
export function setTestFlags(flags: FlagSet = {}) {
  if (!ofProvider) {
    initTestOpenFeatureClient();
  }

  const flagConfig: Parameters<typeof ofProvider.putConfiguration>[0] = {};

  for (const [flagName, value] of Object.entries(flags)) {
    flagConfig[flagName] = {
      variants: {
        testedVariant: value,
      },
      defaultVariant: 'testedVariant',
      disabled: false,
    };
  }

  ofProvider.putConfiguration(flagConfig);
}
