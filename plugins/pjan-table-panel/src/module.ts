import { initPluginTranslations } from '@grafana/i18n';

import pluginJson from './plugin.json';
import { initFeatureFlags } from './pjan/initFeatureFlags';

// Bind t() / <Trans> from the bundled @grafana/i18n to this plugin's namespace before any copied code renders.
// The plugin ships no translations, so every string renders its in-source English default.
await initPluginTranslations(pluginJson.id);

// The table feature flags, read as core reads them (UPSTREAM.md, "Feature flags"). Awaited here, as core's app.ts
// awaits its own initOpenFeature() before it renders, so the flags are ready before the first panel renders. As in
// core, only for a signed-in user, and a failure is logged (the flags then evaluate to their defaults, false).
await initFeatureFlags();

// Core's table panel (src/plugins/panel/table/module.tsx, see UPSTREAM.md).
export { plugin } from './plugins/panel/table/module';
