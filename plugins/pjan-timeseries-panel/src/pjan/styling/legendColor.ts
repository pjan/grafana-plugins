import {
  type DataFrame,
  type FieldConfigSource,
  FieldColorModeId,
  FieldMatcherID,
  getFieldDisplayName,
  type GrafanaTheme2,
} from '@grafana/data';

import { getSeriesColors } from './seriesColors';

// The legend's colour picker writes a `color` override for the series (scenes 8.13.5, VizPanel._onSeriesColorChange
// with its changeSeriesColorConfigFactory). For a series with a Line color, that override alone would not change the
// line: a fixed Line color stays, a shade is a shade of the picked colour. So that a colour picked in the legend is
// drawn as picked (an explicit colour), the plugin writes the same override with the series' Line color set to it.
// For every other series the picker goes through Grafana unchanged.

/** Whether the series the legend names `label` has a Line color drawn. */
export function hasLineColor(frames: DataFrame[] | null | undefined, label: string, theme: GrafanaTheme2): boolean {
  return Boolean(
    frames?.some((frame) =>
      frame.fields.some(
        (field) => getFieldDisplayName(field, frame, frames) === label && getSeriesColors(field, theme)?.line
      )
    )
  );
}

/**
 * The field config after picking `color` for the series `label` in the legend: Grafana's `color` override (as scenes
 * writes it: the series' byName override, or a new one at the end), and in the same override the Line color set to
 * that colour.
 */
export function withPickedColor(fieldConfig: FieldConfigSource, label: string, color: string): FieldConfigSource {
  const properties = [
    { id: 'color', value: { mode: FieldColorModeId.Fixed, fixedColor: color } },
    { id: 'custom.styling.lineColor', value: { mode: 'fixed', fixedColor: color } },
  ];
  const index = fieldConfig.overrides.findIndex(
    (override) => override.matcher.id === FieldMatcherID.byName && override.matcher.options === label
  );
  if (index < 0) {
    return {
      ...fieldConfig,
      overrides: [...fieldConfig.overrides, { matcher: { id: FieldMatcherID.byName, options: label }, properties }],
    };
  }
  const overrides = Array.from(fieldConfig.overrides);
  const existing = overrides[index];
  const kept = existing.properties.map((property) => properties.find((p) => p.id === property.id) ?? property);
  const added = properties.filter((p) => !existing.properties.some((property) => property.id === p.id));
  overrides[index] = { ...existing, properties: [...kept, ...added] };
  return { ...fieldConfig, overrides };
}
