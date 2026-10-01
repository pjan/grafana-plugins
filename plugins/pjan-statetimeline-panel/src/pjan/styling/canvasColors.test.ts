import { colorManipulator } from '@grafana/data';

import {
  getBestContrastText,
  getReadableText,
  getTextContrast,
  MIN_TEXT_CONTRAST,
  toCanvasColor,
  toFillColor,
} from './canvasColors';
import { LIGHT, THEMES } from './testdata/fixtures';

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

  it(`keeps a text colour from ${MIN_TEXT_CONTRAST}:1, otherwise falls back to best contrast`, () => {
    // #767676 on white is 4.54:1, #777777 4.48:1
    expect(getReadableText(LIGHT, '#767676', '#ffffff')).toBe('#767676');
    expect(getReadableText(LIGHT, '#777777', '#ffffff')).toBe('rgb(0,0,0)');
    expect(getReadableText(LIGHT, undefined, '#000000')).toBe('rgb(255,255,255)');
  });
});
