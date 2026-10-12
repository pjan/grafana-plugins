import { type Field } from '@grafana/data';
import { TableCellDisplayMode } from '@grafana/schema';

// The copied table's types (its cell options union includes the Custom cell type)
import { type TypographyCtx } from '../../packages/grafana-ui/src/components/Table/TableNG/types';
import { type TableCellOptions } from '../../packages/grafana-ui/src/components/Table/types';

import { getFieldStyling, type TextWeight, validTextWeight } from './options';

// Text weight (`custom.styling.textWeight`, plan step 7, build 3). Hooked into the copied TableNG, marked
// `pjan-table-panel:` (UPSTREAM.md, "Plugin addition: Text weight"): render-hooks.tsx puts the weight on the column's
// cells (and on Tooltip from field's content), and utils.ts measures the column's wrapped text (row heights) and content
// (content-aware column widths) at it (`getMeasuredTextWeight`). Automatic text is measured at it through `getTextFont` (cellColors.ts). With
// nothing set, every hook gives core's own result.

/** The cell types Text weight applies to: those whose text the plugin's colours already style. */
const TEXT_WEIGHT_CELL_TYPES: ReadonlySet<TableCellOptions['type']> = new Set([
  TableCellDisplayMode.ColorText,
  TableCellDisplayMode.ColorBackground,
  TableCellDisplayMode.Pill,
]);

/**
 * A column's Text weight where it applies: set to one of the three weights, on a Colored text, Colored background or
 * Pill column (its configured cell type, as core reads it: `getCellOptions(field).type`). Undefined otherwise: the
 * column draws and measures as core.
 */
export function getTextWeight(field: Field, cellType: TableCellOptions['type']): TextWeight | undefined {
  return TEXT_WEIGHT_CELL_TYPES.has(cellType)
    ? validTextWeight(getFieldStyling(field.config.custom).textWeight)
    : undefined;
}

/**
 * The weight a column's text is measured at, where it differs from core's: its Text weight, except 400, which is what
 * core measures at already (its body and pill contexts have no weight, the regular one), so an explicit 400 shares
 * core's measurers and contexts. Undefined: measure as core.
 */
export function getMeasuredTextWeight(field: Field, cellType: TableCellOptions['type']): TextWeight | undefined {
  const weight = getTextWeight(field, cellType);
  return weight === 400 ? undefined : weight;
}

/** Core's `createTypographyContext` (copied utils.ts), handed in by its caller there. */
export type CreateTypographyContext = (
  fontSize: number,
  fontFamily: string,
  letterSpacing?: number,
  fontWeight?: number
) => TypographyCtx;

const weightedContexts = new WeakMap<TypographyCtx, Map<number, TypographyCtx>>();

/**
 * The context core measures the table's text with (`base`: the body font, made by `useTypographyCtx` per theme), for
 * text drawn at `weight`: the same size, family and letter spacing at that weight, made with core's own
 * `createTypographyContext` once per context and weight (it measures a few thousand strings when it is made). `base`
 * itself without a weight, or when it doesn't say its size (a context made outside `createTypographyContext`, as some
 * copied tests do).
 */
export function getWeightedTypographyCtx(
  base: TypographyCtx,
  weight: number | undefined,
  create: CreateTypographyContext
): TypographyCtx {
  if (weight === undefined || base.pjanFontSize === undefined) {
    return base;
  }
  let byWeight = weightedContexts.get(base);
  if (!byWeight) {
    byWeight = new Map();
    weightedContexts.set(base, byWeight);
  }
  let weighted = byWeight.get(weight);
  if (!weighted) {
    weighted = create(base.pjanFontSize, base.fontFamily, base.letterSpacing, weight);
    byWeight.set(weight, weighted);
  }
  return weighted;
}
