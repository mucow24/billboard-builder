import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';

import {
  isCreateTool,
  type Point,
  type ResizeHandle,
} from './interactionGeometry';
import {
  getSelectionFrameForRotation,
  getSelectionRenderBounds,
} from './transformGeometry';
import {
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
import { useCropSession } from './useCropSession';
import { useInteractionDerivedState, useSubgroupOutlineFrames } from './useInteractionDerivedState';
import { getGroupDescendantAtPoint } from './interactionHitTesting';
import { useModifierKeys } from './useModifierKeys';
import {
  collectLeafItems,
  getNextDrilldownNodeId,
  getNodeById,
  isCanvasItemNode,
  isGroupNode,
} from '../document/sceneGraph';
import type {
  CanvasItem,
  ImageCanvasItem,
  CanvasTool,
  GuideLine,
  LineCanvasItem,
  ProjectDocument,
} from '../document/documentTypes';

interface UseCanvasInteractionSessionParams {
  activeTool: CanvasTool;
  document: ProjectDocument;
  selectedNodeIds: string[];
  viewport?: { zoom: number; panX: number; panY: number };
  onGuidesChange: (guides: GuideLine[]) => void;
  onSelectNode: (itemId?: string) => void;
  onToggleSelectNode?: (itemId: string) => void;
  onToggleSelectNodes?: (itemIds: string[]) => void;
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

const PICKUP_DRAG_THRESHOLD = 3;
const GROUP_DRILL_DOUBLE_CLICK_MS = 500;
const GROUP_DRILL_DOUBLE_CLICK_MAX_POINTER_DELTA = 6;

function isGroupDrillDoubleClick(
  lastClick: StageDescendantClickSample | null,
  groupId: string,
  itemId: string,
  currentButton: number,
  currentTimeMs: number,
  pointerDelta: number,
): boolean {
  return Boolean(
    lastClick &&
      lastClick.groupId === groupId &&
      lastClick.itemId === itemId &&
      lastClick.button === 0 &&
      currentButton === 0 &&
      currentTimeMs - lastClick.recordedAtMs <= GROUP_DRILL_DOUBLE_CLICK_MS &&
      pointerDelta <= GROUP_DRILL_DOUBLE_CLICK_MAX_POINTER_DELTA,
  );
}

export function useCanvasInteractionSession({
  activeTool,
  document,
  selectedNodeIds,
  viewport = { zoom: 1, panX: 0, panY: 0 },
  onGuidesChange,
  onSelectNode,
  onToggleSelectNode,
  onToggleSelectNodes,
  onUpdateItem,
  onUpdateItems,
  onAddItem,
  onSetActiveTool,
  stageRef,
}: UseCanvasInteractionSessionParams) {
  const shapeRefs = useRef(new Map<string, Konva.Node>());
  const sessionRef = useRef<InteractionSession | null>(null);
  const sessionRafRef = useRef<number | null>(null);
  const guidesRef = useRef<GuideLine[]>([]);
  const guidesRafRef = useRef<number | null>(null);
  const pendingMarqueeRef = useRef<{ pointerStart: Point; toggleMode: boolean } | null>(null);
  const pendingItemGestureRef = useRef<PendingItemGesture | null>(null);
  const lastHandledItemPointerEventRef = useRef<HandledItemPointerEvent | null>(null);
  const lastStageDescendantClickRef = useRef<StageDescendantClickSample | null>(null);
  const [session, setSession] = useState<InteractionSession | null>(null);
  const [selectionFrame, setSelectionFrame] = useState<SelectionFrame | null>(null);
  const [lastDrilldownSource, setLastDrilldownSource] = useState<'item-hit' | 'stage-surface' | null>(null);
  const [hasPendingMarquee, setHasPendingMarquee] = useState(false);
  const [hasPendingItemGesture, setHasPendingItemGesture] = useState(false);

  useEffect(() => {
    return () => {
      if (sessionRafRef.current !== null) cancelAnimationFrame(sessionRafRef.current);
      if (guidesRafRef.current !== null) cancelAnimationFrame(guidesRafRef.current);
    };
  }, []);

  const {
    selectedIdSet,
    renderables,
    orderedItems,
    renderableByLeafId,
    selectedNodes,
    selectedItems,
    selectedLeafIdSet,
    groupBounds,
    stageBounds,
  } = useInteractionDerivedState(document, selectedNodeIds);

  const updateGuides = useCallback((nextGuides: GuideLine[]) => {
    guidesRef.current = nextGuides;
    if (nextGuides.length === 0) {
      if (guidesRafRef.current !== null) {
        cancelAnimationFrame(guidesRafRef.current);
        guidesRafRef.current = null;
      }
      onGuidesChange(nextGuides);
    } else if (guidesRafRef.current === null) {
      guidesRafRef.current = requestAnimationFrame(() => {
        guidesRafRef.current = null;
        onGuidesChange(guidesRef.current);
      });
    }
  }, [onGuidesChange]);

  const resolveSession = useCallback(
    (current: InteractionSession, pointer: Point): InteractionSession =>
      resolveInteractionSession(current as SessionWithModifiers, pointer, { stageBounds, zoom: viewport.zoom }),
    [stageBounds, viewport.zoom]
  );

  const {
    cropSession,
    cropSessionRef,
    startCropSession,
    commitCropSession,
    beginCropResize,
    beginCropPan,
    beginCropFullResize,
    beginCropFullRotate,
    advanceCropInteractionAtPointer,
    endCropInteraction,
  } = useCropSession({
    orderedItems,
    stageBounds,
    zoom: viewport.zoom,
    onUpdateItem,
    updateGuides,
    resolveSession,
  });

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
  const subgroupOutlineFrames = useSubgroupOutlineFrames(document, selectedNodes, renderedItems);

  const { resolveModifierKeys } = useModifierKeys({ capture: true });

  const updateSession = useCallback((nextSession: InteractionSession | null) => {
    sessionRef.current = nextSession;
    if (nextSession === null) {
      // End-of-gesture: flush synchronously so commit is immediate
      if (sessionRafRef.current !== null) {
        cancelAnimationFrame(sessionRafRef.current);
        sessionRafRef.current = null;
      }
      setSession(null);
    } else if (sessionRafRef.current === null) {
      // Active gesture: coalesce to one React render per animation frame
      sessionRafRef.current = requestAnimationFrame(() => {
        sessionRafRef.current = null;
        setSession(sessionRef.current);
      });
    }
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
      updateGuides([]);
    }
  }, [activeTool, updateGuides, session, updateSession]);

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
    if (item.kind === 'generator') return null;
    const selectedGroupNodeId =
      selectedNodeIds.length === 1 &&
      (() => {
        const selectedNode = getNodeById(document.nodes, selectedNodeIds[0]);
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
    selectedNodeIds,
    selectedItems,
    selectedLeafIdSet,
  ]);

  const createSelectableNodeDragSession = useCallback((
    item: CanvasItem,
    selectionNodeId: string,
    pointer: Point,
    source: PointerGestureSource = 'stage',
  ) => {
    if (item.kind === 'generator') return null;
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
    updateGuides([]);
    startCropSession(item);
  }, [clearPendingItemGesture, clearPendingMarquee, startCropSession, updateGuides, updateSession]);

  const finishSession = useCallback((current: InteractionSession, pointer: Point) => {
    const resolved = resolveSession(current, pointer);
    updateGuides([]);
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
        if (commit.toggleMode && onToggleSelectNodes) {
          onToggleSelectNodes(Array.from(new Set(commit.hitIds.map((itemId) => renderableByLeafId.get(itemId)?.selectableNodeId ?? itemId))));
        } else if (commit.hitIds.length > 0) {
          const selectableIds = Array.from(new Set(commit.hitIds.map((itemId) => renderableByLeafId.get(itemId)?.selectableNodeId ?? itemId)));
          onSelectNode(selectableIds[0]);
          if (selectableIds.length > 1 && onToggleSelectNodes) {
            onSelectNode(undefined);
            onToggleSelectNodes(selectableIds);
          }
        } else {
          onSelectNode(undefined);
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
  }, [onAddItem, updateGuides, onSetActiveTool, onSelectNode, onToggleSelectNodes, onUpdateItem, onUpdateItems, orderedItems, renderableByLeafId, resolveSession, stageBounds]);

  const commitActiveSession = useCallback((pointer: Point | null) => {
    const current = sessionRef.current;
    const resolvedPointer = pointer ?? current?.pointerStart ?? null;
    clearPendingItemGesture();
    if (!current || !resolvedPointer) {
      updateSession(null);
      updateGuides([]);
      return;
    }
    finishSession(current, resolvedPointer);
    updateSession(null);
  }, [clearPendingItemGesture, finishSession, updateGuides, updateSession]);

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
          current.kind === 'create' ||
          current.kind === 'drag' ||
          current.kind === 'line-handle' ||
          current.kind === 'group-drag' ||
          current.kind === 'group-resize'
            ? modifiers.ctrlKey
            : current.snapDisabled,
        shiftConstrain: modifiers.shiftKey,
      } as SessionWithModifiers, pointer);
      clearPendingMarquee();
      updateGuides(next.guides);
      updateSession(next);
    },
    [clearPendingItemGesture, clearPendingMarquee, createPendingItemSession, updateGuides, resolveSession, updateSession],
  );

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
          onToggleSelectNode?.(pending.selectionNodeId);
        }
        updateSession(null);
        updateGuides([]);
        return true;
      }

      const distance = Math.hypot(
        pointer.x - pending.pointerStart.x,
        pointer.y - pending.pointerStart.y,
      );
      if (distance < PICKUP_DRAG_THRESHOLD) {
        if (pending.kind === 'shift-toggle') {
          onToggleSelectNode?.(pending.selectionNodeId);
        }
        updateSession(null);
        updateGuides([]);
        return true;
      }

      const pendingSession = sessionRef.current ?? createPendingItemSession(pending);
      if (!pendingSession) {
        updateSession(null);
        updateGuides([]);
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
      updateGuides,
      onToggleSelectNode,
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
      updateGuides([]);
      return;
    }
    commitActiveSession(getCurrentPointer(event));
  });

  const hasActiveSession = Boolean(session);
  const hasCropInteraction = Boolean(cropSession?.activeInteraction);

  useEffect(() => {
    if (!hasActiveSession && !hasPendingMarquee && !hasPendingItemGesture && !hasCropInteraction) {
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
  }, [hasActiveSession, hasCropInteraction, handleWindowMouseMove, handleWindowMouseUp, hasPendingItemGesture, hasPendingMarquee]);

  const beginCreate = useCallback((tool: Extract<CanvasTool, 'text' | 'rectangle' | 'ellipse' | 'line'>, pointer: Point) => {
    updateSession(createCreateSession(tool, pointer, orderedItems));
  }, [orderedItems, updateSession]);

  const beginDrag = useCallback((item: CanvasItem, pointer: Point, source: PointerGestureSource = 'stage') => {
    if (item.kind === 'generator') return;
    updateSession(createDragSession(item, pointer, orderedItems.filter((entry) => entry.id !== item.id), source));
  }, [orderedItems, updateSession]);

  const beginGroupDrag = useCallback((pointer: Point, source: PointerGestureSource = 'stage') => {
    if (selectedNodes.some(n => n.locked) || selectedItems.some(i => i.locked)) return;
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
    if (selectedNodes.some(n => n.locked) || selectedItems.some(i => i.locked)) return;
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
    if (selectedNodes.some(n => n.locked) || selectedItems.some(i => i.locked)) return;
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
      if (shiftPressed && onToggleSelectNode && selectedIdSet.has(selectionNodeId)) {
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
    if (shiftPressed && onToggleSelectNode && !selectedIdSet.has(selectionNodeId)) {
      clearPendingItemGesture();
      setLastDrilldownSource(null);
      onToggleSelectNode(selectionNodeId);
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
    onSelectNode(selectionNodeId);
  }, [
    clearPendingItemGesture,
    commitCropSession,
    cropSessionRef,
    createSelectableNodeDragSession,
    createSelectedDragSession,
    resolveModifierKeys,
    onSelectNode,
    onToggleSelectNode,
    selectedIdSet,
    setPendingItemGesture,
    updateSession,
  ]);

  const handleItemDoubleClick = useCallback((item: CanvasItem) => {
    if (cropSessionRef.current) {
      return;
    }
    const latestHandledItemEvent = lastHandledItemPointerEventRef.current;
    const currentSelectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
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
      onSelectNode(nextNodeId);
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
  }, [cropSessionRef, document.nodes, onSelectNode, selectedNodeIds, startImageCropSession]);

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
        onSelectNode(undefined);
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
      selectedNodeIds.length === 1
    ) {
      const selectedNodeId = selectedNodeIds[0];
      const selectedNode = getNodeById(document.nodes, selectedNodeId);
      if (selectedNode && isGroupNode(selectedNode)) {
        const drilledItem = getGroupDescendantAtPoint(renderedItems, selectedNodeId, pointer);
        const nextNodeId = drilledItem
          ? getNextDrilldownNodeId(document.nodes, selectedNodeId, drilledItem.id)
          : null;
        if (drilledItem && nextNodeId && nextNodeId !== selectedNodeId) {
          clearPendingItemGesture();
          updateGuides([]);
          const recordedAtMs = Date.now();
          const lastDescendantClick = lastStageDescendantClickRef.current;
          const pointerDelta = lastDescendantClick
            ? Math.hypot(
                event.evt.clientX - lastDescendantClick.clientX,
                event.evt.clientY - lastDescendantClick.clientY,
              )
            : Number.POSITIVE_INFINITY;
          const isStageSurfaceDoubleClick = isGroupDrillDoubleClick(
            lastDescendantClick,
            selectedNodeId,
            drilledItem.id,
            event.evt.button,
            recordedAtMs,
            pointerDelta,
          );
          if (isStageSurfaceDoubleClick) {
            lastStageDescendantClickRef.current = null;
            setLastDrilldownSource('stage-surface');
            onSelectNode(nextNodeId);
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
      updateGuides([]);
      onSelectNode(undefined);
      setPendingMarquee({ pointerStart: pointer, toggleMode: modifiers.shiftKey });
      updateSession(null);
      return;
    }
    setLastDrilldownSource(null);
    updateGuides([]);
    onSelectNode(undefined);
  }, [
    activeTool,
    beginCreate,
    clearPendingItemGesture,
    commitCropSession,
    cropSessionRef,
    document.nodes,
    getCanvasPointerFromStageEvent,
    updateGuides,
    onSelectNode,
    resolveModifierKeys,
    renderedItems,
    selectedNodeIds,
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
      updateGuides([]);
      return;
    }
    if (!sessionRef.current) return;
    commitActiveSession(pointer);
  }, [clearPendingMarquee, commitActiveSession, commitPendingItemGesture, getCanvasPointerFromStageEvent, updateGuides]);

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
