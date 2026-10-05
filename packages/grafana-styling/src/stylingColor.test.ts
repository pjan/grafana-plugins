import { getStylingColor, type StylingColorMode } from './stylingColor';

// The mode lists State timeline plus gives its line, value and row-name colours.
const LINE_COLOR_MODES: StylingColorMode[] = ['shade', 'fixed'];
const VALUE_COLOR_MODES: StylingColorMode[] = ['automatic', 'shade', 'fixed'];
const ROW_NAME_COLOR_MODES: StylingColorMode[] = ['state', 'fixed'];

describe('getStylingColor', () => {
  it('keeps a complete value of an allowed mode', () => {
    expect(getStylingColor({ mode: 'shade', shade: 'soft' }, LINE_COLOR_MODES)).toEqual({
      mode: 'shade',
      shade: 'soft',
    });
    expect(getStylingColor({ mode: 'fixed', fixedColor: 'red' }, LINE_COLOR_MODES)).toEqual({
      mode: 'fixed',
      fixedColor: 'red',
    });
    expect(getStylingColor({ mode: 'automatic' }, VALUE_COLOR_MODES)).toEqual({ mode: 'automatic' });
    expect(getStylingColor({ mode: 'state' }, ROW_NAME_COLOR_MODES)).toEqual({ mode: 'state' });
    expect(getStylingColor({ mode: 'series' }, ['series', 'shade', 'fixed'])).toEqual({ mode: 'series' });
  });

  it.each([
    [undefined, LINE_COLOR_MODES],
    [{ mode: 'fixed' }, LINE_COLOR_MODES],
    [{ mode: 'shade' }, LINE_COLOR_MODES],
    [{ mode: 'shade', shade: 'darkest' }, LINE_COLOR_MODES],
    [{ mode: 'automatic' }, LINE_COLOR_MODES],
    [{ mode: 'state' }, VALUE_COLOR_MODES],
    ['red', ROW_NAME_COLOR_MODES],
    [{ mode: 'series' }, LINE_COLOR_MODES],
  ])('counts %o as unset', (value, modes) => {
    expect(getStylingColor(value, modes)).toBeUndefined();
  });
});
