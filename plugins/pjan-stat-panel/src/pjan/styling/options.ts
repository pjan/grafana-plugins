import {
  type FieldConfigEditorBuilder,
  FieldType,
  identityOverrideProcessor,
  type PanelOptionsEditorItem,
  type SelectableValue,
} from '@grafana/data';
import { t } from '@grafana/i18n';
import { BigValueColorMode, BigValueGraphMode } from '@grafana/schema';
import {
  ClearableSliderEditor,
  type ClearableSliderSettings,
  type StylingColor,
  StylingColorEditor,
  type StylingColorEditorSettings,
  type StylingColorMode,
} from '@pjan/grafana-styling';

/**
 * Color mode "Custom" (plugin-only): core's Color mode select gets a fifth choice. Only with it do the styling options
 * below apply; with every core mode the panel draws as core.
 */
export const CUSTOM_COLOR_MODE = 'custom';

/**
 * The styling settings, the same keys as panel options (`options.styling.*`) and as field options (`custom.*`, only
 * in the overrides menu). None has a default value: unset is what Custom draws without it (like core's Value mode).
 * The field option names don't reuse the time series' `custom` keys (`fillColor`, `lineColor`, `lineWidth`,
 * `fillOpacity`), which mean something else there.
 */
export interface StatStyling {
  backgroundColor?: StylingColor;
  textColor?: StylingColor;
  sparklineColor?: StylingColor;
  /** 0–100; unset: opaque */
  sparklineLineOpacity?: number;
  /** 0–100; unset: 20 (core's Value mode) */
  sparklineFillOpacity?: number;
  /** 1–5; unset: 1 */
  sparklineLineWidth?: number;
}

export type StatStylingKey = keyof StatStyling;

export interface OptionsWithStyling {
  colorMode?: string;
  graphMode?: string;
  styling?: StatStyling;
}

export const BACKGROUND_COLOR_MODES: StylingColorMode[] = ['none', 'value', 'shade', 'fixed'];
export const TEXT_COLOR_MODES: StylingColorMode[] = ['contrast', 'value', 'shade', 'fixed'];
export const SPARKLINE_COLOR_MODES: StylingColorMode[] = ['value', 'shade', 'text', 'fixed'];

export const UNSET_SPARKLINE_LINE_OPACITY = 100;
export const UNSET_SPARKLINE_FILL_OPACITY = 20;
export const UNSET_SPARKLINE_LINE_WIDTH = 1;

const getCategory = () => [t('stat.category-stat-styles', 'Stat styles')];
const notTime = (field: { type: FieldType }) => field.type !== FieldType.time;

const isCustom = (options: OptionsWithStyling) => options.colorMode === CUSTOM_COLOR_MODE;
const hasSparkline = (options: OptionsWithStyling) => isCustom(options) && options.graphMode === BigValueGraphMode.Area;

/** The "Custom" choice of core's Color mode select, after core's four. */
export function getCustomColorModeOption(): SelectableValue<BigValueColorMode> {
  return {
    value: CUSTOM_COLOR_MODE as BigValueColorMode,
    label: t('pjan.stat-styling.color-mode-custom', 'Custom'),
    description: t(
      'pjan.stat-styling.color-mode-custom-desc',
      'Choose the background, text and sparkline colors. Nothing else set: as Value'
    ),
  };
}

interface Setting {
  key: StatStylingKey;
  name: string;
  description: string;
  editor: typeof StylingColorEditor | typeof ClearableSliderEditor;
  settings: StylingColorEditorSettings | ClearableSliderSettings;
}

const backgroundSetting = (): Setting => ({
  key: 'backgroundColor',
  name: t('pjan.stat-styling.background-color-name', 'Background color'),
  description: t(
    'pjan.stat-styling.background-color-desc',
    'The tile’s fill: none, the value’s color, a shade of it (ranked by contrast with the panel background), or a fixed color'
  ),
  editor: StylingColorEditor,
  settings: { modes: BACKGROUND_COLOR_MODES, placeholder: t('pjan.stat-styling.none', 'None') },
});

const textSetting = (): Setting => ({
  key: 'textColor',
  name: t('pjan.stat-styling.text-color-name', 'Text color'),
  description: t(
    'pjan.stat-styling.text-color-desc',
    'The value and the name. Each needs a contrast of 4.5:1 (3:1 from 24 px, or 18.66 px bold) with what it is drawn on; otherwise best contrast. Not set: the value’s color, or Grafana’s text color on a background'
  ),
  editor: StylingColorEditor,
  settings: { modes: TEXT_COLOR_MODES, placeholder: t('pjan.stat-styling.text-color-placeholder', 'As Grafana') },
});

const sparklineSettings = (): Setting[] => [
  {
    key: 'sparklineColor',
    name: t('pjan.stat-styling.sparkline-color-name', 'Sparkline color'),
    description: t(
      'pjan.stat-styling.sparkline-color-desc',
      'The value’s color, a shade of it, the text color, or a fixed color. Not set: the value’s color, or on a background a lighter tile color, as Grafana'
    ),
    editor: StylingColorEditor,
    settings: { modes: SPARKLINE_COLOR_MODES, placeholder: t('pjan.stat-styling.as-grafana', 'As Grafana') },
  },
  {
    key: 'sparklineLineOpacity',
    name: t('pjan.stat-styling.sparkline-line-opacity-name', 'Sparkline line opacity'),
    description: t('pjan.stat-styling.sparkline-line-opacity-desc', 'Not set: opaque'),
    editor: ClearableSliderEditor,
    settings: { min: 0, max: 100, step: 1, unsetValue: UNSET_SPARKLINE_LINE_OPACITY },
  },
  {
    key: 'sparklineFillOpacity',
    name: t('pjan.stat-styling.sparkline-fill-opacity-name', 'Sparkline fill opacity'),
    description: t(
      'pjan.stat-styling.sparkline-fill-opacity-desc',
      'The line’s color at this opacity. Not set: 20, or white at 40 on a background, as Grafana'
    ),
    editor: ClearableSliderEditor,
    settings: { min: 0, max: 100, step: 1, unsetValue: UNSET_SPARKLINE_FILL_OPACITY },
  },
  {
    key: 'sparklineLineWidth',
    name: t('pjan.stat-styling.sparkline-line-width-name', 'Sparkline line width'),
    description: t('pjan.stat-styling.sparkline-line-width-desc', 'Not set: 1'),
    editor: ClearableSliderEditor,
    settings: { min: 1, max: 5, step: 1, unsetValue: UNSET_SPARKLINE_LINE_WIDTH },
  },
];

function panelOption<T>(setting: Setting, showIf: (options: OptionsWithStyling) => boolean): PanelOptionsEditorItem<T> {
  return {
    id: `styling.${setting.key}`,
    path: `styling.${setting.key}`,
    name: setting.name,
    description: setting.description,
    category: getCategory(),
    editor: setting.editor as never,
    settings: setting.settings,
    showIf: (options) => showIf(options as OptionsWithStyling),
  };
}

// The panel options, one function each, so they chain into core's builder calls in module.tsx without changing them:
// Background color and Text color right after Color mode (only with Custom), the four sparkline options right after
// Graph mode (only with Custom and Graph mode Area).
export const backgroundColorOption = <T>() => panelOption<T>(backgroundSetting(), isCustom);
export const textColorOption = <T>() => panelOption<T>(textSetting(), isCustom);
export const sparklineColorOption = <T>() => panelOption<T>(sparklineSettings()[0], hasSparkline);
export const sparklineLineOpacityOption = <T>() => panelOption<T>(sparklineSettings()[1], hasSparkline);
export const sparklineFillOpacityOption = <T>() => panelOption<T>(sparklineSettings()[2], hasSparkline);
export const sparklineLineWidthOption = <T>() => panelOption<T>(sparklineSettings()[3], hasSparkline);

/**
 * The same settings as field options (`custom.*`), for one series: hidden from the field defaults, so they only show
 * in the overrides menu. They apply only with Color mode Custom.
 */
export function addStylingFieldConfig<T>(builder: FieldConfigEditorBuilder<T>) {
  const customOnly = t('pjan.stat-styling.custom-only', '(Color mode Custom only)');
  for (const setting of [backgroundSetting(), textSetting(), ...sparklineSettings()]) {
    builder.addCustomEditor({
      id: setting.key,
      path: setting.key,
      name: setting.name,
      // The overrides menu doesn't show the panel's Color mode: say when the setting applies
      description: `${setting.description} ${customOnly}`,
      category: getCategory(),
      editor: setting.editor as never,
      override: setting.editor as never,
      process: identityOverrideProcessor,
      shouldApply: notTime,
      settings: setting.settings,
      hideFromDefaults: true,
    });
  }
}

export const isCustomColorMode = (colorMode: unknown) => colorMode === CUSTOM_COLOR_MODE;

/** Not a core mode: used to tell the copied BigValueLayout apart. */
export const CUSTOM_BIG_VALUE_COLOR_MODE = CUSTOM_COLOR_MODE as BigValueColorMode;
