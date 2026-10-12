import { type StandardEditorContext, type StandardEditorProps } from '@grafana/data';
import { Combobox, type ComboboxOption } from '@grafana/ui';

export interface ClearableSelectSettings<T extends string | number = string> {
  /** Shown while the option is unset: what the panel draws (or uses) then */
  placeholder: string;
  /** The choices, read from the editor's context where they depend on the data (fields, labels, annotations) */
  getOptions: (context: StandardEditorContext<unknown>) => Array<ComboboxOption<T>>;
  /**
   * Whether a value that isn't one of the choices can be typed in: string values only (Grafana's Combobox makes a typed
   * value a string, which a number option must not save)
   */
  createCustomValue?: T extends string ? boolean : never;
}

/** The option value for a choice of the select: undefined when cleared (or an empty custom value). */
const toValue = <T extends string | number>(option: ComboboxOption<T> | null): T | undefined =>
  option === null || option.value === '' ? undefined : option.value;

/**
 * A select that can be cleared, for options with a few values, strings or numbers. Unlike the builder's `addSelect`
 * (core's SelectValueEditor, which has no placeholder and no clear), it shows what an unset option means, so the options
 * need no default value in the saved panel. Clearing the value unsets the option. Values are saved as they are given in
 * `getOptions` (numbers stay numbers); a value typed in (`createCustomValue`, strings only) is saved as typed.
 */
export const ClearableSelectEditor = <T extends string | number = string>({
  value,
  onChange,
  item,
  context,
  id,
}: StandardEditorProps<T | undefined, ClearableSelectSettings<T>>) => {
  const settings = item.settings;
  const options = settings?.getOptions(context) ?? [];
  // A typed value is a string: offered only where the choices are strings, so a number option never saves one
  const createCustomValue = Boolean(settings?.createCustomValue) && options.every((o) => typeof o.value === 'string');
  return (
    <Combobox<T>
      id={id}
      options={options}
      value={value ?? null}
      placeholder={settings?.placeholder}
      createCustomValue={createCustomValue}
      isClearable
      onChange={(option) => onChange(toValue(option))}
    />
  );
};
