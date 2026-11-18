/**
 * The edge field of a filled text (`rendering/alphaOutline`): how far every
 * texel of the text's image is from the edge of its glyphs.
 *
 * The outline of a text and the shape its shadow is cast from are both made
 * from it (`textOutlineImage`, `richTextShadow`). The text is rasterised by
 * Pixi's own text generator, exactly as Pixi rasterises the text's fill.
 *
 * The last few fields are kept: an outlined text with a shadow asks for the
 * same field twice in one render, and a change of the outline's colour or
 * opacity, or of the shadow, asks for the same field again.
 */
import { CanvasTextGenerator, TextStyle } from 'pixi.js';
import type { TextStyleOptions } from 'pixi.js';

import { subscribeToFontRegistrations } from '../../fonts/fontRegistrations';
import { edgeField } from '../alphaOutline';
import type { EdgeField } from '../alphaOutline';

/** A paint that covers: what a text is filled with to find its edge. */
export const SOLID_PAINT = '#000000';

export interface TextEdgeField {
  /** Null where the text has no ink. */
  field: EdgeField | null;
  /** The size of the text's image, in texels. */
  width: number;
  height: number;
}

interface Kept extends TextEdgeField {
  key: string;
  reach: number;
}

/** Fields are kept while together they are no larger than this, in texels; the latest always is. */
const KEPT_TEXELS = 8_000_000;
let kept: Kept[] = [];

// The same text is drawn with another font once its family's file arrives.
subscribeToFontRegistrations(() => {
  kept = [];
});

/**
 * The edge field of `text` filled in `style` (an opaque fill and `padding`
 * included) at `resolution` texels per px, good for outlines reaching up to
 * `reach` texels to either side of the edge. Null where there is no canvas.
 */
export function textEdgeField(
  text: string,
  style: TextStyleOptions,
  resolution: number,
  reach: number,
): TextEdgeField | null {
  if (typeof document === 'undefined') return null;
  const key = JSON.stringify([text, style, resolution, document.fonts?.size ?? 0]);
  const hit = kept.find((entry) => entry.key === key && entry.reach >= reach);
  if (hit) {
    kept = [...kept.filter((entry) => entry !== hit), hit];
    return hit;
  }

  const { canvasAndContext, frame } = CanvasTextGenerator.getCanvasAndContext({
    text,
    style: new TextStyle(style),
    resolution,
  });
  const width = Math.max(1, frame.width);
  const height = Math.max(1, frame.height);
  const pixels = canvasAndContext.context.getImageData(0, 0, width, height).data;
  CanvasTextGenerator.returnCanvasAndContext(canvasAndContext);

  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = pixels[i * 4 + 3];
  const entry: Kept = { key, reach, field: edgeField(alpha, width, height, reach), width, height };

  const size = (candidate: Kept) => (candidate.field ? candidate.field.width * candidate.field.height : 0);
  kept = [...kept.filter((candidate) => candidate.key !== key), entry];
  while (kept.length > 1 && kept.reduce((total, candidate) => total + size(candidate), 0) > KEPT_TEXELS) {
    kept = kept.slice(1);
  }
  return entry;
}

/** Visible for tests. */
export function _clearTextEdgeFields(): void {
  kept = [];
}
