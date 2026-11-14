import type { ScanlinesGeneratorParams } from '../document/documentTypes';

import { rgba } from './colorUtils';
import type { GeneratorSpec } from './index';

export const scanlinesGeneratorSpec: GeneratorSpec<ScanlinesGeneratorParams> = {
  type: 'scanlines',
  label: 'Scanlines',
  fields: [
    { key: 'scanlineColor', label: 'Scanline Color', tooltip: 'Color of the lines.', type: 'color' },
    { key: 'opacity', label: 'Opacity', tooltip: 'Transparency of the lines, from 0 (invisible) to 1 (solid).', type: 'range', min: 0, max: 1, step: 0.01, textMin: 0, textMax: 1 },
    { key: 'scanlineHeight', label: 'Height', tooltip: 'Thickness of each line, in pixels.', type: 'range', min: 1, max: 20, step: 1, textMin: 1, textMax: Infinity },
    { key: 'scanlineSpacing', label: 'Spacing', tooltip: 'Gap between lines, in pixels.', type: 'range', min: 1, max: 20, step: 1, textMin: 0, textMax: Infinity },
  ],
  createDefaultParams(): ScanlinesGeneratorParams {
    return {
      generatorType: 'scanlines',
      scanlineColor: '#000000',
      opacity: 0.09,
      scanlineHeight: 1,
      scanlineSpacing: 4,
    };
  },
  draw(ctx, w, h, params) {
    const lineHeight = Math.max(1, params.scanlineHeight);
    const gap = Math.max(0, params.scanlineSpacing);
    const step = lineHeight + gap;

    ctx.save();
    ctx.fillStyle = rgba(params.scanlineColor, params.opacity);
    for (let y = 0; y < h; y += step) {
      ctx.fillRect(0, y, w, lineHeight);
    }
    ctx.restore();
  },
};
