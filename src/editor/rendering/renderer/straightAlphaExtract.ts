import { RendererType, type ExtractOptions, type Renderer } from 'pixi.js';

/**
 * Turn premultiplied RGBA bytes into straight-alpha RGBA bytes, in place.
 *
 * A premultiplied pixel stores colour * alpha. Canvas ImageData and PNG store
 * the colour itself, so each channel is divided by alpha again. Fully
 * transparent pixels have no colour to recover and stay as they are; fully
 * opaque ones are already right.
 */
export function unpremultiplyAlpha(pixels: Uint8Array | Uint8ClampedArray): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha === 0 || alpha === 255) continue;
    pixels[i] = Math.min(255, Math.round((pixels[i] * 255) / alpha));
    pixels[i + 1] = Math.min(255, Math.round((pixels[i + 1] * 255) / alpha));
    pixels[i + 2] = Math.min(255, Math.round((pixels[i + 2] * 255) / alpha));
  }
}

/**
 * `renderer.extract.canvas`, but with the right colours where the result is
 * partly transparent.
 *
 * Pixi renders premultiplied. Its WebGL extract reads the render texture back
 * with `gl.readPixels` and puts those bytes into a 2D canvas unchanged (the
 * unpremultiply step in `GlTextureSystem.getPixels` is compiled out as of
 * pixi.js 8.17), and a 2D canvas takes ImageData as straight alpha. So every
 * partly transparent pixel came out darkened by its own alpha: a soft edge
 * over a transparent background faded to black instead of to nothing.
 *
 * The WebGPU extract copies the texture into a canvas declared as
 * premultiplied, which the browser converts correctly, so it is used as is.
 */
export function extractStraightAlphaCanvas(
  renderer: Renderer,
  options: ExtractOptions,
): HTMLCanvasElement {
  if (renderer.type !== RendererType.WEBGL) {
    return renderer.extract.canvas(options) as HTMLCanvasElement;
  }

  const { pixels, width, height } = renderer.extract.pixels(options);
  unpremultiplyAlpha(pixels);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas;
}
