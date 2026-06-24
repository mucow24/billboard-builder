/**
 * Linear-gradient endpoint geometry, shared by the PixiJS renderer and the SVG
 * exporter so both derive identical gradient lines from `gradientAngle`.
 *
 * Endpoints are in the item's local box space `[0,w] x [0,h]`. The line passes
 * through the box centre and extends `halfLen` either side along the angle, where
 * `halfLen` is the projection of the box half-extents onto the gradient axis — so
 * the stops reach the box edges for any angle.
 */
export interface GradientEndpoints {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function computeGradientEndpoints(
  item: { gradientEnabled: boolean; gradientAngle: number },
  width: number,
  height: number,
): GradientEndpoints | null {
  if (!item.gradientEnabled) return null;
  const angleRad = (item.gradientAngle * Math.PI) / 180;
  const sinA = Math.sin(angleRad);
  const cosA = Math.cos(angleRad);
  const cx = width / 2;
  const cy = height / 2;
  const halfLen = (width / 2) * Math.abs(sinA) + (height / 2) * Math.abs(cosA);
  return {
    x0: cx - halfLen * sinA,
    y0: cy - halfLen * cosA,
    x1: cx + halfLen * sinA,
    y1: cy + halfLen * cosA,
  };
}
