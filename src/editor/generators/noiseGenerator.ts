import type { NoiseGeneratorParams } from '../document/documentTypes';

import { mulberry32 } from './colorUtils';
import type { GeneratorSpec } from './index';

let noiseCanvas: HTMLCanvasElement | null = null;
let noiseCtx: CanvasRenderingContext2D | null = null;

export const noiseGeneratorSpec: GeneratorSpec<NoiseGeneratorParams> = {
  type: 'noise',
  label: 'Noise',
  fields: [
    { key: 'noise', label: 'Intensity', type: 'range', min: 0, max: 0.2, step: 0.001 },
    { key: 'seedOverride', label: 'Seed Override', type: 'optionalNumber', min: 1, max: 999999999 },
  ],
  createDefaultParams(): NoiseGeneratorParams {
    return {
      generatorType: 'noise',
      noise: 0.05,
      seedOverride: null,
    };
  },
  draw(ctx, w, h, params, seed) {
    if (params.noise <= 0) return;
    const rng = mulberry32(params.seedOverride ?? seed);

    if (!noiseCanvas) {
      noiseCanvas = document.createElement('canvas');
      noiseCtx = noiseCanvas.getContext('2d');
    }
    if (noiseCanvas.width !== w) noiseCanvas.width = w;
    if (noiseCanvas.height !== h) noiseCanvas.height = h;
    if (!noiseCtx) return;

    const image = noiseCtx.createImageData(w, h);
    const data = image.data;
    const alpha = Math.round(255 * params.noise);
    for (let i = 0; i < data.length; i += 4) {
      const n = Math.floor(rng() * 255);
      data[i] = n;
      data[i + 1] = n;
      data[i + 2] = n;
      data[i + 3] = alpha;
    }
    noiseCtx.putImageData(image, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.drawImage(noiseCanvas, 0, 0);
    ctx.restore();
  },
};
