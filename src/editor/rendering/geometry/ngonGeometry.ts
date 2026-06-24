/**
 * Regular-polygon vertex geometry, shared by the PixiJS renderer and the SVG
 * exporter so both tessellate an n-gon identically.
 *
 * Vertices are placed on the unit circle (even-sided polygons get a half-step
 * orientation offset so they sit flat-topped rather than point-topped), then the
 * point cloud is normalized to exactly fill the item's `[0,w] x [0,h]` box.
 */
export interface NgonPoint {
  x: number;
  y: number;
}

export function computeNgonPoints(
  width: number,
  height: number,
  sides: number,
): NgonPoint[] {
  const offset = sides % 2 === 0 ? -Math.PI / 2 - Math.PI / sides : -Math.PI / 2;
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
