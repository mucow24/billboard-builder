import type { CanvasItem, CanvasLeafKind, CanvasShadow, TextPadding } from './documentTypes';

/**
 * The settings of an item that are sizes in canvas pixels and are not part of
 * its box: a plain resize leaves them alone, so text keeps its size in a
 * bigger box and an outline keeps its width. A scaling resize (Alt-drag on a
 * corner) multiplies them by the same factor as the box, so the item looks
 * the same at its new size.
 *
 * This list is the only place that names them: what a scaling resize scales
 * and what it commits are both read from it.
 *
 * Line height is a multiple of the font size, so it follows without help. A
 * generator's own settings are left out: they describe a pattern, not a box.
 */
const SHARED_FIELDS = ['shadow', 'blurRadius'] as const;

// Each kind may only list fields its items have, so a misspelled name does
// not compile.
type FieldsByKind = {
  [K in CanvasLeafKind]: readonly (keyof Extract<CanvasItem, { kind: K }>)[];
};

const FIELDS_BY_KIND = {
  text: [...SHARED_FIELDS, 'fontSize', 'letterSpacing', 'padding', 'strokeWidth'],
  rectangle: [...SHARED_FIELDS, 'strokeWidth', 'cornerRadius'],
  ellipse: [...SHARED_FIELDS, 'strokeWidth'],
  ngon: [...SHARED_FIELDS, 'strokeWidth'],
  polygon: [...SHARED_FIELDS, 'strokeWidth', 'curveRadius'],
  image: SHARED_FIELDS,
  generator: SHARED_FIELDS,
} as const satisfies FieldsByKind;

type ScalableField = (typeof FIELDS_BY_KIND)[CanvasLeafKind][number];

const MIN_FONT_SIZE = 1;

// A field is a plain number of pixels unless it is listed here.
const FIELD_SCALERS: Partial<Record<ScalableField, (value: never, factor: number) => unknown>> = {
  fontSize: (value: number, factor) => Math.max(MIN_FONT_SIZE, value * factor),
  padding: (value: TextPadding, factor): TextPadding => ({
    top: value.top * factor,
    right: value.right * factor,
    bottom: value.bottom * factor,
    left: value.left * factor,
  }),
  shadow: (value: CanvasShadow, factor): CanvasShadow => ({
    ...value,
    blur: value.blur * factor,
    offsetX: value.offsetX * factor,
    offsetY: value.offsetY * factor,
  }),
};

function scaleField(field: ScalableField, value: unknown, factor: number): unknown {
  const scaler = FIELD_SCALERS[field];
  return scaler ? scaler(value as never, factor) : (value as number) * factor;
}

function scalableFields(item: CanvasItem): readonly ScalableField[] {
  return FIELDS_BY_KIND[item.kind];
}

/** The item's scalable settings, as changes to commit. */
export function getScalableStyle(item: CanvasItem): Partial<CanvasItem> {
  const values = item as unknown as Record<string, unknown>;
  return Object.fromEntries(
    scalableFields(item).map((field) => [field, values[field]])
  ) as Partial<CanvasItem>;
}

/** The item with every setting of `getScalableStyle` multiplied by `factor`. */
export function scaleItemStyle<T extends CanvasItem>(item: T, factor: number): T {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) {
    return item;
  }
  const values = item as unknown as Record<string, unknown>;
  const scaled = Object.fromEntries(
    scalableFields(item).map((field) => [field, scaleField(field, values[field], factor)])
  );
  return { ...item, ...scaled };
}
