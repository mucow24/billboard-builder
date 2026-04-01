import type { VignetteGeneratorParams } from '../document/documentTypes';

import type { GeneratorSpec } from './index';

export const vignetteGeneratorSpec: GeneratorSpec<VignetteGeneratorParams> = {
  type: 'vignette',
  label: 'Vignette',
  fields: [
    { key: 'intensity', label: 'Intensity', type: 'range', min: 0, max: 0.5, step: 0.01, textMin: 0, textMax: Infinity },
  ],
  createDefaultParams(): VignetteGeneratorParams {
    return {
      generatorType: 'vignette',
      intensity: 0.12,
    };
  },
  draw(ctx, w, h, params) {
    if (params.intensity <= 0) return;
    const grad = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.15,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.75,
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${params.intensity})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  },
};
