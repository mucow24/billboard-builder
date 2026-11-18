/**
 * The outline of a shape that is known only as an image: a band of a given
 * half-width centred on the shape's edge, with round joins.
 *
 * The edge is where the image's alpha is one half. A texel the edge runs
 * through says by its alpha how far its centre is from the edge. Every other
 * texel finds the nearest texel that is not like itself (an exact Euclidean
 * distance transform, after Felzenszwalb and Huttenlocher) and is as far from
 * the edge as from that texel's centre, plus or minus what that texel's alpha
 * says. The band is then as smooth as the image's own edge.
 */

const FAR = 1e20;

/**
 * For every texel, the index of the nearest texel that `isSeed` holds for, or
 * -1 where there is none at all.
 */
function nearestSeeds(
  isSeed: (index: number) => boolean,
  width: number,
  height: number,
): Int32Array {
  const count = width * height;
  // The row of the nearest seed in each texel's own column.
  const seedRow = new Int32Array(count).fill(-1);
  for (let x = 0; x < width; x += 1) {
    let last = -1;
    for (let y = 0; y < height; y += 1) {
      const i = y * width + x;
      if (isSeed(i)) last = y;
      seedRow[i] = last;
    }
    last = -1;
    for (let y = height - 1; y >= 0; y -= 1) {
      const i = y * width + x;
      if (isSeed(i)) last = y;
      const above = seedRow[i];
      if (last >= 0 && (above < 0 || last - y < y - above)) seedRow[i] = last;
    }
  }

  // Along each row, the column whose nearest seed is nearest: the lower
  // envelope of one parabola per column.
  const nearest = new Int32Array(count).fill(-1);
  const f = new Float64Array(width);
  const v = new Int32Array(width);
  const z = new Float64Array(width + 1);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let k = -1;
    for (let q = 0; q < width; q += 1) {
      const seedY = seedRow[row + q];
      if (seedY < 0) continue;
      f[q] = (seedY - y) * (seedY - y);
      let s = -FAR;
      while (k >= 0) {
        const r = v[k];
        s = (f[q] - f[r] + q * q - r * r) / (q - r) / 2;
        if (s > z[k]) break;
        k -= 1;
      }
      k += 1;
      v[k] = q;
      z[k] = k === 0 ? -FAR : s;
      z[k + 1] = FAR;
    }
    if (k < 0) continue;
    let j = 0;
    for (let x = 0; x < width; x += 1) {
      while (z[j + 1] < x) j += 1;
      const q = v[j];
      nearest[row + x] = seedRow[row + q] * width + q;
    }
  }
  return nearest;
}

/**
 * How far the centre of every texel is outside the edge of a shape, in
 * texels: negative inside it, `FAR` or `-FAR` where the image has no edge.
 * `alpha` is the shape, one value per texel from 0 to 255.
 */
function distancesFromEdge(alpha: ArrayLike<number>, width: number, height: number): Float32Array {
  const count = width * height;
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : alpha[y * width + x] / 255;
  const isPartial = (value: number) => value > 0 && value < 1;

  // A texel the edge runs through says by its alpha how far its centre is from
  // the edge along the rows or the columns, whichever the edge crosses more
  // squarely. The browser softens the upright edges of glyphs over two texels,
  // so the texel next to it along that line counts too where it is also
  // partly covered. The lean of the edge turns that into the distance straight
  // across it.
  const offset = new Float32Array(count);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const a = alpha[i] / 255;
      if (a <= 0) offset[i] = 0.5;
      else if (a >= 1) offset[i] = -0.5;
      else {
        const gx = at(x + 1, y) - at(x - 1, y);
        const gy = at(x, y + 1) - at(x, y - 1);
        const length = Math.sqrt(gx * gx + gy * gy);
        let along = 0.5 - a;
        if (length > 0) {
          const across = Math.abs(gx) >= Math.abs(gy);
          const step = Math.sign(across ? gx : gy);
          const inward = across ? at(x + step, y) : at(x, y + step);
          const outward = across ? at(x - step, y) : at(x, y - step);
          if (isPartial(inward)) along += 1 - inward;
          if (isPartial(outward)) along -= outward;
          along *= Math.max(Math.abs(gx), Math.abs(gy)) / length;
        }
        offset[i] = along;
      }
    }
  }

  // For texels outside the shape, the nearest texel with any of it; for
  // texels inside, the nearest that is not all shape.
  const nearestShape = nearestSeeds((i) => alpha[i] > 0, width, height);
  const nearestOutside = nearestSeeds((i) => alpha[i] < 255, width, height);

  /**
   * How far texel `i` is from the edge by way of the texels around `other`,
   * the nearest one not like itself: the least of what each of them makes it.
   * `side` is 1 for a texel outside the shape and -1 for one inside. The
   * nearest centre is not always the texel nearest the edge, and going by it
   * alone leaves the outline of a curve bumpy.
   */
  const toEdge = (i: number, other: number, side: 1 | -1) => {
    const x = i % width;
    const y = (i - x) / width;
    const otherX = other % width;
    const otherY = (other - otherX) / width;
    let least = FAR;
    for (let ny = Math.max(0, otherY - 1); ny <= Math.min(height - 1, otherY + 1); ny += 1) {
      for (let nx = Math.max(0, otherX - 1); nx <= Math.min(width - 1, otherX + 1); nx += 1) {
        const n = ny * width + nx;
        if (side === 1 ? alpha[n] <= 0 : alpha[n] >= 255) continue;
        const distance = Math.sqrt((nx - x) * (nx - x) + (ny - y) * (ny - y)) + side * offset[n];
        if (distance < least) least = distance;
      }
    }
    return least;
  };

  const distances = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const a = alpha[i];
    if (a <= 0) distances[i] = nearestShape[i] < 0 ? FAR : toEdge(i, nearestShape[i], 1);
    else if (a >= 255) distances[i] = nearestOutside[i] < 0 ? -FAR : -toEdge(i, nearestOutside[i], -1);
    else distances[i] = offset[i];
  }
  return distances;
}

const covered = (amount: number) => Math.round(255 * Math.min(1, Math.max(0, amount)));

/**
 * How much of each texel the outline of a shape covers, 0 to 255. `alpha` is
 * the shape, one value per texel from 0 to 255, `width` by `height`;
 * `halfWidth` is how far the outline reaches to either side of the shape's
 * edge, in texels.
 */
export function outlineCoverage(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  halfWidth: number,
): Uint8ClampedArray {
  const coverage = new Uint8ClampedArray(width * height);
  if (coverage.length === 0 || !(halfWidth > 0)) return coverage;
  const distances = distancesFromEdge(alpha, width, height);
  for (let i = 0; i < coverage.length; i += 1) {
    coverage[i] = covered(halfWidth + 0.5 - Math.abs(distances[i]));
  }
  return coverage;
}

/**
 * How much of each texel a shape covers together with its outline, 0 to 255:
 * the shape grown by `halfWidth` texels on all sides. As `outlineCoverage`.
 */
export function outlinedShapeCoverage(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  halfWidth: number,
): Uint8ClampedArray {
  const coverage = new Uint8ClampedArray(width * height);
  if (coverage.length === 0) return coverage;
  if (!(halfWidth > 0)) {
    for (let i = 0; i < coverage.length; i += 1) coverage[i] = alpha[i];
    return coverage;
  }
  const distances = distancesFromEdge(alpha, width, height);
  for (let i = 0; i < coverage.length; i += 1) coverage[i] = covered(halfWidth + 0.5 - distances[i]);
  return coverage;
}
