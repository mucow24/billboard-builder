/**
 * Image colour-adjustment matrices, shared by the PixiJS renderer (which feeds
 * them to `ColorMatrixFilter`) and the SVG exporter (which feeds them to
 * `<feColorMatrix type="matrix">`). Both consume the SAME 4x5 row-major layout —
 * 4 rows (R, G, B, A) of 5 values, the 5th column being the additive offset — so
 * the two renderers can never drift.
 */
export type ColorMatrix = number[];

export const IDENTITY_COLOR_MATRIX: ColorMatrix = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

/**
 * Brightness (additive) + contrast (scale around the 0.5 midpoint), matching the
 * Konva-derived formula the editor renders with:
 *   factor = ((contrast + 100) / 100)^2
 *   v' = v * factor + brightness * factor + 0.5 * (1 - factor)
 * `brightness`/`contrast` are the normalized values from `getRenderableImageAdjustments`.
 */
export function brightnessContrastMatrix(
  brightness: number,
  contrast: number,
): ColorMatrix | null {
  if (brightness === 0 && contrast === 0) return null;
  const factor = contrast !== 0 ? ((contrast + 100) / 100) ** 2 : 1;
  const offset = brightness * factor + 0.5 * (1 - factor);
  const m = [...IDENTITY_COLOR_MATRIX];
  m[0] = factor;
  m[6] = factor;
  m[12] = factor;
  m[4] = offset;
  m[9] = offset;
  m[14] = offset;
  return m;
}

/**
 * Blend each channel toward a tint colour: v' = v * (1 - a) + channel * a.
 * `tintRed/Green/Blue` are 0..255; `tintAlpha` is 0..1.
 */
export function tintMatrix(
  tintRed: number,
  tintGreen: number,
  tintBlue: number,
  tintAlpha: number,
): ColorMatrix | null {
  if (tintAlpha <= 0) return null;
  const r = tintRed / 255;
  const g = tintGreen / 255;
  const b = tintBlue / 255;
  const a = tintAlpha;
  const m = [...IDENTITY_COLOR_MATRIX];
  m[0] = 1 - a;
  m[4] = r * a;
  m[6] = 1 - a;
  m[9] = g * a;
  m[12] = 1 - a;
  m[14] = b * a;
  m[18] = 1;
  return m;
}
