import { type GrafanaTheme2 } from '@grafana/data';

import { getHueOfColorName, getRelativeShadeColor, getSoftestReadableShadeColor, rankHue } from './shades';
import { ATLAS_EXTRA_HUES } from './testdata/atlasTheme';
import { THEMES as themes } from './testdata/fixtures';
const GRAFANA_HUES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
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

describe('getSoftestReadableShadeColor', () => {
  it('is the softest shade that reaches the contrast with the panel background', () => {
    const theme = themes['Grafana light'];
    // green on white: 1.67, 2.24, 3.02, 4.51, 6.00
    expect(getSoftestReadableShadeColor(theme, 'super-light-green', 4.5)).toBe(
      theme.visualization.getColorByName('semi-dark-green')
    );
    expect(getSoftestReadableShadeColor(theme, 'dark-green', 3)).toBe(theme.visualization.getColorByName('green'));
    expect(getSoftestReadableShadeColor(theme, 'green', 1)).toBe(
      theme.visualization.getColorByName('super-light-green')
    );
  });

  it('is undefined when no shade reaches it, or for a name without shades', () => {
    const theme = themes['Grafana light'];
    // yellow on white: at most 2.50
    expect(getSoftestReadableShadeColor(theme, 'yellow', 4.5)).toBeUndefined();
    expect(getSoftestReadableShadeColor(theme, '#ff0000', 1)).toBeUndefined();
  });
});
