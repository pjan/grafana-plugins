// Test helpers for the styling: themes, fields with Grafana's display processor, and frames processed with the
// plugin's own field config registry (so field options and overrides apply as in Grafana).
import {
  applyFieldOverrides,
  createDataFrame,
  createTheme,
  type DataFrame,
  type Field,
  type FieldConfigSource,
  FieldType,
  getDisplayProcessor,
  type GrafanaTheme2,
  standardEditorsRegistry,
} from '@grafana/data';

import { plugin } from '../../../plugins/panel/state-timeline/module';

import { createAtlasTheme } from './atlasTheme';

export const THEMES: Record<string, GrafanaTheme2> = {
  'Grafana light': createTheme({ colors: { mode: 'light' } }),
  'Grafana dark': createTheme({ colors: { mode: 'dark' } }),
  'Atlas light': createAtlasTheme('light'),
  'Atlas dark': createAtlasTheme('dark'),
};

export const LIGHT = THEMES['Grafana light'];

/** A state field with Grafana's display processor, as the panel gets it. */
export function makeField(theme: GrafanaTheme2, field: Partial<Field>): Field {
  const f: Field = { name: 'state', type: FieldType.string, values: [], config: {}, state: {}, ...field };
  f.display = getDisplayProcessor({ field: f, theme });
  return f;
}

// Grafana fills the editor registry at startup; processing the plugin's options only needs the ids to exist.
const EDITORS = ['slider', 'boolean', 'radio', 'number', 'select', 'text', 'color', 'unit', 'multi-select'];
standardEditorsRegistry.setInit(() => EDITORS.map((id) => ({ id, name: id, editor: () => null })));

/** A frame of time and rows `names` (strings), processed with `fieldConfig` like Grafana processes a panel's data. */
export function processFrame(
  theme: GrafanaTheme2,
  names: string[],
  values: unknown[],
  fieldConfig: FieldConfigSource,
  config: Field['config'] = {}
): DataFrame {
  const data = createDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: values.map((_, i) => i * 1000) },
      // On the fields themselves: the test registry has no standard options (mappings) to process from the defaults.
      ...names.map((name) => ({ name, type: FieldType.string, values, config })),
    ],
  });
  return applyFieldOverrides({
    data: [data],
    fieldConfig,
    fieldConfigRegistry: plugin.fieldConfigRegistry,
    replaceVariables: (v) => v,
    theme,
  })[0];
}
