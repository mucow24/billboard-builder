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

export function scaleImageSourceTransform(
  sourceTransform: ImageSourceTransform,
  ratioX: number,
  ratioY: number,
): ImageSourceTransform {
  return {
    ...sourceTransform,
    x: sourceTransform.x * ratioX,
    y: sourceTransform.y * ratioY,
    width: sourceTransform.width * ratioX,
    height: sourceTransform.height * ratioY,
  };
}

/** Slack, in canvas pixels, for the rounding left behind by resizes. */
const UNCROPPED_TOLERANCE = 0.01;

/**
 * Where the whole picture has to sit to fill the item's frame exactly: no
 * empty space inside the frame and no picture outside it.
 */
function getFrameFillingSourceTransform(item: ImageCanvasItem): ImageSourceTransform {
  return {
    x: 0,
    y: 0,
    width: item.width * item.scaleX,
    height: item.height * item.scaleY,
    rotation: 0,
  };
}

/** Whether any of the picture is cut off by the frame, or any of the frame is left empty. */
export function isImageCropped(item: ImageCanvasItem): boolean {
  const filling = getFrameFillingSourceTransform(item);
  const current = item.sourceTransform;
  return (
    Math.abs(current.x - filling.x) > UNCROPPED_TOLERANCE ||
    Math.abs(current.y - filling.y) > UNCROPPED_TOLERANCE ||
    Math.abs(current.width - filling.width) > UNCROPPED_TOLERANCE ||
    Math.abs(current.height - filling.height) > UNCROPPED_TOLERANCE ||
    Math.abs(current.rotation - filling.rotation) > UNCROPPED_TOLERANCE
  );
}

/**
 * Undoes the crop without moving or resizing the item: the whole picture is
 * squeezed into the frame as it stands, whatever that does to its proportions.
 */
export function buildResetImageCropChange(
  item: ImageCanvasItem,
): Pick<ImageCanvasItem, 'crop' | 'sourceTransform'> {
  return {
    crop: { x: 0, y: 0, width: item.originalWidth, height: item.originalHeight },
    sourceTransform: getFrameFillingSourceTransform(item),
  };
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
