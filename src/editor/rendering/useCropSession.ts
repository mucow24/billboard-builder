import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getShapeHandlePoints,
  type Point,
  type ResizeHandle,
} from './interactionGeometry';
import {
  getCommitChanges,
  createResizeSession,
  createRotateSession,
  type InteractionSession,
  type PointerGestureSource,
  type SessionWithModifiers,
} from './interactionSession';
import {
  buildCroppedImagePreviewItem,
  buildFullImageTransformItem,
  buildSourceTransformFromFullImageItem,
  panImageUnderCrop,
  resizeImageCrop,
} from './imageCropGeometry';
import { SNAP_THRESHOLD } from './snapping';
import type {
  CanvasItem,
  GuideLine,
  ImageCanvasItem,
  ImageCropRect,
} from '../document/documentTypes';

type CropInteraction =
  | {
      kind: 'crop-resize';
      handle: ResizeHandle;
      pointerOffset: Point;
      initialPreviewItem: ImageCanvasItem;
      source: PointerGestureSource;
    }
  | {
      kind: 'image-pan';
      pointerStart: Point;
      initialPreviewItem: ImageCanvasItem;
      source: PointerGestureSource;
    }
  | {
      kind: 'full-resize';
      resizeSession: ReturnType<typeof createResizeSession>;
      initialPreviewItem: ImageCanvasItem;
      source: PointerGestureSource;
    }
  | {
      kind: 'full-rotate';
      rotateSession: ReturnType<typeof createRotateSession>;
      initialPreviewItem: ImageCanvasItem;
      source: PointerGestureSource;
    };

export interface ImageCropSessionState {
  itemId: string;
  originalItem: ImageCanvasItem;
  previewItem: ImageCanvasItem;
  fullImageItem: ImageCanvasItem;
  crop: ImageCropRect;
  activeInteraction: CropInteraction | null;
}

interface UseCropSessionParams {
  orderedItems: CanvasItem[];
  stageBounds: { x: number; y: number; width: number; height: number };
  zoom: number;
  onUpdateItem: (itemId: string, changes: Partial<CanvasItem>) => void;
  updateGuides: (guides: GuideLine[]) => void;
  resolveSession: (current: InteractionSession, pointer: Point) => InteractionSession;
}

export function useCropSession({
  orderedItems,
  stageBounds,
  zoom,
  onUpdateItem,
  updateGuides,
  resolveSession,
}: UseCropSessionParams) {
  const cropSessionRef = useRef<ImageCropSessionState | null>(null);
  const cropSessionRafRef = useRef<number | null>(null);
  const [cropSession, setCropSession] = useState<ImageCropSessionState | null>(null);

  useEffect(() => {
    return () => {
      if (cropSessionRafRef.current !== null) cancelAnimationFrame(cropSessionRafRef.current);
    };
  }, []);

  const updateCropSession = useCallback((nextSession: ImageCropSessionState | null) => {
    cropSessionRef.current = nextSession;
    if (nextSession === null) {
      if (cropSessionRafRef.current !== null) {
        cancelAnimationFrame(cropSessionRafRef.current);
        cropSessionRafRef.current = null;
      }
      setCropSession(null);
    } else if (cropSessionRafRef.current === null) {
      cropSessionRafRef.current = requestAnimationFrame(() => {
        cropSessionRafRef.current = null;
        setCropSession(cropSessionRef.current);
      });
    }
  }, []);

  const startCropSession = useCallback((item: ImageCanvasItem) => {
    updateCropSession({
      itemId: item.id,
      originalItem: item,
      previewItem: item,
      fullImageItem: buildFullImageTransformItem(item),
      crop: item.crop,
      activeInteraction: null,
    });
  }, [updateCropSession]);

  const commitCropSession = useCallback(() => {
    const current = cropSessionRef.current;
    if (!current) {
      return false;
    }
    updateGuides([]);
    const originalChanges = getCommitChanges(current.originalItem);
    const nextChanges = getCommitChanges(current.previewItem);
    if (JSON.stringify(originalChanges) !== JSON.stringify(nextChanges)) {
      onUpdateItem(current.itemId, nextChanges);
    }
    updateCropSession(null);
    return true;
  }, [updateGuides, onUpdateItem, updateCropSession]);

  const cancelCropSession = useCallback(() => {
    if (!cropSessionRef.current) {
      return false;
    }
    updateGuides([]);
    updateCropSession(null);
    return true;
  }, [updateGuides, updateCropSession]);

  useEffect(() => {
    if (!cropSession) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      cancelCropSession();
    }

    window.document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [cancelCropSession, cropSession]);

  const beginCropResize = useCallback((
    handle: ResizeHandle,
    pointer: Point,
    source: PointerGestureSource = 'stage',
  ) => {
    const current = cropSessionRef.current;
    if (!current) {
      return;
    }
    const handlePoint = getShapeHandlePoints(current.previewItem)[handle];
    updateCropSession({
      ...current,
      activeInteraction: {
        kind: 'crop-resize',
        handle,
        pointerOffset: {
          x: pointer.x - handlePoint.x,
          y: pointer.y - handlePoint.y,
        },
        initialPreviewItem: current.previewItem,
        source,
      },
    });
  }, [updateCropSession]);

  const beginCropPan = useCallback((pointer: Point, source: PointerGestureSource = 'stage') => {
    const current = cropSessionRef.current;
    if (!current) {
      return;
    }
    updateCropSession({
      ...current,
      activeInteraction: {
        kind: 'image-pan',
        pointerStart: pointer,
        initialPreviewItem: current.previewItem,
        source,
      },
    });
  }, [updateCropSession]);

  const beginCropFullResize = useCallback((
    handle: ResizeHandle,
    pointer: Point,
    source: PointerGestureSource = 'stage',
  ) => {
    const current = cropSessionRef.current;
    if (!current) {
      return;
    }
    updateCropSession({
      ...current,
      activeInteraction: {
        kind: 'full-resize',
        resizeSession: createResizeSession(
          current.fullImageItem,
          handle,
          pointer,
          orderedItems.filter((entry) => entry.id !== current.itemId),
          source,
        ),
        initialPreviewItem: current.previewItem,
        source,
      },
    });
  }, [orderedItems, updateCropSession]);

  const beginCropFullRotate = useCallback((pointer: Point, source: PointerGestureSource = 'stage') => {
    const current = cropSessionRef.current;
    if (!current) {
      return;
    }
    updateCropSession({
      ...current,
      activeInteraction: {
        kind: 'full-rotate',
        rotateSession: createRotateSession(
          current.fullImageItem,
          pointer,
          orderedItems.filter((entry) => entry.id !== current.itemId),
          source,
        ),
        initialPreviewItem: current.previewItem,
        source,
      },
    });
  }, [orderedItems, updateCropSession]);

  const advanceCropInteractionAtPointer = useCallback((
    pointer: Point | null,
    modifiers: { ctrlKey: boolean; shiftKey: boolean },
  ) => {
    const current = cropSessionRef.current;
    if (!current?.activeInteraction || !pointer) {
      return;
    }

    switch (current.activeInteraction.kind) {
      case 'crop-resize': {
        const next = resizeImageCrop({
          baseItem: current.activeInteraction.initialPreviewItem,
          handle: current.activeInteraction.handle,
          pointer,
          pointerOffset: current.activeInteraction.pointerOffset,
          siblingItems: orderedItems.filter((entry) => entry.id !== current.itemId),
          snapEnabled: !modifiers.ctrlKey,
          stageRect: stageBounds,
          threshold: SNAP_THRESHOLD / zoom,
        });
        updateGuides(next.guides);
        updateCropSession({
          ...current,
          crop: next.crop,
          previewItem: next.previewItem,
          fullImageItem: next.fullImageItem,
        });
        return;
      }
      case 'image-pan': {
        updateGuides([]);
        const next = panImageUnderCrop({
          baseItem: current.activeInteraction.initialPreviewItem,
          pointerStart: current.activeInteraction.pointerStart,
          pointer,
        });
        updateCropSession({
          ...current,
          crop: next.crop,
          previewItem: next.previewItem,
          fullImageItem: next.fullImageItem,
        });
        return;
      }
      case 'full-resize': {
        const resolved = resolveSession({
          ...current.activeInteraction.resizeSession,
          snapDisabled: modifiers.ctrlKey,
          shiftConstrain: modifiers.shiftKey,
        } as SessionWithModifiers, pointer);
        const nextFullImageItem = 'previewItem' in resolved ? resolved.previewItem : null;
        if (!nextFullImageItem || nextFullImageItem.kind !== 'image') {
          return;
        }
        updateGuides(resolved.guides);
        const nextSourceTransform = buildSourceTransformFromFullImageItem(
          current.activeInteraction.initialPreviewItem,
          nextFullImageItem,
        );
        const nextPreviewItem = buildCroppedImagePreviewItem(
          current.activeInteraction.initialPreviewItem,
          nextSourceTransform,
        );
        updateCropSession({
          ...current,
          fullImageItem: nextFullImageItem,
          previewItem: nextPreviewItem,
          crop: nextPreviewItem.crop,
        });
        return;
      }
      case 'full-rotate': {
        const resolved = resolveSession({
          ...current.activeInteraction.rotateSession,
          snapDisabled: modifiers.ctrlKey,
          shiftConstrain: modifiers.shiftKey,
        } as SessionWithModifiers, pointer);
        const nextFullImageItem = 'previewItem' in resolved ? resolved.previewItem : null;
        if (!nextFullImageItem || nextFullImageItem.kind !== 'image') {
          return;
        }
        updateGuides([]);
        const nextSourceTransform = buildSourceTransformFromFullImageItem(
          current.activeInteraction.initialPreviewItem,
          nextFullImageItem,
        );
        const nextPreviewItem = buildCroppedImagePreviewItem(
          current.activeInteraction.initialPreviewItem,
          nextSourceTransform,
        );
        updateCropSession({
          ...current,
          fullImageItem: nextFullImageItem,
          previewItem: nextPreviewItem,
          crop: nextPreviewItem.crop,
        });
      }
    }
  }, [updateGuides, orderedItems, resolveSession, stageBounds, updateCropSession, zoom]);

  const endCropInteraction = useCallback(() => {
    const current = cropSessionRef.current;
    if (!current || !current.activeInteraction) {
      return false;
    }
    updateGuides([]);
    updateCropSession({
      ...current,
      activeInteraction: null,
    });
    return true;
  }, [updateGuides, updateCropSession]);

  return {
    cropSession,
    cropSessionRef,
    startCropSession,
    commitCropSession,
    cancelCropSession,
    beginCropResize,
    beginCropPan,
    beginCropFullResize,
    beginCropFullRotate,
    advanceCropInteractionAtPointer,
    endCropInteraction,
  };
}
