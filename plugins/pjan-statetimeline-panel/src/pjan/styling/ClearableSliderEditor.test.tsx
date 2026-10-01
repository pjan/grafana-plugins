import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { type StandardEditorsRegistryItem } from '@grafana/data';

import { ClearableSliderEditor, type ClearableSliderSettings } from './ClearableSliderEditor';

const renderEditor = (value: number | undefined) => {
  const onChange = jest.fn();
  const item = { id: 'cornerRadius', name: 'Corner radius', settings: { min: 0, max: 12, step: 1 } };
  render(
    <ClearableSliderEditor
      value={value}
      onChange={onChange}
      item={item as StandardEditorsRegistryItem<number | undefined, ClearableSliderSettings>}
      context={{ data: [] }}
    />
  );
  return onChange;
};

describe('ClearableSliderEditor', () => {
  it('has no clear button while unset', () => {
    renderEditor(undefined);
    expect(screen.queryByRole('button', { name: 'Clear value' })).not.toBeInTheDocument();
  });

  it('clearing a value unsets the option', async () => {
    const onChange = renderEditor(4);
    await userEvent.click(screen.getByRole('button', { name: 'Clear value' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
