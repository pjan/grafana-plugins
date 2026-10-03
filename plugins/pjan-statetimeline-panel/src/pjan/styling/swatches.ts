import { useMemo } from 'react';

import { type DataFrame, type Field, FieldColorModeId, FieldType, type GrafanaTheme2 } from '@grafana/data';
import { useTheme2, type VizLegendItem } from '@grafana/ui';
import { getCandidateColorNames } from '@pjan/grafana-styling';

import { type TimelineStylingOptions } from './options';
import { getRowStyle, type RowStyle } from './rowStyle';

// The swatch of a state shows its fill without Fill opacity, as core's shows the state colour.
const swatchOf = (row: RowStyle | undefined, stateColor: string) => row?.getFill(stateColor) ?? stateColor;

/**
 * The colours a row's colour sources produce, named or not (a hex colour can take the shades of its nearest hue). A
 * classic palette gives each row one slot of the whole palette, so a row with a palette mode produces the colours of
 * its own values only; otherwise every row would have every slot, and the first row would decide for all.
 */
function getRowColors(field: Field, theme: GrafanaTheme2): Set<string | undefined> {
  const mode = field.config.color?.mode;
  if (mode === FieldColorModeId.PaletteClassic || mode === FieldColorModeId.PaletteClassicByName) {
    return new Set(field.values.map((value) => field.display?.(value).color));
  }
  return new Set(getCandidateColorNames(field, theme).map((name) => theme.visualization.getColorByName(name)));
}

/**
 * The legend items with the fill colours drawn. Core's legend has one item per state colour (or threshold) for all
 * rows; with a Fill color set per row, an item shows the fill of the first row whose colour sources (mappings,
 * thresholds, fixed colour, palette) produce the state colour. Returns `items` itself when no row is styled.
 */
export function getLegendItemsWithDrawnColors(
  items: VizLegendItem[] | undefined,
  frames: DataFrame[] | undefined,
  theme: GrafanaTheme2,
  styling: TimelineStylingOptions
): VizLegendItem[] | undefined {
  if (!items || !frames) {
    return items;
  }
  // The rows the legend lists, as core's: every non-time field not hidden from the legend
  const fields = frames
    .flatMap((frame) => frame.fields)
    .filter((field) => field.type !== FieldType.time && !field.config.custom?.hideFrom?.legend);
  const styles = fields.map((field) => getRowStyle(field, theme, styling));
  if (!styles.some(Boolean)) {
    return items;
  }
  const colors = fields.map((field) => getRowColors(field, theme));
  return items.map((item) => {
    if (!item.color) {
      return item;
    }
    const i = colors.findIndex((produced) => produced.has(item.color!));
    return i === -1 ? item : { ...item, color: swatchOf(styles[i], item.color) };
  });
}

/**
 * The fields of the tooltip's frame with the fill colours drawn as their display colours, so the tooltip's swatches
 * show them. Only for the tooltip's rows: links, actions and everything else keep using the frame's own fields.
 * Returns `frame.fields` itself when no row has a box colour set (Fill, Line or Value color, or the Pill look); a row
 * with only a Line or Value color keeps its state colour as swatch.
 */
export function useFieldsWithDrawnColors(frame: DataFrame, styling: TimelineStylingOptions | undefined): Field[] {
  const theme = useTheme2();
  return useMemo(() => {
    let styled = false;
    const fields = frame.fields.map((field, i) => {
      const row = i === 0 ? undefined : getRowStyle(field, theme, styling ?? {});
      const display = field.display;
      if (!row || !display) {
        return field;
      }
      styled = true;
      return {
        ...field,
        display: (value: unknown) => {
          const shown = display(value);
          return shown.color ? { ...shown, color: swatchOf(row, shown.color) } : shown;
        },
      };
    });
    return styled ? fields : frame.fields;
  }, [frame, styling, theme]);
}
