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
 *
 * This runs on the main thread, texel by texel, so it is kept short:
 *
 * - Only the part of the image that an outline can reach is looked at
 *   (`EdgeField`): the box of the shape's ink, grown by the reach asked for.
 * - Distances are worked out only as far as that reach; further away a texel
 *   is just "far".
 * - One field serves every outline up to its reach (`outlineCoverageOf`,
 *   `outlinedShapeCoverageOf`), so a shape's outline and the shape grown for
 *   its shadow share the work.
 *
 * It holds 5 bytes per texel looked at while it works, 2 of them in the field
 * it returns. Whoever calls it bounds the size of the image
 * (`stage/rasterCaps`).
 */

/** Distances are kept in sixty-fourths of a texel. */
const STEPS = 64;
/** What a distance is where it is further than the field's reach: outside, and (negated) inside. */
const FAR = 32767;
/** How much further than the reach a texel's nearest unlike texel may be before the texel counts as far. */
const SLACK = 3;

/**
 * How far the centre of every texel of an image is outside the edge of the
 * shape in it, as far as `reach` texels either way.
 */
export interface EdgeField {
  /** The size of the image, in texels. */
  imageWidth: number;
  imageHeight: number;
  /** The part of the image the field covers: everything an outline of up to `reach` touches. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** How wide an outline's half the field is good for, in texels. */
  reach: number;
  /**
   * Row by row over that part: the distance in sixty-fourths of a texel,
   * negative inside the shape, `FAR` or `-FAR` beyond the reach.
   */
  distances: Int16Array;
}

const toSteps = (distance: number) =>
  Math.max(-FAR + 1, Math.min(FAR - 1, Math.round(distance * STEPS)));

/**
 * The edge field of the shape in `alpha`, one value per texel from 0 to 255,
 * `width` by `height`, good for outlines of up to `reach` texels to either
 * side of the edge. Null where the image has no shape in it.
 */
export function edgeField(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  reach: number,
): EdgeField | null {
  // The box of the ink.
  let inkLeft = width;
  let inkTop = height;
  let inkRight = -1;
  let inkBottom = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (alpha[row + x] === 0) continue;
      if (x < inkLeft) inkLeft = x;
      if (x > inkRight) inkRight = x;
      if (y < inkTop) inkTop = y;
      inkBottom = y;
    }
  }
  if (inkRight < 0) return null;

  const margin = Math.ceil(Math.max(0, reach)) + 2;
  const left = Math.max(0, inkLeft - margin);
  const top = Math.max(0, inkTop - margin);
  const w = Math.min(width, inkRight + margin + 1) - left;
  const h = Math.min(height, inkBottom + margin + 1) - top;
  const count = w * h;

  const a = new Uint8Array(count);
  for (let y = 0; y < h; y += 1) {
    const from = (y + top) * width + left;
    const to = y * w;
    for (let x = 0; x < w; x += 1) a[to + x] = alpha[from + x];
  }

  const distances = new Int16Array(count);

  // A texel the edge runs through says by its alpha how far its centre is from
  // the edge along the rows or the columns, whichever the edge crosses more
  // squarely. The browser softens the upright edges of glyphs over two texels,
  // so the texel next to it along that line counts too where it is also
  // partly covered. The lean of the edge turns that into the distance straight
  // across it.
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : a[y * w + x] / 255);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const value = a[i];
      if (value === 0 || value === 255) continue;
      const gx = at(x + 1, y) - at(x - 1, y);
      const gy = at(x, y + 1) - at(x, y - 1);
      const length = Math.sqrt(gx * gx + gy * gy);
      let along = 0.5 - value / 255;
      if (length > 0) {
        const across = Math.abs(gx) >= Math.abs(gy);
        const step = Math.sign(across ? gx : gy);
        const inward = across ? at(x + step, y) : at(x, y + step);
        const outward = across ? at(x - step, y) : at(x, y - step);
        if (inward > 0 && inward < 1) along += 1 - inward;
        if (outward > 0 && outward < 1) along -= outward;
        along *= Math.max(Math.abs(gx), Math.abs(gy)) / length;
      }
      distances[i] = toSteps(along);
    }
  }

  // Texels outside the shape look for the nearest texel with any of it, texels
  // inside for the nearest that is not all shape.
  const seedRow = new Int16Array(count);
  const below = new Int16Array(w);
  const f = new Float64Array(w);
  const v = new Int32Array(w);
  const z = new Float64Array(w + 1);
  const limit = (reach + SLACK) * (reach + SLACK);

  for (const inside of [false, true]) {
    // What a texel of this kind is, and what it looks for.
    const own = inside ? 255 : 0;
    const far = inside ? -FAR : FAR;

    // The row of the nearest texel looked for in each texel's own column.
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      for (let x = 0; x < w; x += 1) {
        const i = row + x;
        seedRow[i] = a[i] !== own ? y : y > 0 ? seedRow[i - w] : -1;
      }
    }
    below.fill(-1);
    for (let y = h - 1; y >= 0; y -= 1) {
      const row = y * w;
      for (let x = 0; x < w; x += 1) {
        const i = row + x;
        if (a[i] !== own) below[x] = y;
        const under = below[x];
        const above = seedRow[i];
        if (under >= 0 && (above < 0 || under - y < y - above)) seedRow[i] = under;
      }
    }

    // Along each row, the column whose nearest is nearest: the lower envelope
    // of one parabola per column.
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      let k = -1;
      for (let q = 0; q < w; q += 1) {
        const seedY = seedRow[row + q];
        if (seedY < 0) continue;
        f[q] = (seedY - y) * (seedY - y);
        let s = -Infinity;
        while (k >= 0) {
          const r = v[k];
          s = (f[q] - f[r] + q * q - r * r) / (q - r) / 2;
          if (s > z[k]) break;
          k -= 1;
        }
        k += 1;
        v[k] = q;
        z[k] = k === 0 ? -Infinity : s;
        z[k + 1] = Infinity;
      }

      let j = 0;
      for (let x = 0; x < w; x += 1) {
        const i = row + x;
        if (a[i] !== own) continue;
        if (k < 0) {
          distances[i] = far;
          continue;
        }
        while (z[j + 1] < x) j += 1;
        const q = v[j];
        const seedY = seedRow[row + q];
        if ((q - x) * (q - x) + (seedY - y) * (seedY - y) > limit) {
          distances[i] = far;
          continue;
        }
        // The nearest centre is not always the texel nearest the edge, and
        // going by it alone leaves the outline of a curve bumpy: the texels
        // around it are asked too, and the least of their answers counts.
        let least = Infinity;
        const yFrom = seedY > 0 ? seedY - 1 : 0;
        const yTo = seedY < h - 1 ? seedY + 1 : h - 1;
        const xFrom = q > 0 ? q - 1 : 0;
        const xTo = q < w - 1 ? q + 1 : w - 1;
        for (let ny = yFrom; ny <= yTo; ny += 1) {
          for (let nx = xFrom; nx <= xTo; nx += 1) {
            const n = ny * w + nx;
            const other = a[n];
            if (other === own) continue;
            // How far that texel's own centre is outside the edge.
            const offset = other === 0 ? 0.5 : other === 255 ? -0.5 : distances[n] / STEPS;
            const centre = Math.sqrt((nx - x) * (nx - x) + (ny - y) * (ny - y));
            const distance = inside ? centre - offset : centre + offset;
            if (distance < least) least = distance;
          }
        }
        distances[i] = toSteps(inside ? -least : least);
      }
    }
  }

  return { imageWidth: width, imageHeight: height, left, top, width: w, height: h, reach, distances };
}

/** One texel's worth of coverage per unit of `amount`, 0 to 255. */
const covered = (amount: number) => (amount <= 0 ? 0 : amount >= 1 ? 255 : Math.round(255 * amount));

/** `coverageAt` of every texel of `field`, in an image of `size` texels: 0 everywhere else. */
function coverageOf(
  field: EdgeField | null,
  size: number,
  coverageAt: (steps: number) => number,
): Uint8ClampedArray {
  const coverage = new Uint8ClampedArray(size);
  if (!field) return coverage;
  const { distances, imageWidth, left, top, width, height } = field;
  for (let y = 0; y < height; y += 1) {
    const from = y * width;
    const to = (y + top) * imageWidth + left;
    for (let x = 0; x < width; x += 1) coverage[to + x] = coverageAt(distances[from + x]);
  }
  return coverage;
}

/**
 * How much of each texel of the field's image the outline of its shape covers,
 * 0 to 255, in an image of `size` texels. `halfWidth` is how far the outline
 * reaches to either side of the shape's edge, in texels: no further than the
 * field's reach.
 */
export function outlineCoverageOf(field: EdgeField | null, size: number, halfWidth: number): Uint8ClampedArray {
  if (!(halfWidth > 0)) return new Uint8ClampedArray(size);
  const full = (halfWidth + 0.5) * STEPS;
  return coverageOf(field, size, (steps) => covered((full - Math.abs(steps)) / STEPS));
}

/**
 * How much of each texel the shape covers together with its outline, 0 to
 * 255: the shape grown by `halfWidth` texels on all sides. As `outlineCoverageOf`.
 */
export function outlinedShapeCoverageOf(
  field: EdgeField | null,
  size: number,
  halfWidth: number,
): Uint8ClampedArray {
  const full = (halfWidth + 0.5) * STEPS;
  return coverageOf(field, size, (steps) => covered((full - steps) / STEPS));
}

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
  if (!(halfWidth > 0)) return new Uint8ClampedArray(width * height);
  return outlineCoverageOf(edgeField(alpha, width, height, halfWidth), width * height, halfWidth);
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
  if (!(halfWidth > 0)) return Uint8ClampedArray.from(alpha);
  return outlinedShapeCoverageOf(edgeField(alpha, width, height, halfWidth), width * height, halfWidth);
}
