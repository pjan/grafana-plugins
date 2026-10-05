import {
  identityOverrideProcessor,
  type StandardEditorsRegistryItem,
  standardEditorsRegistry,
  standardFieldConfigEditorRegistry,
  stringOverrideProcessor,
} from '@grafana/data';
import { RadioButtonGroup, Switch } from '@grafana/ui';

// Grafana fills the option editor registry at startup (getAllOptionEditors in
// public/app/core/components/OptionsUI/registry.tsx). Building the plugin's options (its field config registry, its
// defaults as getPanelOptionsWithDefaults does, or the sparkline cell's graph options) only needs the ids to exist.
// The editors the ported editor tests render and query are defined as core defines them (the boolean switch and the
// radio group, both inline in core's registry.tsx on public @grafana/ui components); the others render nothing.
const editor = () => null;

const IDS_WITHOUT_EDITOR = [
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

const boolean: StandardEditorsRegistryItem<boolean> = {
  id: 'boolean',
  name: 'Boolean',
  description: 'Allows boolean values input',
  editor(props) {
    return <Switch {...props} onChange={(e) => props.onChange(e.currentTarget.checked)} />;
  },
};

const radio: StandardEditorsRegistryItem = {
  id: 'radio',
  name: 'Radio',
  description: 'Allows option selection',
  editor(props) {
    return <RadioButtonGroup {...props} options={props.item.settings?.options} />;
  },
};

/** The option editors: the same ids as Grafana's registry provides for the table and sparkline options. */
export function getAllOptionEditors(): StandardEditorsRegistryItem[] {
  return [boolean, radio, ...IDS_WITHOUT_EDITOR.map((id) => ({ id, name: id, editor }))];
}

// Grafana also fills the standard field config registry at startup (getAllStandardFieldConfigs in
// public/app/core/components/OptionsUI/registry.tsx). getPanelOptionsWithDefaults keeps only the standard field
// options found there, and adapts the colour mode by the `color` item's settings, so the two the tests use are
// registered as core defines them (id, path, processor, settings, shouldApply), without their editors.
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
  standardEditorsRegistry.setInit(getAllOptionEditors);
  standardFieldConfigEditorRegistry.setInit(() => STANDARD_FIELD_CONFIGS);
}
