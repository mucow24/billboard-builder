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
import type {
  CanvasItem,
  CanvasTool,
  GuideLine,
  LineCanvasItem,
  ProjectDocumentV1,
} from '../model/types';

type ShapeItem = Exclude<CanvasItem, LineCanvasItem>;

interface InteractionSessionBase {
  kind: 'create' | 'drag' | 'resize' | 'rotate' | 'line-handle';
  pointerStart: Point;
  guides: GuideLine[];
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

export type InteractionSession =
  | CreateSession
  | DragSession
  | ResizeSession
  | RotateSession
  | LineHandleSession;

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

interface UseCanvasInteractionSessionParams {
  activeTool: CanvasTool;
  document: ProjectDocumentV1;
  viewport?: { zoom: number; panX: number; panY: number };
  onGuidesChange: (guides: GuideLine[]) => void;
  onSelectItem: (itemId?: string) => void;
  onUpdateItem: (itemId: string, changes: Partial<CanvasItem>) => void;
  onAddItem: (item: CanvasItem) => void;
  onSetActiveTool: (tool: CanvasTool) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
}

export function useCanvasInteractionSession({
  activeTool,
  document,
  viewport = { zoom: 1, panX: 0, panY: 0 },
  onGuidesChange,
  onSelectItem,
  onUpdateItem,
  onAddItem,
  onSetActiveTool,
  stageRef,
}: UseCanvasInteractionSessionParams) {
  const shapeRefs = useRef(new Map<string, Konva.Node>());
  const sessionRef = useRef<InteractionSession | null>(null);
  const [session, setSession] = useState<InteractionSession | null>(null);

  const selectedItemId = document.selectedItemIds[0];
  const stageBounds = useMemo(
    () => ({
      x: 0,
      y: 0,
      width: document.canvas.width,
      height: document.canvas.height,
    }),
    [document.canvas.height, document.canvas.width]
  );
  const orderedItems = useMemo(
    () => document.items.slice().sort((left, right) => left.zIndex - right.zIndex),
    [document.items]
  );
  const renderedItems = useMemo(() => {
    const previewItem = session?.previewItem ?? null;
    const baseItems = orderedItems.map((item) =>
      previewItem && session && session.kind !== 'create' && item.id === session.itemId
        ? previewItem
        : item
    );
    return session?.kind === 'create' && previewItem
      ? [...baseItems, previewItem]
      : baseItems;
  }, [orderedItems, session]);
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

  const getCurrentPointer = useCallback(
    (event: MouseEvent) => {
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
    },
    [stageRef, viewport.panX, viewport.panY, viewport.zoom]
  );

  const resolveSession = useCallback(
    (current: InteractionSession, pointer: Point): InteractionSession => {
      switch (current.kind) {
        case 'create':
          return {
            ...current,
            previewItem: getCreatePreview(current.tool, current.pointerStart, pointer),
          };
        case 'drag': {
          const next = solveDragSession(
            current.originalItem,
            current.pointerStart,
            pointer,
            current.siblingItems,
            stageBounds
          );
          return {
            ...current,
            previewItem: next.item,
            guides: next.guides,
          };
        }
        case 'resize': {
          const next = solveResizeSession(
            current.originalItem as ShapeItem,
            current.handle,
            pointer,
            current.pointerOffset,
            current.siblingItems,
            stageBounds
          );
          return {
            ...current,
            previewItem: next.item,
            guides: next.guides,
          };
        }
        case 'rotate': {
          const next = solveRotateSession(
            current.originalItem as ShapeItem,
            current.pointerStart,
            pointer
          );
          return {
            ...current,
            previewItem: next.item,
            guides: [],
          };
        }
        case 'line-handle': {
          const next = solveLineHandleSession(
            current.originalItem as LineCanvasItem,
            current.handle,
            pointer,
            current.pointerOffset,
            current.siblingItems,
            stageBounds
          );
          return {
            ...current,
            previewItem: next.item,
            guides: next.guides,
          };
        }
      }
    },
    [stageBounds]
  );

  const finishSession = useCallback(
    (current: InteractionSession, pointer: Point) => {
      const resolved = resolveSession(current, pointer);
      onGuidesChange([]);

      if (resolved.kind === 'create') {
        const createdItem =
          resolved.previewItem ??
          buildCreatedItem(resolved.tool, resolved.pointerStart, pointer);
        onAddItem(createdItem);
        onSetActiveTool('select');
        return;
      }

      onUpdateItem(resolved.itemId, getCommitChanges(resolved.previewItem));
    },
    [onAddItem, onGuidesChange, onSetActiveTool, onUpdateItem, resolveSession]
  );

  const commitActiveSession = useCallback(
    (pointer: Point | null) => {
      const current = sessionRef.current;
      const resolvedPointer = pointer ?? current?.pointerStart ?? null;
      if (!current || !resolvedPointer) {
        updateSession(null);
        onGuidesChange([]);
        return;
      }
      finishSession(current, resolvedPointer);
      updateSession(null);
    },
    [finishSession, onGuidesChange, updateSession]
  );

  useEffect(() => {
    if (!session) {
      return;
    }

    function handleMouseMove(event: MouseEvent) {
      const current = sessionRef.current;
      const pointer = getCurrentPointer(event);
      if (!current || !pointer) {
        return;
      }
      const next = resolveSession(current, pointer);
      onGuidesChange(next.guides);
      updateSession(next);
    }

    function handleMouseUp(event: MouseEvent) {
      commitActiveSession(getCurrentPointer(event));
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp, true);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [commitActiveSession, getCurrentPointer, onGuidesChange, resolveSession, session, updateSession]);

  const beginCreate = useCallback(
    (tool: Extract<CanvasTool, 'text' | 'rectangle' | 'ellipse' | 'line'>, pointer: Point) => {
      updateSession({
        kind: 'create',
        tool,
        pointerStart: pointer,
        previewItem: null,
        guides: [],
      });
    },
    [updateSession]
  );

  const beginDrag = useCallback(
    (item: CanvasItem, pointer: Point) => {
      updateSession({
        kind: 'drag',
        itemId: item.id,
        originalItem: item,
        previewItem: item,
        siblingItems: orderedItems.filter((entry) => entry.id !== item.id),
        pointerStart: pointer,
        guides: [],
      });
    },
    [orderedItems, updateSession]
  );

  const beginResize = useCallback(
    (item: ShapeItem, handle: ResizeHandle, pointer: Point) => {
      const handlePoint = getShapeHandlePoints(item)[handle];
      updateSession({
        kind: 'resize',
        itemId: item.id,
        originalItem: item,
        previewItem: item,
        siblingItems: orderedItems.filter((entry) => entry.id !== item.id),
        pointerStart: pointer,
        pointerOffset: {
          x: pointer.x - handlePoint.x,
          y: pointer.y - handlePoint.y,
        },
        handle,
        guides: [],
      });
    },
    [orderedItems, updateSession]
  );

  const beginRotate = useCallback(
    (item: ShapeItem, pointer: Point) => {
      updateSession({
        kind: 'rotate',
        itemId: item.id,
        originalItem: item,
        previewItem: item,
        siblingItems: orderedItems.filter((entry) => entry.id !== item.id),
        pointerStart: pointer,
        handle: 'rotater',
        guides: [],
      });
    },
    [orderedItems, updateSession]
  );

  const beginLineHandle = useCallback(
    (item: LineCanvasItem, handle: 'start' | 'end', pointer: Point) => {
      const rect = getLineHandleRects(item)[handle];
      updateSession({
        kind: 'line-handle',
        itemId: item.id,
        originalItem: item,
        previewItem: item,
        siblingItems: orderedItems.filter((entry) => entry.id !== item.id),
        pointerStart: pointer,
        pointerOffset: {
          x: pointer.x - (rect.x + rect.width / 2),
          y: pointer.y - (rect.y + rect.height / 2),
        },
        handle,
        guides: [],
      });
    },
    [orderedItems, updateSession]
  );

  const registerShapeRef = useCallback((itemId: string, node: Konva.Node | null) => {
    if (!node) {
      shapeRefs.current.delete(itemId);
      return;
    }
    shapeRefs.current.set(itemId, node);
  }, []);

  const selectedNode = selectedItemId ? shapeRefs.current.get(selectedItemId) ?? null : null;
  const nodeClientRect =
    selectedNode && stageRef.current
      ? selectedNode.getClientRect({ relativeTo: stageRef.current })
      : null;

  const handleStageMouseDown = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      const target = event.target;
      const stage = event.target.getStage();
      const rawPointer = stage?.getPointerPosition();
      const pointer = rawPointer
        ? {
            x: (rawPointer.x - viewport.panX) / viewport.zoom,
            y: (rawPointer.y - viewport.panY) / viewport.zoom,
          }
        : null;
      const isCanvasSurface =
        target === stage ||
        target.hasName?.('canvas-surface') ||
        target.hasName?.('canvas-background') ||
        target.hasName?.('canvas-backdrop') ||
        target.name() === 'canvas-surface' ||
        target.name() === 'canvas-background' ||
        target.name() === 'canvas-backdrop';
      if (!pointer || !isCanvasSurface) {
        return;
      }
      if (isCreateTool(activeTool)) {
        beginCreate(activeTool, pointer);
        return;
      }
      onGuidesChange([]);
      onSelectItem(undefined);
    },
    [activeTool, beginCreate, onGuidesChange, onSelectItem, viewport.panX, viewport.panY, viewport.zoom]
  );

  const handleStageMouseUp = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (!sessionRef.current) {
        return;
      }
      const rawPointer = event.target.getStage()?.getPointerPosition() ?? null;
      const pointer = rawPointer
        ? {
            x: (rawPointer.x - viewport.panX) / viewport.zoom,
            y: (rawPointer.y - viewport.panY) / viewport.zoom,
          }
        : null;
      commitActiveSession(pointer);
    },
    [commitActiveSession, viewport.panX, viewport.panY, viewport.zoom]
  );

  return {
    beginDrag,
    beginLineHandle,
    beginResize,
    beginRotate,
    handleStageMouseDown,
    handleStageMouseUp,
    nodeClientRect,
    registerShapeRef,
    renderedItems,
    selectedDocumentItem,
    selectedNode,
    selectedRenderedItem,
    selectedItemId,
    session,
  };
}
