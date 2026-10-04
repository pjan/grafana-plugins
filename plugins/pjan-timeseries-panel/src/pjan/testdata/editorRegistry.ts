import {
  identityOverrideProcessor,
  standardEditorsRegistry,
  standardFieldConfigEditorRegistry,
  stringOverrideProcessor,
} from '@grafana/data';

// Grafana fills the option editor registry at startup. Building the plugin's options (its defaults, as
// getPanelOptionsWithDefaults does) only needs the ids to exist.
const EDITORS = [
  'boolean',
  'radio',
  'number',
  'select',
  'slider',
  'text',
  'color',
  'unit',
  'field-name',
  'multi-select',
  'stats-picker',
];

// Grafana also fills the standard field config registry at startup (getAllStandardFieldConfigs in
// public/app/core/components/OptionsUI/registry.tsx). getPanelOptionsWithDefaults keeps only the standard field
// options found there, and adapts the colour mode by the `color` item's settings, so the two the tests use are
// registered as core defines them (id, path, processor, settings, shouldApply), without their editors.
const editor = () => null;
const STANDARD_FIELD_CONFIGS = [
  {
    id: 'unit',
    path: 'unit',
    name: 'Unit',
    editor,
    override: editor,
    process: stringOverrideProcessor,
    settings: { placeholder: 'none' },
    shouldApply: () => true,
  },
  {
    id: 'color',
    path: 'color',
    name: 'Color scheme',
    editor,
    override: editor,
    process: identityOverrideProcessor,
    settings: { byValueSupport: true, preferThresholdsMode: true },
    shouldApply: () => true,
  },
];

export function fillEditorRegistry() {
  standardEditorsRegistry.setInit(() => EDITORS.map((id) => ({ id, name: id, editor })));
  standardFieldConfigEditorRegistry.setInit(() => STANDARD_FIELD_CONFIGS);
}
