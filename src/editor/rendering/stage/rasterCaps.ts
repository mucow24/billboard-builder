// Pixi rasterizes Text textures and filter render targets at a resolution that
// scales with zoom. Without an upper bound, the allocated texture can exceed
// the GPU's MAX_TEXTURE_SIZE, at which point Pixi composites a black/garbage
// rect over the affected region — visible as rectangular "holes" punched
// through high-z items at extreme zoom.
//
// Cap the requested resolution so `itemDimension * resolution` stays under
// MAX_TEXTURE_SIZE. Past the cap the texture is fixed-size and further zoom
// magnifies existing pixels (text turns soft) — preferable to disappearing.

const SAFETY_MARGIN_PX = 256;
const MIN_RESOLUTION = 1 / 64;
const FALLBACK_MAX_TEXTURE_SIZE = 4096;

let cachedMaxTextureSize: number | null = null;

export function getMaxTextureSize(): number {
  if (cachedMaxTextureSize !== null) return cachedMaxTextureSize;
  if (typeof document === 'undefined') {
    cachedMaxTextureSize = FALLBACK_MAX_TEXTURE_SIZE;
    return cachedMaxTextureSize;
  }
  try {
    const probe = document.createElement('canvas');
    const gl =
      (probe.getContext('webgl2') as WebGL2RenderingContext | null) ??
      (probe.getContext('webgl') as WebGLRenderingContext | null);
    const size = gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : 0;
    cachedMaxTextureSize = Number.isFinite(size) && size > 0 ? size : FALLBACK_MAX_TEXTURE_SIZE;
  } catch {
    cachedMaxTextureSize = FALLBACK_MAX_TEXTURE_SIZE;
  }
  return cachedMaxTextureSize;
}

// Visible for tests.
export function _resetMaxTextureSizeCache(value: number | null = null): void {
  cachedMaxTextureSize = value;
}

export function clampRasterResolution(
  requested: number,
  itemDimensionPx: number,
  maxTextureSize: number,
): number {
  const safeMax = Math.max(1, maxTextureSize - SAFETY_MARGIN_PX);
  const cap = safeMax / Math.max(1, itemDimensionPx);
  return Math.max(MIN_RESOLUTION, Math.min(requested, cap));
}

// The outline of a text and the shape its shadow is cast from are worked out
// on the main thread, texel by texel (`rendering/alphaOutline`), from an image
// of the filled text. The time that takes goes by the number of texels: about
// 30 ns each for a line of glyphs, measured in Chromium in November 2026, so
// 100 ms for the 4 million here (the browser's own stroke of the same text
// took under 10 ms). Past this budget the image is rasterised at a lower
// resolution and shown scaled up, so the outline turns soft at deep zoom
// before the fill does. Under it, outline and fill are rasterised at one
// resolution, texel for texel.
export const OUTLINE_TEXEL_BUDGET = 4_000_000;

/**
 * The resolution to rasterise an image `widthPx` by `heightPx` at so that it
 * has no more than `budget` texels: `requested` where that fits.
 */
export function clampResolutionToTexelBudget(
  requested: number,
  widthPx: number,
  heightPx: number,
  budget: number = OUTLINE_TEXEL_BUDGET,
): number {
  const area = Math.max(1, widthPx) * Math.max(1, heightPx);
  const cap = Math.sqrt(Math.max(1, budget) / area);
  return Math.max(MIN_RESOLUTION, Math.min(requested, cap));
}
