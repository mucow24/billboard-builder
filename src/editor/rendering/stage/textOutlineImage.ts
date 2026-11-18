/**
 * The outline of a text, as one image.
 *
 * The canvas's own stroke is not used for it (see `rendering/textStroke`). The
 * text is rasterised filled, by Pixi's own text generator and on the texels
 * its fill is shown on, and the outline is worked out from that image
 * (`alphaOutline`). It follows the glyphs exactly as the layer shows them.
 */
import { CanvasTextGenerator, TextStyle } from 'pixi.js';
import type { TextStyleOptions } from 'pixi.js';

import { outlineCoverage } from '../alphaOutline';

/** Everything the image depends on. Plain data: its JSON is its identity. */
export interface TextOutlineInput {
  text: string;
  /**
   * The style the text is filled with, an opaque fill and `padding` included.
   * The padding has room for the outline.
   */
  style: TextStyleOptions;
  /** Where the text goes, in px of the item: its texture starts `padding` before. */
  x: number;
  y: number;
  /** Texels per px. */
  resolution: number;
  /** Width of the outline in px, and its colour as `#rrggbb`. */
  strokeWidth: number;
  color: string;
}

export interface TextOutlineImage {
  canvas: HTMLCanvasElement;
  /** Where the canvas goes, in px of the item. */
  x: number;
  y: number;
  /** Texels per px. */
  resolution: number;
}

/** Draw the outline of `input`'s text. Null where there is nothing to draw with. */
export function rasteriseTextOutline(input: TextOutlineInput): TextOutlineImage | null {
  if (typeof document === 'undefined') return null;
  const { resolution } = input;
  const padding = typeof input.style.padding === 'number' ? input.style.padding : 0;

  const { canvasAndContext, frame } = CanvasTextGenerator.getCanvasAndContext({
    text: input.text,
    style: new TextStyle(input.style),
    resolution,
  });
  const width = Math.max(1, frame.width);
  const height = Math.max(1, frame.height);
  const filled = canvasAndContext.context.getImageData(0, 0, width, height).data;
  CanvasTextGenerator.returnCanvasAndContext(canvasAndContext);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = filled[i * 4 + 3];
  const coverage = outlineCoverage(alpha, width, height, (input.strokeWidth / 2) * resolution);

  const red = parseInt(input.color.slice(1, 3), 16);
  const green = parseInt(input.color.slice(3, 5), 16);
  const blue = parseInt(input.color.slice(5, 7), 16);
  const image = context.createImageData(width, height);
  for (let i = 0; i < coverage.length; i += 1) {
    image.data[i * 4] = red;
    image.data[i * 4 + 1] = green;
    image.data[i * 4 + 2] = blue;
    image.data[i * 4 + 3] = coverage[i];
  }
  context.putImageData(image, 0, 0);

  return {
    canvas,
    // Exactly where Pixi puts the texture of the text's fill, on whole texels or not.
    x: input.x - padding,
    y: input.y - padding,
    resolution,
  };
}
