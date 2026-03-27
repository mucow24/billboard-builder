import type {
  ImageCanvasItem,
  ImageCropRect,
  ImageSourceTransform,
} from '../document/documentTypes';

const MIN_SCALE = 0.0001;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface ImageNodePresentation {
  height: number;
  rotation: number;
  scaleX: number;
  width: number;
  x: number;
  y: number;
}

export function getImageNodePresentation(
  sourceTransform: ImageSourceTransform,
  mirrorHorizontal: boolean,
): ImageNodePresentation {
  return {
    x: mirrorHorizontal ? sourceTransform.x + sourceTransform.width : sourceTransform.x,
    y: sourceTransform.y,
    width: sourceTransform.width,
    height: sourceTransform.height,
    rotation: sourceTransform.rotation,
    scaleX: mirrorHorizontal ? -1 : 1,
  };
}

export function buildVisibleImageCropFromSourceTransform(
  item: ImageCanvasItem,
  sourceTransform: ImageSourceTransform,
): ImageCropRect {
  if (Math.abs(sourceTransform.rotation) > 0.001) {
    return item.crop;
  }

  const scaleX = sourceTransform.width / Math.max(item.originalWidth, 1);
  const scaleY = sourceTransform.height / Math.max(item.originalHeight, 1);
  const safeScaleX = Math.max(scaleX, MIN_SCALE);
  const safeScaleY = Math.max(scaleY, MIN_SCALE);
  const width = clamp(item.width / safeScaleX, 1, item.originalWidth);
  const height = clamp(item.height / safeScaleY, 1, item.originalHeight);
  const x = item.mirrorHorizontal
    ? clamp(
        item.originalWidth - width + sourceTransform.x / safeScaleX,
        0,
        item.originalWidth - width,
      )
    : clamp(
        -sourceTransform.x / safeScaleX,
        0,
        item.originalWidth - width,
      );
  const y = clamp(
    -sourceTransform.y / safeScaleY,
    0,
    item.originalHeight - height,
  );

  return {
    x,
    y,
    width,
    height,
  };
}
