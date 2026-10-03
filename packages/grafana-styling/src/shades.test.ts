import { type GrafanaTheme2 } from '@grafana/data';

import atlas from '../testdata/atlas-theme.json';

import { getHueOfColorName, getNearestHue, getRelativeShadeColor, getShadeColor, rankHue, toOklch } from './shades';
import { ATLAS_EXTRA_HUES } from './testdata/atlasTheme';
import { THEMES as themes } from './testdata/themes';
const GRAFANA_HUES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
const GRAFANA_HUES_IN_THEME_ORDER = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
const NATURAL = ['super-light-', 'light-', '', 'semi-dark-', 'dark-'];

/** How the ranking relates to Grafana's shade order: 'natural', 'reversed', or the ranked prefixes. */
const orderOf = (names: string[], hue: string) => {
  const prefixes = names.map((name) => name.slice(0, name.length - hue.length));
  if (prefixes.join() === NATURAL.join()) {
    return 'natural';
  }
  if (prefixes.join() === [...NATURAL].reverse().join()) {
    return 'reversed';
  }
  return prefixes.map((p) => p || 'base').join(' < ');
};

describe('getHueOfColorName', () => {
  it.each([
    ['super-light-green', 'green'],
    ['light-green', 'green'],
    ['green', 'green'],
    ['semi-dark-green', 'green'],
    ['dark-green', 'green'],
    ['super-light-gray', 'gray'],
  ])('%s -> %s', (name, hue) => expect(getHueOfColorName(name)).toBe(hue));
});

describe('rankHue', () => {
  it('stock light: lighter is softer; stock dark: darker is softer', () => {
    expect(rankHue(themes['Grafana light'], 'green')!.names).toEqual([
      'super-light-green',
      'light-green',
      'green',
      'semi-dark-green',
      'dark-green',
    ]);
    expect(rankHue(themes['Grafana dark'], 'green')!.names).toEqual([
      'dark-green',
      'semi-dark-green',
      'green',
      'light-green',
      'super-light-green',
    ]);
  });

  it('Atlas dark defines super-light as the darkest shade, so it is still the softest', () => {
    expect(rankHue(themes['Atlas dark'], 'green')!.names[0]).toBe('super-light-green');
    expect(rankHue(themes['Atlas light'], 'green')!.names[0]).toBe('super-light-green');
  });

  it('ranks the extra names of the Atlas theme, and has no hue for them in stock Grafana', () => {
    for (const hue of ATLAS_EXTRA_HUES) {
      expect(rankHue(themes['Atlas light'], hue)).toBeDefined();
      expect(rankHue(themes['Grafana light'], hue)).toBeUndefined();
    }
  });

  it('the Atlas theme lists its extra hues after Grafana’s six, each with the five shade names and the base as primary', () => {
    for (const mode of ['light', 'dark']) {
      const hues = themes[`Atlas ${mode}`].visualization.hues;
      expect(hues.map((hue) => hue.name)).toEqual([...GRAFANA_HUES_IN_THEME_ORDER, ...ATLAS_EXTRA_HUES]);
      for (const hue of hues.slice(6)) {
        expect(hue.shades.map((shade) => shade.name)).toEqual(NATURAL.map((prefix) => prefix + hue.name));
        expect(hue.shades.map((shade) => Boolean(shade.primary))).toEqual([false, false, true, false, false]);
        expect(hue.shades.map((shade) => shade.color)).toEqual(
          hue.shades.map((shade) => themes[`Atlas ${mode}`].visualization.getColorByName(shade.name))
        );
      }
    }
    expect(themes['Grafana light'].visualization.hues.map((hue) => hue.name)).toEqual(GRAFANA_HUES_IN_THEME_ORDER);
  });

  it('has no hue for hex colours, text, transparent, unknown names', () => {
    for (const name of ['#ff0000', 'text', 'transparent', 'panel-bg', 'nope']) {
      expect(rankHue(themes['Grafana light'], getHueOfColorName(name))).toBeUndefined();
    }
  });

  it('ties keep Grafana shade order, from the background towards the text', () => {
    const tie = (isDark: boolean) =>
      ({
        isDark,
        colors: { background: { primary: isDark ? '#000000' : '#ffffff' } },
        visualization: { getColorByName: (name: string) => (name.endsWith('tie') ? '#777777' : name) },
      }) as unknown as GrafanaTheme2;
    expect(rankHue(tie(false), 'tie')!.names).toEqual(NATURAL.map((p) => p + 'tie'));
    expect(rankHue(tie(true), 'tie')!.names).toEqual([...NATURAL].reverse().map((p) => p + 'tie'));
  });

  it('ranks a hue whose shades are not monotonic by contrast, not by name', () => {
    const colors: Record<string, string> = {
      'super-light-zig': '#eeeeee',
      'light-zig': '#444444', // darker than the base: more contrast on white
      zig: '#999999',
      'semi-dark-zig': '#777777',
      'dark-zig': '#222222',
    };
    const theme = {
      isDark: false,
      colors: { background: { primary: '#ffffff' } },
      visualization: { getColorByName: (name: string) => colors[name] ?? name },
    } as unknown as GrafanaTheme2;
    expect(rankHue(theme, 'zig')!.names).toEqual(['super-light-zig', 'zig', 'semi-dark-zig', 'light-zig', 'dark-zig']);
  });

  it('is cached per theme', () => {
    const theme = themes['Grafana light'];
    expect(rankHue(theme, 'red')).toBe(rankHue(theme, 'red'));
  });

  it('relative shades of any shade of a hue are the same five colours', () => {
    const theme = themes['Grafana dark'];
    expect(getRelativeShadeColor(theme, 'super-light-red', 'softer')).toBe(
      getRelativeShadeColor(theme, 'red', 'softer')
    );
    expect(getRelativeShadeColor(theme, 'red', 'softer')).toBe(theme.visualization.getColorByName('dark-red'));
  });
});

describe('ranking in every theme', () => {
  it('stock Grafana: every hue is in Grafana’s shade order on light, reversed on dark', () => {
    for (const hue of GRAFANA_HUES) {
      expect(orderOf(rankHue(themes['Grafana light'], hue)!.names, hue)).toBe('natural');
      expect(orderOf(rankHue(themes['Grafana dark'], hue)!.names, hue)).toBe('reversed');
    }
  });

  it('Atlas: every hue is in Grafana’s shade order, light and dark (its dark theme defines the names reversed)', () => {
    for (const hue of [...GRAFANA_HUES, ...ATLAS_EXTRA_HUES]) {
      expect(orderOf(rankHue(themes['Atlas light'], hue)!.names, hue)).toBe('natural');
      expect(orderOf(rankHue(themes['Atlas dark'], hue)!.names, hue)).toBe('natural');
    }
  });

  it('contrasts rise from softer to stronger', () => {
    for (const theme of Object.values(themes)) {
      for (const hue of GRAFANA_HUES) {
        const { contrasts } = rankHue(theme, hue)!;
        expect([...contrasts].sort((a, b) => a - b)).toEqual(contrasts);
      }
    }
  });
});

// Expected values below come from a separate implementation of the rule (Python, outside this repository; the
// rule is pjan's decision of 2026-10-03), not from the code under test.

describe('toOklch', () => {
  it('converts sRGB to OKLCH', () => {
    const green = toOklch('#00ff00')!;
    expect(green.l).toBeCloseTo(0.8664, 4);
    expect(green.c).toBeCloseTo(0.2948, 4);
    expect(green.h).toBeCloseTo(142.4953, 3);
    expect(toOklch('rgb(1, 152, 178)')!.h).toBeCloseTo(215.5774, 3);
    expect(toOklch('#808080')!.c).toBeCloseTo(0, 6);
  });

  it('ignores alpha, and is undefined for what it can’t read', () => {
    expect(toOklch('rgba(0, 255, 0, 0.2)')!.h).toBeCloseTo(142.4953, 3);
    expect(toOklch('not a colour')).toBeUndefined();
  });
});

describe('getNearestHue', () => {
  // atlas-theme.json themes.<mode>.visualization.palette, in order: each is its own hue family's 600–800 step
  const ATLAS_FAMILIES = [
    'lime', 'violet', 'cyan', 'orange', 'pink', 'teal', 'pink', 'indigo', 'cyan', 'lime', 'indigo',
    'orange', 'lime', 'indigo', 'teal', 'pink', 'violet', 'teal', 'orange', 'violet', 'cyan',
  ]; // prettier-ignore

  it.each(['light', 'dark'] as const)('Atlas %s: all 21 palette colours map to their own hue family', (mode) => {
    const theme = themes[`Atlas ${mode}`];
    const palette = atlas.themes[mode].visualization.palette;
    expect(palette.map((ref) => ref.replace(/^atlas\.([a-z]+)[0-9]+$/, '$1'))).toEqual(ATLAS_FAMILIES);
    expect(theme.visualization.palette.map((color) => getNearestHue(theme, color))).toEqual(ATLAS_FAMILIES);
  });

  // Grafana's classic palette (theme.visualization.palette): the hex colours after its 18 names
  const STOCK_HEX = [
    '#447EBC', '#C15C17', '#890F02', '#0A437C', '#6D1F62', '#584477', '#B7DBAB', '#F4D598', '#70DBED', '#F9BA8F',
    '#F29191', '#82B5D8', '#E5A8E2', '#AEA2E0', '#629E51', '#E5AC0E', '#64B0C8', '#E0752D', '#BF1B00', '#0A50A1',
    '#962D82', '#614D93', '#9AC48A', '#F2C96D', '#65C5DB', '#F9934E', '#EA6460', '#5195CE', '#D683CE', '#806EB7',
    '#3F6833', '#967302', '#2F575E', '#99440A', '#58140C', '#052B51', '#511749', '#3F2B5B', '#E0F9D7', '#FCEACA',
    '#CFFAFF', '#F9E2D2', '#FCE2DE', '#BADFF4', '#F9D9F9', '#DEDAF7',
  ]; // prettier-ignore
  const STOCK_HUES = {
    light: [
      'blue', 'orange', 'red', 'blue', null, 'purple', 'green', 'yellow', null, 'orange', 'red', null, 'purple', null,
      'green', 'yellow', null, 'orange', null, 'blue', null, null, 'green', 'yellow', null, 'orange', 'red', 'blue',
      null, null, 'green', 'yellow', null, 'orange', 'red', 'blue', null, 'purple', 'green', 'yellow', null, null,
      null, null, 'purple', null,
    ],
    dark: [
      'blue', 'orange', 'red', 'blue', null, 'purple', 'green', null, null, 'orange', 'red', null, 'purple', null,
      'green', null, null, 'orange', null, 'blue', null, null, 'green', null, null, 'orange', 'red', 'blue', null,
      null, 'green', 'yellow', null, 'orange', 'red', 'blue', null, 'purple', 'green', null, null, null, null, null,
      'purple', null,
    ],
  }; // prettier-ignore

  it.each([
    ['light', 28],
    ['dark', 24],
  ] as const)('stock Grafana %s: %i of the 46 hex colours of the classic palette get a hue', (mode, count) => {
    const theme = themes[`Grafana ${mode}`];
    const hex = theme.visualization.palette.filter((color) => color.startsWith('#'));
    expect(hex).toEqual(STOCK_HEX);
    const hues = hex.map((color) => getNearestHue(theme, color) ?? null);
    expect(hues).toEqual(STOCK_HUES[mode]);
    expect(hues.filter(Boolean)).toHaveLength(count);
  });

  it.each([
    // colour, Atlas light and dark, stock light and dark
    ['#00ff00', 'green', 'green'],
    ['#ff0000', 'red', 'red'],
    ['rgb(1, 152, 178)', 'cyan', undefined], // Atlas cyan 600; nearest stock hue, blue, is 43° away
    ['#008080', undefined, undefined], // CSS teal: Atlas cyan 13.1°, teal 13.7°, less than 5° apart
    ['#808080', 'gray', undefined], // below the chroma floor: the theme's gray hue, if it has one
    ['#3a3a3a', 'gray', undefined],
  ])('%s: Atlas %s, stock %s', (color, inAtlas, inStock) => {
    for (const mode of ['light', 'dark']) {
      expect(getNearestHue(themes[`Atlas ${mode}`], color)).toBe(inAtlas);
      expect(getNearestHue(themes[`Grafana ${mode}`], color)).toBe(inStock);
    }
  });

  it('is undefined for a colour it can’t read', () => {
    expect(getNearestHue(themes['Atlas light'], 'nope')).toBeUndefined();
  });

  // A theme with hues of the given shade colours. Angles of the colours (OKLCH, `step4/angles.py`): #b0a03c 100.16°,
  // #a3a543 110.24°, #9ea747 114.00°, #9ba749 115.64°, #99a84a 117.19°, #3bacda 229.49°; #9fa08b has chroma 0.030
  // (gray) at 109.37°, #a0a27e chroma 0.050 at 110.26°.
  const themeOf = (hues: Record<string, string[]>) =>
    ({
      visualization: {
        hues: Object.entries(hues).map(([name, colors]) => ({
          name,
          shades: colors.map((color, i) => ({ name: `${i}-${name}`, color })),
        })),
      },
    }) as unknown as GrafanaTheme2;
  const COLOR = '#b0a03c';

  it('the nearest hue wins if the second-nearest is at least 5° further away', () => {
    // 10.08° and 15.48°: 5.40° apart
    expect(getNearestHue(themeOf({ a: ['#3bacda', '#a3a543'], b: ['#9ba749'] }), COLOR)).toBe('a');
    // 10.08° and 13.84°: 3.76° apart
    expect(getNearestHue(themeOf({ a: ['#3bacda', '#a3a543'], b: ['#9ea747'] }), COLOR)).toBeUndefined();
  });

  it('ties have no hue', () => {
    expect(getNearestHue(themeOf({ a: ['#a3a543'], b: ['#a3a543'] }), COLOR)).toBeUndefined();
  });

  it('the nearest shade must be within 15°; with one hue there is no second to compare', () => {
    expect(getNearestHue(themeOf({ a: ['#9ea747'] }), COLOR)).toBe('a'); // 13.84°
    expect(getNearestHue(themeOf({ a: ['#99a84a'] }), COLOR)).toBeUndefined(); // 17.03°
    expect(getNearestHue(themeOf({}), COLOR)).toBeUndefined();
  });

  it('shades below the chroma floor don’t take part; a hue of only such shades is the gray hue', () => {
    // a's shade at 109.37° is gray: only its 229.49° shade counts
    expect(getNearestHue(themeOf({ a: ['#9fa08b', '#3bacda'] }), COLOR)).toBeUndefined();
    // at chroma 0.050 it counts
    expect(getNearestHue(themeOf({ a: ['#a0a27e', '#3bacda'] }), COLOR)).toBe('a');
    // gray hues are never matched by angle, and a gray colour takes the first gray hue
    const withGrays = themeOf({ g1: ['#9fa08b', '#808080'], a: ['#3bacda'], g2: ['#3a3a3a'] });
    expect(getNearestHue(withGrays, '#9fa08b')).toBe('g1');
    expect(getNearestHue(withGrays, COLOR)).toBeUndefined();
  });

  it('a hue without a readable shade takes no part (it is not a gray hue)', () => {
    const theme = themeOf({ broken: ['nope', 'not a colour'], g: ['#808080'], a: ['#a3a543'] });
    expect(getNearestHue(theme, '#3a3a3a')).toBe('g');
    expect(getNearestHue(theme, COLOR)).toBe('a');
  });

  it('is cached per theme', () => {
    const theme = themeOf({ a: ['#a3a543'] });
    expect(getNearestHue(theme, COLOR)).toBe('a');
    theme.visualization.hues.length = 0;
    expect(getNearestHue(theme, COLOR)).toBe('a');
  });
});

describe('getShadeColor', () => {
  const light = themes['Atlas light'];
  const palette = atlas.palette as Record<string, string>;

  it('a colour without a name takes the shades of its nearest hue: base is the hue’s base name, not the colour', () => {
    // A lime 600 series: base is lime 400 (the name `lime` in Atlas light), softer lime 200, stronger lime 800
    expect(getShadeColor(light, palette.lime600, undefined, 'base')).toBe(palette.lime400);
    expect(getShadeColor(light, palette.lime600, undefined, 'softer')).toBe(palette.lime200);
    expect(getShadeColor(light, palette.lime600, undefined, 'stronger')).toBe(palette.lime800);
    expect(getShadeColor(themes['Grafana light'], '#629E51', undefined, 'base')).toBe(
      themes['Grafana light'].visualization.getColorByName('green')
    );
  });

  it('a named colour takes its name’s hue, whatever its colour', () => {
    expect(getShadeColor(light, '#000000', 'semi-dark-red', 'softer')).toBe(
      light.visualization.getColorByName('super-light-red')
    );
  });

  it('a CSS name is not a Grafana colour name: its colour takes its nearest hue', () => {
    // Stock Grafana resolves `lime` to CSS #00ff00, nearest its green
    const stock = themes['Grafana light'];
    expect(stock.visualization.getColorByName('lime')).toBe('#00ff00');
    expect(getShadeColor(stock, '#00ff00', 'lime', 'soft')).toBe(stock.visualization.getColorByName('light-green'));
  });

  it('none without a hue: Grafana’s special names, or a colour no hue is near enough', () => {
    const stock = themes['Grafana light'];
    const atlasLight = themes['Atlas light'];
    // CSS teal (#008080) is near no hue
    expect(getShadeColor(stock, stock.visualization.getColorByName('teal'), 'teal', 'soft')).toBeUndefined();
    expect(getShadeColor(stock, '#008080', undefined, 'soft')).toBeUndefined();
    expect(getShadeColor(stock, '#808080', undefined, 'soft')).toBeUndefined();
    // the special names, even where their colour is gray and the theme has a gray hue
    for (const name of ['transparent', 'text', 'panel-bg']) {
      expect(getShadeColor(atlasLight, atlasLight.visualization.getColorByName(name), name, 'soft')).toBeUndefined();
    }
  });
});
