import { colorManipulator } from '@grafana/data';

import {
  FALLBACK_TEXT_CONTRAST,
  getAutomaticText,
  getMinTextContrast,
  getTextContrast,
  toCanvasColor,
  toFillColor,
} from './canvasColors';
import { LIGHT, THEMES } from './testdata/themes';

describe('toCanvasColor', () => {
  it('draws set colours as rgb() without spaces, so exact-string theme remaps never match', () => {
    expect(toCanvasColor(LIGHT, 'green')).toBe('rgb(86,166,75)'); // #56A64B in the light theme
    expect(toCanvasColor(LIGHT, '#FF0000')).toBe('rgb(255,0,0)');
    expect(toCanvasColor(LIGHT, 'rgba(0, 10, 23, 0.09)')).toBe('rgba(0,10,23,0.09)');
  });

  it('is undefined for what the theme doesn’t resolve', () => {
    expect(toCanvasColor(LIGHT, 'super-light-gray')).toBeUndefined(); // only the Atlas theme has it
    expect(toCanvasColor(THEMES['Atlas light'], 'super-light-gray')).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });
});

describe('toFillColor', () => {
  it('is hex, which core’s Fill opacity (colorManipulator.alpha) handles as it handles Grafana’s colours', () => {
    expect(toFillColor('rgb(255,166,176)')).toBe('#ffa6b0');
    const asCore = colorManipulator.alpha('#FFA6B0', 0.7).toLowerCase(); // a Grafana colour at 70 %
    expect(colorManipulator.alpha(toFillColor('rgb(255,166,176)'), 0.7)).toBe(asCore);
    // what it avoids: alpha() mangles rgb() without spaces, so the contrast of the text on it comes out wrong
    expect(colorManipulator.alpha('rgb(255,166,176)', 0.7)).toBe('rgb(255,166,176, 0.7)');
    expect(toFillColor('rgba(255,166,176,0.5)')).toBe('#ffa6b080');
  });
});

describe('contrast', () => {
  it('composites a translucent fill over the panel background', () => {
    const dark = THEMES['Grafana dark'];
    const translucent = 'rgba(255,255,255,0.05)';
    expect(getTextContrast(dark, 'rgb(255,255,255)', translucent)).toBeGreaterThan(10);
    expect(getTextContrast(LIGHT, 'rgb(255,255,255)', translucent)).toBeCloseTo(1, 1);
  });

  it('composites a fill that core’s Fill opacity made rgb(r, g, b, a) (continuous schemes give rgb())', () => {
    const dark = THEMES['Grafana dark'];
    const fill = colorManipulator.alpha('rgb(242, 73, 92)', 0.7);
    expect(fill).toBe('rgb(242, 73, 92, 0.7)');
    expect(getTextContrast(dark, 'rgb(255,255,255)', fill)).toBeCloseTo(
      getTextContrast(dark, 'rgb(255,255,255)', 'rgba(242, 73, 92, 0.7)'),
      5
    );
  });
});

describe('getAutomaticText', () => {
  const ATLAS_LIGHT = THEMES['Atlas light'];
  const ATLAS_DARK = THEMES['Atlas dark'];
  const contrast = (a: string, b: string) => colorManipulator.getContrastRatio(a, b);

  // Expected colours computed by hand (Grafana's luminance, rounded to 3 digits, and 1 % sRGB steps); the end points
  // are Atlas's page colours, #f4f7fa and #010206.
  it('takes the first colour of the same hue that reaches the contrast, towards the side that gets there first', () => {
    // light-green in Atlas Light is emerald 300 (#9bd5a8): 59 % towards ink gives 4.55:1, 58 % doesn't reach 4.5:1
    expect(getAutomaticText(ATLAS_LIGHT, '#9bd5a8', 4.5)).toBe('rgb(64,89,72)');
    // large text: 46 % towards ink, 3.09:1
    expect(getAutomaticText(ATLAS_LIGHT, '#9bd5a8', 3)).toBe('rgb(84,116,93)');
    // super-light-green in Atlas Dark is emerald 800 (#3c6639): 79 % towards the light page colour, 4.57:1
    expect(getAutomaticText(ATLAS_DARK, '#3c6639', 4.5)).toBe('rgb(205,217,209)');
  });

  it('falls back to 4.2:1 for text that needs 4.5:1 when no colour of the hue reaches 4.5:1', () => {
    // light-green in Atlas Dark is emerald 700 (#42834b): neither page colour gets to 4.5:1; 90 % towards ink, 4.24:1
    const text = getAutomaticText(ATLAS_DARK, '#42834b', 4.5);
    expect(text).toBe('rgb(8,15,13)');
    expect(contrast(text, '#42834b')).toBeGreaterThanOrEqual(FALLBACK_TEXT_CONTRAST);
    expect(contrast(text, '#42834b')).toBeLessThan(4.5);
  });

  it('ends at the extreme with the higher contrast when even the fallback is out of reach', () => {
    const grey = {
      ...LIGHT,
      colors: {
        ...LIGHT.colors,
        background: { ...LIGHT.colors.background, canvas: '#777777' },
        text: { ...LIGHT.colors.text, maxContrast: '#999999' },
      },
    };
    expect(getAutomaticText(grey, '#808080', 4.5)).toBe('rgb(153,153,153)');
  });

  it('starts from another colour when given (row names in the state colour, on the panel background)', () => {
    // emerald 400 (#6fc686) on white: 35 % towards ink, 4.61:1
    expect(getAutomaticText(ATLAS_LIGHT, '#ffffff', 4.5, { from: '#6fc686' })).toBe('rgb(73,129,89)');
    // emerald 800 already reaches 6.65:1 on white, so it stays as it is
    expect(getAutomaticText(ATLAS_LIGHT, '#ffffff', 4.5, { from: '#3c6639' })).toBe('rgb(60,102,57)');
  });

  it('with `alsoOn`, measures every step against each colour it is drawn on, and the lowest contrast counts', () => {
    const DARK = THEMES['Grafana dark'];
    // Hand-computed: a gradient of Grafana dark's blue (#5794f2) and its start rgb(40,101,238) (core's Colored
    // background: darken 10, spin 5). From the blue towards the canvas (#111217) no step reaches 4.2:1 on both stops;
    // the canvas has the higher lowest contrast of the two extremes, 3.73:1 (white: 3.0:1)
    expect(getAutomaticText(DARK, '#5794f2', 4.5, { alsoOn: ['rgb(40, 101, 238)'] })).toBe('rgb(17,18,23)');
    // Alone, the blue reaches 4.5:1 79 % towards the canvas, but that colour gives only 2.75:1 on the darker stop
    expect(getAutomaticText(DARK, '#5794f2', 4.5)).toBe('rgb(32,45,69)');
    // Grafana dark's green (#73bf69) and rgb(77,172,73): 78 % towards the canvas, 4.52:1 on the darker stop
    expect(getAutomaticText(DARK, '#73bf69', 4.5, { alsoOn: ['rgb(77, 172, 73)'] })).toBe('rgb(37,53,39)');
    // A colour it can't read: the theme's text colour, as for drawnOn
    expect(getAutomaticText(DARK, '#73bf69', 4.5, { alsoOn: ['not-a-colour'] })).toBe(DARK.colors.text.primary);
  });

  it('takes the side that reaches the contrast in fewer steps', () => {
    // #808080 at 3:1 in Grafana light: 57 steps towards black (#000000) give rgb(55,55,55); the page colour (#fbfbfb)
    // would need 79
    expect(getAutomaticText(LIGHT, '#808080', 3)).toBe('rgb(55,55,55)');
  });

  it('on a tie, takes the page colour’s side', () => {
    const blackAndWhite = {
      ...LIGHT,
      colors: {
        ...LIGHT.colors,
        background: { ...LIGHT.colors.background, canvas: '#ffffff' },
        text: { ...LIGHT.colors.text, maxContrast: '#000000' },
      },
    };
    // #787878 at 1.5:1: 23 steps either way, rgb(151,151,151) towards white and rgb(92,92,92) towards black
    expect(getAutomaticText(blackAndWhite, '#787878', 1.5)).toBe('rgb(151,151,151)');
  });

  it('gives the theme’s text colour for a colour it can’t read, instead of throwing', () => {
    expect(getAutomaticText(LIGHT, 'dark-teal', 4.5)).toBe(LIGHT.colors.text.primary); // an Atlas-only name
    expect(getAutomaticText(LIGHT, '#ffffff', 4.5, { from: 'not-a-colour' })).toBe(LIGHT.colors.text.primary);
  });

  it('reads hsl() and CSS names as the colours they are', () => {
    expect(getAutomaticText(LIGHT, 'hsl(0, 0%, 50%)', 3)).toBe(getAutomaticText(LIGHT, '#808080', 3));
    expect(getAutomaticText(LIGHT, 'gray', 3)).toBe(getAutomaticText(LIGHT, '#808080', 3));
  });

  it('measures on a translucent fill as drawn: composited over the panel background', () => {
    const drawn = 'rgb(205,234,212)'; // #9bd5a8 at 50 % on white
    expect(getAutomaticText(ATLAS_LIGHT, 'rgba(155, 213, 168, 0.5)', 4.5)).toBe(
      getAutomaticText(ATLAS_LIGHT, drawn, 4.5)
    );
  });

  it.each(Object.keys(THEMES))('reaches 4.5:1 or the fallback on every shade of every hue in %s', (name) => {
    const theme = THEMES[name];
    for (const hue of theme.visualization.hues) {
      for (const shade of hue.shades) {
        const text = getAutomaticText(theme, shade.color, 4.5);
        expect(contrast(text, shade.color)).toBeGreaterThanOrEqual(FALLBACK_TEXT_CONTRAST);
      }
    }
  });
});

describe('getMinTextContrast', () => {
  it.each([
    [12, 400, 4.5],
    [12, 700, 4.5],
    [18.5, 700, 4.5],
    [18.66, 700, 3],
    [18.66, 500, 4.5],
    [20, 'bold', 3],
    [23.9, 500, 4.5],
    [24, 400, 3],
    [24, 500, 3],
    [60, 500, 3],
  ])('%s px at weight %s needs %s:1 (WCAG 2 AA)', (size, weight, expected) => {
    expect(getMinTextContrast(size as number, weight)).toBe(expected);
  });

  it('defaults to the normal weight', () => {
    expect(getMinTextContrast(20)).toBe(4.5);
    expect(getMinTextContrast(24)).toBe(3);
  });
});

describe('getTextContrast with a translucent text colour', () => {
  it('composites the text over the fill before measuring (Grafana’s getContrastRatio ignores the text’s alpha)', () => {
    // White at 50 % on black is drawn as rgb(128,128,128) (127.5 rounded): about 5.3:1, not white's 21:1
    const contrast = getTextContrast(LIGHT, 'rgba(255, 255, 255, 0.5)', '#000000');
    expect(contrast).toBeCloseTo(colorManipulator.getContrastRatio('rgb(128, 128, 128)', '#000000'), 1);
    expect(contrast).toBeLessThan(6);
    expect(colorManipulator.getContrastRatio('rgba(255, 255, 255, 0.5)', '#000000')).toBeCloseTo(21, 0);
  });

  it('composites a translucent fill over the background first, then the text over it', () => {
    const dark = THEMES['Grafana dark'];
    // a 10 % white fill on the dark panel background, text white at 60 %
    const fill = 'rgba(255, 255, 255, 0.1)';
    const behind: number[] = colorManipulator.decomposeColor(dark.colors.background.primary).values;
    const fillDrawn = behind.map((c) => Math.round(c * 0.9 + 255 * 0.1));
    const textDrawn = fillDrawn.map((c) => Math.round(255 * 0.6 + c * 0.4));
    const expected = colorManipulator.getContrastRatio(`rgb(${textDrawn.join(', ')})`, `rgb(${fillDrawn.join(', ')})`);
    expect(getTextContrast(dark, 'rgba(255, 255, 255, 0.6)', fill)).toBeCloseTo(expected, 5);
  });

  it('an opaque text colour is measured as before (State timeline plus unchanged)', () => {
    const dark = THEMES['Grafana dark'];
    for (const fill of ['#73BF69', '#73BF6980', 'rgba(242, 73, 92, 0.7)', 'rgb(242, 73, 92, 0.7)']) {
      expect(getTextContrast(dark, '#ffffff', fill)).toBe(
        colorManipulator.getContrastRatio(
          '#ffffff',
          fill.startsWith('rgb(') && fill.split(',').length === 4 ? fill.replace('rgb(', 'rgba(') : fill,
          dark.colors.background.primary
        )
      );
    }
  });

  it('measures against the background given (a transparent panel shows the dashboard canvas)', () => {
    const fill = 'rgba(0, 0, 0, 0.5)';
    expect(getTextContrast(LIGHT, '#ffffff', fill, '#000000')).toBeCloseTo(21, 0);
    expect(getTextContrast(LIGHT, '#ffffff', fill, '#ffffff')).toBeLessThan(5);
  });
});
