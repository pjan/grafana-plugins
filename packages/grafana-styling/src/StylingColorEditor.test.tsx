import { render, screen } from '@testing-library/react';

import { type StandardEditorsRegistryItem } from '@grafana/data';

import { type StylingColor, type StylingColorMode } from './stylingColor';
import {
  getStylingColorOptions,
  StylingColorEditor,
  type StylingColorEditorSettings,
  toStylingColor,
} from './StylingColorEditor';

// The mode lists State timeline plus gives its line, value and row-name colours.
const LINE_COLOR_MODES: StylingColorMode[] = ['shade', 'fixed'];
const VALUE_COLOR_MODES: StylingColorMode[] = ['automatic', 'shade', 'fixed'];
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
      ['automatic', undefined],
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

describe('getStylingColorOptions for Time series plus', () => {
  it('offers Series color, and names the shade group as asked', () => {
    expect(
      getStylingColorOptions(['series', 'shade', 'fixed'], 'Shade of the series color').map((o) => [
        o.value,
        o.label,
        o.group,
      ])
    ).toEqual([
      ['series', 'Series color', undefined],
      ['softer', 'Softer', 'Shade of the series color'],
      ['soft', 'Soft', 'Shade of the series color'],
      ['base', 'Base', 'Shade of the series color'],
      ['strong', 'Strong', 'Shade of the series color'],
      ['stronger', 'Stronger', 'Shade of the series color'],
      ['fixed', 'Fixed color', undefined],
    ]);
    expect(toStylingColor('series', undefined)).toEqual({ mode: 'series' });
  });
});

describe('getStylingColorOptions for Stat plus', () => {
  it('offers None, Value and Same as text where asked, in the order given', () => {
    expect(getStylingColorOptions(['none', 'value', 'shade', 'fixed']).map((o) => o.label)).toEqual([
      'None',
      'Value',
      'Softer',
      'Soft',
      'Base',
      'Strong',
      'Stronger',
      'Fixed color',
    ]);
    expect(getStylingColorOptions(['value', 'shade', 'text', 'fixed']).map((o) => o.value)).toEqual([
      'value',
      'softer',
      'soft',
      'base',
      'strong',
      'stronger',
      'text',
      'fixed',
    ]);
  });

  it('maps them to option values', () => {
    expect(toStylingColor('none', undefined)).toEqual({ mode: 'none' });
    expect(toStylingColor('value', undefined)).toEqual({ mode: 'value' });
    expect(toStylingColor('text', undefined)).toEqual({ mode: 'text' });
  });
});

describe('toStylingColor', () => {
  it('maps a choice to the option value', () => {
    expect(toStylingColor('strong', undefined)).toEqual({ mode: 'shade', shade: 'strong' });
    expect(toStylingColor('automatic', { mode: 'shade', shade: 'soft' })).toEqual({ mode: 'automatic' });
    expect(toStylingColor('state', undefined)).toEqual({ mode: 'state' });
  });

  it('a fixed colour keeps the colour picked before, if any', () => {
    expect(toStylingColor('fixed', { mode: 'fixed', fixedColor: 'red' })).toEqual({ mode: 'fixed', fixedColor: 'red' });
    expect(toStylingColor('fixed', { mode: 'shade', shade: 'soft' })).toEqual({ mode: 'fixed', fixedColor: undefined });
  });

  it('clearing unsets the option', () => {
    expect(toStylingColor(undefined, { mode: 'automatic' })).toBeUndefined();
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
