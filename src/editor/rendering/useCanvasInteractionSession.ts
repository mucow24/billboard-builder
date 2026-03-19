import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';

import {
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
  buildInteractionCommit,
  buildRenderedItems,
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
  type SelectionFrame,
  type SessionWithModifiers,
  type ShapeItem,
} from './interactionSession';
import { buildRenderableCanvasItems, type RenderableCanvasItem } from './renderAdapter';
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

interface PendingPickupDrag {
  pointerStart: Point;
  selectionNodeId: string;
  item: CanvasItem;
}

interface HandledItemPointerEvent {
  nativeEvent: MouseEvent;
  timeStamp: number;
  clientX: number;
  clientY: number;
  button: number;
}

const PICKUP_DRAG_THRESHOLD = 3;

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
  const pendingMarqueeRef = useRef<{ pointerStart: Point; toggleMode: boolean } | null>(null);
  const pendingPickupDragRef = useRef<PendingPickupDrag | null>(null);
  const lastHandledItemPointerEventRef = useRef<HandledItemPointerEvent | null>(null);
  const [session, setSession] = useState<InteractionSession | null>(null);
  const [selectionFrame, setSelectionFrame] = useState<SelectionFrame | null>(null);
  const [lastDrilldownSource, setLastDrilldownSource] = useState<'item-hit' | 'stage-surface' | null>(null);

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
    () =>
      buildRenderedItems(orderedItems, session).map((item) => {
        const renderable = renderableByLeafId.get(item.id);
        return {
          ...item,
          opacity: renderable?.opacity ?? item.opacity,
          selectableNodeId: renderable?.selectableNodeId ?? item.id,
        } as RenderableCanvasItem;
      }),
    [orderedItems, renderableByLeafId, session]
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

  const updateSession = useCallback((nextSession: InteractionSession | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
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

  const createPendingPickupSession = useCallback((pending: PendingPickupDrag) => {
    if (pending.selectionNodeId === pending.item.id) {
      return createDragSession(
        pending.item,
        pending.pointerStart,
        orderedItems.filter((entry) => entry.id !== pending.item.id),
      );
    }

    const selectedNode = getNodeById(document.nodes, pending.selectionNodeId);
    if (!selectedNode || !isGroupNode(selectedNode)) {
      return null;
    }

    const groupItems = collectLeafItems(selectedNode)
      .slice()
      .sort((left, right) => left.zIndex - right.zIndex);
    const groupLeafIds = new Set(groupItems.map((groupItem) => groupItem.id));
    const groupRenderBounds = getSelectionRenderBounds(
      renderedItems.filter((renderedItem) => groupLeafIds.has(renderedItem.id)),
    );

    return createGroupDragSession(pending.pointerStart, {
      selectedItems: groupItems,
      siblingItems: orderedItems.filter((entry) => !groupLeafIds.has(entry.id)),
      activeSelectionFrame: groupRenderBounds ? { bounds: groupRenderBounds, rotation: 0 } : null,
    });
  }, [document.nodes, orderedItems, renderedItems]);

  const finishSession = useCallback((current: InteractionSession, pointer: Point) => {
    const resolved = resolveSession(current, pointer);
    onGuidesChange([]);
    const commit = buildInteractionCommit(resolved, { orderedItems, pointer });

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
  }, [onAddItem, onGuidesChange, onSetActiveTool, onSelectItem, onToggleSelectItems, onUpdateItem, onUpdateItems, orderedItems, renderableByLeafId, resolveSession]);

  const commitActiveSession = useCallback((pointer: Point | null) => {
    const current = sessionRef.current;
    const resolvedPointer = pointer ?? current?.pointerStart ?? null;
    pendingPickupDragRef.current = null;
    if (!current || !resolvedPointer) {
      updateSession(null);
      onGuidesChange([]);
      return;
    }
    finishSession(current, resolvedPointer);
    updateSession(null);
  }, [finishSession, onGuidesChange, updateSession]);

  const advanceSessionAtPointer = useCallback(
    (pointer: Point | null, modifiers: { ctrlKey: boolean; shiftKey: boolean }) => {
      if (!pointer) {
        return;
      }

      let current = sessionRef.current;
      if (pendingPickupDragRef.current) {
        const pending = pendingPickupDragRef.current;
        const distance = Math.hypot(
          pointer.x - pending.pointerStart.x,
          pointer.y - pending.pointerStart.y,
        );
        if (distance >= PICKUP_DRAG_THRESHOLD) {
          pendingPickupDragRef.current = null;
          if (!current) {
            current = createPendingPickupSession(pending);
          }
        } else {
          return;
        }
      }
      if (!current && pendingMarqueeRef.current) {
        current = {
          kind: 'marquee',
          pointerStart: pendingMarqueeRef.current.pointerStart,
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
      pendingMarqueeRef.current = null;
      onGuidesChange(next.guides);
      updateSession(next);
    },
    [createPendingPickupSession, onGuidesChange, resolveSession, updateSession],
  );

  const handleWindowMouseMove = useEffectEvent((event: MouseEvent) => {
    const pointer = getCurrentPointer(event);
    advanceSessionAtPointer(pointer, {
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
    });
  });

  const commitPendingPickupDrag = useCallback(
    (pointer: Point | null) => {
      if (!pendingPickupDragRef.current) {
        return false;
      }

      const pending = pendingPickupDragRef.current;
      pendingPickupDragRef.current = null;
      if (!pointer) {
        updateSession(null);
        onGuidesChange([]);
        return true;
      }

      const distance = Math.hypot(
        pointer.x - pending.pointerStart.x,
        pointer.y - pending.pointerStart.y,
      );
      if (distance < PICKUP_DRAG_THRESHOLD) {
        updateSession(null);
        onGuidesChange([]);
        return true;
      }

      const pickupSession = sessionRef.current ?? createPendingPickupSession(pending);
      if (!pickupSession) {
        updateSession(null);
        onGuidesChange([]);
        return true;
      }

      finishSession(pickupSession, pointer);
      updateSession(null);
      return true;
    },
    [createPendingPickupSession, finishSession, onGuidesChange, updateSession],
  );

  const handleWindowMouseUp = useEffectEvent((event: MouseEvent) => {
    if (pendingPickupDragRef.current) {
      const pointer = getCurrentPointer(event);
      if (commitPendingPickupDrag(pointer)) {
        return;
      }
    }
    if (!sessionRef.current && pendingMarqueeRef.current) {
      pendingMarqueeRef.current = null;
      onGuidesChange([]);
      return;
    }
    commitActiveSession(getCurrentPointer(event));
  });

  useEffect(() => {
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
  }, [handleWindowMouseMove, handleWindowMouseUp]);

  const beginCreate = useCallback((tool: Extract<CanvasTool, 'text' | 'rectangle' | 'ellipse' | 'line'>, pointer: Point) => {
    updateSession(createCreateSession(tool, pointer));
  }, [updateSession]);

  const beginDrag = useCallback((item: CanvasItem, pointer: Point) => {
    updateSession(createDragSession(item, pointer, orderedItems.filter((entry) => entry.id !== item.id)));
  }, [orderedItems, updateSession]);

  const beginGroupDrag = useCallback((pointer: Point) => {
    const nextSession = createGroupDragSession(pointer, {
      selectedItems,
      siblingItems: orderedItems.filter((entry) => !selectedLeafIdSet.has(entry.id)),
      activeSelectionFrame,
    });
    if (nextSession) {
      updateSession(nextSession);
    }
  }, [activeSelectionFrame, orderedItems, selectedItems, selectedLeafIdSet, updateSession]);

  const beginResize = useCallback((item: ShapeItem, handle: ResizeHandle, pointer: Point) => {
    updateSession(
      createResizeSession(item, handle, pointer, orderedItems.filter((entry) => entry.id !== item.id))
    );
  }, [orderedItems, updateSession]);

  const beginGroupResize = useCallback((handle: ResizeHandle, pointer: Point) => {
    const nextSession = createGroupResizeSession(handle, pointer, {
      selectedItems,
      siblingItems: orderedItems.filter((entry) => !selectedLeafIdSet.has(entry.id)),
      activeSelectionFrame,
    });
    if (nextSession) {
      updateSession(nextSession);
    }
  }, [activeSelectionFrame, orderedItems, selectedItems, selectedLeafIdSet, updateSession]);

  const beginRotate = useCallback((item: ShapeItem, pointer: Point) => {
    updateSession(createRotateSession(item, pointer, orderedItems.filter((entry) => entry.id !== item.id)));
  }, [orderedItems, updateSession]);

  const beginGroupRotate = useCallback((pointer: Point) => {
    const nextSession = createGroupRotateSession(pointer, {
      selectedItems,
      siblingItems: orderedItems.filter((entry) => !selectedLeafIdSet.has(entry.id)),
      activeSelectionFrame,
    });
    if (nextSession) {
      updateSession(nextSession);
    }
  }, [activeSelectionFrame, orderedItems, selectedItems, selectedLeafIdSet, updateSession]);

  const beginLineHandle = useCallback((item: LineCanvasItem, handle: 'start' | 'end', pointer: Point) => {
    updateSession(
      createLineHandleSession(
        item,
        handle,
        pointer,
        orderedItems.filter((entry) => entry.id !== item.id)
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
  ) => {
    if (nativeEvent) {
      lastHandledItemPointerEventRef.current = {
        nativeEvent,
        timeStamp: nativeEvent.timeStamp,
        clientX: nativeEvent.clientX,
        clientY: nativeEvent.clientY,
        button: nativeEvent.button,
      };
    }
    if (shiftKey && onToggleSelectItem) {
      pendingPickupDragRef.current = null;
      setLastDrilldownSource(null);
      onToggleSelectItem(selectionNodeId);
      return;
    }
    if (selectedItemIds.length === 1) {
      const selectedNodeId = selectedItemIds[0];
      const selectedNode = getNodeById(document.nodes, selectedNodeId);
      if (selectedNode && isGroupNode(selectedNode)) {
        const nextNodeId = getNextDrilldownNodeId(document.nodes, selectedNodeId, item.id);
        if (nextNodeId && nextNodeId !== selectedNodeId) {
          pendingPickupDragRef.current = null;
          setLastDrilldownSource('item-hit');
          onSelectItem(nextNodeId);
          return;
        }
      }
    }
    if (selectedIdSet.has(selectionNodeId)) {
      pendingPickupDragRef.current = null;
      setLastDrilldownSource(null);
      if (selectedItems.length > 1) {
        beginGroupDrag(pointer);
        return;
      }
      if (selectionNodeId === item.id) {
        beginDrag(item, pointer);
      }
      return;
    }
    pendingPickupDragRef.current = {
      pointerStart: pointer,
      selectionNodeId,
      item,
    };
    const pickupSession = createPendingPickupSession({
      pointerStart: pointer,
      selectionNodeId,
      item,
    });
    if (pickupSession) {
      updateSession(pickupSession);
    }
    setLastDrilldownSource(null);
    onSelectItem(selectionNodeId);
  }, [
    beginDrag,
    beginGroupDrag,
    createPendingPickupSession,
    document.nodes,
    onSelectItem,
    onToggleSelectItem,
    selectedIdSet,
    selectedItemIds,
    selectedItems.length,
    updateSession,
  ]);

  const handleItemDoubleClick = useCallback((item: CanvasItem) => {
    if (selectedItemIds.length !== 1) {
      return;
    }
    const nextNodeId = getNextDrilldownNodeId(document.nodes, selectedItemIds[0], item.id);
    if (!nextNodeId || nextNodeId === selectedItemIds[0]) {
      return;
    }
    onSelectItem(nextNodeId);
  }, [document.nodes, onSelectItem, selectedItemIds]);

  const handleStageMouseDown = useCallback((event: Konva.KonvaEventObject<MouseEvent>) => {
    if (pendingPickupDragRef.current || sessionRef.current) {
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
    const target = event.target;
    const stage = event.target.getStage();
    const pointer = getCanvasPointerFromStageEvent(event);
    if (
      pointer &&
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
          setLastDrilldownSource('stage-surface');
          onGuidesChange([]);
          onSelectItem(nextNodeId);
          return;
        }
      }
    }
    const isCanvasSurface = target === stage || target.hasName?.('canvas-surface') || target.hasName?.('canvas-background') || target.hasName?.('canvas-backdrop') || target.name() === 'canvas-surface' || target.name() === 'canvas-background' || target.name() === 'canvas-backdrop';
    if (!pointer || !isCanvasSurface) return;
    pendingPickupDragRef.current = null;
    if (isCreateTool(activeTool)) {
      setLastDrilldownSource(null);
      beginCreate(activeTool, pointer);
      return;
    }
    if (activeTool === 'select') {
      setLastDrilldownSource(null);
      onGuidesChange([]);
      onSelectItem(undefined);
      pendingMarqueeRef.current = { pointerStart: pointer, toggleMode: Boolean(event.evt?.shiftKey) };
      updateSession(null);
      return;
    }
    setLastDrilldownSource(null);
    onGuidesChange([]);
    onSelectItem(undefined);
  }, [
    activeTool,
    beginCreate,
    document.nodes,
    getCanvasPointerFromStageEvent,
    onGuidesChange,
    onSelectItem,
    renderedItems,
    selectedItemIds,
    updateSession,
  ]);

  const handleStageMouseUp = useCallback((event: Konva.KonvaEventObject<MouseEvent>) => {
    const pointer = getCanvasPointerFromStageEvent(event);
    if (pendingPickupDragRef.current && commitPendingPickupDrag(pointer)) {
      return;
    }
    if (!sessionRef.current) return;
    commitActiveSession(pointer);
  }, [commitActiveSession, commitPendingPickupDrag, getCanvasPointerFromStageEvent]);

  const handleStagePointerMove = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      const pointer = getCanvasPointerFromStageEvent(event);
      advanceSessionAtPointer(pointer, {
        ctrlKey: event.evt.ctrlKey,
        shiftKey: event.evt.shiftKey,
      });
    },
    [advanceSessionAtPointer, getCanvasPointerFromStageEvent],
  );

  return {
    beginDrag,
    beginGroupDrag,
    beginGroupResize,
    beginGroupRotate,
    beginLineHandle,
    beginResize,
    beginRotate,
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
