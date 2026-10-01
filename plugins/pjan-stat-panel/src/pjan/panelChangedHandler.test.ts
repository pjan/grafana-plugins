import { renderHook } from '@testing-library/react';

import {
  FieldColorModeId,
  type FieldConfigSource,
  MappingType,
  type PanelModel,
  ThresholdsMode,
  VizOrientation,
} from '@grafana/data';
import {
  BigValueColorMode,
  BigValueGraphMode,
  BigValueJustifyMode,
  BigValueTextMode,
  PercentChangeColorMode,
} from '@grafana/schema';

import { statPanelChangedHandler } from '../plugins/panel/stat/StatMigrations';
import { type Options } from '../plugins/panel/stat/panelcfg.gen';

import { useApplyFieldConfigChangedInPlace } from './fieldConfigRefresh';
import { panelChangedHandler } from './panelChangedHandler';

const coreOptions = {
  reduceOptions: { values: true, limit: 5, calcs: [], fields: '/.*/' },
  orientation: VizOrientation.Horizontal,
  text: { titleSize: 14, valueSize: 30 },
  textMode: BigValueTextMode.ValueAndName,
  wideLayout: false,
  colorMode: BigValueColorMode.BackgroundSolid,
  graphMode: BigValueGraphMode.None,
  justifyMode: BigValueJustifyMode.Center,
  showPercentChange: true,
  percentChangeColorMode: PercentChangeColorMode.Inverted,
};

const coreFieldConfig = (color: FieldConfigSource['defaults']['color']): FieldConfigSource => ({
  defaults: {
    unit: 'percent',
    color,
    thresholds: { mode: ThresholdsMode.Absolute, steps: [{ value: -Infinity, color: 'green' }] },
    mappings: [{ type: MappingType.ValueToText, options: { '1': { text: 'ok', color: 'green' } } }],
  },
  overrides: [{ matcher: { id: 'byName', options: 'a' }, properties: [{ id: 'unit', value: 'ms' }] }],
});

// What Grafana's panel editor passes after switching: the previous field config with the colour mode adapted by
// getPanelOptionsWithDefaults (anything that is neither by value nor Fixed becomes thresholds for Stat).
const editorPanel = (prev: FieldConfigSource) => ({
  options: {},
  fieldConfig: {
    defaults: { ...prev.defaults, color: { mode: FieldColorModeId.Thresholds } },
    overrides: prev.overrides,
  } as FieldConfigSource,
});

const makePanel = () =>
  ({ options: {}, fieldConfig: { defaults: {}, overrides: [] } }) as unknown as PanelModel<Partial<Options>>;

describe('panelChangedHandler', () => {
  it('keeps every option when switching from the core stat panel', () => {
    const prev = coreFieldConfig({ mode: FieldColorModeId.Thresholds });
    const options = panelChangedHandler(editorPanel(prev), 'stat', coreOptions, prev);

    expect(options).toEqual(coreOptions);
    expect(options).not.toBe(coreOptions);
    expect(options.reduceOptions).not.toBe(coreOptions.reduceOptions);
  });

  it.each([
    { mode: FieldColorModeId.PaletteClassic },
    { mode: FieldColorModeId.PaletteClassicByName },
    { mode: 'shades', fixedColor: 'purple' },
    { mode: FieldColorModeId.Fixed, fixedColor: 'dark-blue' },
    { mode: 'continuous-GrYlRd', seriesBy: 'last' as const },
  ])('restores the colour mode $mode on the panel field config', (color) => {
    const prev = coreFieldConfig(color);
    const panel = editorPanel(prev);

    panelChangedHandler(panel, 'stat', coreOptions, prev);

    expect(panel.fieldConfig.defaults.color).toEqual(color);
    expect(panel.fieldConfig.defaults.color).not.toBe(color);
    expect(panel.fieldConfig.defaults.unit).toBe('percent');
    expect(panel.fieldConfig.overrides).toEqual(prev.overrides);
  });

  it('removes the colour Grafana adapted when core saved none (its default applies)', () => {
    const prev = coreFieldConfig(undefined);
    const panel = editorPanel(prev);

    expect(panelChangedHandler(panel, 'stat', coreOptions, prev)).toEqual(coreOptions);
    expect(panel.fieldConfig.defaults).not.toHaveProperty('color');
    expect(panel.fieldConfig.defaults.unit).toBe('percent');
  });

  it('leaves the field config alone when no previous field config is passed', () => {
    const panel = editorPanel(coreFieldConfig({ mode: FieldColorModeId.PaletteClassic }));
    const onFieldConfigChange = jest.fn();

    expect(panelChangedHandler(panel, 'stat', coreOptions)).toEqual(coreOptions);
    expect(panel.fieldConfig.defaults.color).toEqual({ mode: FieldColorModeId.Thresholds });
    renderHook(() => useApplyFieldConfigChangedInPlace(panel.fieldConfig, onFieldConfigChange));
    expect(onFieldConfigChange).not.toHaveBeenCalled();
  });

  it.each([{ mode: FieldColorModeId.PaletteClassic }, undefined])(
    'has the panel apply its field config again after restoring %o',
    (color) => {
      const prev = coreFieldConfig(color);
      const panel = editorPanel(prev);
      const onFieldConfigChange = jest.fn();

      panelChangedHandler(panel, 'stat', coreOptions, prev);
      const { rerender } = renderHook(() => useApplyFieldConfigChangedInPlace(panel.fieldConfig, onFieldConfigChange));
      rerender();

      expect(onFieldConfigChange).toHaveBeenCalledTimes(1);
      expect(onFieldConfigChange).toHaveBeenCalledWith(panel.fieldConfig);
    }
  );

  it('uses the core handler for any other previous panel type', () => {
    const angular = { angular: { colorBackground: true, sparkline: { show: true }, valueName: 'name' } };

    expect(panelChangedHandler(makePanel(), 'singlestat', angular)).toEqual(
      statPanelChangedHandler(makePanel(), 'singlestat', angular)
    );

    const gauge = {
      reduceOptions: { calcs: ['mean'], values: false },
      orientation: 'vertical',
      showThresholdLabels: true,
    };
    const panel = makePanel();
    expect(panelChangedHandler(panel, 'gauge', gauge, coreFieldConfig({ mode: 'palette-classic' }))).toEqual(
      statPanelChangedHandler(makePanel(), 'gauge', gauge)
    );
    expect(panel.fieldConfig.defaults).toEqual({});
  });
});
