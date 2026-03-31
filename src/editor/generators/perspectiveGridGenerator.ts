import type { PerspectiveGridGeneratorParams } from '../document/documentTypes';

import type { GeneratorSpec } from './index';

function computePerspectiveNearY(horizonY: number, h: number, nearControl: number): number {
  if (nearControl <= 0) {
    const t = nearControl + 1;
    return horizonY + (1 - t) * (h - horizonY);
  }
  return horizonY - nearControl * horizonY;
}

export const perspectiveGridGeneratorSpec: GeneratorSpec<PerspectiveGridGeneratorParams> = {
  type: 'perspectiveGrid',
  label: 'Perspective Grid',
  fields: [
    { key: 'bandColorB', label: 'Grid Color', type: 'color' },
    { key: 'perspectiveHorizon', label: 'Horizon', type: 'range', min: 0.1, max: 0.9, step: 0.01, textMin: 0, textMax: 1 },
    { key: 'perspectiveDepth', label: 'Depth Lines', type: 'range', min: 2, max: 32, step: 1, textMin: 1, textMax: Infinity },
    { key: 'perspectiveNear', label: 'Near Point', type: 'range', min: -1, max: 1, step: 0.01, textMin: -Infinity, textMax: Infinity },
    { key: 'perspectiveExtent', label: 'Extent', type: 'range', min: 0, max: 1, step: 0.01, textMin: 0, textMax: 1 },
    { key: 'perspectiveThickness', label: 'Thickness', type: 'range', min: 0.5, max: 12, step: 0.5, textMin: 0, textMax: Infinity },
    { key: 'perspectiveThicknessFalloff', label: 'Falloff', type: 'range', min: 0, max: 2, step: 0.01, textMin: 0, textMax: Infinity },
    { key: 'perspectiveRows', label: 'Rows', type: 'range', min: 0, max: 32, step: 1, textMin: 0, textMax: Infinity },
  ],
  createDefaultParams(): PerspectiveGridGeneratorParams {
    return {
      generatorType: 'perspectiveGrid',
      bandColorB: '#30f2ff',
      perspectiveHorizon: 0.62,
      perspectiveDepth: 14,
      perspectiveNear: 0,
      perspectiveExtent: 0.5,
      perspectiveThickness: 2,
      perspectiveThicknessFalloff: 0.5,
      perspectiveRows: 16,
    };
  },
  draw(ctx, w, h, params) {
    const horizonY = h * params.perspectiveHorizon;
    const vanishingX = w / 2;
    const closestY = computePerspectiveNearY(horizonY, h, params.perspectiveNear);
    const span = w * 0.42;
    const rows = Math.max(0, Math.floor(Number(params.perspectiveRows) || 0));
    const extent = Math.max(0, Math.min(1, Number(params.perspectiveExtent) || 0));
    const totalY = closestY - horizonY;
    const farY = closestY - totalY * extent;
    const baseThickness = Math.max(0.1, Number(params.perspectiveThickness) || 2);
    const thicknessFalloff = Math.max(0, Number(params.perspectiveThicknessFalloff) || 0);

    function thicknessAtDepth(depth: number): number {
      const d = Math.max(0, Math.min(1, depth));
      return Math.max(0.1, baseThickness * (1 - thicknessFalloff * d * 0.85));
    }

    ctx.save();
    ctx.strokeStyle = params.bandColorB;
    const verticalThickness = thicknessAtDepth(extent * 0.5);
    for (let i = -params.perspectiveDepth; i <= params.perspectiveDepth; i++) {
      const xNear = vanishingX + (i / params.perspectiveDepth) * span;
      const xFar = vanishingX + (xNear - vanishingX) * (1 - extent);
      ctx.beginPath();
      ctx.lineWidth = verticalThickness;
      ctx.moveTo(xNear, closestY);
      ctx.lineTo(xFar, farY);
      ctx.stroke();
    }
    if (extent <= 0.0001 || rows <= 0) {
      ctx.beginPath();
      ctx.lineWidth = baseThickness;
      ctx.moveTo(vanishingX - span, closestY);
      ctx.lineTo(vanishingX + span, closestY);
      ctx.stroke();
      ctx.restore();
      return;
    }
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const eased = 1 - Math.pow(1 - t, 2.3);
      const y = closestY - (closestY - farY) * eased;
      const widthFactor = 1 - eased * extent;
      const halfWidth = span * widthFactor;
      const depth = eased * extent;
      ctx.beginPath();
      ctx.lineWidth = thicknessAtDepth(depth);
      ctx.moveTo(vanishingX - halfWidth, y);
      ctx.lineTo(vanishingX + halfWidth, y);
      ctx.stroke();
    }
    ctx.restore();
  },
};
