/**
 * Where the one shadow of a text drawn in several pieces goes.
 *
 * Text with tags is drawn piece by piece (see `richTextShadow`). Its drop
 * shadow is cast once, from all of the pieces together: their shapes are
 * gathered in one canvas, the silhouette, and the shadow of that canvas is
 * drawn into a second one. This works out the size of both.
 *
 * Pure, and in whole texels throughout: a piece keeps the texels it was
 * rasterised on when it is copied into the silhouette.
 */

/** A rectangle of whole texels. */
export interface TexelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ShadowCanvasRects {
  /** The smallest rectangle that holds every piece. */
  silhouette: TexelRect;
  /** The rectangle the shadow of that silhouette can reach. */
  shadow: TexelRect;
}

/**
 * The silhouette that holds `pieces`, and the rectangle its shadow needs: the
 * silhouette moved by the shadow's offset and grown by `reach` on every side.
 * `offsetX`, `offsetY` and `reach` are in texels and need not be whole; the
 * shadow's rectangle is rounded outwards. Null without pieces.
 */
export function shadowCanvasRects(
  pieces: TexelRect[],
  offsetX: number,
  offsetY: number,
  reach: number,
): ShadowCanvasRects | null {
  if (pieces.length === 0) return null;
  const left = Math.min(...pieces.map((piece) => piece.left));
  const top = Math.min(...pieces.map((piece) => piece.top));
  const right = Math.max(...pieces.map((piece) => piece.left + piece.width));
  const bottom = Math.max(...pieces.map((piece) => piece.top + piece.height));

  const dx = Number.isFinite(offsetX) ? offsetX : 0;
  const dy = Number.isFinite(offsetY) ? offsetY : 0;
  const room = Number.isFinite(reach) ? Math.max(0, reach) : 0;
  const shadowLeft = Math.floor(left + dx - room);
  const shadowTop = Math.floor(top + dy - room);
  const shadowRight = Math.ceil(right + dx + room);
  const shadowBottom = Math.ceil(bottom + dy + room);

  return {
    silhouette: { left, top, width: right - left, height: bottom - top },
    shadow: {
      left: shadowLeft,
      top: shadowTop,
      width: shadowRight - shadowLeft,
      height: shadowBottom - shadowTop,
    },
  };
}
