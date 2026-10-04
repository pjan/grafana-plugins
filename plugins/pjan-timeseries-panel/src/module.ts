import { PanelPlugin } from '@grafana/data';
import { initPluginTranslations } from '@grafana/i18n';

import { SimplePanel } from './components/SimplePanel';
import pluginJson from './plugin.json';
import { SimpleOptions } from './types';

// Bind t() / <Trans> from the bundled @grafana/i18n to this plugin's namespace before any copied code renders.
// The plugin ships no translations, so every string renders its in-source English default.
await initPluginTranslations(pluginJson.id);

// Placeholder: the scaffold's sample panel (@grafana/create-plugin 7.11.0), unchanged, until the port of core's time
// series panel replaces it with `export { plugin } from './plugins/panel/timeseries/module';` (README.md, "Status").
export const plugin = new PanelPlugin<SimpleOptions>(SimplePanel).setPanelOptions((builder) => {
  return builder
    .addTextInput({
      path: 'text',
      name: 'Simple text option',
      description: 'Description of panel option',
      defaultValue: 'Default value of text input option',
    })
    .addBooleanSwitch({
      path: 'showSeriesCount',
      name: 'Show series counter',
      defaultValue: false,
    })
    .addRadio({
      path: 'seriesCountSize',
      defaultValue: 'sm',
      name: 'Series counter size',
      settings: {
        options: [
          {
            value: 'sm',
            label: 'Small',
          },
          {
            value: 'md',
            label: 'Medium',
          },
          {
            value: 'lg',
            label: 'Large',
          },
        ],
      },
      showIf: (config) => config.showSeriesCount,
    });
});
