import { clampRasterResolution } from './rasterCaps';

// SVG image items are vector sources, so their texture can be rasterized at
// whatever resolution the current presentation needs instead of being stuck at
// the file's natural size. This computes that resolution as a multiple of the
// source's intrinsic pixel size.

export interface SvgPixelScaleParams {
  originalWidth: number;
  originalHeight: number;
  /** Frame-space size the full source is drawn at (sourceTransform), which grows past the item box when crop-zoomed. */
  presentationWidth: number;
  presentationHeight: number;
  zoom: number;
  devicePixelRatio: number;
  maxTextureSize: number;
}

export function computeSvgPixelScale(params: SvgPixelScaleParams): number {
  // How magnified the source is on the canvas: frame units per source unit.
  const sourceToFrame = Math.max(
    params.presentationWidth / Math.max(1, params.originalWidth),
    params.presentationHeight / Math.max(1, params.originalHeight),
  );
  // Floor the screen factor at 1 so PNG export (which renders at zoom 1 with
  // no devicePixelRatio) stays crisp even while the editor is zoomed out.
  const desired = sourceToFrame * Math.max(1, params.zoom * params.devicePixelRatio);
  // Quantize up to powers of two so continuous zooming doesn't re-rasterize
  // on every tick (same idea as the generator pixel-scale quantization).
  const quantized = 2 ** Math.ceil(Math.log2(Math.max(1, desired)));
  return clampRasterResolution(
    quantized,
    Math.max(params.originalWidth, params.originalHeight, 1),
    params.maxTextureSize,
  );
}
