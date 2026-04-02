import { useLayoutEffect, useMemo, useRef } from 'react';
import Konva from 'konva';
import { Group } from 'react-konva';
import { Image as KonvaImage } from 'react-konva';

import type { ImageCanvasItem } from '../document/documentTypes';
import { getRenderableImageAdjustments } from './imageAdjustments';
import { getImageNodePresentation } from './imagePresentation';
import { nativeBlur } from './useBlurEffect';

interface ImageItemNodeProps {
  item: ImageCanvasItem;
  image: HTMLImageElement | null;
  renderBox: { x: number; y: number; width: number; height: number };
  blurRadius: number;
}

export function ImageItemNode({ item, image, renderBox, blurRadius }: ImageItemNodeProps) {
  const imageRef = useRef<Konva.Image | null>(null);
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
    const node = imageRef.current;
    if (!node) {
      return;
    }

    const filters = [...adjustments.filters];
    if (blurRadius > 0) {
      filters.push(nativeBlur);
    }

    node.filters(filters);
    node.brightness(adjustments.brightness);
    node.contrast(adjustments.contrast);
    node.red(adjustments.tintRed);
    node.green(adjustments.tintGreen);
    node.blue(adjustments.tintBlue);
    node.alpha(adjustments.tintAlpha);
    node.blurRadius(blurRadius);

    const needsCache = adjustments.isActive || blurRadius > 0;
    if (image && needsCache) {
      const offset = blurRadius > 0 ? Math.ceil(blurRadius * 2) : 0;
      node.cache({ offset });
    } else {
      node.clearCache();
    }

    node.getLayer()?.batchDraw();

    return () => {
      node.clearCache();
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
