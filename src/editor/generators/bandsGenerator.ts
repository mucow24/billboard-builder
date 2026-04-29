import type { BandsGeneratorParams } from '../document/documentTypes';

import { mixColor, mulberry32, rgba } from './colorUtils';
import type { GeneratorSpec } from './index';

function drawBands(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  params: BandsGeneratorParams,
  rng: () => number,
): void {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((params.stripeAngle * Math.PI) / 180);
  const span = Math.hypot(w, h) * 1.6;
  const start = -span / 2;
  const nominal = params.stripeThickness;
  let cursor = start - span * params.stripeOffset;
  for (let i = 0; i < params.stripeCount; i++) {
    const jitter = (rng() - 0.5) * nominal * params.stripeSpacingJitter * 2;
    const thickness = Math.max(4, nominal + jitter);
    const skew = (rng() - 0.5) * span * params.stripeSkew;
    const t = i / Math.max(1, params.stripeCount - 1);
    const color = mixColor(
      params.bandColorA,
      params.bandColorB,
      Math.pow(t, Math.max(0.01, params.stripeContrast)),
    );
    if (params.stripeGlow > 0) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = params.stripeGlow;
      // ctx.filter blur is in physical pixels and ignores ctx transforms,
      // so multiply by the current x-scale to keep the glow consistent in
      // logical units when the surface is rendered at a higher pixel scale.
      const physicalScale = ctx.getTransform().a;
      ctx.filter = `blur(${Math.max(1, thickness * 0.35) * physicalScale}px)`;
      ctx.beginPath();
      ctx.moveTo(cursor, -span / 2);
      ctx.lineTo(cursor + thickness, -span / 2);
      ctx.lineTo(cursor + thickness + skew, span / 2);
      ctx.lineTo(cursor + skew, span / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cursor, -span / 2);
    ctx.lineTo(cursor + thickness, -span / 2);
    ctx.lineTo(cursor + thickness + skew, span / 2);
    ctx.lineTo(cursor + skew, span / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(params.shadowColor, 0.18);
    ctx.fillRect(cursor + thickness - 4, -span / 2, 6, span);
    cursor += thickness;
  }
  ctx.restore();
}

export const bandsGeneratorSpec: GeneratorSpec<BandsGeneratorParams> = {
  type: 'bands',
  label: 'Diagonal Bands',
  fields: [
    { key: 'bandColorA', label: 'Band Color A', type: 'color' },
    { key: 'bandColorB', label: 'Band Color B', type: 'color' },
    { key: 'shadowColor', label: 'Shadow Color', type: 'color' },
    { key: 'stripeCount', label: 'Band Count', type: 'range', min: 2, max: 64, step: 1, textMin: 1, textMax: Infinity },
    { key: 'stripeAngle', label: 'Band Angle', type: 'range', min: -90, max: 90, step: 1, textMin: -Infinity, textMax: Infinity },
    { key: 'stripeThickness', label: 'Band Thickness', type: 'range', min: 8, max: 220, step: 1, textMin: 1, textMax: Infinity },
    { key: 'stripeSpacingJitter', label: 'Spacing Jitter', type: 'range', min: 0, max: 5, step: 0.01, textMin: 0, textMax: 5 },
    { key: 'stripeOffset', label: 'Band Offset', type: 'range', min: -1, max: 1, step: 0.001, textMin: -Infinity, textMax: Infinity },
    { key: 'stripeSkew', label: 'Skew Intensity', type: 'range', min: 0, max: 3, step: 0.01, textMin: 0, textMax: 3 },
    { key: 'stripeContrast', label: 'Color Contrast', type: 'range', min: 0, max: 1, step: 0.01, textMin: 0, textMax: 1 },
    { key: 'stripeGlow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, textMin: 0, textMax: 1 },
    { key: 'seedOverride', label: 'Seed Override', type: 'optionalNumber', min: 1, max: 999999999 },
  ],
  createDefaultParams(): BandsGeneratorParams {
    return {
      generatorType: 'bands',
      bandColorA: '#8d1fff',
      bandColorB: '#30f2ff',
      shadowColor: '#000000',
      stripeCount: 24,
      stripeAngle: -20,
      stripeThickness: 56,
      stripeSpacingJitter: 0.32,
      stripeOffset: 0.1,
      stripeSkew: 0.28,
      stripeContrast: 0.92,
      stripeGlow: 0.14,
      seedOverride: null,
    };
  },
  draw(ctx, w, h, params, seed) {
    const rng = mulberry32(params.seedOverride ?? seed);
    drawBands(ctx, w, h, params, rng);
  },
};
