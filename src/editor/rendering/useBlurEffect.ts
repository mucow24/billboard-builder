import Konva from 'konva';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

export const CACHE_THROTTLE_MS = 50;

/** Reusable canvas pair for nativeBlur — avoids DOM allocation on every call. */
let _pool: {
  src: HTMLCanvasElement;
  srcCtx: CanvasRenderingContext2D;
  dst: HTMLCanvasElement;
  dstCtx: CanvasRenderingContext2D;
} | null = null;

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

  if (!_pool) {
    const src = document.createElement('canvas');
    const dst = document.createElement('canvas');
    _pool = {
      src,
      srcCtx: src.getContext('2d')!,
      dst,
      dstCtx: dst.getContext('2d')!,
    };
  }

  const { src, srcCtx, dst, dstCtx } = _pool;

  // Resize canvases when dimensions differ (this also clears canvas state)
  if (src.width !== width || src.height !== height) {
    src.width = width;
    src.height = height;
    dst.width = width;
    dst.height = height;
  }

  // Put the source imageData onto the src canvas
  srcCtx.putImageData(imageData, 0, 0);

  // Draw onto dst canvas with the browser's native blur filter,
  // which correctly handles premultiplied alpha compositing.
  // clearRect is required because the pooled canvas retains old content;
  // without it, drawImage composites over stale pixels via source-over,
  // causing ghosted colors and doubled edges on re-cache.
  dstCtx.clearRect(0, 0, width, height);
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
 *
 * The `contentSource` parameter is the item object whose visual properties
 * determine when re-caching is needed. Position fields (`x`, `y`, `rotation`)
 * are excluded from the cache key because they live on the parent Group
 * transform and don't affect cached content. This prevents expensive
 * re-caching during drag when only position changes.
 */
export function useBlurEffect(
  nodeRef: RefObject<Konva.Node | null>,
  blurRadius: number,
  contentSource: object,
): void {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { x: _x, y: _y, rotation: _rot, ...visual } = contentSource as Record<string, unknown>;
  const contentKey = blurRadius > 0 ? JSON.stringify(visual) : '';
  const cacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCacheTimeRef = useRef(0);

  useLayoutEffect(() => {
    if (cacheTimerRef.current !== null) {
      clearTimeout(cacheTimerRef.current);
      cacheTimerRef.current = null;
    }

    const node = nodeRef.current;
    if (!node || typeof node.filters !== 'function') {
      return;
    }

    if (blurRadius > 0) {
      const now = Date.now();
      const elapsed = now - lastCacheTimeRef.current;

      if (elapsed >= CACHE_THROTTLE_MS) {
        // Leading edge — set up filters and cache immediately.
        node.filters([nativeBlur]);
        node.blurRadius(blurRadius);
        node.cache({ offset: Math.ceil(blurRadius * 2) });
        node.getLayer()?.batchDraw();
        lastCacheTimeRef.current = now;
      } else {
        // Throttled — leave the stale cache undisturbed. Touching
        // node.filters() with a new array ref would invalidate it.
        cacheTimerRef.current = setTimeout(() => {
          cacheTimerRef.current = null;
          const n = nodeRef.current;
          if (n) {
            n.filters([nativeBlur]);
            n.blurRadius(blurRadius);
            n.cache({ offset: Math.ceil(blurRadius * 2) });
            n.getLayer()?.batchDraw();
            lastCacheTimeRef.current = Date.now();
          }
        }, CACHE_THROTTLE_MS - elapsed);
      }
    } else {
      node.filters([]);
      node.clearCache();
      node.getLayer()?.batchDraw();
      lastCacheTimeRef.current = 0;
    }

    return () => {
      if (cacheTimerRef.current !== null) {
        clearTimeout(cacheTimerRef.current);
        cacheTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nodeRef is a stable ref object
  }, [blurRadius, contentKey]);

  useEffect(() => {
    return () => {
      if (cacheTimerRef.current !== null) {
        clearTimeout(cacheTimerRef.current);
      }
      nodeRef.current?.clearCache();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nodeRef is a stable ref object
  }, []);
}
