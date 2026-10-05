// Copied from grafana/grafana v13.2.3: public/app/features/panel/table/PaginationEditor.tsx. AGPL-3.0 (Copyright Grafana Labs). Changes: imports only.
import * as React from 'react';

import { type StandardEditorProps } from '@grafana/data';
import { selectors } from 'packages/grafana-e2e-selectors';
import { Switch } from '@grafana/ui';

export const PaginationEditor = ({ onChange, value, id }: StandardEditorProps<boolean>) => (
  <Switch
    id={id}
    label={selectors.components.PanelEditor.OptionsPane.fieldLabel(`Enable pagination`)}
    value={Boolean(value)}
    onChange={(event: React.FormEvent<HTMLInputElement> | undefined) => {
      onChange(event?.currentTarget.checked);
    }}
  />
);
