import type { BurstGeneratorParams } from '../document/documentTypes';

import { rgba } from './colorUtils';
import type { GeneratorFieldBoundsContext, GeneratorSpec } from './index';

/** The burst centre can travel this share of the canvas size either way: the whole canvas plus a margin. */
const OFFSET_RANGE = 0.75;

function offsetXBounds({ canvasWidth }: GeneratorFieldBoundsContext) {
  const reach = Math.round(canvasWidth * OFFSET_RANGE);
  return { min: -reach, max: reach, textMin: -reach, textMax: reach };
}

function offsetYBounds({ canvasHeight }: GeneratorFieldBoundsContext) {
  const reach = Math.round(canvasHeight * OFFSET_RANGE);
  return { min: -reach, max: reach, textMin: -reach, textMax: reach };
}

export const burstGeneratorSpec: GeneratorSpec<BurstGeneratorParams> = {
  type: 'burst',
  label: 'Burst Rays',
  fields: [
    { key: 'accentColor', label: 'Accent Color', tooltip: 'Color of every other ray.', type: 'color' },
    { key: 'bandColorB', label: 'Secondary Color', tooltip: 'Color of the rays in between.', type: 'color' },
    { key: 'burstRays', label: 'Ray Count', tooltip: 'Number of rays around the center.', type: 'range', min: 1, max: 48, step: 1, textMin: 1, textMax: 48 },
    { key: 'burstScale', label: 'Scale', tooltip: 'Length of the rays relative to the size of the canvas.', type: 'range', min: 0.1, max: 2, step: 0.01, textMin: 0, textMax: Infinity },
    { key: 'opacity', label: 'Opacity', tooltip: 'Transparency of the rays, from 0 (invisible) to 1 (solid).', type: 'range', min: 0, max: 1, step: 0.01, textMin: 0, textMax: 1 },
    // The fixed range is only a fallback: getBounds sizes the sliders to the canvas.
    { key: 'offsetX', label: 'Offset X', tooltip: 'Move the center of the burst left or right, in pixels.', type: 'range', min: -512, max: 512, step: 1, textMin: -512, textMax: 512, getBounds: offsetXBounds },
    { key: 'offsetY', label: 'Offset Y', tooltip: 'Move the center of the burst up or down, in pixels.', type: 'range', min: -512, max: 512, step: 1, textMin: -512, textMax: 512, getBounds: offsetYBounds },
    { key: 'rotation', label: 'Rotation', tooltip: 'Turn the burst around its center, in degrees.', type: 'range', min: -180, max: 180, step: 1, textMin: -Infinity, textMax: Infinity },
  ],
  createDefaultParams(): BurstGeneratorParams {
    return {
      generatorType: 'burst',
      accentColor: '#ff2d95',
      bandColorB: '#30f2ff',
      burstRays: 20,
      burstScale: 0.9,
      opacity: 0.18,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
    };
  },
  draw(ctx, w, h, params) {
    if (params.opacity <= 0 || params.burstRays <= 0) return;
    const cx = w * 0.5 + params.offsetX;
    const cy = h * 0.48 + params.offsetY;
    const maxR = Math.hypot(w, h) * params.burstScale;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((params.rotation * Math.PI) / 180);
    ctx.globalAlpha = params.opacity;
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
