import type {
  CanvasItem,
  EllipseCanvasItem,
  GeneratorCanvasItem,
  ImageCanvasItem,
  LineCanvasItem,
  NgonCanvasItem,
  PolygonCanvasItem,
  RectangleCanvasItem,
} from '../../document/documentTypes';
import { computeNgonPoints } from '../../rendering/geometry/ngonGeometry';
import { buildPolygonPathSegments } from '../../rendering/geometry/polygonGeometry';
import {
  computeGradientEndpoints,
  type GradientEndpoints,
} from '../../rendering/geometry/gradientGeometry';
import { paintAttrs, toSvgPaint } from './svgColor';
import { escapeXml, fmt } from './svgEscape';

interface GradientCapable {
  id: string;
  gradientEnabled: boolean;
  gradientAngle: number;
  fill: string;
  secondaryFill: string;
}

/**
 * Gaussian-vs-Kawase blur conversion factors (see plan): Pixi halves the app
 * shadow blur before handing it to a Kawase DropShadowFilter, and a Kawase blur
 * of strength X ≈ a Gaussian sigma of X/2 — so a feDropShadow stdDeviation of
 * blur/4 approximates Pixi's shadow. blurRadius maps to a Gaussian sigma of
 * blurRadius/2. Both are starting points flagged for a screenshot tuning pass.
 */
const SHADOW_BLUR_TO_STDDEV = 0.25;
const BLUR_RADIUS_TO_STDDEV = 0.5;
/** Pixi renders text shadow via the canvas-2D text style with an un-halved blur, so text uses a larger sigma than shapes. */
export const TEXT_SHADOW_BLUR_TO_STDDEV = 0.5;

interface PositionedItem {
  x: number;
  y: number;
  rotation: number;
}

interface Strokable {
  stroke: string;
  strokeWidth: number;
}

/** `translate(x y)` plus `rotate(deg)` when rotated. Rotation is degrees in both the doc and SVG, and pivots on the local origin (matching Pixi's pivot=(0,0)). */
export function itemTransform(item: PositionedItem): string {
  const parts = [`translate(${fmt(item.x)} ${fmt(item.y)})`];
  if (item.rotation) parts.push(`rotate(${fmt(item.rotation)})`);
  return parts.join(' ');
}

/** Wrap a shape drawn in local space in its transform/opacity group. */
export function wrapItem(
  item: PositionedItem,
  effectiveOpacity: number,
  inner: string,
  extraAttrs = '',
): string {
  const opacity = effectiveOpacity < 1 ? ` opacity="${fmt(effectiveOpacity)}"` : '';
  return `<g transform="${itemTransform(item)}"${opacity}${extraAttrs}>${inner}</g>`;
}

/** Leading-space stroke attributes, matching Pixi's `strokeWidth > 0 && stroke !== 'transparent'` gate. */
export function strokeAttr(item: Strokable): string {
  if (item.strokeWidth > 0 && item.stroke && item.stroke !== 'transparent') {
    return ` ${paintAttrs('stroke', item.stroke)} stroke-width="${fmt(item.strokeWidth)}"`;
  }
  return '';
}

export function rectShape(item: RectangleCanvasItem, fillAttr: string): string {
  const rx = item.cornerRadius > 0 ? ` rx="${fmt(item.cornerRadius)}"` : '';
  return `<rect x="0" y="0" width="${fmt(item.width)}" height="${fmt(item.height)}"${rx} ${fillAttr}${strokeAttr(item)}/>`;
}

export function ellipseShape(item: EllipseCanvasItem, fillAttr: string): string {
  const rx = item.width / 2;
  const ry = item.height / 2;
  return `<ellipse cx="${fmt(rx)}" cy="${fmt(ry)}" rx="${fmt(rx)}" ry="${fmt(ry)}" ${fillAttr}${strokeAttr(item)}/>`;
}

export function ngonShape(item: NgonCanvasItem, fillAttr: string): string {
  const points = computeNgonPoints(item.width, item.height, item.sides)
    .map((p) => `${fmt(p.x)},${fmt(p.y)}`)
    .join(' ');
  return `<polygon points="${points}" ${fillAttr}${strokeAttr(item)}/>`;
}

/**
 * Freeform polygon as a `<path>` in local (AABB-relative) space, sharing the
 * renderer's segment builder so canvas and SVG tessellate identically. Open
 * chains are stroke-only (no fill, no closing edge, round caps).
 */
export function polygonShape(item: PolygonCanvasItem, fillAttr: string): string {
  const local = item.vertices.map((v) => ({ x: v.x - item.x, y: v.y - item.y }));
  const segments = buildPolygonPathSegments(local, item.curveRadius, item.closed);
  let d = '';
  for (const segment of segments) {
    switch (segment.type) {
      case 'move':
        d += `M ${fmt(segment.x)} ${fmt(segment.y)}`;
        break;
      case 'line':
        d += ` L ${fmt(segment.x)} ${fmt(segment.y)}`;
        break;
      case 'quad':
        d += ` Q ${fmt(segment.cx)} ${fmt(segment.cy)} ${fmt(segment.x)} ${fmt(segment.y)}`;
        break;
      case 'close':
        d += ' Z';
        break;
    }
  }
  const fill = item.closed ? fillAttr : 'fill="none"';
  const caps = item.closed ? ' stroke-linejoin="round"' : ' stroke-linejoin="round" stroke-linecap="round"';
  const stroke = strokeAttr(item);
  return `<path d="${d}" ${fill}${stroke}${stroke ? caps : ''}/>`;
}

/** Lines use absolute canvas coordinates and carry their own opacity (no transform wrapper). */
export function lineShape(item: LineCanvasItem, effectiveOpacity: number, filterAttr = ''): string {
  const opacity = effectiveOpacity < 1 ? ` opacity="${fmt(effectiveOpacity)}"` : '';
  return (
    `<line x1="${fmt(item.startX)}" y1="${fmt(item.startY)}" ` +
    `x2="${fmt(item.endX)}" y2="${fmt(item.endY)}"${strokeAttr(item)}${opacity}${filterAttr}/>`
  );
}

/** A `<linearGradient>` def in the item's local box space, with primary→secondary stops. */
export function linearGradientDef(
  id: string,
  endpoints: GradientEndpoints,
  fill: string,
  secondaryFill: string,
): string {
  return (
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
    `x1="${fmt(endpoints.x0)}" y1="${fmt(endpoints.y0)}" ` +
    `x2="${fmt(endpoints.x1)}" y2="${fmt(endpoints.y1)}">` +
    stopEl(0, fill) +
    stopEl(1, secondaryFill) +
    `</linearGradient>`
  );
}

function stopEl(offset: number, color: string): string {
  const { hex, alpha } = toSvgPaint(color);
  const opacity = alpha < 1 ? ` stop-opacity="${fmt(alpha)}"` : '';
  return `<stop offset="${offset}" stop-color="${hex}"${opacity}/>`;
}

/** Solid `fill="#hex"` (+ opacity), or a `<linearGradient>` reference (pushed into `defs`) when gradient-enabled. */
export function gradientOrSolidFill(
  item: GradientCapable,
  defs: string[],
  boxWidth: number,
  boxHeight: number,
): string {
  if (item.gradientEnabled) {
    const endpoints = computeGradientEndpoints(item, boxWidth, boxHeight);
    if (endpoints) {
      const id = `grad-${item.id}`;
      defs.push(linearGradientDef(id, endpoints, item.fill, item.secondaryFill));
      return `fill="url(#${id})"`;
    }
  }
  return paintAttrs('fill', item.fill);
}

/**
 * Combined blur + drop-shadow filter for an item, chained in Pixi's order (blur
 * first, then shadow casts off the blurred shape). Returns null when the item has
 * neither. Text shadow is handled separately (Pixi renders it via the text style),
 * so this skips shadow for text.
 */
export function itemFilterDef(
  id: string,
  item: CanvasItem,
  opts?: { includeShadow?: boolean; shadowStdDevFactor?: number },
): string | null {
  // Shapes/lines/images route their shadow through this filter; text passes
  // includeShadow + its own (larger) sigma because Pixi renders text shadow
  // through the text style rather than the container filter.
  const includeShadow = opts?.includeShadow ?? item.kind !== 'text';
  const shadowStdDevFactor = opts?.shadowStdDevFactor ?? SHADOW_BLUR_TO_STDDEV;

  const primitives: string[] = [];
  let input = 'SourceGraphic';

  if (item.blurRadius > 0) {
    primitives.push(
      `<feGaussianBlur in="${input}" stdDeviation="${fmt(item.blurRadius * BLUR_RADIUS_TO_STDDEV)}" result="blurred"/>`,
    );
    input = 'blurred';
  }

  const s = item.shadow;
  const hasShadow =
    includeShadow &&
    !!s &&
    (s.blur > 0 || s.offsetX !== 0 || s.offsetY !== 0) &&
    s.opacity > 0;
  if (hasShadow) {
    const { hex, alpha } = toSvgPaint(s.color);
    const floodOpacity = alpha * s.opacity;
    primitives.push(
      `<feDropShadow in="${input}" dx="${fmt(s.offsetX)}" dy="${fmt(s.offsetY)}" ` +
        `stdDeviation="${fmt(s.blur * shadowStdDevFactor)}" ` +
        `flood-color="${hex}" flood-opacity="${fmt(floodOpacity)}"/>`,
    );
  }

  if (primitives.length === 0) return null;
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">${primitives.join('')}</filter>`;
}

/** Basic image element filling the frame. Crop/sourceTransform/mirror/adjustments are layered on in a later step. */
export function imageShape(item: ImageCanvasItem): string {
  return (
    `<image x="0" y="0" width="${fmt(item.width)}" height="${fmt(item.height)}" ` +
    `preserveAspectRatio="none" href="${escapeXml(item.src)}"/>`
  );
}

/** Generators have no vector form — their rasterized bitmap is embedded as a full-frame image. */
export function generatorImage(item: GeneratorCanvasItem, dataUrl: string): string {
  return (
    `<image x="0" y="0" width="${fmt(item.width)}" height="${fmt(item.height)}" ` +
    `preserveAspectRatio="none" href="${escapeXml(dataUrl)}"/>`
  );
}
