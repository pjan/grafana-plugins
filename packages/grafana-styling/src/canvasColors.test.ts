import { colorManipulator } from '@grafana/data';

import {
  getBestContrastText,
  getMinTextContrast,
  getReadableText,
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
    expect(getBestContrastText(dark, fill)).toBe('rgb(255,255,255)');
  });

  it('best contrast is black or white, whichever is higher', () => {
    expect(getBestContrastText(LIGHT, '#FADE2A')).toBe('rgb(0,0,0)');
    expect(getBestContrastText(LIGHT, '#1250B0')).toBe('rgb(255,255,255)');
    // core's automatic contrast prefers white from 3:1; best contrast doesn't
    expect(LIGHT.colors.getContrastText('#E02F44', 3)).toBe('#ffffff');
    expect(getBestContrastText(LIGHT, '#E02F44')).toBe('rgb(0,0,0)');
  });

  it('keeps a text colour from the minimum contrast given, otherwise falls back to best contrast', () => {
    // #767676 on white is 4.54:1, #777777 4.48:1
    expect(getReadableText(LIGHT, '#767676', '#ffffff', 4.5)).toBe('#767676');
    expect(getReadableText(LIGHT, '#777777', '#ffffff', 4.5)).toBe('rgb(0,0,0)');
    expect(getReadableText(LIGHT, undefined, '#000000', 4.5)).toBe('rgb(255,255,255)');
    // #949494 on white is 3.03:1 (enough for large text only), #959595 2.995:1
    expect(getReadableText(LIGHT, '#949494', '#ffffff', 3)).toBe('#949494');
    expect(getReadableText(LIGHT, '#959595', '#ffffff', 3)).toBe('rgb(0,0,0)');
    expect(getReadableText(LIGHT, '#949494', '#ffffff', 4.5)).toBe('rgb(0,0,0)');
  });

  it('best contrast picks from the candidates given (Stat ++: core’s two text colours)', () => {
    const core = ['rgb(247, 248, 250)', 'rgb(32, 34, 38)'];
    expect(getBestContrastText(LIGHT, '#FADE2A', core)).toBe('rgb(32, 34, 38)');
    expect(getBestContrastText(LIGHT, '#1250B0', core)).toBe('rgb(247, 248, 250)');
    expect(getReadableText(LIGHT, '#777777', '#ffffff', 4.5, core)).toBe('rgb(32, 34, 38)');
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

  it('an opaque text colour is measured as before (State timeline ++ unchanged)', () => {
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
