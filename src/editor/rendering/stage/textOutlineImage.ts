/**
 * The outline of a text, as one image.
 *
 * The canvas's own stroke is not used for it (see `rendering/textStroke`). The
 * text is rasterised filled, by Pixi's own text generator and on the texels
 * its fill is shown on, and the outline is worked out from that image
 * (`textEdgeField`, `alphaOutline`). It follows the glyphs exactly as the
 * layer shows them.
 *
 * The image is white: whoever shows it tints it with the outline's colour, so
 * that a change of colour draws nothing anew.
 *
 * Working the outline out costs time for every texel, so the images of one
 * text item are together no larger than `OUTLINE_TEXEL_BUDGET`
 * (`outlineResolutionCap`): a text too large for that at the resolution its
 * fill is shown at is rasterised at a lower one, and its outline shown scaled
 * up.
 */
import { CanvasTextMetrics, TextStyle } from 'pixi.js';
import type { TextStyleOptions } from 'pixi.js';

import { outlineCoverageOf } from '../alphaOutline';
import { clampResolutionToTexelBudget } from './rasterCaps';
import { textEdgeField } from './textEdgeField';

/** Everything the image depends on. Plain data: its JSON is its identity. */
export interface TextOutlineInput {
  text: string;
  /**
   * The style the text is filled with, an opaque fill and `padding` included.
   * The padding has room for the outline.
   */
  style: TextStyleOptions;
  /** Texels per px to rasterise at: see `outlineResolutionCap`. */
  resolution: number;
  /** Width of the outline in px. */
  strokeWidth: number;
}

export interface TextOutlineImage {
  /**
   * The outline in white. It goes where Pixi puts the texture of the text's
   * fill: the text's `padding` before the text, on whole texels or not.
   */
  canvas: HTMLCanvasElement;
  /** Texels per px. */
  resolution: number;
}

/** A text to draw an outline around. */
export interface OutlinedText {
  text: string;
  /** Its style, without padding. */
  style: TextStyleOptions;
  /** The room its image needs around the text, in px: for its ink and for half the outline. */
  room: number;
}

/** Padding is rounded up to blocks of texels; this much, in px, stands in for the rounding. */
const PADDING_ALLOWANCE_PX = 2;

/**
 * The finest resolution the filled texts of one item's outline are rasterised
 * at: the one at which their images come to the texel budget together.
 *
 * It goes by the texts alone and not by the zoom, so past it every zoom step
 * asks for the very image there already is. Under it the outline is
 * rasterised at the resolution of the fill, on the fill's own texels.
 */
export function outlineResolutionCap(texts: OutlinedText[]): number {
  let area = 0;
  for (const { text, style, room } of texts) {
    const measured = CanvasTextMetrics.measureText(text || ' ', new TextStyle({ ...style, padding: 0 }));
    const padding = Math.max(0, room) + PADDING_ALLOWANCE_PX;
    // The size Pixi's text generator gives the image, in px.
    area +=
      Math.ceil(Math.max(1, measured.width) + padding * 2) *
      Math.ceil(Math.max(1, measured.height) + padding * 2);
  }
  return clampResolutionToTexelBudget(Number.POSITIVE_INFINITY, area, 1);
}

/** Draw the outline of `input`'s text. Null where there is nothing to draw with. */
export function rasteriseTextOutline(input: TextOutlineInput): TextOutlineImage | null {
  if (typeof document === 'undefined') return null;
  const { resolution } = input;
  const halfWidth = (input.strokeWidth / 2) * resolution;

  const filled = textEdgeField(input.text, input.style, resolution, halfWidth);
  if (!filled) return null;
  const { width, height } = filled;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const coverage = outlineCoverageOf(filled.field, width * height, halfWidth);
  const image = context.createImageData(width, height);
  const pixels = new Uint32Array(image.data.buffer);
  // White, as see-through as the outline covers the texel: 0xAABBGGRR or
  // 0xRRGGBBAA, whichever way round the bytes are.
  const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  for (let i = 0; i < coverage.length; i += 1) {
    const alpha = coverage[i];
    if (alpha === 0) continue;
    pixels[i] = littleEndian ? ((alpha << 24) | 0xffffff) >>> 0 : (0xffffff00 | alpha) >>> 0;
  }
  context.putImageData(image, 0, 0);

  return { canvas, resolution };
}
