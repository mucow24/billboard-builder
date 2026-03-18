import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';

import {
  buildCreatedItem,
  getCreatePreview,
  getLineHandleRects,
  getShapeHandlePoints,
  isCreateTool,
  solveDragSession,
  solveLineHandleSession,
  solveResizeSession,
  solveRotateSession,
  type Point,
  type ResizeHandle,
} from './interactionGeometry';
import {
  buildGroupDragPreviews,
  buildGroupResizePreviews,
  buildGroupRotatePreviews,
  getGroupResizeFrame,
  getSelectionFrameForRotation,
  getSelectionRenderBounds,
  itemIntersectsSelectionRect,
  type RenderBox,
} from './transformGeometry';
import { getResizeSnappedRect, getSnappedRect } from './snapping';
import type {
  CanvasItem,
  CanvasTool,
  GuideLine,
  LineCanvasItem,
  ProjectDocumentV1,
} from '../document/documentTypes';

type ShapeItem = Exclude<CanvasItem, LineCanvasItem>;

type SessionWithModifiers = InteractionSession & { shiftConstrain?: boolean };

interface InteractionSessionBase {
  kind: 'create' | 'drag' | 'resize' | 'rotate' | 'line-handle' | 'marquee' | 'group-drag' | 'group-resize' | 'group-rotate';
  pointerStart: Point;
  guides: GuideLine[];
  snapDisabled?: boolean;
}

interface CreateSession extends InteractionSessionBase {
  kind: 'create';
  tool: Extract<CanvasTool, 'text' | 'rectangle' | 'ellipse' | 'line'>;
  previewItem: CanvasItem | null;
}

interface ItemSession extends InteractionSessionBase {
  kind: 'drag' | 'resize' | 'rotate' | 'line-handle';
  itemId: string;
  originalItem: CanvasItem;
  previewItem: CanvasItem;
  siblingItems: CanvasItem[];
}

interface DragSession extends ItemSession {
  kind: 'drag';
  axisLock?: 'x' | 'y';
}

interface ResizeSession extends ItemSession {
  kind: 'resize';
  handle: ResizeHandle;
  pointerOffset: Point;
}

interface RotateSession extends ItemSession {
  kind: 'rotate';
  handle: 'rotater';
}

interface LineHandleSession extends ItemSession {
  kind: 'line-handle';
  handle: 'start' | 'end';
  pointerOffset: Point;
}

interface MarqueeSession extends InteractionSessionBase {
  kind: 'marquee';
  currentPointer: Point;
  toggleMode: boolean;
}

export interface SelectionFrame {
  bounds: RenderBox;
  rotation: number;
}

interface GroupSessionBase extends InteractionSessionBase {
  kind: 'group-drag' | 'group-resize' | 'group-rotate';
  itemIds: string[];
  originalItems: CanvasItem[];
  previewItems: CanvasItem[];
  siblingItems: CanvasItem[];
  bounds: RenderBox;
  frameRotation: number;
}

interface GroupDragSession extends GroupSessionBase {
  kind: 'group-drag';
  currentPointer: Point;
}

interface GroupResizeSession extends GroupSessionBase {
  kind: 'group-resize';
  handle: ResizeHandle;
  currentPointer: Point;
}

interface GroupRotateSession extends GroupSessionBase {
  kind: 'group-rotate';
  handle: 'rotater';
  currentPointer: Point;
}

function currentSelectionSetSignature(itemIds: string[]): string {
  return [...itemIds].sort().join('\u0000');
}

function rotateGroupPointerDelta(bounds: RenderBox, startPointer: Point, currentPointer: Point, snap = false): number {
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const startAngle = Math.atan2(startPointer.y - center.y, startPointer.x - center.x);
  const currentAngle = Math.atan2(currentPointer.y - center.y, currentPointer.x - center.x);
  let deltaDegrees = ((currentAngle - startAngle) * 180) / Math.PI;
  if (snap) {
    deltaDegrees = Math.round(deltaDegrees / 15) * 15;
  }
  return deltaDegrees;
}

export type InteractionSession =
  | CreateSession
  | DragSession
  | ResizeSession
  | RotateSession
  | LineHandleSession
  | MarqueeSession
  | GroupDragSession
  | GroupResizeSession
  | GroupRotateSession;

function getCommitChanges(item: CanvasItem): Partial<CanvasItem> {
  if (item.kind === 'line') {
    return {
      startX: item.startX,
      startY: item.startY,
      endX: item.endX,
      endY: item.endY,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      scaleX: 1,
      scaleY: 1,
    };
  }

  return {
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    rotation: item.rotation,
    scaleX: 1,
    scaleY: 1,
  };
}

function normalizeRectFromPoints(start: Point, current: Point): RenderBox {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.max(1, Math.abs(current.x - start.x)),
    height: Math.max(1, Math.abs(current.y - start.y)),
  };
}

function getGroupResizeRect(bounds: RenderBox, handle: ResizeHandle, pointer: Point): RenderBox {
  const edges = {
    left: bounds.x,
    right: bounds.x + bounds.width,
    top: bounds.y,
    bottom: bounds.y + bounds.height,
  };

  if (handle.includes('left')) {
    edges.left = pointer.x;
  }
  if (handle.includes('right')) {
    edges.right = pointer.x;
  }
  if (handle.includes('top')) {
    edges.top = pointer.y;
  }
  if (handle.includes('bottom')) {
    edges.bottom = pointer.y;
  }
  if (handle === 'top-center' || handle === 'bottom-center') {
    edges.left = bounds.x;
    edges.right = bounds.x + bounds.width;
  }
  if (handle === 'middle-left' || handle === 'middle-right') {
    edges.top = bounds.y;
    edges.bottom = bounds.y + bounds.height;
  }

  return {
    x: edges.left,
    y: edges.top,
    width: edges.right - edges.left,
    height: edges.bottom - edges.top,
  };
}

function getGroupResizePointer(rect: RenderBox, handle: ResizeHandle, bounds: RenderBox): Point {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  return {
    x: handle.includes('left') ? rect.x : handle.includes('right') ? right : centerX,
    y: handle.includes('top') ? rect.y : handle.includes('bottom') ? bottom : centerY,
  };
}

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

  const renderedItems = useMemo(() => {
    const previewItem = session && 'previewItem' in session ? session.previewItem : null;
    const previewItems = session && 'previewItems' in session ? session.previewItems : null;
    const previewMap = new Map(previewItems?.map((item) => [item.id, item] as const) ?? []);
    const baseItems = orderedItems.map((item) => {
      if (previewMap.has(item.id)) {
        return previewMap.get(item.id)!;
      }
      if (previewItem && 'itemId' in (session ?? {}) && item.id === (session as DragSession | ResizeSession | RotateSession | LineHandleSession).itemId) {
        return previewItem;
      }
      return item;
    });
    return session?.kind === 'create' && session.previewItem ? [...baseItems, session.previewItem] : baseItems;
  }, [orderedItems, session]);

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

  const resolveSession = useCallback((current: InteractionSession, pointer: Point): InteractionSession => {
    const currentWithModifiers = current as SessionWithModifiers;
    switch (current.kind) {
      case 'create':
        return { ...current, previewItem: getCreatePreview(current.tool, current.pointerStart, pointer) };
      case 'drag': {
        let resolvedPointer = pointer;
        let axisLock = current.axisLock;
        const deltaX = pointer.x - current.pointerStart.x;
        const deltaY = pointer.y - current.pointerStart.y;
        if (currentWithModifiers.shiftConstrain) {
          if (!axisLock && Math.hypot(deltaX, deltaY) >= 6) {
            axisLock = Math.abs(deltaX) >= Math.abs(deltaY) ? 'x' : 'y';
          }
          if (axisLock === 'x') resolvedPointer = { ...pointer, y: current.pointerStart.y };
          if (axisLock === 'y') resolvedPointer = { ...pointer, x: current.pointerStart.x };
        }
        const next = solveDragSession(current.originalItem, current.pointerStart, resolvedPointer, current.siblingItems, stageBounds, !current.snapDisabled);
        return { ...current, axisLock, previewItem: next.item, guides: next.guides };
      }
      case 'resize': {
        const next = solveResizeSession(current.originalItem as ShapeItem, current.handle, pointer, current.pointerOffset, current.siblingItems, stageBounds, !current.snapDisabled);
        return { ...current, previewItem: next.item, guides: next.guides };
      }
      case 'rotate': {
        const next = solveRotateSession(current.originalItem as ShapeItem, current.pointerStart, pointer, Boolean(currentWithModifiers.shiftConstrain));
        return { ...current, previewItem: next.item, guides: [] };
      }
      case 'line-handle': {
        const next = solveLineHandleSession(current.originalItem as LineCanvasItem, current.handle, pointer, current.pointerOffset, current.siblingItems, stageBounds, !current.snapDisabled);
        return { ...current, previewItem: next.item, guides: next.guides };
      }
      case 'marquee':
        return { ...current, currentPointer: pointer };
      case 'group-drag': {
        const rawRect = {
          x: current.bounds.x + (pointer.x - current.pointerStart.x),
          y: current.bounds.y + (pointer.y - current.pointerStart.y),
          width: current.bounds.width,
          height: current.bounds.height,
        };
        const snapped = current.snapDisabled
          ? { rect: rawRect, guides: [] }
          : getSnappedRect(rawRect, current.siblingItems, stageBounds);
        const resolvedPointer = {
          x: current.pointerStart.x + (snapped.rect.x - current.bounds.x),
          y: current.pointerStart.y + (snapped.rect.y - current.bounds.y),
        };
        return {
          ...current,
          currentPointer: resolvedPointer,
          guides: snapped.guides,
          previewItems: buildGroupDragPreviews(
            current.originalItems,
            snapped.rect.x - current.bounds.x,
            snapped.rect.y - current.bounds.y
          ),
        };
      }
      case 'group-resize': {
        if (current.snapDisabled || Math.abs(current.frameRotation) >= 0.001) {
          return {
            ...current,
            currentPointer: pointer,
            guides: [],
            previewItems: buildGroupResizePreviews(
              current.originalItems,
              current.bounds,
              current.handle,
              pointer,
              current.frameRotation
            ),
          };
        }
        const rawRect = getGroupResizeRect(current.bounds, current.handle, pointer);
        const snapped = getResizeSnappedRect(rawRect, current.siblingItems, stageBounds, current.handle);
        const resolvedPointer = getGroupResizePointer(snapped.rect, current.handle, current.bounds);
        return {
          ...current,
          currentPointer: resolvedPointer,
          guides: snapped.guides,
          previewItems: buildGroupResizePreviews(
            current.originalItems,
            current.bounds,
            current.handle,
            resolvedPointer,
            current.frameRotation
          ),
        };
      }
      case 'group-rotate':
        return { ...current, currentPointer: pointer, previewItems: buildGroupRotatePreviews(current.originalItems, current.bounds, current.pointerStart, pointer, Boolean(currentWithModifiers.shiftConstrain)) };
    }
  }, [stageBounds]);

  const finishSession = useCallback((current: InteractionSession, pointer: Point) => {
    const resolved = resolveSession(current, pointer);
    onGuidesChange([]);

    if (resolved.kind === 'create') {
      const createdItem = resolved.previewItem ?? buildCreatedItem(resolved.tool, resolved.pointerStart, pointer);
      onAddItem(createdItem);
      onSetActiveTool('select');
      return;
    }
    if (resolved.kind === 'marquee') {
      const rect = normalizeRectFromPoints(resolved.pointerStart, resolved.currentPointer);
      const hitIds = orderedItems.filter((item) => !item.hidden && itemIntersectsSelectionRect(item, rect)).map((item) => item.id);
      if (resolved.toggleMode && onToggleSelectItems) {
        onToggleSelectItems(hitIds);
      } else if (hitIds.length > 0) {
        onSelectItem(hitIds[0]);
        if (hitIds.length > 1 && onToggleSelectItems) {
          onSelectItem(undefined);
          onToggleSelectItems(hitIds);
        }
      } else {
        onSelectItem(undefined);
      }
      return;
    }
    if ('previewItems' in resolved) {
      const updates = resolved.previewItems.map((item) => ({ itemId: item.id, changes: getCommitChanges(item) }));
      if (resolved.kind === 'group-drag') {
        setSelectionFrame({
          bounds: {
            x: resolved.bounds.x + (resolved.currentPointer.x - resolved.pointerStart.x),
            y: resolved.bounds.y + (resolved.currentPointer.y - resolved.pointerStart.y),
            width: resolved.bounds.width,
            height: resolved.bounds.height,
          },
          rotation: resolved.frameRotation,
        });
      } else if (resolved.kind === 'group-rotate') {
        const deltaRotation = rotateGroupPointerDelta(
          resolved.bounds,
          resolved.pointerStart,
          resolved.currentPointer,
          false
        );
        setSelectionFrame(
          {
            bounds: resolved.bounds,
            rotation: resolved.frameRotation + deltaRotation,
          }
        );
      } else if (resolved.kind === 'group-resize') {
        setSelectionFrame(getGroupResizeFrame(resolved.bounds, resolved.handle, resolved.currentPointer, resolved.frameRotation));
      }
      if (onUpdateItems) {
        onUpdateItems(updates);
      } else {
        updates.forEach(({ itemId, changes }) => onUpdateItem(itemId, changes));
      }
      return;
    }
    onUpdateItem(resolved.itemId, getCommitChanges(resolved.previewItem));
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
    updateSession({ kind: 'create', tool, pointerStart: pointer, previewItem: null, guides: [], snapDisabled: false });
  }, [updateSession]);

  const beginDrag = useCallback((item: CanvasItem, pointer: Point) => {
    updateSession({ kind: 'drag', itemId: item.id, originalItem: item, previewItem: item, siblingItems: orderedItems.filter((entry) => entry.id !== item.id), pointerStart: pointer, guides: [], snapDisabled: false, axisLock: undefined });
  }, [orderedItems, updateSession]);

  const beginGroupDrag = useCallback((pointer: Point) => {
    if (!activeSelectionFrame || selectedItems.length <= 1) return;
    updateSession({
      kind: 'group-drag',
      itemIds: selectedItems.map((item) => item.id),
      originalItems: selectedItems,
      previewItems: selectedItems,
      siblingItems: orderedItems.filter((entry) => !selectedIdSet.has(entry.id)),
      bounds: activeSelectionFrame.bounds,
      frameRotation: activeSelectionFrame.rotation,
      pointerStart: pointer,
      currentPointer: pointer,
      guides: [],
      snapDisabled: false,
    });
  }, [activeSelectionFrame, orderedItems, selectedIdSet, selectedItems, updateSession]);

  const beginResize = useCallback((item: ShapeItem, handle: ResizeHandle, pointer: Point) => {
    const handlePoint = getShapeHandlePoints(item)[handle];
    updateSession({ kind: 'resize', itemId: item.id, originalItem: item, previewItem: item, siblingItems: orderedItems.filter((entry) => entry.id !== item.id), pointerStart: pointer, pointerOffset: { x: pointer.x - handlePoint.x, y: pointer.y - handlePoint.y }, handle, guides: [], snapDisabled: false });
  }, [orderedItems, updateSession]);

  const beginGroupResize = useCallback((handle: ResizeHandle, pointer: Point) => {
    if (!activeSelectionFrame || selectedItems.length <= 1) return;
    updateSession({
      kind: 'group-resize',
      itemIds: selectedItems.map((item) => item.id),
      originalItems: selectedItems,
      previewItems: selectedItems,
      siblingItems: orderedItems.filter((entry) => !selectedIdSet.has(entry.id)),
      bounds: activeSelectionFrame.bounds,
      frameRotation: activeSelectionFrame.rotation,
      pointerStart: pointer,
      currentPointer: pointer,
      handle,
      guides: [],
      snapDisabled: false,
    });
  }, [activeSelectionFrame, orderedItems, selectedIdSet, selectedItems, updateSession]);

  const beginRotate = useCallback((item: ShapeItem, pointer: Point) => {
    updateSession({ kind: 'rotate', itemId: item.id, originalItem: item, previewItem: item, siblingItems: orderedItems.filter((entry) => entry.id !== item.id), pointerStart: pointer, handle: 'rotater', guides: [], snapDisabled: false });
  }, [orderedItems, updateSession]);

  const beginGroupRotate = useCallback((pointer: Point) => {
    if (!activeSelectionFrame || selectedItems.length <= 1) return;
    updateSession({
      kind: 'group-rotate',
      itemIds: selectedItems.map((item) => item.id),
      originalItems: selectedItems,
      previewItems: selectedItems,
      siblingItems: orderedItems.filter((entry) => !selectedIdSet.has(entry.id)),
      bounds: activeSelectionFrame.bounds,
      frameRotation: activeSelectionFrame.rotation,
      pointerStart: pointer,
      currentPointer: pointer,
      handle: 'rotater',
      guides: [],
    });
  }, [activeSelectionFrame, orderedItems, selectedIdSet, selectedItems, updateSession]);

  const beginLineHandle = useCallback((item: LineCanvasItem, handle: 'start' | 'end', pointer: Point) => {
    const rect = getLineHandleRects(item)[handle];
    updateSession({ kind: 'line-handle', itemId: item.id, originalItem: item, previewItem: item, siblingItems: orderedItems.filter((entry) => entry.id !== item.id), pointerStart: pointer, pointerOffset: { x: pointer.x - (rect.x + rect.width / 2), y: pointer.y - (rect.y + rect.height / 2) }, handle, guides: [], snapDisabled: false });
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
