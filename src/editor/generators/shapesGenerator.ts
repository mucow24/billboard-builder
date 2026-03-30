import type { ShapesGeneratorParams, ShapeTypeKey } from '../document/documentTypes';

import { mulberry32 } from './colorUtils';
import type { GeneratorSpec } from './index';

const SHAPE_KEYS: ShapeTypeKey[] = ['rect', 'diamond', 'triangle', 'circle', 'bar'];

function drawRectShape(ctx: CanvasRenderingContext2D, w: number, h: number, fill: boolean): void {
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  fill ? ctx.fill() : ctx.stroke();
}

function drawDiamondShape(ctx: CanvasRenderingContext2D, size: number, fill: boolean): void {
  ctx.beginPath();
  ctx.moveTo(0, -size / 2);
  ctx.lineTo(size / 2, 0);
  ctx.lineTo(0, size / 2);
  ctx.lineTo(-size / 2, 0);
  ctx.closePath();
  fill ? ctx.fill() : ctx.stroke();
}

function drawTriangleShape(ctx: CanvasRenderingContext2D, size: number, fill: boolean): void {
  ctx.beginPath();
  ctx.moveTo(0, -size / 2);
  ctx.lineTo(size / 2, size / 2);
  ctx.lineTo(-size / 2, size / 2);
  ctx.closePath();
  fill ? ctx.fill() : ctx.stroke();
}

function drawCircleShape(ctx: CanvasRenderingContext2D, radius: number, fill: boolean): void {
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  fill ? ctx.fill() : ctx.stroke();
}

export const shapesGeneratorSpec: GeneratorSpec<ShapesGeneratorParams> = {
  type: 'shapes',
  label: 'Shapes',
  fields: [
    { key: 'accentColor', label: 'Accent Color', type: 'color' },
    { key: 'bandColorA', label: 'Color A', type: 'color' },
    { key: 'bandColorB', label: 'Color B', type: 'color' },
    { key: 'shapeCount', label: 'Count', type: 'range', min: 0, max: 64, step: 1, textMin: 0, textMax: Infinity },
    { key: 'shapeMinSize', label: 'Min Size', type: 'range', min: 4, max: 240, step: 1, textMin: 0, textMax: Infinity },
    { key: 'shapeMaxSize', label: 'Max Size', type: 'range', min: 8, max: 320, step: 1, textMin: 0, textMax: Infinity },
    { key: 'shapeRotation', label: 'Rotation', type: 'range', min: 0, max: 1, step: 0.01, textMin: 0, textMax: 1 },
    { key: 'shapeOpacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, textMin: 0, textMax: 1 },
    { key: 'shapeOutline', label: 'Outline Width', type: 'range', min: 0, max: 24, step: 1, textMin: 0, textMax: Infinity },
    { key: 'shapeMix', label: 'Fill Mix', type: 'range', min: 0, max: 1, step: 0.01, textMin: 0, textMax: 1 },
    { key: 'seedOverride', label: 'Seed Override', type: 'optionalNumber', min: 1, max: 999999999 },
  ],
  createDefaultParams(): ShapesGeneratorParams {
    return {
      generatorType: 'shapes',
      accentColor: '#ff2d95',
      bandColorA: '#8d1fff',
      bandColorB: '#30f2ff',
      shapeTypes: { rect: true, diamond: true, triangle: true, circle: true, bar: true },
      shapeCount: 12,
      shapeMinSize: 40,
      shapeMaxSize: 180,
      shapeRotation: 0.5,
      shapeOpacity: 0.85,
      shapeOutline: 6,
      shapeMix: 0.7,
      seedOverride: null,
    };
  },
  draw(ctx, w, h, params, seed) {
    if (params.shapeCount <= 0 || params.shapeOpacity <= 0) return;
    const rng = mulberry32(params.seedOverride ?? seed);
    const types = SHAPE_KEYS.filter((key) => params.shapeTypes[key]);
    if (!types.length) return;

    ctx.save();
    ctx.globalAlpha = params.shapeOpacity;
    for (let i = 0; i < params.shapeCount; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const size = params.shapeMinSize + rng() * Math.max(0, params.shapeMaxSize - params.shapeMinSize);
      const rotation = (rng() - 0.5) * Math.PI * params.shapeRotation * 2;
      const fill = rng() < params.shapeMix;
      const type = types[Math.floor(rng() * types.length)];
      const color =
        rng() < 0.45
          ? params.accentColor
          : rng() < 0.5
            ? params.bandColorA
            : params.bandColorB;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.lineWidth = params.shapeOutline;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      switch (type) {
        case 'rect':
          drawRectShape(ctx, size, size * (0.35 + rng() * 0.9), fill);
          break;
        case 'diamond':
          drawDiamondShape(ctx, size, fill);
          break;
        case 'triangle':
          drawTriangleShape(ctx, size, fill);
          break;
        case 'circle':
          drawCircleShape(ctx, size * 0.5, fill);
          break;
        case 'bar':
          drawRectShape(ctx, size * (1.2 + rng()), Math.max(8, size * 0.15), fill);
          break;
      }
      ctx.restore();
    }
    ctx.restore();
  },
};
