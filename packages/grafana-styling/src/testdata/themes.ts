// Test helpers for the styling: Grafana's stock themes and the Atlas theme, and fields with Grafana's display
// processor.
import { createTheme, type Field, FieldType, getDisplayProcessor, type GrafanaTheme2 } from '@grafana/data';

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
