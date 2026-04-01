import type { ScanlinesGeneratorParams } from '../document/documentTypes';

import type { GeneratorSpec } from './index';

export const scanlinesGeneratorSpec: GeneratorSpec<ScanlinesGeneratorParams> = {
  type: 'scanlines',
  label: 'Scanlines',
  fields: [
    { key: 'scanlineSpacing', label: 'Spacing', type: 'range', min: 2, max: 20, step: 1, textMin: 1, textMax: Infinity },
    { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 0.35, step: 0.01, textMin: 0, textMax: 1 },
  ],
  createDefaultParams(): ScanlinesGeneratorParams {
    return {
      generatorType: 'scanlines',
      scanlineSpacing: 5,
      opacity: 0.09,
    };
  },
  draw(ctx, w, h, params) {
    if (params.opacity <= 0) return;
    ctx.save();
    ctx.globalAlpha = params.opacity;
    ctx.fillStyle = '#000';
    for (let y = 0; y < h; y += params.scanlineSpacing) {
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();
  },
};
