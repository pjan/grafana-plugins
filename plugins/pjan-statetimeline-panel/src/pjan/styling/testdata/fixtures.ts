// Test helpers for the styling: the shared package's themes and fields (re-exported), and frames processed with the
// plugin's own field config registry (so field options and overrides apply as in Grafana).
import {
  applyFieldOverrides,
  createDataFrame,
  type DataFrame,
  type Field,
  type FieldConfigSource,
  FieldType,
  type GrafanaTheme2,
  standardEditorsRegistry,
} from '@grafana/data';

import { plugin } from '../../../plugins/panel/state-timeline/module';

export { LIGHT, makeField, THEMES } from '@pjan/grafana-styling/src/testdata/themes';

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
