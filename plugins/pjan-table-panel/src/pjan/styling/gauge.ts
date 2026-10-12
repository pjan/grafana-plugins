import {
  type DecimalCount,
  type DisplayProcessor,
  type DisplayValue,
  type Field,
  type FieldColorMode,
  FieldColorModeId,
  type FieldConfig,
  getFieldColorMode,
  type GrafanaTheme2,
  type ThresholdsConfig,
} from '@grafana/data';
import { BarGaugeDisplayMode } from '@grafana/schema';
import tinycolor from 'tinycolor2';
import {
  type ColorScheme,
  getColorNameLookup,
  getColorScheme,
  getShadeColor,
  getStylingColor,
  getValueShadeColor,
  interpolateColorScheme,
  type RelativeShade,
  shadeColorScheme,
  type StylingColor,
} from '@pjan/grafana-styling';

import { GAUGE_COLOR_MODES, getFieldStyling } from './options';

// Gauge color (`custom.styling.gaugeColor`, plan step 7, build 4). Hooked into the copied Cells/BarGaugeCell.tsx
// (`getGaugeProps`, marked `pjan-table-panel:`), which hands the copied BarGauge the field config, display processor
// and value this returns, and for a continuous colour scheme's gradient a colour mode of the plugin's (the copied
// BarGauge's one marked prop, `pjanColorMode`). UPSTREAM.md, "Plugin addition: Gauge color". With it unset (or Fixed on
// a gradient or LCD gauge) it returns core's own object, so BarGauge gets core's props.

/** The props BarGaugeCell hands BarGauge that Gauge color changes. */
export interface GaugeProps {
  /** BarGauge's `field`: the field config with min and max (and BarGaugeCell's default thresholds) */
  config: FieldConfig;
  /** BarGauge's `display`: the colour of each LCD cell */
  display?: DisplayProcessor;
  /** BarGauge's `value`: the basic bar's colour, and the value's text in "Value color" */
  value: DisplayValue;
  /** The copied BarGauge's `pjanColorMode`: the colour mode its gradient reads a continuous scheme's stops from */
  colorMode?: FieldColorMode;
}

/** The column's Gauge color, complete or unset (`getStylingColor`: an incomplete value counts as unset). */
export const getGaugeColor = (field: Field): StylingColor | undefined =>
  getStylingColor(getFieldStyling(field.config.custom).gaugeColor, GAUGE_COLOR_MODES);

/** No colour, or a fully transparent one (`transparent`, `#00000000`, `rgba(0, 0, 0, 0)`, …): Gauge color leaves it. */
const isUncoloured = (color: string | undefined): boolean => !color || tinycolor(color).getAlpha() === 0;

// Per theme object (a theme plugin that changes its colours builds a new theme) and thresholds object (the field's own,
// or BarGaugeCell's default scale), by shade
const shadedThresholdsCache = new WeakMap<
  GrafanaTheme2,
  WeakMap<ThresholdsConfig, Map<RelativeShade, ThresholdsConfig>>
>();

/**
 * Thresholds with each step's colour in the shade of its own hue (a name by its name, a hex or rgb() colour by its
 * nearest hue); a step without a hue keeps its colour as saved (so BarGauge resolves it as core does). The values and
 * the mode as they are.
 */
export function shadeThresholds(
  theme: GrafanaTheme2,
  thresholds: ThresholdsConfig,
  shade: RelativeShade
): ThresholdsConfig {
  let byThresholds = shadedThresholdsCache.get(theme);
  if (!byThresholds) {
    byThresholds = new WeakMap();
    shadedThresholdsCache.set(theme, byThresholds);
  }
  let byShade = byThresholds.get(thresholds);
  if (!byShade) {
    byShade = new Map();
    byThresholds.set(thresholds, byShade);
  }
  let shaded = byShade.get(shade);
  if (!shaded) {
    shaded = {
      ...thresholds,
      steps: thresholds.steps.map((step) => {
        const color = theme.visualization.getColorByName(step.color);
        // a name the theme knows resolves to another string; a hex or rgb() colour resolves to itself. Without a hue
        // (Grafana's special names, a colour no hue wins) undefined: the step keeps its colour
        const name = color !== step.color ? step.color : undefined;
        return { ...step, color: getShadeColor(theme, color, name, shade) ?? step.color };
      }),
    };
    byShade.set(shade, shaded);
  }
  return shaded;
}

/**
 * A colour mode drawing a continuous scheme's shaded stops, for the copied BarGauge's gradient (its marked prop
 * `pjanColorMode`, read instead of Grafana's mode): the same id, name and kind as Grafana's mode, `getColors` the shaded
 * stops (what the gradient reads), and a calculator interpolating them as Grafana's does. A plain object of the
 * plugin's, never registered: Grafana's registry and the scheme it caches on its own mode object stay as they are.
 */
export function createShadedColorMode(base: FieldColorMode, shaded: ColorScheme): FieldColorMode {
  return {
    id: base.id,
    name: base.name,
    description: base.description,
    isContinuous: base.isContinuous,
    isByValue: base.isByValue,
    getColors: () => shaded.stops,
    getCalculator: () => (_value: number, percent: number) => interpolateColorScheme(shaded, percent),
  };
}

interface FieldColors {
  /** The Grafana colour names behind the field's colours (mappings, thresholds, fixed, classic palette) */
  names: Map<string, string>;
  /** The continuous by-value scheme the field's colours come from, if any */
  scheme?: ColorScheme;
  /** The scheme's colour modes with shaded stops, by shade */
  modes: Map<RelativeShade, FieldColorMode>;
}

// Per theme object and field (a field is rebuilt when its data or config changes)
const fieldColorsCache = new WeakMap<GrafanaTheme2, WeakMap<Field, FieldColors>>();

function getFieldColors(field: Field, theme: GrafanaTheme2): FieldColors {
  let byField = fieldColorsCache.get(theme);
  if (!byField) {
    byField = new WeakMap();
    fieldColorsCache.set(theme, byField);
  }
  let colors = byField.get(field);
  if (!colors) {
    colors = { names: getColorNameLookup(field, theme), scheme: getColorScheme(field, theme), modes: new Map() };
    byField.set(field, colors);
  }
  return colors;
}

/**
 * BarGaugeCell's hook: the BarGauge props with the column's Gauge color, or `core` itself when it is unset.
 * - **Basic gauge:** the bar (and the value in "Value color", which follows the bar as in core) in the shade of the
 *   value's colour (of its name's hue, its nearest hue, or from a continuous scheme the scheme's stops shaded and
 *   interpolated at the value's position, `getValueShadeColor`; without a hue the colour itself), or Fixed: one colour.
 * - **Gradient and LCD gauges, a shade:** per colour stop, so the bar keeps core's transition at the chosen lightness
 *   (pjan, 2026-10-10): each threshold step's colour (the gradient, `shadeThresholds`), a continuous scheme's stops (the
 *   gradient, through `pjanColorMode`; no exception for schemes), each LCD cell's colour (`display`) and the value's
 *   colour, each in that shade of its own hue. Other colour modes draw the gradient bar in the value's colour, which is
 *   shaded.
 * - **Gradient and LCD gauges, Fixed:** ignored, drawn as core (the editor can't hide Fixed there: the cell type is often
 *   set by an override the field defaults' editor doesn't see; plan, review M3). The description says so.
 * - **A value without a colour, or a fully transparent one** (`transparent`, or any colour with alpha 0 such as
 *   `#00000000`): as core, with a shade and with Fixed, for the value, the basic bar and each LCD cell. On a gauge the
 *   bar's length is its meaning, and a value mapped to `transparent` is a sentinel (Atlas's "unlimited" `-1` and
 *   `null+nan`, shown as " "): Grafana draws it as an invisible 1 px stub, which a colour would turn into a visible stub
 *   with a 2 px line (and, in Value color, a visible value). This differs from Background color and Pill fill color,
 *   whose Fixed fills a transparent cell or pill (there a fill makes a readable chip; UPSTREAM.md, "Plugin addition:
 *   Gauge color", decision 8).
 */
export function getGaugeProps(
  field: Field,
  theme: GrafanaTheme2,
  displayMode: BarGaugeDisplayMode,
  core: GaugeProps
): GaugeProps {
  const setting = getGaugeColor(field);
  if (!setting) {
    return core;
  }
  if (setting.mode === 'fixed') {
    // A value Grafana leaves uncoloured stays uncoloured: a gauge's length is its meaning, and a transparent value is a
    // sentinel (Atlas's "unlimited"); Fixed would draw its 1 px stub and 2 px line. Unlike Background color and Pill
    // fill color, whose Fixed fills a transparent cell or pill (decision 8 in UPSTREAM.md)
    if (displayMode !== BarGaugeDisplayMode.Basic || isUncoloured(core.value.color)) {
      return core;
    }
    // the basic gauge reads only the value's colour (its bar, and the value's text in "Value color")
    return { ...core, value: { ...core.value, color: theme.visualization.getColorByName(setting.fixedColor!) } };
  }

  const shade = setting.shade!;
  const { names, scheme, modes } = getFieldColors(field, theme);
  // A displayed value's colour in the shade: from a continuous scheme at the value's position (a mapped colour has no
  // position: its name decides), otherwise by its name or nearest hue; without a hue the colour itself
  const shaded = (shown: DisplayValue): DisplayValue => {
    // as core without a colour or with a fully transparent one, whatever its name (as Fixed above)
    if (isUncoloured(shown.color)) {
      return shown;
    }
    const at = scheme && shown.percent !== undefined && !Number.isNaN(shown.percent) ? shown.percent : undefined;
    const color =
      getValueShadeColor(
        theme,
        shown.color!,
        names.get(shown.color!),
        shade,
        at !== undefined ? { scheme: scheme!, position: at } : undefined
      ) ?? shown.color!;
    return { ...shown, color };
  };

  const result: GaugeProps = { ...core, value: shaded(core.value) };
  if (displayMode === BarGaugeDisplayMode.Lcd) {
    const display = core.display;
    result.display = display
      ? (value: unknown, decimals?: DecimalCount) => shaded(display(value, decimals))
      : undefined;
  } else if (displayMode !== BarGaugeDisplayMode.Basic) {
    // the gradient, as BarGauge's getBarGradient reads it: thresholds, or a continuous scheme's stops
    const mode = getFieldColorMode(core.config.color?.mode);
    if (mode.id === FieldColorModeId.Thresholds && core.config.thresholds) {
      result.config = { ...core.config, thresholds: shadeThresholds(theme, core.config.thresholds, shade) };
    } else if (mode.isContinuous && mode.getColors && scheme) {
      let colorMode = modes.get(shade);
      if (!colorMode) {
        colorMode = createShadedColorMode(mode, shadeColorScheme(theme, scheme, shade));
        modes.set(shade, colorMode);
      }
      result.colorMode = colorMode;
    }
  }
  return result;
}
