import { type StandardEditorContext, type StandardEditorProps } from '@grafana/data';
import { Combobox, type ComboboxOption } from '@grafana/ui';

export interface RowAnnotationsComboboxSettings {
  /** Shown while the option is unset: what the panel uses then */
  placeholder: string;
  getOptions: (context: StandardEditorContext<unknown>) => Array<ComboboxOption<string>>;
  createCustomValue?: boolean;
}

/**
 * A select for the per-row annotation options. Unlike the builder's `addSelect` (core's SelectValueEditor, which has
 * no placeholder), it shows what an unset option means, so the options need no default value in the saved panel.
 * Clearing the value unsets the option.
 */
export const RowAnnotationsComboboxEditor = ({
  value,
  onChange,
  item,
  context,
  id,
}: StandardEditorProps<string | undefined, RowAnnotationsComboboxSettings>) => {
  const settings = item.settings;
  return (
    <Combobox<string>
      id={id}
      options={settings?.getOptions(context) ?? []}
      value={value ?? null}
      placeholder={settings?.placeholder}
      createCustomValue={settings?.createCustomValue}
      isClearable
      onChange={(option) => onChange(option?.value || undefined)}
    />
  );
};
