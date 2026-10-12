import {
  type FieldConfigPropertyItem,
  identityOverrideProcessor,
  type PanelOptionsEditorConfig,
  type SelectFieldConfigSettings,
} from '@grafana/data';
import { t } from '@grafana/i18n';
import { config } from '@grafana/runtime';
import {
  ClearableSelectEditor,
  type ClearableSelectSettings,
  ClearableSliderEditor,
  type ClearableSliderSettings,
  type StylingColor,
  StylingColorEditor,
  type StylingColorEditorSettings,
  type StylingColorMode,
} from '@pjan/grafana-styling';

/**
 * The plugin's field options (plan decision 6): per column, under one object, `custom.styling` (override ids
 * `custom.styling.<key>`), the same key for the same meaning as in the other plus plugins. None has a default value:
 * unset draws as core, and a table that never uses them saves none.
 */
export interface FieldStyling {
  backgroundColor?: StylingColor;
  textColor?: StylingColor;
  /** Colored text, Colored background and Pill cells: one of TEXT_WEIGHTS */
  textWeight?: number;
  /** Pill cells (plan decision 10): the pill's fill, State timeline plus's key for a box's fill */
  fillColor?: StylingColor;
  /** Pill cells: a line inside the pill's edge, State timeline plus's key for a box's line */
  lineColor?: StylingColor;
  /** Pill cells: the line's width in CSS pixels, 1 to MAX_PILL_LINE_WIDTH */
  lineWidth?: number;
  /** Pill cells: in CSS pixels, 0 to MAX_PILL_CORNER_RADIUS (State timeline plus's key, a panel option there) */
  cornerRadius?: number;
  /** Gauge cells: the bar, a shade (per colour stop in gradient and LCD gauges) or Fixed (the basic gauge only) */
  gaugeColor?: StylingColor;
}

export interface FieldConfigWithStyling {
  styling?: FieldStyling;
}

/**
 * Background color's modes: a shade or a fixed colour. Value is core's own fill, so unset; None isn't needed (Colored
 * background without a fill is another cell type).
 */
export const BACKGROUND_COLOR_MODES: StylingColorMode[] = ['shade', 'fixed'];
/** Text color's modes, in the editor's order: Stat plus's Text color. */
export const TEXT_COLOR_MODES: StylingColorMode[] = ['automatic', 'value', 'shade', 'fixed'];
/** Pill fill color's modes: a shade or a fixed colour (Value is core's own fill, so unset), as Background color. */
export const PILL_FILL_COLOR_MODES: StylingColorMode[] = ['shade', 'fixed'];
/** Pill line color's modes: a shade or a fixed colour, as State timeline plus's Line color. */
export const PILL_LINE_COLOR_MODES: StylingColorMode[] = ['shade', 'fixed'];
/**
 * Gauge color's modes: a shade or a fixed colour. Value is core's own bar, so unset; Automatic and None don't apply to
 * a bar.
 */
export const GAUGE_COLOR_MODES: StylingColorMode[] = ['shade', 'fixed'];
/** Pill line width's range, in CSS pixels. */
export const MIN_PILL_LINE_WIDTH = 1;
// 3: the line is drawn inside the 22 px pill; at 4 px it touches the descenders of its 12 px text, at 5 px it crosses
// them (measured, UPSTREAM.md "Plugin addition: pill options and Look", pjan 2026-10-12)
export const MAX_PILL_LINE_WIDTH = 3;
/** Pill corner radius's range, in CSS pixels (State timeline plus's Corner radius: 0 to 12). */
export const MAX_PILL_CORNER_RADIUS = 12;

/**
 * Text weight's values, saved as numbers: Grafana's theme calls 500 "bold" (`fontWeightBold`, the same as
 * `fontWeightMedium`), so the values are explicit rather than names.
 */
// No 700: Grafana 13.2.3 ships Inter at 400 and 500 only, so 600 and 700 both draw as an emboldened Medium (500), the
// same pixels. A weight added later (when Grafana ships the faces) is harmless; one removed later would unset every
// panel that saved it (pjan, 2026-10-12).
export const TEXT_WEIGHTS = [400, 500, 600] as const;
export type TextWeight = (typeof TEXT_WEIGHTS)[number];

const NO_FIELD_STYLING: FieldStyling = Object.freeze({});

/**
 * A column's styling field options (`field.config.custom.styling`): one frozen empty object while nothing is set (as
 * State timeline plus), so code that keys a memo on it keeps its value.
 */
export const getFieldStyling = (custom: unknown): FieldStyling =>
  (custom as FieldConfigWithStyling | undefined)?.styling ?? NO_FIELD_STYLING;

/**
 * A number option of the styling: undefined unless it is a finite number in its range (out of range, or not a number,
 * counts as unset; Stat plus's rule).
 */
export const validNumber = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined;

/** A Text weight: one of the three values (TEXT_WEIGHTS), otherwise undefined (anything else counts as unset). */
export const validTextWeight = (value: unknown): TextWeight | undefined =>
  (TEXT_WEIGHTS as readonly unknown[]).includes(value) ? (value as TextWeight) : undefined;

type ColorFieldOption<T> = FieldConfigPropertyItem<T, StylingColor | undefined, StylingColorEditorSettings>;
type SliderFieldOption<T> = FieldConfigPropertyItem<T, number | undefined, ClearableSliderSettings>;

/**
 * A field option in core's "Cell options" category, for `.addCustomEditor()` right after Cell type (module.tsx,
 * marked). No `showIf` on the cell type (plan, review M3: Atlas tables keep `auto` in the field defaults and set cell
 * types by override), so each option does nothing on cell types it doesn't apply to and its description says which it
 * applies to. `shouldApply` is core's own for its cell options (a time column can be a coloured cell too). The shared
 * editor in the defaults and in the overrides; a placeholder saying what unset draws; clearable, and a cleared value
 * leaves no key.
 */
function colorFieldOption<T>(
  key: 'backgroundColor' | 'textColor' | 'fillColor' | 'lineColor' | 'gaugeColor',
  category: string[],
  name: string,
  description: string,
  modes: StylingColorMode[],
  placeholder: string,
  shadeGroup = t('pjan.table-styling.shade-group', 'Shade of the value color')
): ColorFieldOption<T> {
  return {
    id: `styling.${key}`,
    path: `styling.${key}`,
    name,
    description,
    category,
    editor: StylingColorEditor,
    override: StylingColorEditor,
    process: identityOverrideProcessor,
    shouldApply: () => true,
    settings: { modes, placeholder, shadeGroup },
  };
}

/** A clearable slider field option, as `colorFieldOption` otherwise. */
function sliderFieldOption<T>(
  key: 'lineWidth' | 'cornerRadius',
  category: string[],
  name: string,
  description: string,
  settings: ClearableSliderSettings
): SliderFieldOption<T> {
  return {
    id: `styling.${key}`,
    path: `styling.${key}`,
    name,
    description,
    category,
    editor: ClearableSliderEditor,
    override: ClearableSliderEditor,
    process: identityOverrideProcessor,
    shouldApply: () => true,
    settings,
  };
}

/**
 * "Background color" (`custom.styling.backgroundColor`, Stat plus's key and meaning), right after Cell type and before
 * Text color. Colored background cells only (pills get their own Pill fill color, plan decision 10).
 */
export const backgroundColorFieldOption = <T>(category: string[]): ColorFieldOption<T> =>
  colorFieldOption<T>(
    'backgroundColor',
    category,
    t('pjan.table-styling.background-color-name', 'Background color'),
    t(
      'pjan.table-styling.background-color-desc',
      'The fill of Colored background cells (with Apply to entire row: the row’s); other cell types are not changed. A shade of the value’s color (ranked by contrast with the panel background; from a continuous color scheme, the scheme’s colors in that shade) or a fixed color, drawn as chosen. In gradient mode a shade keeps the gradient, built from the shaded color; Fixed applies to basic mode only and is ignored in gradient mode. With it, Text color not set is Automatic on it. Not set: as Grafana, the value’s color, solid or as a gradient'
    ),
    BACKGROUND_COLOR_MODES,
    t('pjan.table-styling.as-grafana', 'As Grafana')
  );

/** "Text color" (`custom.styling.textColor`, Stat plus's key and meaning), right after Background color. */
export const textColorFieldOption = <T>(category: string[]): ColorFieldOption<T> =>
  colorFieldOption<T>(
    'textColor',
    category,
    t('pjan.table-styling.text-color-name', 'Text color'),
    t(
      'pjan.table-styling.text-color-desc',
      'The text of Colored background cells (with Apply to entire row: the row’s), Pill cells and Colored text cells; other cell types are not changed. Automatic is the first shade of the fill’s hue (on Colored text, of the value’s color) readable on what the text is drawn on: 4.5:1, 3:1 from 24 px or 18.66 px bold, at least 4.2:1 where a shade reaches it. A gradient counts with both of its colors: where no shade reaches 4.2:1 on both, Automatic is the color with the highest contrast on both, which can be as low as about 3.2:1 (use basic mode where the text must be readable). A value, shade or fixed color is drawn as chosen, even where it is unreadable. Not set: Automatic on a Background color, on a Pill fill color and with the Pill look; otherwise as Grafana, near-white or near-black by the fill’s brightness, and the value’s color on Colored text'
    ),
    TEXT_COLOR_MODES,
    // As Stat plus's Text color ("Automatic on a background"): unset text is Automatic where the plugin draws the fill
    t(
      'pjan.table-styling.text-color-placeholder',
      'Automatic on a Background or Pill fill color or the Pill look, otherwise as Grafana'
    )
  );

/** Text weight's choices: the numbers saved, with their names (Grafana's "bold" is 500). */
export const getTextWeightOptions = () => [
  { value: 400, label: t('pjan.table-styling.text-weight-400', 'Regular (400)') },
  {
    value: 500,
    label: t('pjan.table-styling.text-weight-500', 'Medium (500)'),
    description: t('pjan.table-styling.text-weight-500-desc', 'What Grafana’s theme calls bold'),
  },
  {
    value: 600,
    label: t('pjan.table-styling.text-weight-600', 'Semibold (600)'),
    description: t(
      'pjan.table-styling.text-weight-600-desc',
      'Grafana ships its font at 400 and 500 only: drawn as an emboldened Medium'
    ),
  },
];

/**
 * "Text weight" (`custom.styling.textWeight`), right after Text color: the shared clearable select, numbers saved, no
 * default. Colored text, Colored background and Pill cells only (src/pjan/styling/textWeight.ts).
 */
export const textWeightFieldOption = <T>(
  category: string[]
): FieldConfigPropertyItem<T, number | undefined, ClearableSelectSettings<number>> => ({
  id: 'styling.textWeight',
  path: 'styling.textWeight',
  name: t('pjan.table-styling.text-weight-name', 'Text weight'),
  description: t(
    'pjan.table-styling.text-weight-desc',
    'The weight of the text of Colored text, Colored background and Pill cells (with Apply to entire row: of the column’s own cells, not the row’s); other cell types are not changed. Wrapped text is measured at it, so rows grow to fit. Automatic text is measured at it too (at table sizes it needs the same contrast at every weight). Not set: as Grafana, regular (400)'
  ),
  category,
  editor: ClearableSelectEditor<number>,
  override: ClearableSelectEditor<number>,
  process: identityOverrideProcessor,
  shouldApply: () => true,
  settings: {
    placeholder: t('pjan.table-styling.as-grafana', 'As Grafana'),
    getOptions: getTextWeightOptions,
  },
});

const pillShadeGroup = () => t('pjan.table-styling.pill-shade-group', 'Shade of the pill color');

/**
 * "Pill fill color" (`custom.styling.fillColor`, State timeline plus's key for a box's fill), right after Text color.
 * Pill cells only (plan decision 10).
 */
export const pillFillColorFieldOption = <T>(category: string[]): ColorFieldOption<T> =>
  colorFieldOption<T>(
    'fillColor',
    category,
    t('pjan.table-styling.pill-fill-color-name', 'Pill fill color'),
    t(
      'pjan.table-styling.pill-fill-color-desc',
      'The fill of the pills of Pill cells; other cell types are not changed. A shade of the pill’s color (ranked by contrast with the panel background; a color without a name takes its nearest hue’s shades, and stays as it is without one) or a fixed color. With it, Text color not set is Automatic on it. Not set: the Pill look’s Softer shade; otherwise as Grafana: the pill’s color from its value mapping, the fixed color, or a palette color picked by the value'
    ),
    PILL_FILL_COLOR_MODES,
    t('pjan.table-styling.as-grafana', 'As Grafana'),
    pillShadeGroup()
  );

/** "Pill line color" (`custom.styling.lineColor`, State timeline plus's key for a box's line), after Pill fill color. */
export const pillLineColorFieldOption = <T>(category: string[]): ColorFieldOption<T> =>
  colorFieldOption<T>(
    'lineColor',
    category,
    t('pjan.table-styling.pill-line-color-name', 'Pill line color'),
    t(
      'pjan.table-styling.pill-line-color-desc',
      'A line inside the edge of the pills of Pill cells, 1 px unless Pill line width is set; other cell types are not changed. A shade of the pill’s color (without a hue: the pill’s color) or a fixed color. On a transparent pill it replaces Grafana’s border. Not set: the Pill look’s Base shade; otherwise no line, or with a Pill line width the pill’s color'
    ),
    PILL_LINE_COLOR_MODES,
    t('pjan.table-styling.pill-color', 'Pill color'),
    pillShadeGroup()
  );

/**
 * Where an unset slider shows: what unset draws, read once when the options are registered. A line width only looks
 * like 1 there (unset draws no line unless a Pill line color or the Pill look asks for one), and the corner radius
 * follows the theme, so both are values of their own (`unsetIsExact: false`, the Time series plus lesson).
 */
export const UNSET_PILL_LINE_WIDTH = MIN_PILL_LINE_WIDTH;

/** The theme's default radius (Grafana's pills use `shape.radius.default`, 6 px in its themes), within the range. */
export function unsetPillCornerRadius(radius: string = config.theme2.shape.radius.default): number {
  const px = parseFloat(radius);
  return Number.isFinite(px) ? Math.min(MAX_PILL_CORNER_RADIUS, Math.max(0, px)) : 0;
}

/** "Pill line width" (`custom.styling.lineWidth`), after Pill line color. */
export const pillLineWidthFieldOption = <T>(category: string[]): SliderFieldOption<T> =>
  sliderFieldOption<T>(
    'lineWidth',
    category,
    t('pjan.table-styling.pill-line-width-name', 'Pill line width'),
    t(
      'pjan.table-styling.pill-line-width-desc',
      'The width of the line inside the edge of the pills of Pill cells, in pixels (1–3); other cell types are not changed. Set without a Pill line color, the line is the pill’s color (on a transparent pill, Grafana’s border color). Not set: 1 px with a Pill line color or the Pill look; otherwise no line, as Grafana'
    ),
    {
      min: MIN_PILL_LINE_WIDTH,
      max: MAX_PILL_LINE_WIDTH,
      step: 1,
      unsetValue: UNSET_PILL_LINE_WIDTH,
      unsetIsExact: false,
    }
  );

/** "Pill corner radius" (`custom.styling.cornerRadius`, State timeline plus's key), after Pill line width. */
export const pillCornerRadiusFieldOption = <T>(category: string[]): SliderFieldOption<T> =>
  sliderFieldOption<T>(
    'cornerRadius',
    category,
    t('pjan.table-styling.pill-corner-radius-name', 'Pill corner radius'),
    t(
      'pjan.table-styling.pill-corner-radius-desc',
      'Rounds the pills of Pill cells, in pixels (a radius of half the pill’s height or more gives round ends); other cell types are not changed. Not set: as Grafana, the theme’s default radius'
    ),
    {
      min: 0,
      max: MAX_PILL_CORNER_RADIUS,
      step: 1,
      unsetValue: unsetPillCornerRadius(),
      unsetIsExact: false,
    }
  );

/**
 * "Gauge color" (`custom.styling.gaugeColor`), after Pill corner radius: the last of the plugin's field options, as it
 * is the only one for Gauge cells (the Pill-only options before it). Gauge cells only.
 */
export const gaugeColorFieldOption = <T>(category: string[]): ColorFieldOption<T> =>
  colorFieldOption<T>(
    'gaugeColor',
    category,
    t('pjan.table-styling.gauge-color-name', 'Gauge color'),
    t(
      'pjan.table-styling.gauge-color-desc',
      'The bar of Gauge cells; other cell types are not changed. A shade of the value’s color (ranked by contrast with the panel background): the basic gauge’s bar in that shade; gradient and LCD gauges take it per color stop: each threshold’s color, a continuous color scheme’s colors and each LCD cell in that shade of its own hue (a color without a name: of its nearest hue; without a hue, the color itself), so the bar keeps its transition. The value, in Value color, follows the bar. Fixed: one color for the bar; it applies to the basic gauge only and is ignored in gradient and LCD gauges. A value without a color or with a transparent one (such as a mapping to transparent for no limit) keeps Grafana’s invisible bar, with a shade and with Fixed. Not set: as Grafana, the value’s color, and in gradient and LCD gauges the thresholds’ or the color scheme’s colors'
    ),
    GAUGE_COLOR_MODES,
    t('pjan.table-styling.as-grafana', 'As Grafana')
  );

/** Look (`options.styling.look`): State timeline plus's key, values and meaning. Unset is `grafana`. */
export type TableLook = 'grafana' | 'pill';

/** The panel options of the styling (plugin-only), under one top-level object `options.styling`. */
export interface TableStylingOptions {
  look?: TableLook;
}

/** The panel's look, from its options; undefined when not set. */
export const getTableLook = (options: unknown): TableLook | undefined =>
  (options as { styling?: TableStylingOptions } | undefined)?.styling?.look;

/**
 * "Look" (`options.styling.look`), the plugin's panel option, in the panel's "Table" category after core's options
 * (module.tsx, marked, as State timeline plus registers its Look after core's options): State timeline plus's radio,
 * with its key, values and meaning; no default (unset draws as Grafana, and a panel that never uses it saves nothing).
 */
export function lookPanelOption<O>(
  category: string[]
): PanelOptionsEditorConfig<O, SelectFieldConfigSettings<TableLook>, TableLook> {
  return {
    path: 'styling.look',
    name: t('pjan.table-styling.look-name', 'Look'),
    description: t(
      'pjan.table-styling.look-desc',
      'Pill cells only. Pill: the softest shade of each pill’s color as fill, a 1 px line in its base shade, and the text in Automatic (the first readable shade of the fill’s hue), as State timeline plus’s Pill look. A look only sets the pill options left unset: a Pill fill color, Pill line color, Pill line width or Text color of a column wins. It sets no corner radius. Not set: as Grafana'
    ),
    category,
    settings: {
      options: [
        { value: 'grafana', label: t('pjan.table-styling.look-grafana', 'Grafana') },
        { value: 'pill', label: t('pjan.table-styling.look-pill', 'Pill') },
      ],
    },
  };
}
