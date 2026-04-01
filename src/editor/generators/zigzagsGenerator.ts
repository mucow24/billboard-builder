import type { ZigzagsGeneratorParams } from '../document/documentTypes';

import { mulberry32 } from './colorUtils';
import type { GeneratorSpec } from './index';

export const zigzagsGeneratorSpec: GeneratorSpec<ZigzagsGeneratorParams> = {
  type: 'zigzags',
  label: 'Zigzags',
  fields: [
    { key: 'accentColor', label: 'Accent Color', type: 'color' },
    { key: 'bandColorA', label: 'Secondary Color', type: 'color' },
    { key: 'count', label: 'Count', type: 'range', min: 0, max: 24, step: 1, textMin: 0, textMax: Infinity },
    { key: 'zigzagAmplitude', label: 'Amplitude', type: 'range', min: 0, max: 160, step: 1, textMin: 0, textMax: Infinity },
    { key: 'thickness', label: 'Thickness', type: 'range', min: 1, max: 24, step: 1, textMin: 0, textMax: Infinity },
    { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, textMin: 0, textMax: 1 },
    { key: 'seedOverride', label: 'Seed Override', type: 'optionalNumber', min: 1, max: 999999999 },
  ],
  createDefaultParams(): ZigzagsGeneratorParams {
    return {
      generatorType: 'zigzags',
      accentColor: '#ff2d95',
      bandColorA: '#8d1fff',
      count: 9,
      zigzagAmplitude: 48,
      thickness: 8,
      opacity: 0.85,
      seedOverride: null,
    };
  },
  draw(ctx, w, h, params, seed) {
    if (params.count <= 0 || params.opacity <= 0 || params.thickness <= 0) return;
    const rng = mulberry32(params.seedOverride ?? seed);
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.globalAlpha = params.opacity;
    for (let i = 0; i < params.count; i++) {
      const y = ((i + 0.5) / params.count) * h;
      const step = Math.max(24, w / (8 + i + 2));
      const phase = rng() * step * 2;
      ctx.beginPath();
      for (let x = -step * 2; x <= w + step * 2; x += step) {
        const index = Math.floor((x + phase) / step);
        const dy = index % 2 === 0 ? -params.zigzagAmplitude : params.zigzagAmplitude;
        if (x === -step * 2) ctx.moveTo(x, y + dy);
        else ctx.lineTo(x, y + dy);
      }
      ctx.strokeStyle = i % 2 === 0 ? params.accentColor : params.bandColorA;
      ctx.lineWidth = params.thickness;
      ctx.stroke();
    }
    ctx.restore();
  },
};
