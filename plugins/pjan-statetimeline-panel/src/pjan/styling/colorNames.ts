import {
  type Field,
  FieldColorModeId,
  FieldType,
  type GrafanaTheme2,
  MappingType,
  type ValueMapping,
} from '@grafana/data';

/**
 * The Grafana colour names a field's state colours can come from: value mappings (all four types), thresholds, the
 * fixed colour, booleans (Grafana's green and red), and the classic palettes. Hex colours, the continuous schemes and
 * the colour-blind and categorical palettes have no names. With a continuous scheme (the state timeline's default
 * colour mode), only the mapped values have names: the scheme's own colours are interpolated.
 */
export function getCandidateColorNames(field: Field, theme: GrafanaTheme2): string[] {
  const { config } = field;
  const names: string[] = [];
  for (const mapping of config.mappings ?? []) {
    names.push(...getMappingColors(mapping).filter((color): color is string => Boolean(color)));
  }
  if (config.color?.mode?.startsWith('continuous-')) {
    return names;
  }
  for (const step of config.thresholds?.steps ?? []) {
    names.push(step.color);
  }
  if (config.color?.fixedColor) {
    names.push(config.color.fixedColor);
  }
  if (field.type === FieldType.boolean) {
    names.push('green', 'red');
  }
  const mode = config.color?.mode;
  if (mode === FieldColorModeId.PaletteClassic || mode === FieldColorModeId.PaletteClassicByName) {
    names.push(...theme.visualization.palette);
  }
  return names;
}

function getMappingColors(mapping: ValueMapping): Array<string | undefined> {
  switch (mapping.type) {
    case MappingType.ValueToText:
      return Object.values(mapping.options).map((result) => result.color);
    case MappingType.RangeToText:
    case MappingType.RegexToText:
    case MappingType.SpecialValue:
      return [mapping.options.result.color];
    default:
      return [];
  }
}

/**
 * Maps each colour the field's display processor can return (other than continuous ones) back to its Grafana colour
 * name. The display processor resolves a name with `theme.visualization.getColorByName`, so resolving the candidate
 * names with the same function gives the same strings. Names that resolve to themselves (unknown to the theme) and
 * plain hex or rgb() colours are left out. When two names resolve to the same colour, the first one wins.
 *
 * A reverse lookup, not a second display processor on a theme copy that returns names: Grafana caches continuous
 * schemes and measures palette contrasts on the theme it is given, so such a copy would corrupt both for every panel.
 */
export function getColorNameLookup(field: Field, theme: GrafanaTheme2): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const name of getCandidateColorNames(field, theme)) {
    if (!name || name[0] === '#' || name.startsWith('rgb')) {
      continue;
    }
    const color = theme.visualization.getColorByName(name);
    if (color !== name && !lookup.has(color)) {
      lookup.set(color, name);
    }
  }
  return lookup;
}
