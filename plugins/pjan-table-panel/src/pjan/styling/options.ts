import { type FieldConfigPropertyItem, identityOverrideProcessor } from '@grafana/data';
import { t } from '@grafana/i18n';
import {
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

const NO_FIELD_STYLING: FieldStyling = Object.freeze({});

/**
 * A column's styling field options (`field.config.custom.styling`): one frozen empty object while nothing is set (as
 * State timeline plus), so code that keys a memo on it keeps its value.
 */
export const getFieldStyling = (custom: unknown): FieldStyling =>
  (custom as FieldConfigWithStyling | undefined)?.styling ?? NO_FIELD_STYLING;

type ColorFieldOption<T> = FieldConfigPropertyItem<T, StylingColor | undefined, StylingColorEditorSettings>;

/**
 * A colour field option in core's "Cell options" category, for `.addCustomEditor()` right after Cell type (module.tsx,
 * marked). No `showIf` on the cell type (plan, review M3: Atlas tables keep `auto` in the field defaults and set cell
 * types by override), so each option does nothing on cell types it doesn't apply to and its description says which it
 * applies to. `shouldApply` is core's own for its cell options (a time column can be a coloured cell too). The shared
 * editor in the defaults and in the overrides; a placeholder saying what unset draws; clearable, and a cleared value
 * leaves no key.
 */
function colorFieldOption<T>(
  key: keyof FieldStyling,
  category: string[],
  name: string,
  description: string,
  modes: StylingColorMode[],
  placeholder: string
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
    settings: {
      modes,
      placeholder,
      shadeGroup: t('pjan.table-styling.shade-group', 'Shade of the value color'),
    },
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
      'The text of Colored background cells (with Apply to entire row: the row’s), Pill cells and Colored text cells; other cell types are not changed. Automatic is the first shade of the fill’s hue (on Colored text, of the value’s color) readable on what the text is drawn on: 4.5:1, 3:1 from 24 px or 18.66 px bold, at least 4.2:1 where a shade reaches it. A gradient counts with both of its colors: where no shade reaches 4.2:1 on both, Automatic is the color with the highest contrast on both, which can be as low as about 3.2:1 (use basic mode where the text must be readable). A value, shade or fixed color is drawn as chosen, even where it is unreadable. Not set: Automatic on a Background color; otherwise as Grafana, near-white or near-black by the fill’s brightness, and the value’s color on Colored text'
    ),
    TEXT_COLOR_MODES,
    // As Stat plus's Text color ("Automatic on a background"): unset text is Automatic where the plugin draws the fill
    t('pjan.table-styling.text-color-placeholder', 'Automatic on a Background color, otherwise as Grafana')
  );
