import { useLayoutEffect, useMemo, useRef } from 'react';
import { Group } from 'react-konva';
import { Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';

import type { ImageCanvasItem } from '../document/documentTypes';
import { getRenderableImageAdjustments } from './imageAdjustments';
import { getImageNodePresentation } from './imagePresentation';

interface ImageItemNodeProps {
  item: ImageCanvasItem;
  image: HTMLImageElement | null;
  renderBox: { x: number; y: number; width: number; height: number };
}

export function ImageItemNode({ item, image, renderBox }: ImageItemNodeProps) {
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

    node.filters(adjustments.filters);
    node.brightness(adjustments.brightness);
    node.contrast(adjustments.contrast);
    node.red(adjustments.tintRed);
    node.green(adjustments.tintGreen);
    node.blue(adjustments.tintBlue);
    node.alpha(adjustments.tintAlpha);

    if (image && adjustments.isActive) {
      node.cache();
    } else {
      node.clearCache();
    }

    node.getLayer()?.batchDraw();

    return () => {
      node.clearCache();
    };
  }, [
    adjustments,
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

  return (
    <Group
      clipX={0}
      clipY={0}
      clipWidth={renderBox.width}
      clipHeight={renderBox.height}
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
