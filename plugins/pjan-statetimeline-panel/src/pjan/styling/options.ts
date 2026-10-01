import {
  type FieldConfigEditorBuilder,
  FieldType,
  identityOverrideProcessor,
  type PanelOptionsEditorBuilder,
} from '@grafana/data';
import { t } from '@grafana/i18n';
import { VisibilityMode } from '@grafana/schema';

import {
  RowAnnotationsComboboxEditor,
  type RowAnnotationsComboboxSettings,
} from '../rowAnnotations/RowAnnotationsComboboxEditor';

import { ClearableSliderEditor, type ClearableSliderSettings } from './ClearableSliderEditor';
import { RELATIVE_SHADES, type RelativeShade } from './shades';
import { StylingColorEditor, type StylingColorEditorSettings } from './StylingColorEditor';

export type TimelineLook = 'grafana' | 'pill';
export type ValueOverflow = 'truncate' | 'hide';

/**
 * Panel options of the styling (plugin-only, not in core's state timeline), under one top-level `styling` object.
 * None has a default value: unset is core's look, and a panel that never used them saves none.
 */
export interface TimelineStylingOptions {
  /** Unset is `grafana` */
  look?: TimelineLook;
  /** In CSS pixels; unset or 0: square boxes, as core */
  cornerRadius?: number;
  /** Unset is `truncate` (core), unless the look sets it */
  valueOverflow?: ValueOverflow;
  gridColor?: string;
  axisTextColor?: string;
  dayBoundaries?: boolean;
  dayBoundaryColor?: string;
}

export interface OptionsWithStyling {
  styling?: TimelineStylingOptions;
}

/**
 * - `shade`: a relative shade of the state colour (`shade`);
 * - `fixed`: a colour from Grafana's colour picker (`fixedColor`);
 * - `contrast`: black or white, whichever contrasts more with the box (value text only);
 * - `state`: the row's current state colour (row names only).
 */
export type StylingColorMode = 'shade' | 'fixed' | 'contrast' | 'state';

/** A colour option of the styling. Like Grafana's own field colour, a mode and what that mode needs. */
export interface StylingColor {
  mode: StylingColorMode;
  shade?: RelativeShade;
  fixedColor?: string;
}

/** Field options of the styling (custom field config), set per row with overrides. */
export interface FieldConfigWithStyling {
  fillColor?: StylingColor;
  lineColor?: StylingColor;
  valueColor?: StylingColor;
  rowNameColor?: StylingColor;
}

export const FILL_COLOR_MODES: StylingColorMode[] = ['shade'];
export const LINE_COLOR_MODES: StylingColorMode[] = ['shade', 'fixed'];
export const VALUE_COLOR_MODES: StylingColorMode[] = ['contrast', 'shade', 'fixed'];
export const ROW_NAME_COLOR_MODES: StylingColorMode[] = ['state', 'fixed'];

const NO_STYLING: TimelineStylingOptions = Object.freeze({});

/** The panel's styling options; the same object while they don't change, so it can be a memo dependency. */
export const getStylingOptions = (options: unknown): TimelineStylingOptions =>
  (options as OptionsWithStyling | undefined)?.styling ?? NO_STYLING;

/**
 * The option if it is complete and one of the allowed modes; otherwise undefined, which counts as unset. The editor
 * saves `{ mode: 'fixed' }` until a colour is picked, for example.
 */
export function getStylingColor(value: unknown, modes: StylingColorMode[]): StylingColor | undefined {
  const color = value as StylingColor | undefined;
  if (!color || !modes.includes(color.mode)) {
    return undefined;
  }
  switch (color.mode) {
    case 'shade':
      return color.shade && RELATIVE_SHADES.includes(color.shade) ? color : undefined;
    case 'fixed':
      return color.fixedColor ? color : undefined;
    default:
      return color;
  }
}

const getCategory = () => [t('state-timeline.category-state-timeline', 'State timeline')];
const notTime = (field: { type: FieldType }) => field.type !== FieldType.time;

function addStylingColorFieldConfig<T>(
  builder: FieldConfigEditorBuilder<T>,
  path: keyof FieldConfigWithStyling,
  name: string,
  description: string,
  settings: StylingColorEditorSettings
) {
  builder.addCustomEditor<StylingColorEditorSettings, StylingColor>({
    id: path,
    path,
    name,
    description,
    category: getCategory(),
    editor: StylingColorEditor,
    override: StylingColorEditor,
    process: identityOverrideProcessor,
    shouldApply: notTime,
    settings,
  });
}

/** "Line color", registered right after core's "Line width". */
export function addLineColorFieldConfig<T>(builder: FieldConfigEditorBuilder<T>) {
  addStylingColorFieldConfig(
    builder,
    'lineColor',
    t('pjan.styling.line-color-name', 'Line color'),
    t(
      'pjan.styling.line-color-desc',
      'A shade of the state color, or a fixed color. Drawn when Line width is set, or with the Pill look'
    ),
    { modes: LINE_COLOR_MODES, placeholder: t('pjan.styling.state-color', 'State color') }
  );
}

/** "Fill color", "Value color" and "Row name color", registered right after core's "Fill opacity". */
export function addFillAndTextColorFieldConfig<T>(builder: FieldConfigEditorBuilder<T>) {
  addStylingColorFieldConfig(
    builder,
    'fillColor',
    t('pjan.styling.fill-color-name', 'Fill color'),
    t('pjan.styling.fill-color-desc', 'A shade of the state color, ranked by contrast with the panel background'),
    { modes: FILL_COLOR_MODES, placeholder: t('pjan.styling.state-color', 'State color') }
  );
  addStylingColorFieldConfig(
    builder,
    'valueColor',
    t('pjan.styling.value-color-name', 'Value color'),
    t(
      'pjan.styling.value-color-desc',
      'Best contrast is black or white. A shade or a fixed color needs a contrast of 4.5:1 with the box; otherwise best contrast is used'
    ),
    { modes: VALUE_COLOR_MODES, placeholder: t('pjan.styling.value-color-placeholder', 'Automatic') }
  );
  addStylingColorFieldConfig(
    builder,
    'rowNameColor',
    t('pjan.styling.row-name-color-name', 'Row name color'),
    t(
      'pjan.styling.row-name-color-desc',
      'A fixed color, or the color of the row’s current state: its last value in the time range, in the softest shade with a contrast of 4.5:1 with the panel background'
    ),
    { modes: ROW_NAME_COLOR_MODES, placeholder: t('pjan.styling.text-color', 'Text color') }
  );
}

/**
 * "Value overflow", registered right after core's "Show values". A clearable select rather than a radio: unset follows
 * the look (truncate, or hide with Pill), and clearing it goes back to that.
 */
export function addValueOverflowOption<T>(builder: PanelOptionsEditorBuilder<T>) {
  builder.addCustomEditor<RowAnnotationsComboboxSettings, ValueOverflow>({
    id: 'styling.valueOverflow',
    path: 'styling.valueOverflow',
    name: t('pjan.styling.value-overflow-name', 'Value overflow'),
    description: t(
      'pjan.styling.value-overflow-desc',
      'A value wider than its box is truncated, or hidden. Not set: as the look (Pill hides)'
    ),
    category: getCategory(),
    editor: RowAnnotationsComboboxEditor,
    settings: {
      placeholder: t('pjan.styling.value-overflow-placeholder', 'As the look'),
      getOptions: () => [
        { value: 'truncate', label: t('pjan.styling.value-overflow-truncate', 'Truncate') },
        { value: 'hide', label: t('pjan.styling.value-overflow-hide', 'Hide') },
      ],
    },
    showIf: (options) => (options as { showValue?: VisibilityMode }).showValue !== VisibilityMode.Never,
  });
}

/** The largest Corner radius, in CSS pixels. */
export const MAX_CORNER_RADIUS = 12;

/** "Look", "Corner radius", the grid, axis text and day-boundary options, registered right after core's "Page size". */
export function addStylingOptions<T>(builder: PanelOptionsEditorBuilder<T>) {
  const category = getCategory();
  builder
    .addRadio({
      path: 'styling.look',
      name: t('pjan.styling.look-name', 'Look'),
      description: t(
        'pjan.styling.look-desc',
        'Pill: the softest shade as fill, a line in the base shade, and the value in the strongest shade. Its fill is opaque, so Fill opacity doesn’t apply; its line is 1 px unless Line width is set above 0. A look only sets the options left unset'
      ),
      category,
      settings: {
        options: [
          { value: 'grafana', label: t('pjan.styling.look-grafana', 'Grafana') },
          { value: 'pill', label: t('pjan.styling.look-pill', 'Pill') },
        ],
      },
    })
    .addCustomEditor<ClearableSliderSettings, number>({
      id: 'styling.cornerRadius',
      path: 'styling.cornerRadius',
      name: t('pjan.styling.corner-radius-name', 'Corner radius'),
      description: t(
        'pjan.styling.corner-radius-desc',
        'Rounds every box and its line, in pixels (at most half the box’s width and height). Not set or 0: square'
      ),
      category,
      editor: ClearableSliderEditor,
      settings: { min: 0, max: MAX_CORNER_RADIUS, step: 1 },
    })
    .addColorPicker({
      path: 'styling.gridColor',
      name: t('pjan.styling.grid-color-name', 'Grid line color'),
      category,
      settings: { isClearable: true, placeholder: t('pjan.styling.theme', 'Theme') },
    })
    .addColorPicker({
      path: 'styling.axisTextColor',
      name: t('pjan.styling.axis-text-color-name', 'Axis text color'),
      category,
      settings: { isClearable: true, placeholder: t('pjan.styling.theme', 'Theme') },
    })
    .addRadio({
      path: 'styling.dayBoundaries',
      name: t('pjan.styling.day-boundaries-name', 'Day boundaries'),
      description: t(
        'pjan.styling.day-boundaries-desc',
        'A stronger grid line and a bold time label at 00:00, in the dashboard’s time zone'
      ),
      category,
      settings: {
        options: [
          { value: false, label: t('pjan.styling.off', 'Off') },
          { value: true, label: t('pjan.styling.on', 'On') },
        ],
      },
    })
    .addColorPicker({
      path: 'styling.dayBoundaryColor',
      name: t('pjan.styling.day-boundary-color-name', 'Day boundary color'),
      description: t('pjan.styling.day-boundary-color-desc', 'The color of the grid line at 00:00'),
      category,
      settings: { isClearable: true, placeholder: t('pjan.styling.strong-border', 'Strong border') },
      showIf: (options) => getStylingOptions(options).dayBoundaries === true,
    });
}
