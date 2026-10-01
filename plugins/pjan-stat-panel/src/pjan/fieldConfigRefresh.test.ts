import { renderHook } from '@testing-library/react';

import { type FieldConfigSource } from '@grafana/data';

import { markFieldConfigChanged, useApplyFieldConfigChangedInPlace } from './fieldConfigRefresh';

const fieldConfig = (): FieldConfigSource => ({ defaults: { color: { mode: 'palette-classic' } }, overrides: [] });

describe('useApplyFieldConfigChangedInPlace', () => {
  it('applies a field config changed in place once, on the next render after the change', () => {
    const config = fieldConfig();
    const onFieldConfigChange = jest.fn();
    const { rerender } = renderHook(() => useApplyFieldConfigChangedInPlace(config, onFieldConfigChange));
    expect(onFieldConfigChange).not.toHaveBeenCalled();

    // The same object, as the panel-change handler leaves it
    markFieldConfigChanged(config);
    rerender();
    rerender();

    expect(onFieldConfigChange).toHaveBeenCalledTimes(1);
    expect(onFieldConfigChange).toHaveBeenCalledWith(config);
  });

  it('does nothing for a field config that was not changed in place', () => {
    markFieldConfigChanged(fieldConfig());
    const onFieldConfigChange = jest.fn();
    const { rerender } = renderHook(() => useApplyFieldConfigChangedInPlace(fieldConfig(), onFieldConfigChange));
    rerender();

    expect(onFieldConfigChange).not.toHaveBeenCalled();
  });
});
