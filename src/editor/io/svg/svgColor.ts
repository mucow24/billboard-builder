import { parseHexColor } from '../../color/hexColor';
import { fmt } from './svgEscape';

export interface SvgPaint {
  hex: string;
  alpha: number;
}

/** Split a stored colour (`#rrggbb` or `#rrggbbaa`) into an SVG hex + opacity. Reuses the document's hex parser. */
export function toSvgPaint(color: string): SvgPaint {
  return parseHexColor(color);
}

/** True when the colour is fully transparent — nothing to paint. */
export function isFullyTransparent(color: string): boolean {
  return toSvgPaint(color).alpha <= 0;
}

/**
 * Build `fill="#rrggbb"` (+ `fill-opacity` when partially transparent) — SVG
 * renderers handle 8-digit hex unreliably, so alpha is split into its own attr.
 * Pass an `href` (e.g. a gradient id) to reference a paint server instead of a hex.
 */
export function paintAttrs(prefix: 'fill' | 'stroke', color: string, href?: string): string {
  const { hex, alpha } = toSvgPaint(color);
  const paint = href ? `${prefix}="url(#${href})"` : `${prefix}="${hex}"`;
  const opacity = alpha < 1 ? ` ${prefix}-opacity="${fmt(alpha)}"` : '';
  return `${paint}${opacity}`;
}
