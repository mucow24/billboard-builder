import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';

import {
  getShapeHandlePoints,
  isCreateTool,
  stageToLocal,
  type Point,
  type ResizeHandle,
} from './interactionGeometry';
import {
  getRenderBox,
  getSelectionFrameForRotation,
  getSelectionRenderBounds,
} from './transformGeometry';
import {
  getCommitChanges,
  buildInteractionCommit,
  buildRenderedRenderables,
  createCreateSession,
  createDragSession,
  createGroupDragSession,
  createGroupResizeSession,
  createGroupRotateSession,
  createLineHandleSession,
  createResizeSession,
  createRotateSession,
  currentSelectionSetSignature,
  resolveInteractionSession,
  type InteractionSession,
  type PointerGestureSource,
  type SelectionFrame,
  type SessionWithModifiers,
  type ShapeItem,
} from './interactionSession';
import {
  buildCroppedImagePreviewItem,
  buildFullImageTransformItem,
  buildSourceTransformFromFullImageItem,
  panImageUnderCrop,
  resizeImageCrop,
} from './imageCropGeometry';
import { buildRenderableCanvasItems, type RenderableCanvasItem } from './renderAdapter';
import { useModifierKeys } from './useModifierKeys';
import {
  collectLeafItems,
  getNextDrilldownNodeId,
  getNodeEntry,
  getNodeById,
  isCanvasItemNode,
  isGroupNode,
} from '../document/sceneGraph';
import type {
  CanvasItem,
  ImageCanvasItem,
  ImageCropRect,
  CanvasTool,
  CanvasNode,
  GuideLine,
  LineCanvasItem,
  ProjectDocument,
} from '../document/documentTypes';

interface UseCanvasInteractionSessionParams {
  activeTool: CanvasTool;
  document: ProjectDocument;
  selectedItemIds: string[];
  viewport?: { zoom: number; panX: number; panY: number };
  onGuidesChange: (guides: GuideLine[]) => void;
  onSelectItem: (itemId?: string) => void;
  onToggleSelectItem?: (itemId: string) => void;
  onToggleSelectItems?: (itemIds: string[]) => void;
  onUpdateItem: (itemId: string, changes: Partial<CanvasItem>) => void;
  onUpdateItems?: (changesById: Array<{ itemId: string; changes: Partial<CanvasItem> }>) => void;
  onAddItem: (item: CanvasItem) => void;
  onSetActiveTool: (tool: CanvasTool) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
}

interface PendingItemGesture {
  kind: 'pickup-drag' | 'shift-toggle';
  pointerStart: Point;
  selectionNodeId: string;
  item: CanvasItem;
  source: PointerGestureSource;
}

interface HandledItemPointerEvent {
  nativeEvent: MouseEvent;
  timeStamp: number;
  clientX: number;
  clientY: number;
  button: number;
  itemId: string;
  selectionNodeId: string;
}

interface StageDescendantClickSample {
  groupId: string;
  itemId: string;
  recordedAtMs: number;
  clientX: number;
  clientY: number;
  button: number;
}

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

interface ImageCropSessionState {
  itemId: string;
  originalItem: ImageCanvasItem;
  previewItem: ImageCanvasItem;
  fullImageItem: ImageCanvasItem;
  crop: ImageCropRect;
  activeInteraction: CropInteraction | null;
}

const PICKUP_DRAG_THRESHOLD = 3;
const GROUP_DRILL_DOUBLE_CLICK_MS = 500;
const GROUP_DRILL_DOUBLE_CLICK_MAX_POINTER_DELTA = 6;

function pointHitsRenderableItem(item: RenderableCanvasItem, point: Point) {
  if (item.kind === 'line') {
    const left = Math.min(item.startX, item.endX) - Math.max(item.strokeWidth / 2, 8);
    const right = Math.max(item.startX, item.endX) + Math.max(item.strokeWidth / 2, 8);
    const top = Math.min(item.startY, item.endY) - Math.max(item.strokeWidth / 2, 8);
    const bottom = Math.max(item.startY, item.endY) + Math.max(item.strokeWidth / 2, 8);
    return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  }

  const renderBox = getRenderBox(item);
  const local = stageToLocal(point, { x: renderBox.x, y: renderBox.y }, item.rotation);
  return (
    local.x >= 0 &&
    local.x <= renderBox.width &&
    local.y >= 0 &&
    local.y <= renderBox.height
  );
}

function getGroupDescendantAtPoint(
  renderedItems: RenderableCanvasItem[],
  groupId: string,
  point: Point,
) {
  return renderedItems
    .filter((item) => item.groupPath.includes(groupId))
    .slice()
    .reverse()
    .find((item) => pointHitsRenderableItem(item, point)) ?? null;
}

export function useCanvasInteractionSession({
  activeTool,
  document,
  selectedItemIds,
  viewport = { zoom: 1, panX: 0, panY: 0 },
  onGuidesChange,
  onSelectItem,
  onToggleSelectItem,
  onToggleSelectItems,
  onUpdateItem,
  onUpdateItems,
  onAddItem,
  onSetActiveTool,
  stageRef,
}: UseCanvasInteractionSessionParams) {
  const shapeRefs = useRef(new Map<string, Konva.Node>());
  const sessionRef = useRef<InteractionSession | null>(null);
  const cropSessionRef = useRef<ImageCropSessionState | null>(null);
  const pendingMarqueeRef = useRef<{ pointerStart: Point; toggleMode: boolean } | null>(null);
  const pendingItemGestureRef = useRef<PendingItemGesture | null>(null);
  const lastHandledItemPointerEventRef = useRef<HandledItemPointerEvent | null>(null);
  const lastStageDescendantClickRef = useRef<StageDescendantClickSample | null>(null);
  const [session, setSession] = useState<InteractionSession | null>(null);
  const [cropSession, setCropSession] = useState<ImageCropSessionState | null>(null);
  const [selectionFrame, setSelectionFrame] = useState<SelectionFrame | null>(null);
  const [lastDrilldownSource, setLastDrilldownSource] = useState<'item-hit' | 'stage-surface' | null>(null);
  const [hasPendingMarquee, setHasPendingMarquee] = useState(false);
  const [hasPendingItemGesture, setHasPendingItemGesture] = useState(false);

  const selectedIdSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const renderables = useMemo(
    () => buildRenderableCanvasItems(document, selectedItemIds),
    [document, selectedItemIds]
  );
  const orderedItems = useMemo(
    () => renderables.map(({ selectableNodeId, ...item }) => {
      void selectableNodeId;
      return item;
    }),
    [renderables]
  );
  const renderableByLeafId = useMemo(
    () => new Map(renderables.map((item) => [item.id, item])),
    [renderables]
  );
  const selectedNodes = useMemo(
    () =>
      selectedItemIds
        .map((nodeId) => getNodeById(document.nodes, nodeId))
        .filter((node): node is CanvasNode => Boolean(node)),
    [document.nodes, selectedItemIds]
  );
  const selectedItems = useMemo(
    () =>
      selectedNodes
        .flatMap(collectLeafItems)
        .slice()
        .sort((left, right) => left.zIndex - right.zIndex),
    [selectedNodes]
  );
  const selectedLeafIdSet = useMemo(() => new Set(selectedItems.map((item) => item.id)), [selectedItems]);
  const groupBounds = useMemo(() => getSelectionRenderBounds(selectedItems), [selectedItems]);
  const stageBounds = useMemo(() => ({ x: 0, y: 0, width: document.canvas.width, height: document.canvas.height }), [document.canvas.height, document.canvas.width]);

  const renderedItems = useMemo(
    () => {
      const nextRenderables = buildRenderedRenderables(renderables, session);
      if (!cropSession) {
        return nextRenderables;
      }
      return nextRenderables.map((renderable) =>
        renderable.id === cropSession.itemId
          ? {
              ...renderable,
              ...cropSession.previewItem,
            }
          : renderable,
      );
    },
    [cropSession, renderables, session]
  );

  const renderedSelectedItems = useMemo(() => renderedItems.filter((item) => selectedLeafIdSet.has(item.id)), [renderedItems, selectedLeafIdSet]);
  const renderedGroupBounds = useMemo(() => getSelectionRenderBounds(renderedSelectedItems), [renderedSelectedItems]);
  const renderedSelectionFrame = useMemo(() => {
    if (renderedSelectedItems.length <= 1) {
      return null;
    }
    if (selectionFrame) {
      return selectionFrame;
    }
    return renderedGroupBounds ? { bounds: renderedGroupBounds, rotation: 0 } : null;
  }, [renderedGroupBounds, renderedSelectedItems.length, selectionFrame]);
  const activeSelectionFrame = useMemo(
    () => renderedSelectionFrame ?? (groupBounds ? { bounds: groupBounds, rotation: 0 } : null),
    [groupBounds, renderedSelectionFrame]
  );
  const selectedDocumentItem = useMemo(
    () => (selectedNodes[0] && isCanvasItemNode(selectedNodes[0]) ? selectedNodes[0] : null),
    [selectedNodes]
  );
  const selectedItemId = selectedDocumentItem?.id;
  const selectedRenderedItem = renderedItems.find((item) => item.id === selectedItemId) ?? null;
  const subgroupOutlineFrames = useMemo(() => {
    const outlineGroupIds = new Set<string>();

    if (selectedNodes.length === 1 && isCanvasItemNode(selectedNodes[0])) {
      const parentGroupId =
        getNodeEntry(document.nodes, selectedNodes[0].id)?.parent?.id ?? null;
      if (parentGroupId) {
        outlineGroupIds.add(parentGroupId);
      }
    } else if (selectedNodes.length > 1) {
      selectedNodes.filter(isGroupNode).forEach((node) => {
        outlineGroupIds.add(node.id);
      });
    }

    return Array.from(outlineGroupIds)
      .map((groupId) => {
        const outlineItems = renderedItems.filter((item) => item.groupPath.includes(groupId));
        const bounds = getSelectionRenderBounds(outlineItems);
        return bounds ? { nodeId: groupId, bounds } : null;
      })
      .filter(
        (frame): frame is { nodeId: string; bounds: { x: number; y: number; width: number; height: number } } =>
          Boolean(frame),
      );
  }, [document.nodes, renderedItems, selectedNodes]);

  const { resolveModifierKeys } = useModifierKeys({ capture: true });

  const updateSession = useCallback((nextSession: InteractionSession | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  const updateCropSession = useCallback((nextSession: ImageCropSessionState | null) => {
    cropSessionRef.current = nextSession;
    setCropSession(nextSession);
  }, []);

  const setPendingMarquee = useCallback((nextPending: { pointerStart: Point; toggleMode: boolean } | null) => {
    pendingMarqueeRef.current = nextPending;
    setHasPendingMarquee(Boolean(nextPending));
  }, []);

  const clearPendingMarquee = useCallback(() => {
    pendingMarqueeRef.current = null;
    setHasPendingMarquee(false);
  }, []);

  const setPendingItemGesture = useCallback((nextPending: PendingItemGesture | null) => {
    pendingItemGestureRef.current = nextPending;
    setHasPendingItemGesture(Boolean(nextPending));
  }, []);

  const clearPendingItemGesture = useCallback(() => {
    pendingItemGestureRef.current = null;
    setHasPendingItemGesture(false);
  }, []);

  const getCanvasPointerFromClient = useCallback((clientX: number, clientY: number) => {
    const containerBounds = stageRef.current?.container?.().getBoundingClientRect?.();
    if (!containerBounds) {
      return null;
    }
    return {
      x: (clientX - containerBounds.left - viewport.panX) / viewport.zoom,
      y: (clientY - containerBounds.top - viewport.panY) / viewport.zoom,
    };
  }, [stageRef, viewport.panX, viewport.panY, viewport.zoom]);

  const isClientPointInsideStage = useCallback((clientX: number, clientY: number) => {
    const containerBounds = stageRef.current?.container?.().getBoundingClientRect?.();
    if (!containerBounds) {
      return false;
    }
    return (
      clientX >= containerBounds.left &&
      clientX <= containerBounds.right &&
      clientY >= containerBounds.top &&
      clientY <= containerBounds.bottom
    );
  }, [stageRef]);


  useEffect(() => {
    if ((activeTool === 'select' || activeTool === 'pan' || activeTool === 'zoom') && session?.kind === 'create') {
      updateSession(null);
      onGuidesChange([]);
    }
  }, [activeTool, onGuidesChange, session, updateSession]);

  const selectionSetSignature = useMemo(() => currentSelectionSetSignature(selectedItems.map((item) => item.id)), [selectedItems]);

  useEffect(() => {
    if (selectedItems.length <= 1) {
      setSelectionFrame(null);
      return;
    }
    if (session?.kind === 'group-drag' || session?.kind === 'group-resize' || session?.kind === 'group-rotate') {
      return;
    }
    setSelectionFrame((current) => {
      const rotation = current && currentSelectionSetSignature(selectedItems.map((item) => item.id)) === selectionSetSignature
        ? current.rotation
        : 0;
      return getSelectionFrameForRotation(selectedItems, rotation) ?? (groupBounds ? { bounds: groupBounds, rotation } : null);
    });
  }, [groupBounds, selectedItems, selectionSetSignature, session?.kind]);

  const getCurrentPointer = useCallback((event: MouseEvent) => {
    if (!stageRef.current) {
      return null;
    }
    stageRef.current.setPointersPositions(event);
    const pointer = stageRef.current.getPointerPosition();
    if (!pointer) {
      return getCanvasPointerFromClient(event.clientX, event.clientY);
    }
    return {
      x: (pointer.x - viewport.panX) / viewport.zoom,
      y: (pointer.y - viewport.panY) / viewport.zoom,
    };
  }, [getCanvasPointerFromClient, stageRef, viewport.panX, viewport.panY, viewport.zoom]);

  const getCanvasPointerFromStageEvent = useCallback((event: Konva.KonvaEventObject<MouseEvent>) => {
    const rawPointer = event.target.getStage()?.getPointerPosition() ?? null;
    if (rawPointer) {
      return {
        x: (rawPointer.x - viewport.panX) / viewport.zoom,
        y: (rawPointer.y - viewport.panY) / viewport.zoom,
      };
    }
    return getCanvasPointerFromClient(event.evt.clientX, event.evt.clientY);
  }, [getCanvasPointerFromClient, viewport.panX, viewport.panY, viewport.zoom]);

  const resolveSession = useCallback(
    (current: InteractionSession, pointer: Point): InteractionSession =>
      resolveInteractionSession(current as SessionWithModifiers, pointer, { stageBounds }),
    [stageBounds]
  );

  const createGroupDragSessionForNode = useCallback((
    nodeId: string,
    pointer: Point,
    source: PointerGestureSource = 'stage',
  ) => {
    const node = getNodeById(document.nodes, nodeId);
    if (!node || !isGroupNode(node)) {
      return null;
    }

    const groupItems = collectLeafItems(node)
      .slice()
      .sort((left, right) => left.zIndex - right.zIndex);
    const groupLeafIds = new Set(groupItems.map((groupItem) => groupItem.id));
    const groupRenderBounds = getSelectionRenderBounds(
      renderedItems.filter((renderedItem) => groupLeafIds.has(renderedItem.id)),
    );

    return createGroupDragSession(pointer, {
      selectedItems: groupItems,
      siblingItems: orderedItems.filter((entry) => !groupLeafIds.has(entry.id)),
      activeSelectionFrame: groupRenderBounds ? { bounds: groupRenderBounds, rotation: 0 } : null,
    }, source);
  }, [document.nodes, orderedItems, renderedItems]);

  const createSelectedDragSession = useCallback((
    item: CanvasItem,
    selectionNodeId: string,
    pointer: Point,
    source: PointerGestureSource = 'stage',
  ) => {
    const selectedGroupNodeId =
      selectedItemIds.length === 1 &&
      (() => {
        const selectedNode = getNodeById(document.nodes, selectedItemIds[0]);
        return selectedNode && isGroupNode(selectedNode) ? selectedNode.id : null;
      })();
    const clickedRenderable = renderableByLeafId.get(item.id);
    if (
      selectedGroupNodeId &&
      clickedRenderable?.groupPath.includes(selectedGroupNodeId)
    ) {
      if (selectedItems.length > 1) {
        return createGroupDragSession(pointer, {
          selectedItems,
          siblingItems: orderedItems.filter((entry) => !selectedLeafIdSet.has(entry.id)),
          activeSelectionFrame,
        }, source);
      }
      return createDragSession(
        item,
        pointer,
        orderedItems.filter((entry) => entry.id !== item.id),
        source,
      );
    }

    if (!selectedIdSet.has(selectionNodeId)) {
      return null;
    }

    if (selectedItems.length > 1) {
      return createGroupDragSession(pointer, {
        selectedItems,
        siblingItems: orderedItems.filter((entry) => !selectedLeafIdSet.has(entry.id)),
        activeSelectionFrame,
      }, source);
    }

    if (selectionNodeId === item.id) {
      return createDragSession(
        item,
        pointer,
        orderedItems.filter((entry) => entry.id !== item.id),
        source,
      );
    }

    return createGroupDragSessionForNode(selectionNodeId, pointer, source);
  }, [
    activeSelectionFrame,
    createGroupDragSessionForNode,
    document.nodes,
    orderedItems,
    renderableByLeafId,
    selectedIdSet,
    selectedItemIds,
    selectedItems,
    selectedLeafIdSet,
  ]);

  const createSelectableNodeDragSession = useCallback((
    item: CanvasItem,
    selectionNodeId: string,
    pointer: Point,
    source: PointerGestureSource = 'stage',
  ) => {
    if (selectionNodeId === item.id) {
      return createDragSession(
        item,
        pointer,
        orderedItems.filter((entry) => entry.id !== item.id),
        source,
      );
    }

    return createGroupDragSessionForNode(selectionNodeId, pointer, source);
  }, [createGroupDragSessionForNode, orderedItems]);

  const createPendingItemSession = useCallback((pending: PendingItemGesture) => (
    pending.kind === 'shift-toggle'
      ? createSelectedDragSession(
          pending.item,
          pending.selectionNodeId,
          pending.pointerStart,
          pending.source,
        )
      : createSelectableNodeDragSession(
          pending.item,
          pending.selectionNodeId,
          pending.pointerStart,
          pending.source,
        )
  ), [createSelectableNodeDragSession, createSelectedDragSession]);

  const startImageCropSession = useCallback((item: ImageCanvasItem) => {
    updateSession(null);
    clearPendingMarquee();
    clearPendingItemGesture();
    onGuidesChange([]);
    updateCropSession({
      itemId: item.id,
      originalItem: item,
      previewItem: item,
      fullImageItem: buildFullImageTransformItem(item),
      crop: item.crop,
      activeInteraction: null,
    });
  }, [clearPendingItemGesture, clearPendingMarquee, onGuidesChange, updateCropSession, updateSession]);

  const commitCropSession = useCallback(() => {
    const current = cropSessionRef.current;
    if (!current) {
      return false;
    }
    onGuidesChange([]);
    const originalChanges = getCommitChanges(current.originalItem);
    const nextChanges = getCommitChanges(current.previewItem);
    if (JSON.stringify(originalChanges) !== JSON.stringify(nextChanges)) {
      onUpdateItem(current.itemId, nextChanges);
    }
    updateCropSession(null);
    return true;
  }, [onGuidesChange, onUpdateItem, updateCropSession]);

  const cancelCropSession = useCallback(() => {
    if (!cropSessionRef.current) {
      return false;
    }
    onGuidesChange([]);
    updateCropSession(null);
    return true;
  }, [onGuidesChange, updateCropSession]);

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

  const finishSession = useCallback((current: InteractionSession, pointer: Point) => {
    const resolved = resolveSession(current, pointer);
    onGuidesChange([]);
    const commit = buildInteractionCommit(resolved, {
      orderedItems,
      pointer,
      canvasBounds: stageBounds,
    });

    switch (commit.kind) {
      case 'create':
        onAddItem(commit.item);
        onSetActiveTool(commit.nextTool);
        return;
      case 'marquee':
        if (commit.toggleMode && onToggleSelectItems) {
          onToggleSelectItems(Array.from(new Set(commit.hitIds.map((itemId) => renderableByLeafId.get(itemId)?.selectableNodeId ?? itemId))));
        } else if (commit.hitIds.length > 0) {
          const selectableIds = Array.from(new Set(commit.hitIds.map((itemId) => renderableByLeafId.get(itemId)?.selectableNodeId ?? itemId)));
          onSelectItem(selectableIds[0]);
          if (selectableIds.length > 1 && onToggleSelectItems) {
            onSelectItem(undefined);
            onToggleSelectItems(selectableIds);
          }
        } else {
          onSelectItem(undefined);
        }
        return;
      case 'group':
        setSelectionFrame(commit.selectionFrame);
        if (onUpdateItems) {
          onUpdateItems(commit.updates);
        } else {
          commit.updates.forEach(({ itemId, changes }) => onUpdateItem(itemId, changes));
        }
        return;
      case 'single-item':
        onUpdateItem(commit.itemId, commit.changes);
        return;
    }
  }, [onAddItem, onGuidesChange, onSetActiveTool, onSelectItem, onToggleSelectItems, onUpdateItem, onUpdateItems, orderedItems, renderableByLeafId, resolveSession, stageBounds]);

  const commitActiveSession = useCallback((pointer: Point | null) => {
    const current = sessionRef.current;
    const resolvedPointer = pointer ?? current?.pointerStart ?? null;
    clearPendingItemGesture();
    if (!current || !resolvedPointer) {
      updateSession(null);
      onGuidesChange([]);
      return;
    }
    finishSession(current, resolvedPointer);
    updateSession(null);
  }, [clearPendingItemGesture, finishSession, onGuidesChange, updateSession]);

  const advanceSessionAtPointer = useCallback(
    (pointer: Point | null, modifiers: { ctrlKey: boolean; shiftKey: boolean }) => {
      if (!pointer) {
        return;
      }

      let current = sessionRef.current;
      if (pendingItemGestureRef.current) {
        const pending = pendingItemGestureRef.current;
        const distance = Math.hypot(
          pointer.x - pending.pointerStart.x,
          pointer.y - pending.pointerStart.y,
        );
        if (distance >= PICKUP_DRAG_THRESHOLD) {
          clearPendingItemGesture();
          if (!current) {
            current = createPendingItemSession(pending);
          }
        } else {
          return;
        }
      }
      if (!current && pendingMarqueeRef.current) {
        current = {
          kind: 'marquee',
          pointerStart: pendingMarqueeRef.current.pointerStart,
          pointerSource: 'stage',
          currentPointer: pointer,
          toggleMode: pendingMarqueeRef.current.toggleMode,
          guides: [],
        };
      }
      if (!current) {
        return;
      }

      const next = resolveSession({
        ...current,
        snapDisabled:
          current.kind === 'drag' ||
          current.kind === 'line-handle' ||
          current.kind === 'group-drag' ||
          current.kind === 'group-resize'
            ? modifiers.ctrlKey
            : current.snapDisabled,
        shiftConstrain: modifiers.shiftKey,
      } as SessionWithModifiers, pointer);
      clearPendingMarquee();
      onGuidesChange(next.guides);
      updateSession(next);
    },
    [clearPendingItemGesture, clearPendingMarquee, createPendingItemSession, onGuidesChange, resolveSession, updateSession],
  );

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
        });
        onGuidesChange(next.guides);
        updateCropSession({
          ...current,
          crop: next.crop,
          previewItem: next.previewItem,
          fullImageItem: next.fullImageItem,
        });
        return;
      }
      case 'image-pan': {
        onGuidesChange([]);
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
        onGuidesChange(resolved.guides);
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
        onGuidesChange([]);
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
  }, [onGuidesChange, orderedItems, resolveSession, stageBounds, updateCropSession]);

  const endCropInteraction = useCallback(() => {
    const current = cropSessionRef.current;
    if (!current || !current.activeInteraction) {
      return false;
    }
    onGuidesChange([]);
    updateCropSession({
      ...current,
      activeInteraction: null,
    });
    return true;
  }, [onGuidesChange, updateCropSession]);

  const handleWindowMouseMove = useEffectEvent((event: MouseEvent) => {
    const modifiers = resolveModifierKeys({
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
    });
    const shouldUseInsideStageWindowFallback =
      cropSessionRef.current?.activeInteraction?.source === 'overlay' ||
      sessionRef.current?.pointerSource === 'overlay' ||
      pendingItemGestureRef.current?.source === 'overlay';
    if (!shouldUseInsideStageWindowFallback && isClientPointInsideStage(event.clientX, event.clientY)) {
      return;
    }
    if (cropSessionRef.current?.activeInteraction) {
      const pointer = getCurrentPointer(event);
      advanceCropInteractionAtPointer(pointer, modifiers);
      return;
    }
    const pointer = getCurrentPointer(event);
    advanceSessionAtPointer(pointer, modifiers);
  });

  const commitPendingItemGesture = useCallback(
    (pointer: Point | null) => {
      if (!pendingItemGestureRef.current) {
        return false;
      }

      const pending = pendingItemGestureRef.current;
      clearPendingItemGesture();
      if (!pointer) {
        if (pending.kind === 'shift-toggle') {
          onToggleSelectItem?.(pending.selectionNodeId);
        }
        updateSession(null);
        onGuidesChange([]);
        return true;
      }

      const distance = Math.hypot(
        pointer.x - pending.pointerStart.x,
        pointer.y - pending.pointerStart.y,
      );
      if (distance < PICKUP_DRAG_THRESHOLD) {
        if (pending.kind === 'shift-toggle') {
          onToggleSelectItem?.(pending.selectionNodeId);
        }
        updateSession(null);
        onGuidesChange([]);
        return true;
      }

      const pendingSession = sessionRef.current ?? createPendingItemSession(pending);
      if (!pendingSession) {
        updateSession(null);
        onGuidesChange([]);
        return true;
      }

      finishSession(pendingSession, pointer);
      updateSession(null);
      return true;
    },
    [
      clearPendingItemGesture,
      createPendingItemSession,
      finishSession,
      onGuidesChange,
      onToggleSelectItem,
      updateSession,
    ],
  );

  const handleWindowMouseUp = useEffectEvent((event: MouseEvent) => {
    const modifiers = resolveModifierKeys({
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
    });
    if (cropSessionRef.current?.activeInteraction) {
      const pointer = getCurrentPointer(event);
      advanceCropInteractionAtPointer(pointer, modifiers);
      endCropInteraction();
      return;
    }
    if (pendingItemGestureRef.current) {
      const pointer = getCurrentPointer(event);
      if (commitPendingItemGesture(pointer)) {
        return;
      }
    }
    if (!sessionRef.current && pendingMarqueeRef.current) {
      clearPendingMarquee();
      onGuidesChange([]);
      return;
    }
    commitActiveSession(getCurrentPointer(event));
  });

  useEffect(() => {
    if (!session && !hasPendingMarquee && !hasPendingItemGesture && !cropSession?.activeInteraction) {
      return;
    }

    function handleMouseMove(event: MouseEvent) {
      handleWindowMouseMove(event);
    }

    function handleMouseUp(event: MouseEvent) {
      handleWindowMouseUp(event);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp, true);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [cropSession?.activeInteraction, handleWindowMouseMove, handleWindowMouseUp, hasPendingItemGesture, hasPendingMarquee, session]);

  const beginCreate = useCallback((tool: Extract<CanvasTool, 'text' | 'rectangle' | 'ellipse' | 'line'>, pointer: Point) => {
    updateSession(createCreateSession(tool, pointer));
  }, [updateSession]);

  const beginDrag = useCallback((item: CanvasItem, pointer: Point, source: PointerGestureSource = 'stage') => {
    updateSession(createDragSession(item, pointer, orderedItems.filter((entry) => entry.id !== item.id), source));
  }, [orderedItems, updateSession]);

  const beginGroupDrag = useCallback((pointer: Point, source: PointerGestureSource = 'stage') => {
    if (selectedNodes.length === 1 && isGroupNode(selectedNodes[0]) && selectedNodes[0].locked) return;
    const nextSession = createGroupDragSession(pointer, {
      selectedItems,
      siblingItems: orderedItems.filter((entry) => !selectedLeafIdSet.has(entry.id)),
      activeSelectionFrame,
    }, source);
    if (nextSession) {
      updateSession(nextSession);
    }
  }, [activeSelectionFrame, orderedItems, selectedItems, selectedLeafIdSet, selectedNodes, updateSession]);

  const beginResize = useCallback((
    item: ShapeItem,
    handle: ResizeHandle,
    pointer: Point,
    source: PointerGestureSource = 'stage',
  ) => {
    updateSession(
      createResizeSession(item, handle, pointer, orderedItems.filter((entry) => entry.id !== item.id), source)
    );
  }, [orderedItems, updateSession]);

  const beginGroupResize = useCallback((
    handle: ResizeHandle,
    pointer: Point,
    source: PointerGestureSource = 'stage',
  ) => {
    if (selectedNodes.length === 1 && isGroupNode(selectedNodes[0]) && selectedNodes[0].locked) return;
    const nextSession = createGroupResizeSession(handle, pointer, {
      selectedItems,
      siblingItems: orderedItems.filter((entry) => !selectedLeafIdSet.has(entry.id)),
      activeSelectionFrame,
    }, source);
    if (nextSession) {
      updateSession(nextSession);
    }
  }, [activeSelectionFrame, orderedItems, selectedItems, selectedLeafIdSet, selectedNodes, updateSession]);

  const beginRotate = useCallback((item: ShapeItem, pointer: Point, source: PointerGestureSource = 'stage') => {
    updateSession(createRotateSession(item, pointer, orderedItems.filter((entry) => entry.id !== item.id), source));
  }, [orderedItems, updateSession]);

  const beginGroupRotate = useCallback((pointer: Point, source: PointerGestureSource = 'stage') => {
    if (selectedNodes.length === 1 && isGroupNode(selectedNodes[0]) && selectedNodes[0].locked) return;
    const nextSession = createGroupRotateSession(pointer, {
      selectedItems,
      siblingItems: orderedItems.filter((entry) => !selectedLeafIdSet.has(entry.id)),
      activeSelectionFrame,
    }, source);
    if (nextSession) {
      updateSession(nextSession);
    }
  }, [activeSelectionFrame, orderedItems, selectedItems, selectedLeafIdSet, selectedNodes, updateSession]);

  const beginLineHandle = useCallback((
    item: LineCanvasItem,
    handle: 'start' | 'end',
    pointer: Point,
    source: PointerGestureSource = 'stage',
  ) => {
    updateSession(
      createLineHandleSession(
        item,
        handle,
        pointer,
        orderedItems.filter((entry) => entry.id !== item.id),
        source,
      )
    );
  }, [orderedItems, updateSession]);

  const registerShapeRef = useCallback((itemId: string, node: Konva.Node | null) => {
    if (!node) {
      shapeRefs.current.delete(itemId);
      return;
    }
    shapeRefs.current.set(itemId, node);
  }, []);

  const selectedNode = selectedItemId ? shapeRefs.current.get(selectedItemId) ?? null : null;
  const nodeClientRect = selectedNode && stageRef.current ? selectedNode.getClientRect({ relativeTo: stageRef.current }) : null;

  const handleItemPointerDown = useCallback((
    item: CanvasItem,
    selectionNodeId: string,
    pointer: Point,
    shiftKey: boolean,
    nativeEvent?: MouseEvent,
    source: PointerGestureSource = 'stage',
  ) => {
    const shiftPressed = resolveModifierKeys({ ctrlKey: false, shiftKey }).shiftKey;
    const selectedSession = createSelectedDragSession(item, selectionNodeId, pointer, source);
    if (nativeEvent) {
      lastHandledItemPointerEventRef.current = {
        nativeEvent,
        timeStamp: nativeEvent.timeStamp,
        clientX: nativeEvent.clientX,
        clientY: nativeEvent.clientY,
        button: nativeEvent.button,
        itemId: item.id,
        selectionNodeId,
      };
    }
    if (cropSessionRef.current && cropSessionRef.current.itemId !== item.id) {
      commitCropSession();
    }
    if (selectedSession) {
      clearPendingItemGesture();
      setLastDrilldownSource(null);
      if (shiftPressed && onToggleSelectItem && selectedIdSet.has(selectionNodeId)) {
        // Defer the toggle until mouseup so shift-drag can still constrain movement.
        setPendingItemGesture({
          kind: 'shift-toggle',
          pointerStart: pointer,
          selectionNodeId,
          item,
          source,
        });
        updateSession(null);
        return;
      }
      updateSession(selectedSession);
      return;
    }
    if (shiftPressed && onToggleSelectItem && !selectedIdSet.has(selectionNodeId)) {
      clearPendingItemGesture();
      setLastDrilldownSource(null);
      onToggleSelectItem(selectionNodeId);
      return;
    }
    setPendingItemGesture({
      kind: 'pickup-drag',
      pointerStart: pointer,
      selectionNodeId,
      item,
      source,
    });
    const pickupSession = createSelectableNodeDragSession(item, selectionNodeId, pointer, source);
    if (pickupSession) {
      updateSession(pickupSession);
    }
    setLastDrilldownSource(null);
    onSelectItem(selectionNodeId);
  }, [
    clearPendingItemGesture,
    commitCropSession,
    createSelectableNodeDragSession,
    createSelectedDragSession,
    resolveModifierKeys,
    onSelectItem,
    onToggleSelectItem,
    selectedIdSet,
    setPendingItemGesture,
    updateSession,
  ]);

  const handleItemDoubleClick = useCallback((item: CanvasItem) => {
    if (cropSessionRef.current) {
      return;
    }
    const latestHandledItemEvent = lastHandledItemPointerEventRef.current;
    const currentSelectedNodeId = selectedItemIds.length === 1 ? selectedItemIds[0] : null;
    const currentSelectionDrillTarget = currentSelectedNodeId
      ? getNextDrilldownNodeId(document.nodes, currentSelectedNodeId, item.id)
      : null;
    const directItemHitNodeId =
      latestHandledItemEvent &&
      latestHandledItemEvent.itemId === item.id &&
      latestHandledItemEvent.selectionNodeId === item.id
        ? item.id
        : null;
    const effectiveSelectedNodeId =
      currentSelectedNodeId &&
      (currentSelectedNodeId === item.id || currentSelectionDrillTarget)
        ? currentSelectedNodeId
        : directItemHitNodeId;
    if (!effectiveSelectedNodeId) {
      return;
    }
    const nextNodeId = getNextDrilldownNodeId(document.nodes, effectiveSelectedNodeId, item.id);
    if (nextNodeId && nextNodeId !== effectiveSelectedNodeId) {
      setLastDrilldownSource('item-hit');
      onSelectItem(nextNodeId);
      return;
    }
    if (
      effectiveSelectedNodeId === item.id &&
      item.kind === 'image' &&
      !item.locked &&
      !item.hidden
    ) {
      setLastDrilldownSource(null);
      startImageCropSession(item);
    }
  }, [document.nodes, onSelectItem, selectedItemIds, startImageCropSession]);

  const handleStageMouseDown = useCallback((event: Konva.KonvaEventObject<MouseEvent>) => {
    const target = event.target;
    const stage = event.target.getStage();
    const isCanvasSurface =
      target === stage ||
      target.hasName?.('canvas-surface') ||
      target.hasName?.('canvas-background') ||
      target.hasName?.('canvas-backdrop') ||
      target.name() === 'canvas-surface' ||
      target.name() === 'canvas-background' ||
      target.name() === 'canvas-backdrop';
    const pointer = getCanvasPointerFromStageEvent(event);
    if (cropSessionRef.current) {
      if (
        pointer &&
        isCanvasSurface &&
        activeTool === 'select' &&
        event.evt?.button !== 1
      ) {
        commitCropSession();
        onSelectItem(undefined);
      }
      return;
    }
    if (pendingItemGestureRef.current || sessionRef.current) {
      return;
    }
    const handledItemEvent = lastHandledItemPointerEventRef.current;
    if (
      handledItemEvent &&
      (
        handledItemEvent.nativeEvent === event.evt ||
        (
          handledItemEvent.timeStamp === event.evt.timeStamp &&
          handledItemEvent.clientX === event.evt.clientX &&
          handledItemEvent.clientY === event.evt.clientY &&
          handledItemEvent.button === event.evt.button
        )
      )
    ) {
      lastHandledItemPointerEventRef.current = null;
      return;
    }
    lastHandledItemPointerEventRef.current = null;
    if (
      pointer &&
      isCanvasSurface &&
      activeTool === 'select' &&
      event.evt?.button !== 1 &&
      selectedItemIds.length === 1
    ) {
      const selectedNodeId = selectedItemIds[0];
      const selectedNode = getNodeById(document.nodes, selectedNodeId);
      if (selectedNode && isGroupNode(selectedNode)) {
        const drilledItem = getGroupDescendantAtPoint(renderedItems, selectedNodeId, pointer);
        const nextNodeId = drilledItem
          ? getNextDrilldownNodeId(document.nodes, selectedNodeId, drilledItem.id)
          : null;
        if (drilledItem && nextNodeId && nextNodeId !== selectedNodeId) {
          clearPendingItemGesture();
          onGuidesChange([]);
          const recordedAtMs = Date.now();
          const lastDescendantClick = lastStageDescendantClickRef.current;
          const pointerDelta = lastDescendantClick
            ? Math.hypot(
                event.evt.clientX - lastDescendantClick.clientX,
                event.evt.clientY - lastDescendantClick.clientY,
              )
            : Number.POSITIVE_INFINITY;
          const isStageSurfaceDoubleClick = Boolean(
            lastDescendantClick &&
              lastDescendantClick.groupId === selectedNodeId &&
              lastDescendantClick.itemId === drilledItem.id &&
              lastDescendantClick.button === 0 &&
              event.evt.button === 0 &&
              recordedAtMs - lastDescendantClick.recordedAtMs <= GROUP_DRILL_DOUBLE_CLICK_MS &&
              pointerDelta <= GROUP_DRILL_DOUBLE_CLICK_MAX_POINTER_DELTA,
          );
          if (isStageSurfaceDoubleClick) {
            lastStageDescendantClickRef.current = null;
            setLastDrilldownSource('stage-surface');
            onSelectItem(nextNodeId);
          } else {
            lastStageDescendantClickRef.current = {
              groupId: selectedNodeId,
              itemId: drilledItem.id,
              recordedAtMs,
              clientX: event.evt.clientX,
              clientY: event.evt.clientY,
              button: event.evt.button,
            };
          }
          return;
        }
      }
    }
    if (!pointer || !isCanvasSurface) return;
    clearPendingItemGesture();
    const modifiers = resolveModifierKeys({
      ctrlKey: Boolean(event.evt?.ctrlKey),
      shiftKey: Boolean(event.evt?.shiftKey),
    });
    if (isCreateTool(activeTool)) {
      setLastDrilldownSource(null);
      beginCreate(activeTool, pointer);
      return;
    }
    if (activeTool === 'select') {
      setLastDrilldownSource(null);
      onGuidesChange([]);
      onSelectItem(undefined);
      setPendingMarquee({ pointerStart: pointer, toggleMode: modifiers.shiftKey });
      updateSession(null);
      return;
    }
    setLastDrilldownSource(null);
    onGuidesChange([]);
    onSelectItem(undefined);
  }, [
    activeTool,
    beginCreate,
    clearPendingItemGesture,
    commitCropSession,
    document.nodes,
    getCanvasPointerFromStageEvent,
    onGuidesChange,
    onSelectItem,
    resolveModifierKeys,
    renderedItems,
    selectedItemIds,
    setPendingMarquee,
    updateSession,
  ]);

  const handleStageMouseUp = useCallback((event: Konva.KonvaEventObject<MouseEvent>) => {
    const pointer = getCanvasPointerFromStageEvent(event);
    if (pendingItemGestureRef.current && commitPendingItemGesture(pointer)) {
      return;
    }
    if (!sessionRef.current && pendingMarqueeRef.current) {
      clearPendingMarquee();
      onGuidesChange([]);
      return;
    }
    if (!sessionRef.current) return;
    commitActiveSession(pointer);
  }, [clearPendingMarquee, commitActiveSession, commitPendingItemGesture, getCanvasPointerFromStageEvent, onGuidesChange]);

  const handleStagePointerMove = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      const pointer = getCanvasPointerFromStageEvent(event);
      advanceSessionAtPointer(pointer, resolveModifierKeys({
        ctrlKey: event.evt.ctrlKey,
        shiftKey: event.evt.shiftKey,
      }));
    },
    [advanceSessionAtPointer, getCanvasPointerFromStageEvent, resolveModifierKeys],
  );

  return {
    beginDrag,
    beginGroupDrag,
    beginGroupResize,
    beginGroupRotate,
    commitCropSession,
    beginCropFullResize,
    beginCropFullRotate,
    beginCropPan,
    beginCropResize,
    beginLineHandle,
    beginResize,
    beginRotate,
    cropSession,
    handleItemDoubleClick,
    handleItemPointerDown,
    handleStageMouseDown,
    handleStagePointerMove,
    handleStageMouseUp,
    nodeClientRect,
    registerShapeRef,
    renderedItems,
    renderedSelectedItems,
    renderedGroupBounds,
    renderedSelectionFrame,
    selectedDocumentItem,
    lastDrilldownSource,
    selectedNode,
    selectedRenderedItem,
    selectedItemId,
    session,
    subgroupOutlineFrames,
  };
}
