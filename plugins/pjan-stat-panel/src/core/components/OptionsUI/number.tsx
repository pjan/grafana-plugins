// Copied from grafana/grafana v13.2.3: public/app/core/components/OptionsUI/number.tsx. AGPL-3.0 (Copyright Grafana Labs). Changes: none.
import { useCallback } from 'react';

import { type StandardEditorProps, type NumberFieldConfigSettings } from '@grafana/data';

import { NumberInput } from './NumberInput';

type Props = StandardEditorProps<number, NumberFieldConfigSettings>;

export const NumberValueEditor = ({ value, onChange, item, id }: Props) => {
  const { settings } = item;

  const onValueChange = useCallback(
    (value: number | undefined) => {
      onChange(settings?.integer && value !== undefined ? Math.floor(value) : value);
    },
    [onChange, settings?.integer]
  );

  return (
    <NumberInput
      id={id}
      value={value}
      min={settings?.min}
      max={settings?.max}
      step={settings?.step}
      placeholder={settings?.placeholder}
      onChange={onValueChange}
    />
  );
};
