import { type FieldConfigEditorBuilder, FieldType, identityOverrideProcessor } from '@grafana/data';
import { t } from '@grafana/i18n';
import { GraphDrawStyle, GraphGradientMode, GraphThresholdsStyleMode, VisibilityMode } from '@grafana/schema';
import {
  ClearableSliderEditor,
  type ClearableSliderSettings,
  type StylingColor,
  StylingColorEditor,
  type StylingColorEditorSettings,
  type StylingColorMode,
} from '@pjan/grafana-styling';
import uPlot from 'uplot';

/**
 * The plugin's field options (`custom.styling.*`, plan decision 3), per series like core's other field options: the
 * colour model's, and the threshold line options. None has a default value: unset draws as core.
 */
export interface SeriesStyling {
  lineColor?: StylingColor;
  fillColor?: StylingColor;
  pointColor?: StylingColor;
  thresholdLineColor?: StylingColor;
  thresholdLineOpacity?: number;
  thresholdLineWidth?: number;
}

export const LINE_COLOR_MODES: StylingColorMode[] = ['shade', 'fixed'];
export const FILL_COLOR_MODES: StylingColorMode[] = ['series', 'shade', 'fixed'];
export const POINT_COLOR_MODES: StylingColorMode[] = ['series', 'shade', 'fixed'];
export const THRESHOLD_LINE_COLOR_MODES: StylingColorMode[] = ['shade', 'fixed'];

/** The core field options the plugin's options' visibility depends on (`custom.*`). */
interface GraphStyles {
  drawStyle?: string;
  lineWidth?: number;
  fillOpacity?: number;
  fillBelowTo?: string;
  gradientMode?: string;
  showPoints?: string;
  thresholdsStyle?: { mode?: string };
}

const drawsLines = (c: GraphStyles) => c.drawStyle !== GraphDrawStyle.Points;
const isScheme = (c: GraphStyles) => c.gradientMode === GraphGradientMode.Scheme;

// Each option shows only where it changes what is drawn. A hidden option is also ignored when drawing
// (seriesColors.ts): a line colour needs a line, a fill colour a fill, a point colour points, and with the Scheme
// gradient Grafana draws the line and the fill from the color scheme.
export const showLineColor = (c: GraphStyles) => drawsLines(c) && (c.lineWidth ?? 1) > 0 && !isScheme(c);
// core fills a fillBelowTo band at 35 when Fill opacity is 0 (TimeSeries/utils.ts)
export const showFillColor = (c: GraphStyles) =>
  drawsLines(c) && ((c.fillOpacity ?? 0) > 0 || Boolean(c.fillBelowTo)) && !isScheme(c);
// The condition of core's Point size
export const showPointColor = (c: GraphStyles) =>
  c.showPoints !== VisibilityMode.Never || c.drawStyle === GraphDrawStyle.Points;
// Show thresholds draws lines (Off, Area and the JSON-only `series` draw none)
const THRESHOLD_LINE_MODES: string[] = [
  GraphThresholdsStyleMode.Line,
  GraphThresholdsStyleMode.Dashed,
  GraphThresholdsStyleMode.LineAndArea,
  GraphThresholdsStyleMode.DashedAndArea,
];
export const showThresholdLines = (c: GraphStyles) => THRESHOLD_LINE_MODES.includes(c.thresholdsStyle?.mode ?? '');

function addColorOption<T>(
  builder: FieldConfigEditorBuilder<T>,
  key: 'lineColor' | 'fillColor' | 'pointColor' | 'thresholdLineColor',
  name: string,
  description: string,
  category: string[],
  settings: StylingColorEditorSettings,
  showIf: (c: GraphStyles) => boolean
) {
  builder.addCustomEditor<StylingColorEditorSettings, StylingColor>({
    id: `styling.${key}`,
    path: `styling.${key}`,
    name,
    description,
    category,
    editor: StylingColorEditor,
    override: StylingColorEditor,
    process: identityOverrideProcessor,
    shouldApply: (field) => field.type !== FieldType.time,
    settings,
    showIf: (c) => showIf(c as GraphStyles),
  });
}

const shadeGroup = () => t('pjan.timeseries-styling.shade-group', 'Shade of the series color');

/** "Line color", registered right after core's "Line width" (a marked line in the copied config.ts). */
export function addLineColorOption<T>(builder: FieldConfigEditorBuilder<T>, category: string[]) {
  addColorOption(
    builder,
    'lineColor',
    t('pjan.timeseries-styling.line-color-name', 'Line color'),
    t(
      'pjan.timeseries-styling.line-color-desc',
      'A shade of the series color (ranked by contrast with the panel background), or a fixed color. The legend and the tooltip show it. Only with colors by series (not a by-value color scheme). Not set: the series color.'
    ),
    category,
    {
      modes: LINE_COLOR_MODES,
      placeholder: t('pjan.timeseries-styling.series-color', 'Series color'),
      shadeGroup: shadeGroup(),
    },
    showLineColor
  );
}

/** "Fill color", registered right after core's "Gradient mode". */
export function addFillColorOption<T>(builder: FieldConfigEditorBuilder<T>, category: string[]) {
  addColorOption(
    builder,
    'fillColor',
    t('pjan.timeseries-styling.fill-color-name', 'Fill color'),
    t(
      'pjan.timeseries-styling.fill-color-desc',
      'The series color, a shade of it, or a fixed color. Fill opacity and the Opacity and Hue gradients apply. Only with colors by series (not a by-value color scheme). Not set: the line color, as Grafana.'
    ),
    category,
    {
      modes: FILL_COLOR_MODES,
      placeholder: t('pjan.timeseries-styling.line-color', 'Line color'),
      shadeGroup: shadeGroup(),
    },
    showFillColor
  );
}

/** "Point color", registered right after core's "Point size". */
export function addPointColorOption<T>(builder: FieldConfigEditorBuilder<T>, category: string[]) {
  addColorOption(
    builder,
    'pointColor',
    t('pjan.timeseries-styling.point-color-name', 'Point color'),
    t(
      'pjan.timeseries-styling.point-color-desc',
      'The series color, a shade of it, or a fixed color. Only with colors by series (not a by-value color scheme). Not set: the line color, as Grafana.'
    ),
    category,
    {
      modes: POINT_COLOR_MODES,
      placeholder: t('pjan.timeseries-styling.line-color', 'Line color'),
      shadeGroup: shadeGroup(),
    },
    showPointColor
  );
}

function addSliderOption<T>(
  builder: FieldConfigEditorBuilder<T>,
  key: 'thresholdLineOpacity' | 'thresholdLineWidth',
  name: string,
  description: string,
  category: string[],
  settings: ClearableSliderSettings,
  showIf: (c: GraphStyles) => boolean
) {
  builder.addCustomEditor<ClearableSliderSettings, number>({
    id: `styling.${key}`,
    path: `styling.${key}`,
    name,
    description,
    category,
    editor: ClearableSliderEditor,
    override: ClearableSliderEditor,
    process: identityOverrideProcessor,
    shouldApply: (field) => field.type !== FieldType.time,
    settings,
    showIf: (c) => showIf(c as GraphStyles),
  });
}

/**
 * Where the width slider shows an unset width: Grafana's 2 canvas pixels in CSS pixels on this screen (2 at pixel
 * ratio 1, 1 at ratio 2), within the slider's range. Read once, when the options are registered.
 */
export const unsetThresholdLineWidth = (pxRatio = uPlot.pxRatio) => Math.min(5, Math.max(1, Math.round(2 / pxRatio)));

/**
 * "Threshold line color", "Threshold line opacity" and "Threshold line width", registered right after core's "Show
 * thresholds" (a marked line in the copied config.ts), in its category. They apply to the lines Grafana draws: those
 * of the first series of each scale that shows thresholds (thresholdLines.ts).
 */
export function addThresholdLineOptions<T>(builder: FieldConfigEditorBuilder<T>, category: string[]) {
  addColorOption(
    builder,
    'thresholdLineColor',
    t('pjan.timeseries-styling.threshold-line-color-name', 'Threshold line color'),
    t(
      'pjan.timeseries-styling.threshold-line-color-desc',
      'A shade of each threshold’s color (ranked by contrast with the panel background), or one fixed color for all lines. Applies to the threshold lines Grafana draws: those of the first series on each axis that shows thresholds (hidden series included). Not set: each threshold’s color, as Grafana.'
    ),
    category,
    {
      modes: THRESHOLD_LINE_COLOR_MODES,
      placeholder: t('pjan.timeseries-styling.threshold-color', 'Threshold color'),
      shadeGroup: t('pjan.timeseries-styling.threshold-shade-group', 'Shade of the threshold color'),
    },
    showThresholdLines
  );
  addSliderOption(
    builder,
    'thresholdLineOpacity',
    t('pjan.timeseries-styling.threshold-line-opacity-name', 'Threshold line opacity'),
    t(
      'pjan.timeseries-styling.threshold-line-opacity-desc',
      'Replaces the line color’s own opacity too. Applies to the threshold lines Grafana draws: those of the first series on each axis that shows thresholds (hidden series included). Lines of a transparent threshold stay hidden. Not set: 70, or the color’s own opacity, as Grafana.'
    ),
    category,
    { min: 0, max: 100, step: 1, unsetValue: 70, unsetIsExact: false },
    showThresholdLines
  );
  addSliderOption(
    builder,
    'thresholdLineWidth',
    t('pjan.timeseries-styling.threshold-line-width-name', 'Threshold line width'),
    t(
      'pjan.timeseries-styling.threshold-line-width-desc',
      'In pixels, as Line width. Dashes keep Grafana’s length. Applies to the threshold lines Grafana draws: those of the first series on each axis that shows thresholds (hidden series included). Not set: 2 device pixels, as Grafana (1 pixel on a high-density screen).'
    ),
    category,
    { min: 1, max: 5, step: 1, unsetValue: unsetThresholdLineWidth(), unsetIsExact: false },
    showThresholdLines
  );
}
