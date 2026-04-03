import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import Konva from 'konva';
import { Group } from 'react-konva';
import { Image as KonvaImage } from 'react-konva';

import type { ImageCanvasItem } from '../document/documentTypes';
import { getRenderableImageAdjustments } from './imageAdjustments';
import { getImageNodePresentation } from './imagePresentation';
import { CACHE_THROTTLE_MS, nativeBlur } from './useBlurEffect';

interface ImageItemNodeProps {
  item: ImageCanvasItem;
  image: HTMLImageElement | null;
  renderBox: { x: number; y: number; width: number; height: number };
  blurRadius: number;
}

export function ImageItemNode({ item, image, renderBox, blurRadius }: ImageItemNodeProps) {
  const imageRef = useRef<Konva.Image | null>(null);
  const cacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCacheTimeRef = useRef(0);
  const adjustments = useMemo(
    () => getRenderableImageAdjustments(item.adjustments),
    [item.adjustments],
  );
  const sourceTransform = item.sourceTransform;
  const imagePresentation = useMemo(
    () => getImageNodePresentation(sourceTransform, item.mirrorHorizontal),
    [item.mirrorHorizontal, sourceTransform],
  );

  useLayoutEffect(() => {
    if (cacheTimerRef.current !== null) {
      clearTimeout(cacheTimerRef.current);
      cacheTimerRef.current = null;
    }

    const node = imageRef.current;
    if (!node) {
      return;
    }

    const needsCache = adjustments.isActive || blurRadius > 0;

    /** Apply all filter/adjustment props and cache the node. */
    function applyAndCache(target: Konva.Image) {
      const filters = [...adjustments.filters];
      if (blurRadius > 0) {
        filters.push(nativeBlur);
      }
      target.filters(filters);
      target.brightness(adjustments.brightness);
      target.contrast(adjustments.contrast);
      target.red(adjustments.tintRed);
      target.green(adjustments.tintGreen);
      target.blue(adjustments.tintBlue);
      target.alpha(adjustments.tintAlpha);
      target.blurRadius(blurRadius);

      const offset = blurRadius > 0 ? Math.ceil(blurRadius * 2) : 0;
      target.cache({ offset });
      target.getLayer()?.batchDraw();
      lastCacheTimeRef.current = Date.now();
    }

    if (image && needsCache) {
      const now = Date.now();
      const elapsed = now - lastCacheTimeRef.current;

      if (elapsed >= CACHE_THROTTLE_MS) {
        applyAndCache(node);
      } else {
        // Throttled — leave the stale cache undisturbed. Touching
        // node.filters() with a new array ref would invalidate it.
        cacheTimerRef.current = setTimeout(() => {
          cacheTimerRef.current = null;
          const n = imageRef.current;
          if (n) {
            applyAndCache(n);
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
  }, [
    adjustments,
    blurRadius,
    image,
    imagePresentation.height,
    imagePresentation.rotation,
    imagePresentation.scaleX,
    imagePresentation.width,
    imagePresentation.x,
    imagePresentation.y,
    renderBox.width,
    renderBox.height,
  ]);

  useEffect(() => {
    return () => {
      if (cacheTimerRef.current !== null) {
        clearTimeout(cacheTimerRef.current);
      }
      imageRef.current?.clearCache();
    };
  }, []);

  const blurOffset = blurRadius > 0 ? Math.ceil(blurRadius * 2) : 0;

  return (
    <Group
      clipX={-blurOffset}
      clipY={-blurOffset}
      clipWidth={renderBox.width + blurOffset * 2}
      clipHeight={renderBox.height + blurOffset * 2}
      listening={false}
    >
      <KonvaImage
        ref={imageRef}
        shadowColor={item.shadow.color}
        shadowBlur={item.shadow.blur}
        shadowOffsetX={item.shadow.offsetX}
        shadowOffsetY={item.shadow.offsetY}
        shadowOpacity={item.shadow.opacity}
        x={imagePresentation.x}
        y={imagePresentation.y}
        rotation={imagePresentation.rotation}
        image={image ?? undefined}
        width={imagePresentation.width}
        height={imagePresentation.height}
        scaleX={imagePresentation.scaleX}
        listening={false}
      />
    </Group>
  );
}
