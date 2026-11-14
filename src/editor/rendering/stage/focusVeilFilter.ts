import { AlphaFilter, Filter, GlProgram, GpuProgram, Texture, TexturePool } from 'pixi.js';
import type { FilterSystem, RenderSurface, Texture as PixiTexture } from 'pixi.js';

import { ClampingBlurFilter } from './clampingBlurFilter';

/**
 * The canvas-focus veil (shown by the Canvas focus button, while the Export
 * button is hovered and while the bounds key is held): everything outside the
 * canvas is blurred and darkened, the canvas itself is left untouched.
 *
 * It is a filter on the layer that holds the graphic items, not a DOM element
 * over the whole stage, so it blurs only the items. Selection outlines,
 * handles, guides and the marquee are drawn after this layer and stay sharp.
 *
 * `progress` (0..1) fades the veil in and out: it scales the blur radius and
 * mixes the veiled result over the untouched layer, the way the CSS veil
 * this replaces eased its backdrop blur together with its opacity.
 */

/** The veil's colour: rgba(6, 10, 20, 0.82). */
export const FOCUS_VEIL_COLOR = { r: 6, g: 10, b: 20, a: 0.82 } as const;

/** Gaussian standard deviation of the fully faded-in blur, in CSS pixels. */
export const FOCUS_VEIL_BLUR_SIGMA = 18;

const KERNEL_SIZE = 9;
// Standard deviation of one pass of the 9-tap kernel, in units of its
// sample step. The passes of Pixi's blur combine so that the whole blur has
// a step of `strength`; strength = sigma / this gives the wanted sigma.
const KERNEL_SIGMA_PER_STEP = 1.863;

const glFragment = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uBlurred;
uniform vec4 uInputSize;
uniform vec4 uHole;
uniform vec4 uVeilColor;
uniform vec2 uOrigin;
uniform float uProgress;

void main(void) {
  vec4 sharp = texture(uTexture, vTextureCoord);
  vec2 position = uOrigin + vTextureCoord * uInputSize.xy;
  if (position.x >= uHole.x && position.x < uHole.z && position.y >= uHole.y && position.y < uHole.w) {
    finalColor = sharp;
    return;
  }
  vec4 blurred = texture(uBlurred, vTextureCoord);
  vec4 veiled = uVeilColor + blurred * (1.0 - uVeilColor.a);
  finalColor = mix(sharp, veiled, uProgress);
}
`;

const glVertex = `in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

const wgsl = `struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

struct VeilUniforms {
  uHole: vec4<f32>,
  uVeilColor: vec4<f32>,
  uOrigin: vec2<f32>,
  uProgress: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> veilUniforms: VeilUniforms;
@group(1) @binding(1) var uBlurred: texture_2d<f32>;

struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return VSOutput(
    vec4(position, 0.0, 1.0),
    aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw),
  );
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let sharp = textureSample(uTexture, uSampler, uv);
  let blurred = textureSample(uBlurred, uSampler, uv);
  let position = veilUniforms.uOrigin + uv * gfu.uInputSize.xy;
  let hole = veilUniforms.uHole;
  if (position.x >= hole.x && position.x < hole.z && position.y >= hole.y && position.y < hole.w) {
    return sharp;
  }
  let veilColor = veilUniforms.uVeilColor;
  let veiled = veilColor + blurred * (1.0 - veilColor.a);
  return mix(sharp, veiled, veilUniforms.uProgress);
}
`;

export interface FocusVeilHole {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface VeilUniformValues {
  uHole: Float32Array;
  uVeilColor: Float32Array;
  uOrigin: Float32Array;
  uProgress: number;
}

export class FocusVeilFilter extends Filter {
  private readonly blur: ClampingBlurFilter;
  private readonly copy = new AlphaFilter({ alpha: 1 });
  private _progress = 0;

  constructor() {
    const { r, g, b, a } = FOCUS_VEIL_COLOR;
    super({
      gpuProgram: GpuProgram.from({
        vertex: { source: wgsl, entryPoint: 'mainVertex' },
        fragment: { source: wgsl, entryPoint: 'mainFragment' },
      }),
      glProgram: GlProgram.from({ vertex: glVertex, fragment: glFragment, name: 'focus-veil' }),
      resources: {
        veilUniforms: {
          uHole: { value: new Float32Array(4), type: 'vec4<f32>' },
          // Premultiplied, as Pixi's render targets are.
          uVeilColor: {
            value: new Float32Array([(r / 255) * a, (g / 255) * a, (b / 255) * a, a]),
            type: 'vec4<f32>',
          },
          uOrigin: { value: new Float32Array(2), type: 'vec2<f32>' },
          uProgress: { value: 0, type: 'f32' },
        },
        uBlurred: Texture.EMPTY.source,
      },
      // The canvas inside the hole is copied through unchanged, so the layer
      // must be drawn at the screen's resolution and with its antialiasing.
      resolution: 'inherit',
      antialias: 'inherit',
      padding: 0,
    });
    this.blur = new ClampingBlurFilter({ strength: 0, kernelSize: KERNEL_SIZE, quality: 4 });
  }

  private get veilUniforms(): VeilUniformValues {
    return (this.resources.veilUniforms as { uniforms: VeilUniformValues }).uniforms;
  }

  get progress(): number {
    return this._progress;
  }

  set progress(value: number) {
    this._progress = Math.min(1, Math.max(0, value));
    this.veilUniforms.uProgress = this._progress;
    this.blur.strength = (FOCUS_VEIL_BLUR_SIGMA * this._progress) / KERNEL_SIGMA_PER_STEP;
  }

  /** The canvas on screen, in the stage's CSS pixels. */
  setHole({ left, top, right, bottom }: FocusVeilHole) {
    const hole = this.veilUniforms.uHole;
    hole[0] = left;
    hole[1] = top;
    hole[2] = right;
    hole[3] = bottom;
  }

  override apply(
    filterManager: FilterSystem,
    input: PixiTexture,
    output: RenderSurface,
    clearMode: boolean,
  ) {
    // Where the filtered area starts on screen, so the shader can place the
    // hole whatever area Pixi gives the filter.
    const bounds = (filterManager as unknown as { _activeFilterData: { bounds: { minX: number; minY: number } } })
      ._activeFilterData.bounds;
    const origin = this.veilUniforms.uOrigin;
    origin[0] = bounds.minX;
    origin[1] = bounds.minY;

    if (this.blur.strength > 0) {
      // Pixi's blur passes ping-pong through their input texture, so they
      // get a copy: the input is still needed, untouched, for the canvas.
      const scratch = TexturePool.getSameSizeTexture(input);
      const blurred = TexturePool.getSameSizeTexture(input);
      this.copy.apply(filterManager, input, scratch, true);
      this.blur.apply(filterManager, scratch, blurred, true);
      this.resources.uBlurred = blurred.source;
      super.apply(filterManager, input, output, clearMode);
      TexturePool.returnTexture(scratch);
      TexturePool.returnTexture(blurred);
    } else {
      this.resources.uBlurred = input.source;
      super.apply(filterManager, input, output, clearMode);
    }
  }

  override destroy() {
    this.blur.destroy();
    this.copy.destroy();
    super.destroy();
  }
}
