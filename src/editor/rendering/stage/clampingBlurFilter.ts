import { BlurFilter, type BlurFilterOptions, GlProgram, GpuProgram } from 'pixi.js';

// Gaussian kernel weights (matches Pixi's internal GAUSSIAN_VALUES so we can
// be a drop-in replacement for BlurFilter at the same kernelSize).
const GAUSSIAN_VALUES: Record<number, number[]> = {
  5: [0.153388, 0.221461, 0.250301],
  7: [0.071303, 0.131514, 0.189879, 0.214607],
  9: [0.028532, 0.067234, 0.124009, 0.179044, 0.20236],
  11: [0.0093, 0.028002, 0.065984, 0.121703, 0.175713, 0.198596],
  13: [0.002406, 0.009255, 0.027867, 0.065666, 0.121117, 0.174868, 0.197641],
  15: [0.000489, 0.002403, 0.009246, 0.02784, 0.065602, 0.120999, 0.174697, 0.197448],
};

// Pixi's BlurFilter samples raw UVs without clamping. TexturePool returns
// power-of-two textures and reuses them across frames; the area between the
// active frame and the po2 boundary keeps stale pixels from previous use.
// At larger blur strengths the kernel reaches into that dirty padding and
// pulls in bright values, producing zoom/blur-dependent edge artifacts that
// vary on text edits as the pool hands back different textures. Clamping
// every sample to uInputClamp keeps reads inside the active frame.

function generateClampingWgsl(horizontal: boolean, kernelSize: number): string {
  const kernel = GAUSSIAN_VALUES[kernelSize];
  const halfLength = kernel.length;
  const dimension = horizontal ? 'z' : 'w';

  const blurStruct = Array.from({ length: kernelSize }, (_, i) =>
    `  @location(${i}) offset${i}: vec2<f32>,`,
  ).join('\n');

  const blurVertexOut = Array.from({ length: kernelSize }, (_, i) => {
    const sampleIndex = i - halfLength + 1;
    const offset = horizontal
      ? `vec2(${sampleIndex.toFixed(1)} * pixelStrength, 0.0)`
      : `vec2(0.0, ${sampleIndex.toFixed(1)} * pixelStrength)`;
    return `    filteredCord + ${offset},`;
  }).join('\n');

  const blurSampling = Array.from({ length: kernelSize }, (_, i) => {
    const kernelIndex = i < halfLength ? i : kernelSize - i - 1;
    const weight = kernel[kernelIndex].toString();
    return `  finalColor += textureSample(uTexture, uSampler, clamp(offset${i}, gfu.uInputClamp.xy, gfu.uInputClamp.zw)) * ${weight};`;
  }).join('\n');

  return `
struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

struct BlurUniforms {
  uStrength: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> blurUniforms: BlurUniforms;

struct VSOutput {
  @builtin(position) position: vec4<f32>,
${blurStruct}
};

fn filterVertexPosition(aPosition: vec2<f32>) -> vec4<f32> {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

fn filterTextureCoord(aPosition: vec2<f32>) -> vec2<f32> {
  return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
  let filteredCord = filterTextureCoord(aPosition);
  let pixelStrength = gfu.uInputSize.${dimension} * blurUniforms.uStrength;
  return VSOutput(
    filterVertexPosition(aPosition),
${blurVertexOut}
  );
}

@fragment
fn mainFragment(
  @builtin(position) position: vec4<f32>,
${blurStruct}
) -> @location(0) vec4<f32> {
  var finalColor = vec4(0.0);
${blurSampling}
  return finalColor;
}
`;
}

function generateClampingGlVertex(horizontal: boolean, kernelSize: number): string {
  const halfLength = Math.ceil(kernelSize / 2);
  const dimension = horizontal ? 'z' : 'w';
  const offsets = Array.from({ length: kernelSize }, (_, i) => {
    const sampleIndex = (i - (halfLength - 1)).toFixed(1);
    const offset = horizontal
      ? `vec2(${sampleIndex} * pixelStrength, 0.0)`
      : `vec2(0.0, ${sampleIndex} * pixelStrength)`;
    return `  vBlurTexCoords[${i}] = textureCoord + ${offset};`;
  }).join('\n');

  return `in vec2 aPosition;
uniform float uStrength;
out vec2 vBlurTexCoords[${kernelSize}];

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  float pixelStrength = uInputSize.${dimension} * uStrength;
  vec2 textureCoord = filterTextureCoord();
${offsets}
}`;
}

function generateClampingGlFragment(kernelSize: number): string {
  const kernel = GAUSSIAN_VALUES[kernelSize];
  const halfLength = kernel.length;
  const samples = Array.from({ length: kernelSize }, (_, i) => {
    const prefix = i === 0 ? 'finalColor = ' : '    + ';
    const kernelIndex = i < halfLength ? i : kernelSize - i - 1;
    const weight = kernel[kernelIndex].toString();
    return `${prefix}texture(uTexture, clamp(vBlurTexCoords[${i}], uInputClamp.xy, uInputClamp.zw)) * ${weight}`;
  }).join('\n');

  return `in vec2 vBlurTexCoords[${kernelSize}];
uniform sampler2D uTexture;
uniform vec4 uInputClamp;
out vec4 finalColor;

void main(void) {
${samples};
}`;
}

function generateClampingPrograms(
  horizontal: boolean,
  kernelSize: number,
): { gpuProgram: GpuProgram; glProgram: GlProgram } {
  const wgsl = generateClampingWgsl(horizontal, kernelSize);
  const gpuProgram = GpuProgram.from({
    vertex: { source: wgsl, entryPoint: 'mainVertex' },
    fragment: { source: wgsl, entryPoint: 'mainFragment' },
  });
  const glProgram = GlProgram.from({
    vertex: generateClampingGlVertex(horizontal, kernelSize),
    fragment: generateClampingGlFragment(kernelSize),
    name: `clamping-blur-${horizontal ? 'horizontal' : 'vertical'}`,
  });
  return { gpuProgram, glProgram };
}

interface BlurSubFilter {
  gpuProgram: GpuProgram;
  glProgram: GlProgram;
}

export class ClampingBlurFilter extends BlurFilter {
  constructor(options?: BlurFilterOptions) {
    super(options);
    const kernelSize = options?.kernelSize ?? 5;
    if (!GAUSSIAN_VALUES[kernelSize]) {
      throw new Error(`ClampingBlurFilter: unsupported kernelSize ${kernelSize}`);
    }
    const xPrograms = generateClampingPrograms(true, kernelSize);
    const yPrograms = generateClampingPrograms(false, kernelSize);
    const blurX = this.blurXFilter as unknown as BlurSubFilter;
    const blurY = this.blurYFilter as unknown as BlurSubFilter;
    blurX.gpuProgram = xPrograms.gpuProgram;
    blurX.glProgram = xPrograms.glProgram;
    blurY.gpuProgram = yPrograms.gpuProgram;
    blurY.glProgram = yPrograms.glProgram;
  }
}
