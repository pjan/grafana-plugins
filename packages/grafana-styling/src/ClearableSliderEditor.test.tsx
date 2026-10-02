import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { type StandardEditorsRegistryItem } from '@grafana/data';

import { ClearableSliderEditor, type ClearableSliderSettings } from './ClearableSliderEditor';

const renderEditor = (value: number | undefined, settings: ClearableSliderSettings = { min: 0, max: 12, step: 1 }) => {
  const onChange = jest.fn();
  const item = { id: 'cornerRadius', name: 'Corner radius', settings };
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

  it('shows an unset option at its unset value (what the panel draws), or at the minimum', () => {
    renderEditor(undefined, { min: 0, max: 100, step: 1, unsetValue: 20 });
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '20');
  });

  it('shows an unset option at the minimum without an unset value', () => {
    renderEditor(undefined);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '0');
  });

  it('focusing and leaving an unset slider saves nothing (Grafana’s Slider reports its value on blur)', async () => {
    const onChange = renderEditor(undefined, { min: 0, max: 100, step: 1, unsetValue: 20 });
    await userEvent.click(screen.getByRole('textbox'));
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('without an unset value, leaving an unset slider at its minimum saves nothing either', async () => {
    const onChange = renderEditor(undefined);
    await userEvent.click(screen.getByRole('textbox'));
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a different value sets an unset option; the unset value sets an option that is set', async () => {
    const onChange = renderEditor(undefined, { min: 0, max: 100, step: 1, unsetValue: 20 });
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '45');
    expect(onChange).toHaveBeenLastCalledWith(45);

    const onChangeSet = renderEditor(45, { min: 0, max: 100, step: 1, unsetValue: 20 });
    const inputs = screen.getAllByRole('textbox');
    await userEvent.clear(inputs[1]);
    await userEvent.type(inputs[1], '20');
    expect(onChangeSet).toHaveBeenLastCalledWith(20);
  });
});
