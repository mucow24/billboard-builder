import { createFullImageCropRect } from '../document/documentDefaults';
import type {
  CanvasItem,
  GuideLine,
  ImageCanvasItem,
  ImageSourceTransform,
  SnapRect,
} from '../document/documentTypes';
import { buildVisibleImageCropFromSourceTransform } from './imagePresentation';
import { getItemAABB } from './selectionGeometry';
import {
  buildCandidateCache,
  getResizeSnappedRect,
  getSnappedRect,
  isMultipleOf90,
} from './snapping';
import {
  localToStage,
  stageToLocal,
  type Point,
  type ResizeHandle,
} from './interactionGeometry';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Below this (in pixels or degrees) a difference is rounding left over from
// the crop maths, not a crop anyone made.
const UNCROPPED_TOLERANCE = 0.001;

// Guards the reset's division against a degenerate, zero-sized image.
const MIN_IMAGE_SIZE = 0.0001;

/**
 * True when the whole image exactly fills its box: not moved, zoomed,
 * stretched or turned inside it. Such an image has no crop to reset.
 */
export function isImageUncropped(item: ImageCanvasItem): boolean {
  const st = item.sourceTransform;
  return (
    Math.abs(st.x) < UNCROPPED_TOLERANCE &&
    Math.abs(st.y) < UNCROPPED_TOLERANCE &&
    Math.abs(st.width - item.width * item.scaleX) < UNCROPPED_TOLERANCE &&
    Math.abs(st.height - item.height * item.scaleY) < UNCROPPED_TOLERANCE &&
    Math.abs(st.rotation) < UNCROPPED_TOLERANCE
  );
}

/**
 * Undoes every crop-mode edit: the whole image fills its box again, unmoved
 * and unturned, and is never stretched to do it. It keeps its proportions as
 * last drawn (so a stretch made outside crop mode stays) and takes the
 * smallest size that covers the box.
 *
 * After a pan, zoom or turn the box is left as it is. Where the box's
 * proportions no longer match the image's, as after dragging a crop edge,
 * the box grows to the image. It keeps its corner, scale and angle, so it
 * grows to the right and down (it turns about its top-left corner).
 */
export function buildImageCropResetChanges(
  item: ImageCanvasItem,
): Partial<ImageCanvasItem> {
  const st = item.sourceTransform;
  const boxWidth = item.width * item.scaleX;
  const boxHeight = item.height * item.scaleY;
  const scale = Math.max(
    boxWidth / Math.max(st.width, MIN_IMAGE_SIZE),
    boxHeight / Math.max(st.height, MIN_IMAGE_SIZE),
  );
  // Keep the box exactly as it is along a side the image already spans, so
  // rounding does not nudge it.
  const keepsWidth = Math.abs(st.width * scale - boxWidth) < UNCROPPED_TOLERANCE;
  const keepsHeight = Math.abs(st.height * scale - boxHeight) < UNCROPPED_TOLERANCE;
  const imageWidth = keepsWidth ? boxWidth : st.width * scale;
  const imageHeight = keepsHeight ? boxHeight : st.height * scale;

  return {
    width: keepsWidth ? item.width : imageWidth / item.scaleX,
    height: keepsHeight ? item.height : imageHeight / item.scaleY,
    crop: createFullImageCropRect(item.originalWidth, item.originalHeight),
    sourceTransform: { x: 0, y: 0, width: imageWidth, height: imageHeight, rotation: 0 },
  };
}

// What crop mode edits, and all a commit writes (see getCommitChanges).
const IMAGE_GEOMETRY_KEYS = [
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'scaleX',
  'scaleY',
  'crop',
  'sourceTransform',
] as const;

type ImageGeometry = Pick<ImageCanvasItem, (typeof IMAGE_GEOMETRY_KEYS)[number]>;

function pickImageGeometry(item: ImageCanvasItem): ImageGeometry {
  return {
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    rotation: item.rotation,
    scaleX: item.scaleX,
    scaleY: item.scaleY,
    crop: item.crop,
    sourceTransform: item.sourceTransform,
  };
}

// The document's copies are rebuilt on every change, so objects are compared
// by content. Strings (an image's src can be large) are compared directly.
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  return (
    typeof left === 'object' &&
    typeof right === 'object' &&
    left !== null &&
    right !== null &&
    JSON.stringify(left) === JSON.stringify(right)
  );
}

function sameFields(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return keys.every((key) => sameValue(left[key], right[key]));
}

interface CropSessionItems {
  originalItem: ImageCanvasItem;
  previewItem: ImageCanvasItem;
  fullImageItem: ImageCanvasItem;
  activeInteraction: unknown;
}

/**
 * Keeps an open crop session in step with the document. Crop mode draws the
 * image from its own copy, taken when it opened, and a commit writes that
 * copy's geometry back, so a change made meanwhile by the inspector or by
 * undo would neither show nor last. Returns:
 *
 * - 'restart' when the item's geometry changed (Reset crop, Dimensions,
 *   Rotation, undo...): crop mode starts over from the document's item.
 *   Crop-mode edits not yet committed are dropped.
 * - a session showing the document's other settings (Brightness, Mirror...)
 *   when only those changed, keeping the crop-mode edits in progress.
 * - the same session when nothing changed, or while a drag is under way
 *   (the caller checks again once it ends).
 */
export function syncImageCropSessionToDocument<T extends CropSessionItems>(
  session: T,
  documentItem: ImageCanvasItem,
): T | 'restart' {
  if (session.activeInteraction || documentItem === session.originalItem) {
    return session;
  }
  const original = session.originalItem as unknown as Record<string, unknown>;
  const current = documentItem as unknown as Record<string, unknown>;
  if (!sameFields(original, current, IMAGE_GEOMETRY_KEYS)) {
    return 'restart';
  }
  const allKeys = Array.from(new Set([...Object.keys(original), ...Object.keys(current)]));
  if (sameFields(original, current, allKeys)) {
    return session;
  }
  return {
    ...session,
    originalItem: documentItem,
    previewItem: { ...documentItem, ...pickImageGeometry(session.previewItem) },
    fullImageItem: {
      ...documentItem,
      ...pickImageGeometry(session.fullImageItem),
      id: session.fullImageItem.id,
    },
  };
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

/**
 * The full image's four edges as snap lines in the crop frame's own axes.
 * Empty when the image is turned inside the frame by anything other than a
 * quarter turn: its edges are then not parallel to the frame's.
 */
function getImageEdgeLines(
  sourceTransform: ImageSourceTransform,
): { orientation: 'vertical' | 'horizontal'; position: number }[] {
  if (!isMultipleOf90(sourceTransform.rotation)) {
    return [];
  }
  const origin = { x: sourceTransform.x, y: sourceTransform.y };
  const opposite = localToStage(
    { x: sourceTransform.width, y: sourceTransform.height },
    origin,
    sourceTransform.rotation,
  );
  return [
    { orientation: 'vertical', position: origin.x },
    { orientation: 'vertical', position: opposite.x },
    { orientation: 'horizontal', position: origin.y },
    { orientation: 'horizontal', position: opposite.y },
  ];
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
    left = clamp(localPointer.x, -Number.MAX_SAFE_INTEGER, right - 1);
  }
  if (handle.includes('right')) {
    right = clamp(localPointer.x, left + 1, Number.MAX_SAFE_INTEGER);
  }
  if (handle.includes('top')) {
    top = clamp(localPointer.y, -Number.MAX_SAFE_INTEGER, bottom - 1);
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
  if (snapEnabled) {
    // Snapping runs in the crop frame's own axes (origin at the frame's
    // top-left corner, turned with the item), where the frame's edges are
    // axis-aligned whatever the item's rotation.
    const frameIsUpright = Math.abs(baseItem.rotation) < 0.001;
    const lines: ReturnType<typeof getImageEdgeLines> = [];
    if (frameIsUpright) {
      // The stage's and the siblings' guides are axis-aligned on the stage,
      // so they only line up with the edges of an upright frame.
      for (const line of buildCandidateCache(siblingItems, stageRect).lines) {
        lines.push({
          orientation: line.orientation,
          position:
            line.position - (line.orientation === 'vertical' ? baseItem.x : baseItem.y),
        });
      }
    }
    // Last, so that a stage or sibling guide wins a tie with an image edge.
    lines.push(...getImageEdgeLines(baseItem.sourceTransform));
    const snapped = getResizeSnappedRect(
      { x: left, y: top, width: right - left, height: bottom - top },
      siblingItems,
      stageRect,
      handle,
      threshold,
      { lines, vertical: [], horizontal: [] },
    );
    left = snapped.rect.x;
    top = snapped.rect.y;
    right = snapped.rect.x + snapped.rect.width;
    bottom = snapped.rect.y + snapped.rect.height;
    guides = snapped.guides.map((guide) =>
      frameIsUpright
        ? {
            orientation: guide.orientation,
            position:
              guide.position + (guide.orientation === 'vertical' ? baseItem.x : baseItem.y),
          }
        : {
            ...guide,
            frame: {
              origin: { x: baseItem.x, y: baseItem.y },
              rotation: baseItem.rotation,
            },
          },
    );
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
  siblingItems: CanvasItem[];
  snapEnabled?: boolean;
  stageRect: SnapRect;
  threshold?: number;
}) {
  const {
    baseItem,
    pointer,
    pointerStart,
    siblingItems,
    snapEnabled = true,
    stageRect,
    threshold,
  } = params;
  const panBy = (stageDelta: Point) => {
    const deltaLocal = stageToLocal(stageDelta, { x: 0, y: 0 }, baseItem.rotation);
    return buildImagePreviewItem(baseItem, {
      ...baseItem.sourceTransform,
      x: baseItem.sourceTransform.x + deltaLocal.x,
      y: baseItem.sourceTransform.y + deltaLocal.y,
    });
  };
  const stageDelta = {
    x: pointer.x - pointerStart.x,
    y: pointer.y - pointerStart.y,
  };
  let previewItem = panBy(stageDelta);
  let guides: GuideLine[] = [];

  if (snapEnabled) {
    // Snap the whole picture's bounding box, as an ordinary move does, to
    // the stage and the other items. The cache is built fresh on every move
    // (as in resizeImageCrop), so adding lines to it below is safe; if it is
    // ever built once per gesture, the additions must move with it.
    const cache = buildCandidateCache(siblingItems, stageRect);
    // Also snap to the crop frame, which stays put while the picture slides
    // under it. Not when the item is rotated: the frame's bounding box then
    // lines up with none of its real edges, so a snap to it would show a
    // guide without making anything flush.
    if (Math.abs(baseItem.rotation) < 0.001) {
      const frame = getItemAABB(baseItem);
      cache.lines.push(
        { orientation: 'vertical', position: frame.x },
        { orientation: 'vertical', position: frame.x + frame.width / 2 },
        { orientation: 'vertical', position: frame.x + frame.width },
        { orientation: 'horizontal', position: frame.y },
        { orientation: 'horizontal', position: frame.y + frame.height / 2 },
        { orientation: 'horizontal', position: frame.y + frame.height },
      );
    }
    const rawRect = getItemAABB(buildFullImageTransformItem(previewItem));
    const snapped = getSnappedRect(rawRect, siblingItems, stageRect, threshold, cache);
    guides = snapped.guides;
    if (guides.length > 0) {
      previewItem = panBy({
        x: stageDelta.x + snapped.rect.x - rawRect.x,
        y: stageDelta.y + snapped.rect.y - rawRect.y,
      });
    }
  }

  return {
    crop: previewItem.crop,
    fullImageItem: buildFullImageTransformItem(previewItem),
    guides,
    previewItem,
  };
}
