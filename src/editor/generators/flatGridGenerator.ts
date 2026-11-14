import type { FlatGridGeneratorParams } from '../document/documentTypes';

import type { GeneratorFieldBoundsContext, GeneratorSpec } from './index';

// The grid repeats every `spacing` pixels, so one spacing of offset reaches
// every position it can take.
function offsetXBounds({ params }: GeneratorFieldBoundsContext) {
  return params.generatorType === 'flatGrid' ? { min: 0, max: Math.max(1, params.gridSpacingX) } : {};
}

function offsetYBounds({ params }: GeneratorFieldBoundsContext) {
  return params.generatorType === 'flatGrid' ? { min: 0, max: Math.max(1, params.gridSpacingY) } : {};
}

export const flatGridGeneratorSpec: GeneratorSpec<FlatGridGeneratorParams> = {
  type: 'flatGrid',
  label: 'Flat Grid',
  fields: [
    { key: 'accentColor', label: 'Grid Color', tooltip: 'Color of the grid lines.', type: 'color' },
    { key: 'gridSpacingX', label: 'Spacing X', tooltip: 'Distance between vertical lines, in pixels.', type: 'range', min: 8, max: 180, step: 1, textMin: 1, textMax: Infinity },
    { key: 'gridSpacingY', label: 'Spacing Y', tooltip: 'Distance between horizontal lines, in pixels.', type: 'range', min: 8, max: 180, step: 1, textMin: 1, textMax: Infinity },
    { key: 'thickness', label: 'Thickness', tooltip: 'Width of the grid lines, in pixels.', type: 'range', min: 1, max: 64, step: 1, textMin: 1, textMax: 64 },
    { key: 'offsetX', label: 'Offset X', tooltip: 'Slide the grid sideways, in pixels. The grid repeats, so the slider covers one Spacing X.', type: 'range', min: 0, max: 40, step: 1, textMin: -Infinity, textMax: Infinity, getBounds: offsetXBounds },
    { key: 'offsetY', label: 'Offset Y', tooltip: 'Slide the grid up or down, in pixels. The grid repeats, so the slider covers one Spacing Y.', type: 'range', min: 0, max: 40, step: 1, textMin: -Infinity, textMax: Infinity, getBounds: offsetYBounds },
    { key: 'rotation', label: 'Rotation', tooltip: 'Turn the grid around the center of the canvas, in degrees.', type: 'range', min: -180, max: 180, step: 1, textMin: -Infinity, textMax: Infinity },
  ],
  createDefaultParams(): FlatGridGeneratorParams {
    return {
      generatorType: 'flatGrid',
      accentColor: '#30f2ff',
      gridSpacingX: 40,
      gridSpacingY: 40,
      thickness: 2,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
    };
  },
  draw(ctx, w, h, params) {
    const spacingX = Math.max(1, params.gridSpacingX);
    const spacingY = Math.max(1, params.gridSpacingY);
    const span = Math.hypot(w, h) * 1.8;
    const offsetX = ((params.offsetX % spacingX) + spacingX) % spacingX;
    const offsetY = ((params.offsetY % spacingY) + spacingY) % spacingY;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((params.rotation * Math.PI) / 180);
    ctx.strokeStyle = params.accentColor;
    ctx.lineWidth = params.thickness;
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
