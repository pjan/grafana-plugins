import { initPluginTranslations } from '@grafana/i18n';

import pluginJson from './plugin.json';

// Bind t() / <Trans> from the bundled @grafana/i18n to this plugin's namespace before any copied code renders.
// The plugin ships no translations, so every string renders its in-source English default.
await initPluginTranslations(pluginJson.id);

export { plugin } from './plugins/panel/state-timeline/module';
