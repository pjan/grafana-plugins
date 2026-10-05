import { type FieldConfigEditorBuilder, FieldType, identityOverrideProcessor } from '@grafana/data';
import { t } from '@grafana/i18n';
import { GraphDrawStyle, GraphGradientMode, VisibilityMode } from '@grafana/schema';
import {
  type StylingColor,
  StylingColorEditor,
  type StylingColorEditorSettings,
  type StylingColorMode,
} from '@pjan/grafana-styling';

/**
 * The colour model's field options (`custom.styling.*`, plan decision 3), per series like core's other Graph styles
 * options. None has a default value: unset draws as core.
 */
export interface SeriesStyling {
  lineColor?: StylingColor;
  fillColor?: StylingColor;
  pointColor?: StylingColor;
}

export const LINE_COLOR_MODES: StylingColorMode[] = ['shade', 'fixed'];
export const FILL_COLOR_MODES: StylingColorMode[] = ['series', 'shade', 'fixed'];
export const POINT_COLOR_MODES: StylingColorMode[] = ['series', 'shade', 'fixed'];

/** The core field options the colour options' visibility depends on (`custom.*`). */
interface GraphStyles {
  drawStyle?: string;
  lineWidth?: number;
  fillOpacity?: number;
  fillBelowTo?: string;
  gradientMode?: string;
  showPoints?: string;
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

function addColorOption<T>(
  builder: FieldConfigEditorBuilder<T>,
  key: keyof SeriesStyling,
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
