import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getShapeHandlePoints,
  type Point,
  type ResizeHandle,
} from './interactionGeometry';
import {
  createResizeSession,
  createRotateSession,
  type InteractionSession,
  type PointerGestureSource,
  type SessionWithModifiers,
} from './interactionSession';
import {
  bakeImageScale,
  buildCroppedImagePreviewItem,
  buildFullImageTransformItem,
  buildImageCropCommitChanges,
  buildSourceTransformFromFullImageItem,
  panImageUnderCrop,
  resizeImageCrop,
} from './imageCropGeometry';
import { SNAP_THRESHOLD } from './snapping';
import { isEditableTarget } from './domUtils';
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

/** Everything about an image that crop mode can change. */
function getCropGeometry(item: ImageCanvasItem): Partial<ImageCanvasItem> {
  return {
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    rotation: item.rotation,
    crop: item.crop,
    sourceTransform: item.sourceTransform,
    scaleX: item.scaleX,
    scaleY: item.scaleY,
  };
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
    if (cropSessionRafRef.current !== null) {
      cancelAnimationFrame(cropSessionRafRef.current);
      cropSessionRafRef.current = null;
    }
    // Update React state synchronously.  React's auto-batching coalesces
    // multiple updates per event-handler call, so we don't need the rAF
    // batching that was here previously — and that rAF prevented the
    // state-driven `useEffect` (which registers the window mousemove
    // listener for crop drags) from running in time during e2e tests
    // where headless Chromium throttles requestAnimationFrame.
    setCropSession(nextSession);
  }, []);

  const startCropSession = useCallback((item: ImageCanvasItem) => {
    // The session works on the box as drawn; originalItem stays the
    // document's item.
    const previewItem = bakeImageScale(item);
    updateCropSession({
      itemId: item.id,
      originalItem: item,
      previewItem,
      fullImageItem: buildFullImageTransformItem(previewItem),
      crop: item.crop,
      activeInteraction: null,
    });
  }, [updateCropSession]);

  // The document's copy of the image being cropped. Each crop gesture is
  // written to the document as it ends, so between gestures this is what the
  // session shows, and the properties panel sees the crop as it stands.
  const documentItem = cropSession
    ? orderedItems.find((entry) => entry.id === cropSession.itemId)
    : undefined;

  const writePreviewToDocument = useCallback((current: ImageCropSessionState) => {
    const inDocument = orderedItems.find((entry) => entry.id === current.itemId);
    // The preview is the box as drawn; the document's copy keeps its own
    // scale, so the changes are worked out against that copy.
    const changes = buildImageCropCommitChanges(
      inDocument?.kind === 'image' ? inDocument : current.originalItem,
      current.previewItem,
    );
    if (changes) {
      onUpdateItem(current.itemId, changes);
    }
  }, [orderedItems, onUpdateItem]);

  // When the document's copy changes under the session (a finished gesture
  // landing, an edit in the properties panel, undo), carry on from it.
  useEffect(() => {
    const current = cropSessionRef.current;
    if (
      !current ||
      current.activeInteraction ||
      documentItem?.kind !== 'image' ||
      documentItem === current.previewItem
    ) {
      return;
    }
    // The session works on the box as drawn.
    const previewItem = bakeImageScale(documentItem);
    updateCropSession({
      ...current,
      previewItem,
      fullImageItem: buildFullImageTransformItem(previewItem),
      crop: previewItem.crop,
    });
  }, [documentItem, updateCropSession]);

  const commitCropSession = useCallback(() => {
    const current = cropSessionRef.current;
    if (!current) {
      return false;
    }
    updateGuides([]);
    writePreviewToDocument(current);
    updateCropSession(null);
    return true;
  }, [updateGuides, writePreviewToDocument, updateCropSession]);

  /** Leaves crop mode with the image as it was on the way in. */
  const cancelCropSession = useCallback(() => {
    const current = cropSessionRef.current;
    if (!current) {
      return false;
    }
    updateGuides([]);
    const inDocument = orderedItems.find((entry) => entry.id === current.itemId);
    if (inDocument?.kind === 'image' && inDocument !== current.originalItem) {
      const original = getCropGeometry(current.originalItem);
      if (JSON.stringify(getCropGeometry(inDocument)) !== JSON.stringify(original)) {
        onUpdateItem(current.itemId, original);
      }
    }
    updateCropSession(null);
    return true;
  }, [orderedItems, onUpdateItem, updateGuides, updateCropSession]);

  useEffect(() => {
    if (!cropSession) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }
      // Escape in a text field (an inspector input, the HUD zoom field)
      // belongs to that field, not to the crop session.
      if (isEditableTarget(event.target)) {
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
        const next = panImageUnderCrop({
          baseItem: current.activeInteraction.initialPreviewItem,
          pointerStart: current.activeInteraction.pointerStart,
          pointer,
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
    writePreviewToDocument(current);
    return true;
  }, [updateGuides, updateCropSession, writePreviewToDocument]);

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
