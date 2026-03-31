import type { ScanlinesGeneratorParams } from '../document/documentTypes';

import { rgba } from './colorUtils';
import type { GeneratorSpec } from './index';

export const scanlinesGeneratorSpec: GeneratorSpec<ScanlinesGeneratorParams> = {
  type: 'scanlines',
  label: 'Scanlines',
  fields: [
    { key: 'scanlineColor', label: 'Scanline Color', type: 'color' },
    { key: 'scanlineHeight', label: 'Height', type: 'range', min: 1, max: 20, step: 1, textMin: 1, textMax: Infinity },
    { key: 'scanlineSpacing', label: 'Spacing', type: 'range', min: 1, max: 20, step: 1, textMin: 0, textMax: Infinity },
  ],
  createDefaultParams(): ScanlinesGeneratorParams {
    return {
      generatorType: 'scanlines',
      scanlineColor: '#00000017',
      scanlineHeight: 1,
      scanlineSpacing: 4,
    };
  },
  draw(ctx, w, h, params) {
    const lineHeight = Math.max(1, params.scanlineHeight);
    const gap = Math.max(0, params.scanlineSpacing);
    const step = lineHeight + gap;

    ctx.save();
    ctx.fillStyle = rgba(params.scanlineColor, 1);
    for (let y = 0; y < h; y += step) {
      ctx.fillRect(0, y, w, lineHeight);
    }
    ctx.restore();
  },
};
