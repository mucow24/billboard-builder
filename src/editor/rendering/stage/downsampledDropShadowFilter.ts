import { TexturePool } from 'pixi.js';
import type { Filter, FilterSystem, RenderSurface, Texture } from 'pixi.js';
import { DropShadowFilter } from 'pixi-filters';

import { blurHalvings } from './blurDownsampling';

/**
 * How many texels of the reduced texture the blur's strength spans at least.
 * The blurred shadow is close to a Gaussian with a standard deviation of 1.8
 * times that strength (`SHADOW_BLUR_TO_STDDEV` in svgPrimitives, where the
 * blur is twice the strength), so a texel is at most a fourteenth of the
 * standard deviation: far finer than anything left in the shadow.
 */
const TEXELS_PER_BLUR_STRENGTH = 8;

/**
 * How many times the resolution can be halved for a shadow blurred by
 * `blurStrength` (in px of the filtered area). 0 for a blur too small to gain
 * from it.
 */
export function shadowBlurHalvings(inputResolution: number, blurStrength: number): number {
  return blurHalvings(inputResolution, blurStrength, TEXELS_PER_BLUR_STRENGTH);
}

/** The passes pixi-filters builds its drop shadow from. They are private there. */
interface DropShadowPasses {
  /** The Kawase blur of the shadow. */
  _blurFilter: Filter;
  /** Copies a texture as it is. */
  _basePass: Filter;
}

/** A pooled texture covering `frame` at `resolution`, a whole number of texels wide and high. */
function takeTexture(frame: Texture, resolution: number): Texture {
  return TexturePool.getOptimalTexture(
    Math.ceil(frame.frame.width * resolution) / resolution,
    Math.ceil(frame.frame.height * resolution) / resolution,
    resolution,
    false,
  );
}

/**
 * pixi-filters' drop shadow, with the shadow blurred at a reduced resolution.
 *
 * The stock filter runs every pass of its blur over the whole filtered area at
 * the resolution of the item: eight passes, each over the item and the room
 * its shadow needs around it. That is most of what a frame costs once a wide
 * shadow is zoomed in on. A blurred shadow has no fine detail, though, so here
 * the item's silhouette is first scaled down, by halves so that no part of it
 * is skipped, until a texel is as large as the blur allows
 * (`shadowBlurHalvings`). The blur then runs on that small texture, and its
 * last pass draws the shadow at full size. Only the item itself, drawn over
 * the shadow, still takes a pass at full resolution.
 *
 * With `downsampleBlur` off, or for a blur too small to scale down, this is
 * the stock filter.
 */
export class DownsampledDropShadowFilter extends DropShadowFilter {
  downsampleBlur = true;

  override apply(
    filterManager: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clearMode: boolean,
  ): void {
    const inputResolution = input.source.resolution;
    const halvings = this.downsampleBlur ? shadowBlurHalvings(inputResolution, this.blur) : 0;
    if (halvings === 0) {
      super.apply(filterManager, input, output, clearMode);
      return;
    }

    const { _blurFilter: blur, _basePass: copy } = this as unknown as DropShadowPasses;
    const taken: Texture[] = [];
    const take = (resolution: number) => {
      const texture = takeTexture(input, resolution);
      taken.push(texture);
      return texture;
    };

    // Each step averages two by two texels into one.
    let source = input;
    let resolution = inputResolution;
    for (let i = 0; i < halvings; i += 1) {
      resolution /= 2;
      const half = take(resolution);
      filterManager.applyFilter(copy, source, half, true);
      source = half;
    }

    // The shadow's colour and offset, then its blur: offsets and blur strength
    // are in px of the filtered area, whatever the resolution of the texture.
    const silhouette = take(resolution);
    filterManager.applyFilter(this, source, silhouette, true);
    blur.apply(filterManager, silhouette, output, clearMode);

    if (!this.shadowOnly) {
      filterManager.applyFilter(copy, input, output, false);
    }
    for (const texture of taken) TexturePool.returnTexture(texture);
  }
}
