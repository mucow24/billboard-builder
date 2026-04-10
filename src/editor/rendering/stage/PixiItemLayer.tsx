import { useCallback } from 'react';
import { FillGradient, Graphics } from 'pixi.js';

import type {
  EllipseCanvasItem,
  LineCanvasItem,
  NgonCanvasItem,
  RectangleCanvasItem,
  TextCanvasItem,
} from '../../document/documentTypes';
import type { RenderableCanvasItem } from '../renderAdapter';

// ---------------------------------------------------------------------------
// Ngon geometry — ported from ShapeItemView
// ---------------------------------------------------------------------------

function computeNgonPoints(
  width: number,
  height: number,
  sides: number,
): Array<{ x: number; y: number }> {
  const offset =
    sides % 2 === 0 ? -Math.PI / 2 - Math.PI / sides : -Math.PI / 2;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides + offset;
    xs.push(Math.cos(angle));
    ys.push(Math.sin(angle));
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rawW = maxX - minX;
  const rawH = maxY - minY;
  return xs.map((x, i) => ({
    x: ((x - minX) / rawW) * width,
    y: ((ys[i] - minY) / rawH) * height,
  }));
}

// ---------------------------------------------------------------------------
// Gradient helper
// ---------------------------------------------------------------------------

function computeGradientEndpoints(
  item: { gradientEnabled: boolean; gradientAngle: number },
  width: number,
  height: number,
): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!item.gradientEnabled) return null;
  const angleRad = (item.gradientAngle * Math.PI) / 180;
  const sinA = Math.sin(angleRad);
  const cosA = Math.cos(angleRad);
  const cx = width / 2;
  const cy = height / 2;
  const halfLen =
    (width / 2) * Math.abs(sinA) + (height / 2) * Math.abs(cosA);
  return {
    x0: cx - halfLen * sinA,
    y0: cy - halfLen * cosA,
    x1: cx + halfLen * sinA,
    y1: cy + halfLen * cosA,
  };
}


type GradientCapable = RectangleCanvasItem | EllipseCanvasItem | NgonCanvasItem | TextCanvasItem;

function buildPixiGradient(
  item: GradientCapable,
  width: number,
  height: number,
): FillGradient | null {
  const endpoints = computeGradientEndpoints(item, width, height);
  if (!endpoints) return null;
  const grad = new FillGradient({
    type: 'linear',
    start: { x: endpoints.x0, y: endpoints.y0 },
    end: { x: endpoints.x1, y: endpoints.y1 },
    colorStops: [
      { offset: 0, color: item.fill },
      { offset: 1, color: item.secondaryFill },
    ],
    textureSpace: 'global',
  });
  return grad;
}

// ---------------------------------------------------------------------------
// Individual item drawers
// ---------------------------------------------------------------------------

function drawRectangle(g: Graphics, item: RectangleCanvasItem) {
  g.clear();
  const { width, height, cornerRadius, stroke, strokeWidth } = item;
  if (cornerRadius > 0) {
    g.roundRect(0, 0, width, height, cornerRadius);
  } else {
    g.rect(0, 0, width, height);
  }

  const grad = buildPixiGradient(item, width, height);
  g.fill(grad ?? item.fill);

  if (strokeWidth > 0 && stroke && stroke !== 'transparent') {
    g.stroke({ color: stroke, width: strokeWidth });
  }
}

function drawEllipse(g: Graphics, item: EllipseCanvasItem) {
  g.clear();
  const { width, height, stroke, strokeWidth } = item;
  const rx = width / 2;
  const ry = height / 2;
  g.ellipse(rx, ry, rx, ry);

  const grad = buildPixiGradient(item, width, height);
  g.fill(grad ?? item.fill);

  if (strokeWidth > 0 && stroke && stroke !== 'transparent') {
    g.stroke({ color: stroke, width: strokeWidth });
  }
}

function drawNgon(g: Graphics, item: NgonCanvasItem) {
  g.clear();
  const { width, height, sides, stroke, strokeWidth } = item;
  const pts = computeNgonPoints(width, height, sides);
  if (pts.length === 0) return;

  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    g.lineTo(pts[i].x, pts[i].y);
  }
  g.closePath();

  const grad = buildPixiGradient(item, width, height);
  g.fill(grad ?? item.fill);

  if (strokeWidth > 0 && stroke && stroke !== 'transparent') {
    g.stroke({ color: stroke, width: strokeWidth });
  }
}

function drawLine(g: Graphics, item: LineCanvasItem) {
  g.clear();
  const { startX, startY, endX, endY, stroke, strokeWidth } = item;
  g.moveTo(startX, startY);
  g.lineTo(endX, endY);
  if (strokeWidth > 0 && stroke && stroke !== 'transparent') {
    g.stroke({ color: stroke, width: strokeWidth });
  }
}

// ---------------------------------------------------------------------------
// Text rendering stub
// ---------------------------------------------------------------------------

function drawTextPlaceholder(g: Graphics, item: TextCanvasItem) {
  g.clear();
  const { width, height, fill } = item;
  // Phase 2a: render a filled rect placeholder for text items.
  // Phase 3 will replace this with PixiJS Text objects.
  g.rect(0, 0, width, height);
  g.fill({ color: fill, alpha: 0.15 });
  g.stroke({ color: fill, alpha: 0.4, width: 1 });
}

// ---------------------------------------------------------------------------
// PixiItemLayer component
// ---------------------------------------------------------------------------

interface PixiItemLayerProps {
  items: RenderableCanvasItem[];
}

export function PixiItemLayer({ items }: PixiItemLayerProps) {
  return (
    <>
      {items.map((item) => {
        if (item.hidden) return null;
        return <PixiItemView key={item.id} item={item} />;
      })}
    </>
  );
}

function PixiItemView({ item }: { item: RenderableCanvasItem }) {
  const draw = useCallback(
    (g: Graphics) => {
      switch (item.kind) {
        case 'rectangle':
          drawRectangle(g, item);
          break;
        case 'ellipse':
          drawEllipse(g, item);
          break;
        case 'ngon':
          drawNgon(g, item);
          break;
        case 'line':
          drawLine(g, item);
          break;
        case 'text':
          drawTextPlaceholder(g, item);
          break;
        case 'image':
          // Phase 3: PixiJS Sprite from loaded texture.
          // For now, render a placeholder.
          g.clear();
          g.rect(0, 0, item.width, item.height);
          g.fill({ color: 0x334455, alpha: 0.3 });
          g.stroke({ color: 0x5588aa, alpha: 0.5, width: 1 });
          break;
        case 'generator':
          // Phase 3: PixiJS Sprite from generator canvas.
          g.clear();
          g.rect(0, 0, item.width, item.height);
          g.fill({ color: 0x553344, alpha: 0.3 });
          g.stroke({ color: 0xaa5588, alpha: 0.5, width: 1 });
          break;
      }
    },
    [item],
  );

  // Lines use absolute coordinates (startX/startY → endX/endY), no transform.
  if (item.kind === 'line') {
    return (
      <pixiGraphics
        label={item.id}
        draw={draw}
        alpha={item.opacity}
        eventMode="none"
      />
    );
  }

  return (
    <pixiContainer
      label={item.id}
      x={item.x}
      y={item.y}
      rotation={(item.rotation * Math.PI) / 180}
      alpha={item.opacity}
      pivot={{ x: 0, y: 0 }}
    >
      <pixiGraphics draw={draw} eventMode="none" />
    </pixiContainer>
  );
}
