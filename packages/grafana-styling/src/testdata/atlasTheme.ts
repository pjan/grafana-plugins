// Test helper: builds the Atlas theme the way the Atlas theme plugin does (module.js `build()` in
// pjan/atlas stacks/monitoring/grafana/plugins/atlas-theme-app, unchanged since 4.1.1): createTheme() from the theme
// definition, with `getColorByName` patched to resolve the extra colour names (gray, lemon, teal, ...), and their hues
// appended to `theme.visualization.hues` in the order of the names. `atlas-theme.json` is a copy of that plugin's file
// (4.2.0, which adds lemon).
import { createTheme, type GrafanaTheme2 } from '@grafana/data';

import atlas from '../../testdata/atlas-theme.json';

type Mode = 'light' | 'dark';
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const palette = atlas.palette as Record<string, string>;

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// atlas.<key> is a palette colour, atlas.<key>/<alpha> the same with alpha.
const ref = (value: string) =>
  value.replace(/atlas\.([a-z]+[0-9]*)(?:\/([0-9.]+))?/g, (match, key: string, alpha?: string) => {
    const hex = palette[key];
    if (!hex) {
      return match;
    }
    return alpha === undefined ? hex : `rgba(${channels(hex).join(', ')}, ${alpha})`;
  });

function resolve(node: Json): Json {
  if (typeof node === 'string') {
    return ref(node);
  }
  if (Array.isArray(node)) {
    return node.map(resolve);
  }
  if (node && typeof node === 'object') {
    const out: Record<string, Json> = {};
    Object.keys(node)
      .filter((key) => key[0] !== '$')
      .forEach((key) => (out[key] = resolve(node[key])));
    return out;
  }
  return node;
}

// Grafana's five shade names of a hue, in its own order; the base shade is the primary one.
const SHADE_PREFIXES = ['super-light-', 'light-', '', 'semi-dark-', 'dark-'];

const own = (names: Record<string, string>, name: string) =>
  Object.prototype.hasOwnProperty.call(names, name) ? names[name] : undefined;

// The hues of the extra colour names, in the order of names, each with all five shade names (module.js `extraHues`).
function extraHues(names: Record<string, string>): string[] {
  const hues: string[] = [];
  for (const name of Object.keys(names)) {
    const hue = name.replace(/^(super-light-|light-|semi-dark-|dark-)/, '');
    const complete = SHADE_PREFIXES.every((prefix) => own(names, prefix + hue) !== undefined);
    if (complete && !hues.includes(hue)) {
      hues.push(hue);
    }
  }
  return hues;
}

export function createAtlasTheme(mode: Mode): GrafanaTheme2 {
  const theme = createTheme(resolve(atlas.themes[mode] as Json) as Parameters<typeof createTheme>[0]);
  const names = resolve(atlas.names[mode] as Json) as Record<string, string>;
  const byName = theme.visualization.getColorByName;
  theme.visualization.getColorByName = (name: string) => (name && own(names, name)) || byName(name);
  for (const hue of extraHues(names)) {
    // createTheme() ignores hue names Grafana doesn't have, and its type only allows Grafana's six
    theme.visualization.hues.push({
      name: hue,
      shades: SHADE_PREFIXES.map((prefix) => ({
        color: theme.visualization.getColorByName(prefix + hue),
        name: prefix + hue,
        ...(prefix ? {} : { primary: true }),
      })),
    } as unknown as GrafanaTheme2['visualization']['hues'][number]);
  }
  return theme;
}

/** The extra hue names the Atlas theme resolves (not in Grafana's hues). */
export const ATLAS_EXTRA_HUES = [...new Set(Object.keys(atlas.names.light).map((name) => name.replace(/^.*-/, '')))];
