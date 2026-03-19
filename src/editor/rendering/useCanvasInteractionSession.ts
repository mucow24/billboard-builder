import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type {
  CanvasItem,
  CanvasTool,
  GuideLine,
  LineCanvasItem,
  ProjectDocumentV1,
} from '../document/documentTypes';

interface UseCanvasInteractionSessionParams {
  activeTool: CanvasTool;
  document: ProjectDocumentV1;
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
  const [session, setSession] = useState<InteractionSession | null>(null);
  const [selectionFrame, setSelectionFrame] = useState<SelectionFrame | null>(null);

  const selectedIdSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const orderedItems = useMemo(() => document.items.slice().sort((left, right) => left.zIndex - right.zIndex), [document.items]);
  const selectedItems = useMemo(() => orderedItems.filter((item) => selectedIdSet.has(item.id)), [orderedItems, selectedIdSet]);
  const groupBounds = useMemo(() => getSelectionRenderBounds(selectedItems), [selectedItems]);
  const stageBounds = useMemo(() => ({ x: 0, y: 0, width: document.canvas.width, height: document.canvas.height }), [document.canvas.height, document.canvas.width]);

  const renderedItems = useMemo(() => buildRenderedItems(orderedItems, session), [orderedItems, session]);

  const renderedSelectedItems = useMemo(() => renderedItems.filter((item) => selectedIdSet.has(item.id)), [renderedItems, selectedIdSet]);
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
  const selectedItemId = selectedItemIds[0];
  const selectedDocumentItem = orderedItems.find((item) => item.id === selectedItemId) ?? null;
  const selectedRenderedItem = renderedItems.find((item) => item.id === selectedItemId) ?? null;

  const updateSession = useCallback((nextSession: InteractionSession | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);


  useEffect(() => {
    if ((activeTool === 'select' || activeTool === 'pan' || activeTool === 'zoom') && session?.kind === 'create') {
      updateSession(null);
      onGuidesChange([]);
    }
  }, [activeTool, onGuidesChange, session, updateSession]);

  const selectionSetSignature = useMemo(() => currentSelectionSetSignature(selectedItemIds), [selectedItemIds]);

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
      return null;
    }
    return {
      x: (pointer.x - viewport.panX) / viewport.zoom,
      y: (pointer.y - viewport.panY) / viewport.zoom,
    };
  }, [stageRef, viewport.panX, viewport.panY, viewport.zoom]);

  const resolveSession = useCallback(
    (current: InteractionSession, pointer: Point): InteractionSession =>
      resolveInteractionSession(current as SessionWithModifiers, pointer, { stageBounds }),
    [stageBounds]
  );

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
          onToggleSelectItems(commit.hitIds);
        } else if (commit.hitIds.length > 0) {
          onSelectItem(commit.hitIds[0]);
          if (commit.hitIds.length > 1 && onToggleSelectItems) {
            onSelectItem(undefined);
            onToggleSelectItems(commit.hitIds);
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
  }, [onAddItem, onGuidesChange, onSetActiveTool, onSelectItem, onToggleSelectItems, onUpdateItem, onUpdateItems, orderedItems, resolveSession]);

  const commitActiveSession = useCallback((pointer: Point | null) => {
    const current = sessionRef.current;
    const resolvedPointer = pointer ?? current?.pointerStart ?? null;
    if (!current || !resolvedPointer) {
      updateSession(null);
      onGuidesChange([]);
      return;
    }
    finishSession(current, resolvedPointer);
    updateSession(null);
  }, [finishSession, onGuidesChange, updateSession]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      let current = sessionRef.current;
      const pointer = getCurrentPointer(event);
      if (!pointer) {
        return;
      }
      if (!current && pendingMarqueeRef.current) {
        current = { kind: 'marquee', pointerStart: pendingMarqueeRef.current.pointerStart, currentPointer: pointer, toggleMode: pendingMarqueeRef.current.toggleMode, guides: [] };
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
            ? event.ctrlKey
            : current.snapDisabled,
        shiftConstrain: event.shiftKey,
      } as SessionWithModifiers, pointer);
      pendingMarqueeRef.current = null;
      onGuidesChange(next.guides);
      updateSession(next);
    }
    function handleMouseUp(event: MouseEvent) {
      if (!sessionRef.current && pendingMarqueeRef.current) {
        pendingMarqueeRef.current = null;
        onGuidesChange([]);
        return;
      }
      commitActiveSession(getCurrentPointer(event));
    }
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp, true);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [commitActiveSession, getCurrentPointer, onGuidesChange, resolveSession, updateSession]);

  const beginCreate = useCallback((tool: Extract<CanvasTool, 'text' | 'rectangle' | 'ellipse' | 'line'>, pointer: Point) => {
    updateSession(createCreateSession(tool, pointer));
  }, [updateSession]);

  const beginDrag = useCallback((item: CanvasItem, pointer: Point) => {
    updateSession(createDragSession(item, pointer, orderedItems.filter((entry) => entry.id !== item.id)));
  }, [orderedItems, updateSession]);

  const beginGroupDrag = useCallback((pointer: Point) => {
    const nextSession = createGroupDragSession(pointer, {
      selectedItems,
      siblingItems: orderedItems.filter((entry) => !selectedIdSet.has(entry.id)),
      activeSelectionFrame,
    });
    if (nextSession) {
      updateSession(nextSession);
    }
  }, [activeSelectionFrame, orderedItems, selectedIdSet, selectedItems, updateSession]);

  const beginResize = useCallback((item: ShapeItem, handle: ResizeHandle, pointer: Point) => {
    updateSession(
      createResizeSession(item, handle, pointer, orderedItems.filter((entry) => entry.id !== item.id))
    );
  }, [orderedItems, updateSession]);

  const beginGroupResize = useCallback((handle: ResizeHandle, pointer: Point) => {
    const nextSession = createGroupResizeSession(handle, pointer, {
      selectedItems,
      siblingItems: orderedItems.filter((entry) => !selectedIdSet.has(entry.id)),
      activeSelectionFrame,
    });
    if (nextSession) {
      updateSession(nextSession);
    }
  }, [activeSelectionFrame, orderedItems, selectedIdSet, selectedItems, updateSession]);

  const beginRotate = useCallback((item: ShapeItem, pointer: Point) => {
    updateSession(createRotateSession(item, pointer, orderedItems.filter((entry) => entry.id !== item.id)));
  }, [orderedItems, updateSession]);

  const beginGroupRotate = useCallback((pointer: Point) => {
    const nextSession = createGroupRotateSession(pointer, {
      selectedItems,
      siblingItems: orderedItems.filter((entry) => !selectedIdSet.has(entry.id)),
      activeSelectionFrame,
    });
    if (nextSession) {
      updateSession(nextSession);
    }
  }, [activeSelectionFrame, orderedItems, selectedIdSet, selectedItems, updateSession]);

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

  const handleItemPointerDown = useCallback((item: CanvasItem, pointer: Point, shiftKey: boolean) => {
    if (shiftKey && onToggleSelectItem) {
      onToggleSelectItem(item.id);
      return;
    }
    if (selectedIdSet.has(item.id)) {
      if (selectedItems.length > 1) {
        beginGroupDrag(pointer);
        return;
      }
      beginDrag(item, pointer);
      return;
    }
    onSelectItem(item.id);
    beginDrag(item, pointer);
  }, [beginDrag, beginGroupDrag, onSelectItem, onToggleSelectItem, selectedIdSet, selectedItems.length]);

  const handleStageMouseDown = useCallback((event: Konva.KonvaEventObject<MouseEvent>) => {
    const target = event.target;
    const stage = event.target.getStage();
    const rawPointer = stage?.getPointerPosition();
    const pointer = rawPointer ? { x: (rawPointer.x - viewport.panX) / viewport.zoom, y: (rawPointer.y - viewport.panY) / viewport.zoom } : null;
    const isCanvasSurface = target === stage || target.hasName?.('canvas-surface') || target.hasName?.('canvas-background') || target.hasName?.('canvas-backdrop') || target.name() === 'canvas-surface' || target.name() === 'canvas-background' || target.name() === 'canvas-backdrop';
    if (!pointer || !isCanvasSurface) return;
    if (isCreateTool(activeTool)) {
      beginCreate(activeTool, pointer);
      return;
    }
    if (activeTool === 'select') {
      onGuidesChange([]);
      onSelectItem(undefined);
      pendingMarqueeRef.current = { pointerStart: pointer, toggleMode: Boolean(event.evt?.shiftKey) };
      updateSession(null);
      return;
    }
    onGuidesChange([]);
    onSelectItem(undefined);
  }, [activeTool, beginCreate, onGuidesChange, onSelectItem, updateSession, viewport.panX, viewport.panY, viewport.zoom]);

  const handleStageMouseUp = useCallback((event: Konva.KonvaEventObject<MouseEvent>) => {
    if (!sessionRef.current) return;
    const rawPointer = event.target.getStage()?.getPointerPosition() ?? null;
    const pointer = rawPointer ? { x: (rawPointer.x - viewport.panX) / viewport.zoom, y: (rawPointer.y - viewport.panY) / viewport.zoom } : null;
    commitActiveSession(pointer);
  }, [commitActiveSession, viewport.panX, viewport.panY, viewport.zoom]);

  return {
    beginDrag,
    beginGroupDrag,
    beginGroupResize,
    beginGroupRotate,
    beginLineHandle,
    beginResize,
    beginRotate,
    handleItemPointerDown,
    handleStageMouseDown,
    handleStageMouseUp,
    nodeClientRect,
    registerShapeRef,
    renderedItems,
    renderedSelectedItems,
    renderedGroupBounds,
    renderedSelectionFrame,
    selectedDocumentItem,
    selectedNode,
    selectedRenderedItem,
    selectedItemId,
    session,
  };
}
