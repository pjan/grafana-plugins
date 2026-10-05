import { config } from '@grafana/runtime';

import { initOpenFeature } from '../packages/grafana-runtime/internal';

/**
 * Sets up the table feature flags as core does at start-up (grafana/grafana v13.2.3 `public/app/app.ts`): only for a
 * signed-in user, and a failure is logged, not thrown. Core checks `contextSrv.user.isSignedIn`, which it copies from
 * the boot data (`public/app/core/services/context_srv.ts`); plugins read the same value from the public
 * `config.bootData.user`. Without a signed-in user (anonymous viewers, public dashboards) core's flag domain has no
 * provider and every flag evaluates to its default (`false`), whatever a localStorage override says; so does the
 * plugin's, because its provider isn't set either. Returns whether the provider was set up.
 */
export async function initFeatureFlags(): Promise<boolean> {
  // "Currently the OpenFeature API requires a signed in user." (core's comment)
  if (!config.bootData?.user?.isSignedIn) {
    return false;
  }
  try {
    await initOpenFeature();
  } catch (err) {
    console.error('Failed to initialize OpenFeature provider', err);
  }
  return true;
}
