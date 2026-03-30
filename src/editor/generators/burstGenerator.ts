import type { BurstGeneratorParams } from '../document/documentTypes';

import { rgba } from './colorUtils';
import type { GeneratorSpec } from './index';

export const burstGeneratorSpec: GeneratorSpec<BurstGeneratorParams> = {
  type: 'burst',
  label: 'Burst Rays',
  fields: [
    { key: 'accentColor', label: 'Accent Color', type: 'color' },
    { key: 'bandColorB', label: 'Secondary Color', type: 'color' },
    { key: 'burstRays', label: 'Ray Count', type: 'range', min: 2, max: 48, step: 1, textMin: 1, textMax: Infinity },
    { key: 'burstScale', label: 'Scale', type: 'range', min: 0.1, max: 2, step: 0.01, textMin: 0, textMax: Infinity },
    { key: 'burstOpacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, textMin: 0, textMax: 1 },
    { key: 'burstOffsetX', label: 'Offset X', type: 'range', min: -240, max: 240, step: 1, textMin: -Infinity, textMax: Infinity },
    { key: 'burstOffsetY', label: 'Offset Y', type: 'range', min: -240, max: 240, step: 1, textMin: -Infinity, textMax: Infinity },
    { key: 'burstRotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, textMin: -Infinity, textMax: Infinity },
  ],
  createDefaultParams(): BurstGeneratorParams {
    return {
      generatorType: 'burst',
      accentColor: '#ff2d95',
      bandColorB: '#30f2ff',
      burstRays: 20,
      burstScale: 0.9,
      burstOpacity: 0.18,
      burstOffsetX: 0,
      burstOffsetY: 0,
      burstRotation: 0,
    };
  },
  draw(ctx, w, h, params) {
    if (params.burstOpacity <= 0 || params.burstRays <= 0) return;
    const cx = w * 0.5 + params.burstOffsetX;
    const cy = h * 0.48 + params.burstOffsetY;
    const maxR = Math.hypot(w, h) * params.burstScale;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((params.burstRotation * Math.PI) / 180);
    ctx.globalAlpha = params.burstOpacity;
    for (let i = 0; i < params.burstRays; i++) {
      const a0 = (Math.PI * 2 * i) / params.burstRays;
      const a1 = (Math.PI * 2 * (i + 0.56)) / params.burstRays;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a0) * maxR, Math.sin(a0) * maxR);
      ctx.lineTo(Math.cos(a1) * maxR, Math.sin(a1) * maxR);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? rgba(params.accentColor, 0.8) : rgba(params.bandColorB, 0.65);
      ctx.fill();
    }
    ctx.restore();
  },
};
