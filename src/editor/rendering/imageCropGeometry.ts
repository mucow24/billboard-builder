import { createFullImageCropRect } from '../document/documentDefaults';
import type {
  CanvasItem,
  GuideLine,
  ImageCanvasItem,
  ImageCropRect,
  SnapRect,
} from '../document/documentTypes';
import { getResizeSnappedRect } from './snapping';
import { stageToLocal, type Point, type ResizeHandle } from './interactionGeometry';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildFullImageTransformItem(item: ImageCanvasItem): ImageCanvasItem {
  const scaleX = item.width / Math.max(item.crop.width, 1);
  const scaleY = item.height / Math.max(item.crop.height, 1);

  return {
    ...item,
    id: `crop-full-${item.id}`,
    x: item.x - item.crop.x * scaleX,
    y: item.y - item.crop.y * scaleY,
    width: item.originalWidth * scaleX,
    height: item.originalHeight * scaleY,
    crop: createFullImageCropRect(item.originalWidth, item.originalHeight),
    scaleX: 1,
    scaleY: 1,
  };
}

export function buildCroppedImagePreviewItem(
  baseItem: ImageCanvasItem,
  fullImageItem: ImageCanvasItem,
  crop: ImageCropRect,
): ImageCanvasItem {
  const scaleX = fullImageItem.width / Math.max(fullImageItem.originalWidth, 1);
  const scaleY = fullImageItem.height / Math.max(fullImageItem.originalHeight, 1);

  return {
    ...baseItem,
    x: fullImageItem.x + crop.x * scaleX,
    y: fullImageItem.y + crop.y * scaleY,
    width: crop.width * scaleX,
    height: crop.height * scaleY,
    rotation: fullImageItem.rotation,
    crop,
    scaleX: 1,
    scaleY: 1,
  };
}

function getCropEdgesInFullFrame(
  fullImageItem: ImageCanvasItem,
  crop: ImageCropRect,
) {
  const scaleX = fullImageItem.width / Math.max(fullImageItem.originalWidth, 1);
  const scaleY = fullImageItem.height / Math.max(fullImageItem.originalHeight, 1);

  return {
    left: crop.x * scaleX,
    top: crop.y * scaleY,
    right: (crop.x + crop.width) * scaleX,
    bottom: (crop.y + crop.height) * scaleY,
    minWidth: scaleX,
    minHeight: scaleY,
    scaleX,
    scaleY,
  };
}

export function resizeImageCrop(params: {
  baseItem: ImageCanvasItem;
  fullImageItem: ImageCanvasItem;
  crop: ImageCropRect;
  handle: ResizeHandle;
  pointer: Point;
  siblingItems: CanvasItem[];
  snapEnabled?: boolean;
  stageRect: SnapRect;
}) {
  const {
    baseItem,
    crop,
    fullImageItem,
    handle,
    pointer,
    siblingItems,
    snapEnabled = true,
    stageRect,
  } = params;
  const localPointer = stageToLocal(
    pointer,
    { x: fullImageItem.x, y: fullImageItem.y },
    fullImageItem.rotation,
  );
  const edges = getCropEdgesInFullFrame(fullImageItem, crop);
  let { left, top, right, bottom } = edges;

  if (handle.includes('left')) {
    left = clamp(localPointer.x, 0, right - edges.minWidth);
  }
  if (handle.includes('right')) {
    right = clamp(localPointer.x, left + edges.minWidth, fullImageItem.width);
  }
  if (handle.includes('top')) {
    top = clamp(localPointer.y, 0, bottom - edges.minHeight);
  }
  if (handle.includes('bottom')) {
    bottom = clamp(localPointer.y, top + edges.minHeight, fullImageItem.height);
  }
  if (handle === 'top-center' || handle === 'bottom-center') {
    left = edges.left;
    right = edges.right;
  }
  if (handle === 'middle-left' || handle === 'middle-right') {
    top = edges.top;
    bottom = edges.bottom;
  }

  let guides: GuideLine[] = [];
  if (snapEnabled && Math.abs(fullImageItem.rotation) < 0.001) {
    const snapped = getResizeSnappedRect(
      {
        x: fullImageItem.x + left,
        y: fullImageItem.y + top,
        width: right - left,
        height: bottom - top,
      },
      siblingItems,
      stageRect,
      handle,
    );
    left = clamp(snapped.rect.x - fullImageItem.x, 0, fullImageItem.width - edges.minWidth);
    top = clamp(snapped.rect.y - fullImageItem.y, 0, fullImageItem.height - edges.minHeight);
    right = clamp(
      snapped.rect.x + snapped.rect.width - fullImageItem.x,
      left + edges.minWidth,
      fullImageItem.width,
    );
    bottom = clamp(
      snapped.rect.y + snapped.rect.height - fullImageItem.y,
      top + edges.minHeight,
      fullImageItem.height,
    );
    guides = snapped.guides;
  }

  const nextCrop: ImageCropRect = {
    x: left / edges.scaleX,
    y: top / edges.scaleY,
    width: (right - left) / edges.scaleX,
    height: (bottom - top) / edges.scaleY,
  };

  return {
    crop: nextCrop,
    guides,
    previewItem: buildCroppedImagePreviewItem(baseItem, fullImageItem, nextCrop),
  };
}

export function panImageUnderCrop(params: {
  baseItem: ImageCanvasItem;
  fullImageItem: ImageCanvasItem;
  crop: ImageCropRect;
  pointerStart: Point;
  pointer: Point;
}) {
  const { baseItem, crop, fullImageItem, pointer, pointerStart } = params;
  const pointerStartLocal = stageToLocal(
    pointerStart,
    { x: 0, y: 0 },
    fullImageItem.rotation,
  );
  const pointerLocal = stageToLocal(pointer, { x: 0, y: 0 }, fullImageItem.rotation);
  const deltaLocal = {
    x: pointerLocal.x - pointerStartLocal.x,
    y: pointerLocal.y - pointerStartLocal.y,
  };
  const scaleX = fullImageItem.width / Math.max(fullImageItem.originalWidth, 1);
  const scaleY = fullImageItem.height / Math.max(fullImageItem.originalHeight, 1);
  const nextCrop: ImageCropRect = {
    x: clamp(
      crop.x - deltaLocal.x / scaleX,
      0,
      fullImageItem.originalWidth - crop.width,
    ),
    y: clamp(
      crop.y - deltaLocal.y / scaleY,
      0,
      fullImageItem.originalHeight - crop.height,
    ),
    width: crop.width,
    height: crop.height,
  };
  const nextFullImageItem = buildFullImageTransformItem({
    ...baseItem,
    crop: nextCrop,
  });

  return {
    crop: nextCrop,
    fullImageItem: nextFullImageItem,
    previewItem: {
      ...baseItem,
      crop: nextCrop,
    },
  };
}
