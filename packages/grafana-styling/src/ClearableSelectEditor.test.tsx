import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { type StandardEditorContext, type StandardEditorsRegistryItem } from '@grafana/data';

import { ClearableSelectEditor, type ClearableSelectSettings } from './ClearableSelectEditor';

// The Combobox's clear button is an Icon (an SVG with a title and a click handler): this file's stand-in for the SVG
// keeps them (the package's stand-in, jest/reactInlineSvgMock.tsx, draws an empty SVG)
jest.mock('react-inlinesvg', () => ({
  __esModule: true,
  default: ({ title, onClick }: { title?: string; onClick?: () => void }) => (
    <svg role="img" onClick={onClick}>
      {title && <title>{title}</title>}
    </svg>
  ),
}));

// Grafana's Combobox virtualises its menu and sizes it from the elements' boxes, which are all 0 in jsdom: give them a
// size so the options render (as Grafana's own Combobox tests do, `mockComboboxRect`); its menu also observes its items,
// which jsdom can't
const SIZE = { width: 120, height: 120, top: 0, left: 0, bottom: 120, right: 120, x: 0, y: 0, toJSON: () => ({}) };
const sized = [
  [Element.prototype, 'getBoundingClientRect', { value: () => SIZE }],
  [HTMLElement.prototype, 'offsetWidth', { get: () => SIZE.width }],
  [HTMLElement.prototype, 'offsetHeight', { get: () => SIZE.height }],
] as const;
const originals = sized.map(([target, key]) => Object.getOwnPropertyDescriptor(target, key));
const originalIntersectionObserver = global.IntersectionObserver;

beforeAll(() => {
  for (const [target, key, descriptor] of sized) {
    Object.defineProperty(target, key, { ...descriptor, configurable: true });
  }
  global.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
});

afterAll(() => {
  sized.forEach(([target, key], i) => {
    if (originals[i]) {
      Object.defineProperty(target, key, originals[i]!);
    } else {
      delete (target as unknown as Record<string, unknown>)[key];
    }
  });
  global.IntersectionObserver = originalIntersectionObserver;
});

// Table plus's Text weight: numbers with labels
const WEIGHTS: ClearableSelectSettings<number> = {
  placeholder: 'As Grafana',
  getOptions: () => [
    { value: 400, label: 'Regular (400)' },
    { value: 500, label: 'Medium (500)' },
    { value: 600, label: 'Semibold (600)' },
    { value: 700, label: 'Bold (700)' },
  ],
};

// State timeline plus's Annotation field: strings from the context, a custom value allowed
const FIELDS: ClearableSelectSettings<string> = {
  placeholder: 'tags',
  getOptions: (context) => (context.data ?? []).map((frame) => ({ value: frame.name!, label: frame.name })),
  createCustomValue: true,
};

function renderEditor<T extends string | number>(
  value: T | undefined,
  settings: ClearableSelectSettings<T>,
  context: StandardEditorContext<unknown> = { data: [] }
) {
  const onChange = jest.fn();
  const item = { id: 'option', name: 'Option', settings } as StandardEditorsRegistryItem<
    T | undefined,
    ClearableSelectSettings<T>
  >;
  render(<ClearableSelectEditor<T> value={value} onChange={onChange} item={item} context={context} id="option" />);
  return { onChange, combobox: screen.getByRole('combobox') };
}

describe('ClearableSelectEditor', () => {
  it('unset: empty, showing what an unset option means', () => {
    const { combobox } = renderEditor(undefined, WEIGHTS);
    expect(combobox).toHaveValue('');
    expect(combobox).toHaveAttribute('placeholder', 'As Grafana');
  });

  it('shows the label of a number value', () => {
    expect(renderEditor(600, WEIGHTS).combobox).toHaveValue('Semibold (600)');
  });

  it('a choice saves its value as given: a number stays a number', async () => {
    const { onChange, combobox } = renderEditor(undefined, WEIGHTS);
    await userEvent.click(combobox);
    await userEvent.click(await screen.findByRole('option', { name: 'Bold (700)' }));
    expect(onChange).toHaveBeenCalledWith(700);
  });

  it('clearing unsets the option', async () => {
    const { onChange, combobox } = renderEditor(500, WEIGHTS);
    await userEvent.click(combobox);
    // (Grafana's styles give the input's suffix `pointer-events: none`, which user-event respects: a plain click)
    fireEvent.click(screen.getByTitle('Clear value').closest('svg')!);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('offers the choices of its context, and saves strings', async () => {
    const { onChange, combobox } = renderEditor(undefined, FIELDS, { data: [{ name: 'tags', fields: [], length: 0 }] });
    expect(combobox).toHaveAttribute('placeholder', 'tags');
    await userEvent.click(combobox);
    await userEvent.click(await screen.findByRole('option', { name: 'tags' }));
    expect(onChange).toHaveBeenCalledWith('tags');
  });

  it('a number 0 is a value like any other (not unset)', async () => {
    const zero: ClearableSelectSettings<number> = {
      placeholder: '',
      getOptions: () => [{ value: 0, label: 'None (0)' }],
    };
    const { onChange, combobox } = renderEditor(undefined, zero);
    await userEvent.click(combobox);
    await userEvent.click(await screen.findByRole('option', { name: 'None (0)' }));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('a number option can’t take typed-in values: nothing typed is offered or saved', async () => {
    // createCustomValue is for strings only (a typed value is a string): the type doesn't allow it on numbers
    // @ts-expect-error createCustomValue on number values
    const typed: ClearableSelectSettings<number> = { ...WEIGHTS, createCustomValue: true };
    const { onChange, combobox } = renderEditor(undefined, typed);
    await userEvent.type(combobox, '650');
    expect(screen.queryByRole('option', { name: /^650/ })).not.toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('with createCustomValue, a value typed in is saved', async () => {
    const { onChange, combobox } = renderEditor(undefined, FIELDS);
    await userEvent.type(combobox, 'service');
    await userEvent.click(await screen.findByRole('option', { name: /^service/ }));
    expect(onChange).toHaveBeenCalledWith('service');
  });
});
