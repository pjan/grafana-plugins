// Copied from grafana/grafana v13.2.3: public/app/core/components/OptionsUI/registry.tsx. AGPL-3.0 (Copyright Grafana Labs). Changes: partial copy (getAllOptionEditors with the number, select, radio and stats-picker editors, which the stat panel options use; test-only: common.test.ts initialises the editor registry with it, Grafana provides its full registry at runtime).
import { type StandardEditorsRegistryItem, type StatsPickerConfigSettings } from '@grafana/data';
import { RadioButtonGroup } from '@grafana/ui';

import { NumberValueEditor } from './number';
import { SelectValueEditor } from './select';
import { StatsPickerEditor } from './stats';

/**
 * Returns collection of standard option editors definitions
 */
export const getAllOptionEditors = () => {
  const number: StandardEditorsRegistryItem<number> = {
    id: 'number',
    name: 'Number',
    description: 'Allows numeric values input',
    editor: NumberValueEditor,
  };

  const select: StandardEditorsRegistryItem = {
    id: 'select',
    name: 'Select',
    description: 'Allows option selection',
    editor: SelectValueEditor,
  };

  const radio: StandardEditorsRegistryItem = {
    id: 'radio',
    name: 'Radio',
    description: 'Allows option selection',
    editor(props) {
      return <RadioButtonGroup {...props} options={props.item.settings?.options} />;
    },
  };

  const statsPicker: StandardEditorsRegistryItem<string[], StatsPickerConfigSettings> = {
    id: 'stats-picker',
    name: 'Stats Picker',
    editor: StatsPickerEditor,
    description: '',
  };

  return [number, radio, select, statsPicker];
};
