import Konva from 'konva';
import { useLayoutEffect, type RefObject } from 'react';

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
      node.filters([Konva.Filters.Blur]);
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
