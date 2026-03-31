import type { FlatGridGeneratorParams } from '../document/documentTypes';

import type { GeneratorSpec } from './index';

export const flatGridGeneratorSpec: GeneratorSpec<FlatGridGeneratorParams> = {
  type: 'flatGrid',
  label: 'Flat Grid',
  fields: [
    { key: 'accentColor', label: 'Grid Color', type: 'color' },
    { key: 'gridSpacingX', label: 'Spacing X', type: 'range', min: 8, max: 180, step: 1, textMin: 1, textMax: Infinity },
    { key: 'gridSpacingY', label: 'Spacing Y', type: 'range', min: 8, max: 180, step: 1, textMin: 1, textMax: Infinity },
    { key: 'gridThickness', label: 'Thickness', type: 'range', min: 1, max: 8, step: 0.5, textMin: 0, textMax: Infinity },
    { key: 'gridOffsetX', label: 'Offset X', type: 'range', min: -240, max: 240, step: 1, textMin: -Infinity, textMax: Infinity },
    { key: 'gridOffsetY', label: 'Offset Y', type: 'range', min: -240, max: 240, step: 1, textMin: -Infinity, textMax: Infinity },
    { key: 'gridRotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, textMin: -Infinity, textMax: Infinity },
  ],
  createDefaultParams(): FlatGridGeneratorParams {
    return {
      generatorType: 'flatGrid',
      accentColor: '#30f2ff',
      gridSpacingX: 40,
      gridSpacingY: 40,
      gridThickness: 2,
      gridOffsetX: 0,
      gridOffsetY: 0,
      gridRotation: 0,
    };
  },
  draw(ctx, w, h, params) {
    const spacingX = Math.max(1, params.gridSpacingX);
    const spacingY = Math.max(1, params.gridSpacingY);
    const span = Math.hypot(w, h) * 1.8;
    const offsetX = ((params.gridOffsetX % spacingX) + spacingX) % spacingX;
    const offsetY = ((params.gridOffsetY % spacingY) + spacingY) % spacingY;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((params.gridRotation * Math.PI) / 180);
    ctx.strokeStyle = params.accentColor;
    ctx.lineWidth = params.gridThickness;
    ctx.beginPath();
    for (let x = -span / 2 + offsetX; x <= span / 2; x += spacingX) {
      ctx.moveTo(x, -span / 2);
      ctx.lineTo(x, span / 2);
    }
    for (let y = -span / 2 + offsetY; y <= span / 2; y += spacingY) {
      ctx.moveTo(-span / 2, y);
      ctx.lineTo(span / 2, y);
    }
    ctx.stroke();
    ctx.restore();
  },
};
