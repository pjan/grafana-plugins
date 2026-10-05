import { fireEvent, render, screen } from '@testing-library/react';
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

  describe('with unsetIsExact: false (unset only looks like its unset value)', () => {
    const settings = { min: 1, max: 5, step: 1, unsetValue: 2, unsetIsExact: false };

    it('typing the unset value saves it (by default it saves nothing: unset already draws it)', async () => {
      const exact = renderEditor(undefined, { min: 1, max: 5, step: 1, unsetValue: 2 });
      await userEvent.clear(screen.getByRole('textbox'));
      await userEvent.type(screen.getByRole('textbox'), '2');
      expect(exact).not.toHaveBeenCalledWith(2);
      exact.mockClear();

      const notExact = renderEditor(undefined, settings);
      const input = screen.getAllByRole('textbox')[1];
      await userEvent.clear(input);
      await userEvent.type(input, '2');
      expect(notExact).toHaveBeenLastCalledWith(2);
    });

    it('a keyboard pick that ends on the value shown saves it (End on a slider shown at its maximum)', async () => {
      // rc-slider reads the key code; End at the maximum changes nothing, and its key-up ends the change
      const end = (slider: HTMLElement) => {
        fireEvent.keyDown(slider, { key: 'End', keyCode: 35, which: 35 });
        fireEvent.keyUp(slider, { key: 'End', keyCode: 35, which: 35 });
      };
      const exact = renderEditor(undefined, { min: 1, max: 5, step: 1, unsetValue: 5 });
      end(screen.getByRole('slider'));
      expect(exact).not.toHaveBeenCalled();

      const notExact = renderEditor(undefined, { ...settings, unsetValue: 5 });
      end(screen.getAllByRole('slider')[1]);
      expect(notExact).toHaveBeenCalledWith(5);
    });

    it('focusing and leaving the unset slider’s text box still saves nothing', async () => {
      const onChange = renderEditor(undefined, settings);
      await userEvent.click(screen.getByRole('textbox'));
      await userEvent.tab();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('other values set the option as usual', async () => {
      const onChange = renderEditor(undefined, settings);
      const input = screen.getByRole('textbox');
      await userEvent.clear(input);
      await userEvent.type(input, '4');
      expect(onChange).toHaveBeenLastCalledWith(4);
    });
  });
});
