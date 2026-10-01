import { render, screen } from '@testing-library/react';

import { type StandardEditorsRegistryItem } from '@grafana/data';

import { type StylingColor, type StylingColorMode } from './stylingColor';
import {
  getStylingColorOptions,
  StylingColorEditor,
  type StylingColorEditorSettings,
  toStylingColor,
} from './StylingColorEditor';

// The mode lists State timeline ++ gives its line, value and row-name colours.
const LINE_COLOR_MODES: StylingColorMode[] = ['shade', 'fixed'];
const VALUE_COLOR_MODES: StylingColorMode[] = ['contrast', 'shade', 'fixed'];
const ROW_NAME_COLOR_MODES: StylingColorMode[] = ['state', 'fixed'];

// Choosing in the select and clearing it are covered end to end (tests/styling.spec.ts): Combobox's virtualised menu
// doesn't render in jsdom.
const renderEditor = (value: StylingColor | undefined, settings: StylingColorEditorSettings) => {
  const item = { id: 'lineColor', name: 'Line color', settings } as StandardEditorsRegistryItem<
    StylingColor | undefined,
    StylingColorEditorSettings
  >;
  render(<StylingColorEditor value={value} onChange={jest.fn()} item={item} context={{ data: [] }} id="line-color" />);
  return screen.getByRole('combobox');
};

describe('getStylingColorOptions', () => {
  it('offers the modes of an option, in order, with the five shades as one group', () => {
    expect(getStylingColorOptions(VALUE_COLOR_MODES).map((o) => [o.value, o.group])).toEqual([
      ['contrast', undefined],
      ['softer', 'Shade of the state color'],
      ['soft', 'Shade of the state color'],
      ['base', 'Shade of the state color'],
      ['strong', 'Shade of the state color'],
      ['stronger', 'Shade of the state color'],
      ['fixed', undefined],
    ]);
    expect(getStylingColorOptions(ROW_NAME_COLOR_MODES).map((o) => o.label)).toEqual([
      'Current state color',
      'Fixed color',
    ]);
  });
});

describe('toStylingColor', () => {
  it('maps a choice to the option value', () => {
    expect(toStylingColor('strong', undefined)).toEqual({ mode: 'shade', shade: 'strong' });
    expect(toStylingColor('contrast', { mode: 'shade', shade: 'soft' })).toEqual({ mode: 'contrast' });
    expect(toStylingColor('state', undefined)).toEqual({ mode: 'state' });
  });

  it('a fixed colour keeps the colour picked before, if any', () => {
    expect(toStylingColor('fixed', { mode: 'fixed', fixedColor: 'red' })).toEqual({ mode: 'fixed', fixedColor: 'red' });
    expect(toStylingColor('fixed', { mode: 'shade', shade: 'soft' })).toEqual({ mode: 'fixed', fixedColor: undefined });
  });

  it('clearing unsets the option', () => {
    expect(toStylingColor(undefined, { mode: 'contrast' })).toBeUndefined();
  });
});

describe('StylingColorEditor', () => {
  it('shows what an unset option draws', () => {
    expect(renderEditor(undefined, { modes: VALUE_COLOR_MODES, placeholder: 'Automatic' })).toHaveAttribute(
      'placeholder',
      'Automatic'
    );
    expect(screen.queryByRole('button', { name: 'Choose color' })).not.toBeInTheDocument();
  });

  it('shows the choice, and Grafana’s colour picker for a fixed colour', () => {
    expect(
      renderEditor({ mode: 'fixed', fixedColor: 'red' }, { modes: LINE_COLOR_MODES, placeholder: '' })
    ).toHaveValue('Fixed color');
    expect(screen.getByRole('button', { name: 'Choose color' })).toBeInTheDocument();
  });
});
