// Test helper: builds the Atlas theme the way the Atlas theme plugin does (module.js `build()` in
// pjan/atlas stacks/monitoring/grafana/plugins/atlas-theme-app, 2026-10-01): createTheme() from the theme definition,
// with `getColorByName` patched to resolve the extra colour names (gray, teal, ...). `atlas-theme.json` is a copy of
// that plugin's file.
import { createTheme, type GrafanaTheme2 } from '@grafana/data';

import atlas from '../../../../testdata/atlas-theme.json';

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

export function createAtlasTheme(mode: Mode): GrafanaTheme2 {
  const theme = createTheme(resolve(atlas.themes[mode] as Json) as Parameters<typeof createTheme>[0]);
  const names = resolve(atlas.names[mode] as Json) as Record<string, string>;
  const byName = theme.visualization.getColorByName;
  theme.visualization.getColorByName = (name: string) =>
    (name && Object.prototype.hasOwnProperty.call(names, name) ? names[name] : undefined) || byName(name);
  return theme;
}

/** The extra hue names the Atlas theme resolves (not in Grafana's hues). */
export const ATLAS_EXTRA_HUES = [...new Set(Object.keys(atlas.names.light).map((name) => name.replace(/^.*-/, '')))];
