import Konva from 'konva';
import { useLayoutEffect, type RefObject } from 'react';

/**
 * A Konva filter that uses the browser's native CSS `filter: blur()` instead
 * of Konva's built-in stack blur. The native blur operates in premultiplied
 * alpha space, avoiding the color fringe artifacts that Konva's pixel-level
 * blur produces at transparent edges (caused by getImageData un-premultiply
 * precision loss).
 */
export function nativeBlur(this: Konva.Node, imageData: ImageData): void {
  const radius = typeof this.blurRadius === 'function' ? this.blurRadius() : 0;
  if (!radius) return;

  const { width, height } = imageData;

  // Put the source imageData onto a temp canvas
  const src = document.createElement('canvas');
  src.width = width;
  src.height = height;
  const srcCtx = src.getContext('2d')!;
  srcCtx.putImageData(imageData, 0, 0);

  // Draw onto a second canvas with the browser's native blur filter,
  // which correctly handles premultiplied alpha compositing
  const dst = document.createElement('canvas');
  dst.width = width;
  dst.height = height;
  const dstCtx = dst.getContext('2d')!;
  dstCtx.filter = `blur(${radius}px)`;
  dstCtx.drawImage(src, 0, 0);

  // Copy the correctly-blurred result back into the imageData
  const result = dstCtx.getImageData(0, 0, width, height);
  imageData.data.set(result.data);
}

/**
 * Applies a Gaussian blur filter to a Konva node when blurRadius > 0.
 * Caches the node with offset padding so the blur isn't clipped at edges.
 * Clears the cache when blurRadius returns to 0.
 */
export function useBlurEffect(
  nodeRef: RefObject<Konva.Node | null>,
  blurRadius: number,
): void {
  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node || typeof node.filters !== 'function') {
      return;
    }

    if (blurRadius > 0) {
      node.filters([nativeBlur]);
      node.blurRadius(blurRadius);
      node.cache({ offset: Math.ceil(blurRadius * 2) });
    } else {
      node.filters([]);
      node.clearCache();
    }

    node.getLayer()?.batchDraw();

    return () => {
      node.clearCache();
    };
  });
}
