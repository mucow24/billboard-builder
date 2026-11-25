/**
 * Blurring on smaller textures.
 *
 * A blur leaves nothing finer than a fraction of its own strength, so it does
 * not need the resolution of the screen: a texture with fewer texels gives the
 * same picture once it is scaled back up. What it costs is another matter. A
 * blur is several passes over the blurred item and the room its halo needs
 * around it, and both grow with the zoom: at full resolution that is most of
 * the work of a frame once a wide blur is zoomed in on.
 *
 * Resolutions are lowered by halves, which keeps the texels of the smaller
 * texture on the pixel grid of the screen.
 */

/**
 * How many times a texture's resolution can be halved for a blur of
 * `blurStrength` (in px of the filtered area) and still leave `texelsKept`
 * texels across that strength. 0 for a blur too small to gain from it.
 */
export function blurHalvings(resolution: number, blurStrength: number, texelsKept: number): number {
  const texelsAcrossStrength = blurStrength * resolution;
  if (!(texelsAcrossStrength >= texelsKept * 2)) return 0;
  return Math.floor(Math.log2(texelsAcrossStrength / texelsKept));
}

/**
 * How many texels an item blurred by Pixi's BlurFilter keeps across the blur's
 * strength.
 *
 * The filter blurs in four passes, each sampling at half the spacing of the
 * one before; the last samples at steps of about a ninth of the strength. With
 * 64 texels across the strength there are seven texels to such a step, so the
 * blur comes out as it does at full resolution, the faint steps along a sharp
 * edge included.
 *
 * The item itself is drawn straight into the smaller texture, where anything
 * thinner than a texel can be missed. That is a sixty-fourth of the strength
 * at most, and the blur spreads something that thin to under half a percent
 * of its opacity: it does not show either way.
 */
const TEXELS_PER_GAUSSIAN_BLUR_STRENGTH = 64;

/**
 * The resolution an item is drawn and blurred at by a BlurFilter of `strength`
 * (in px of the filtered area), where `resolution` is what the surface it ends
 * up on has.
 */
export function gaussianBlurResolution(resolution: number, strength: number): number {
  return resolution / 2 ** blurHalvings(resolution, strength, TEXELS_PER_GAUSSIAN_BLUR_STRENGTH);
}
