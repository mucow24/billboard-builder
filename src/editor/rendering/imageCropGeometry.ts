import { createFullImageCropRect } from '../document/documentDefaults';
import type {
  CanvasItem,
  GuideLine,
  ImageCanvasItem,
  ImageSourceTransform,
  SnapRect,
} from '../document/documentTypes';
import { buildVisibleImageCropFromSourceTransform } from './imagePresentation';
import { getResizeSnappedRect } from './snapping';
import {
  localToStage,
  stageToLocal,
  type Point,
  type ResizeHandle,
} from './interactionGeometry';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildImagePreviewItem(
  baseItem: ImageCanvasItem,
  sourceTransform: ImageSourceTransform,
): ImageCanvasItem {
  return {
    ...baseItem,
    crop: buildVisibleImageCropFromSourceTransform(baseItem, sourceTransform),
    sourceTransform,
    scaleX: 1,
    scaleY: 1,
  };
}

export function buildFullImageTransformItem(item: ImageCanvasItem): ImageCanvasItem {
  const origin = { x: item.x, y: item.y };
  const stageTopLeft = localToStage(
    { x: item.sourceTransform.x, y: item.sourceTransform.y },
    origin,
    item.rotation,
  );

  return {
    ...item,
    id: `crop-full-${item.id}`,
    x: stageTopLeft.x,
    y: stageTopLeft.y,
    width: item.sourceTransform.width,
    height: item.sourceTransform.height,
    rotation: item.rotation + item.sourceTransform.rotation,
    crop: createFullImageCropRect(item.originalWidth, item.originalHeight),
    sourceTransform: {
      x: 0,
      y: 0,
      width: item.sourceTransform.width,
      height: item.sourceTransform.height,
      rotation: 0,
    },
    scaleX: 1,
    scaleY: 1,
  };
}

export function buildSourceTransformFromFullImageItem(
  baseItem: ImageCanvasItem,
  fullImageItem: ImageCanvasItem,
): ImageSourceTransform {
  const localTopLeft = stageToLocal(
    { x: fullImageItem.x, y: fullImageItem.y },
    { x: baseItem.x, y: baseItem.y },
    baseItem.rotation,
  );

  return {
    x: localTopLeft.x,
    y: localTopLeft.y,
    width: fullImageItem.width,
    height: fullImageItem.height,
    rotation: fullImageItem.rotation - baseItem.rotation,
  };
}

export function buildCroppedImagePreviewItem(
  baseItem: ImageCanvasItem,
  sourceTransform: ImageSourceTransform,
): ImageCanvasItem {
  return buildImagePreviewItem(baseItem, sourceTransform);
}

export function resizeImageCrop(params: {
  baseItem: ImageCanvasItem;
  handle: ResizeHandle;
  pointer: Point;
  pointerOffset?: Point;
  siblingItems: CanvasItem[];
  snapEnabled?: boolean;
  stageRect: SnapRect;
  threshold?: number;
}) {
  const {
    baseItem,
    handle,
    pointer,
    pointerOffset = { x: 0, y: 0 },
    siblingItems,
    snapEnabled = true,
    stageRect,
    threshold,
  } = params;
  const adjustedPointer = {
    x: pointer.x - pointerOffset.x,
    y: pointer.y - pointerOffset.y,
  };
  const localPointer = stageToLocal(
    adjustedPointer,
    { x: baseItem.x, y: baseItem.y },
    baseItem.rotation,
  );
  let left = 0;
  let top = 0;
  let right = baseItem.width;
  let bottom = baseItem.height;

  if (handle.includes('left')) {
    left = clamp(localPointer.x, 0, right - 1);
  }
  if (handle.includes('right')) {
    right = clamp(localPointer.x, left + 1, Number.MAX_SAFE_INTEGER);
  }
  if (handle.includes('top')) {
    top = clamp(localPointer.y, 0, bottom - 1);
  }
  if (handle.includes('bottom')) {
    bottom = clamp(localPointer.y, top + 1, Number.MAX_SAFE_INTEGER);
  }
  if (handle === 'top-center' || handle === 'bottom-center') {
    left = 0;
    right = baseItem.width;
  }
  if (handle === 'middle-left' || handle === 'middle-right') {
    top = 0;
    bottom = baseItem.height;
  }

  let guides: GuideLine[] = [];
  if (snapEnabled && Math.abs(baseItem.rotation) < 0.001) {
    const snapped = getResizeSnappedRect(
      {
        x: baseItem.x + left,
        y: baseItem.y + top,
        width: right - left,
        height: bottom - top,
      },
      siblingItems,
      stageRect,
      handle,
      threshold,
    );
    left = snapped.rect.x - baseItem.x;
    top = snapped.rect.y - baseItem.y;
    right = snapped.rect.x + snapped.rect.width - baseItem.x;
    bottom = snapped.rect.y + snapped.rect.height - baseItem.y;
    guides = snapped.guides;
  }

  const nextWidth = Math.max(1, right - left);
  const nextHeight = Math.max(1, bottom - top);
  const nextOrigin = localToStage(
    { x: left, y: top },
    { x: baseItem.x, y: baseItem.y },
    baseItem.rotation,
  );
  const nextSourceTransform: ImageSourceTransform = {
    ...baseItem.sourceTransform,
    x: baseItem.sourceTransform.x - left,
    y: baseItem.sourceTransform.y - top,
  };
  const previewItem = buildImagePreviewItem(
    {
      ...baseItem,
      x: nextOrigin.x,
      y: nextOrigin.y,
      width: nextWidth,
      height: nextHeight,
    },
    nextSourceTransform,
  );

  return {
    crop: previewItem.crop,
    guides,
    previewItem,
    fullImageItem: buildFullImageTransformItem(previewItem),
  };
}

export function panImageUnderCrop(params: {
  baseItem: ImageCanvasItem;
  pointerStart: Point;
  pointer: Point;
}) {
  const { baseItem, pointer, pointerStart } = params;
  const pointerStartLocal = stageToLocal(
    pointerStart,
    { x: 0, y: 0 },
    baseItem.rotation,
  );
  const pointerLocal = stageToLocal(pointer, { x: 0, y: 0 }, baseItem.rotation);
  const deltaLocal = {
    x: pointerLocal.x - pointerStartLocal.x,
    y: pointerLocal.y - pointerStartLocal.y,
  };
  const nextSourceTransform: ImageSourceTransform = {
    ...baseItem.sourceTransform,
    x:
      Math.abs(baseItem.sourceTransform.rotation) < 0.001
        ? clamp(
            baseItem.sourceTransform.x + deltaLocal.x,
            baseItem.width - baseItem.sourceTransform.width,
            0,
          )
        : baseItem.sourceTransform.x + deltaLocal.x,
    y:
      Math.abs(baseItem.sourceTransform.rotation) < 0.001
        ? clamp(
            baseItem.sourceTransform.y + deltaLocal.y,
            baseItem.height - baseItem.sourceTransform.height,
            0,
          )
        : baseItem.sourceTransform.y + deltaLocal.y,
  };
  const previewItem = buildImagePreviewItem(baseItem, nextSourceTransform);

  return {
    crop: previewItem.crop,
    fullImageItem: buildFullImageTransformItem(previewItem),
    previewItem,
  };
}
