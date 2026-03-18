import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Konva from 'konva';

import { useCanvasInteractionSession } from './useCanvasInteractionSession';
import { getLineHandleRects, getShapeHandlePoints } from './interactionGeometry';
import {
  createDefaultProjectDocument,
  createLineItem,
  createRectangleItem,
} from '../document/documentDefaults';
import type {
  CanvasItem,
  CanvasTool,
  ProjectDocumentV1,
} from '../document/documentTypes';

function makeStageRef() {
  let pointer: { x: number; y: number } | null = null;
  const stage = {
    setPointersPositions(event: MouseEvent) {
      pointer = {
        x: event.clientX,
        y: event.clientY,
      };
    },
    getPointerPosition() {
      return pointer;
    },
  } as unknown as Konva.Stage;

  return {
    ref: {
      current: stage,
    } as React.RefObject<Konva.Stage | null>,
  };
}

function makeStageEvent(
  pointer: { x: number; y: number } | null,
  name = 'canvas-background'
) {
  return {
    target: {
      name: () => name,
      getStage: () => ({
        getPointerPosition: () => pointer,
      }),
    },
  } as unknown as Konva.KonvaEventObject<MouseEvent>;
}

function createDocument(items: CanvasItem[] = [], selectedItemIds: string[] = []) {
  void selectedItemIds;
  return {
    ...createDefaultProjectDocument(),
    items,
  } satisfies ProjectDocumentV1;
}

function createHookParamsBase() {
  const stageRef = makeStageRef();

  return {
    activeTool: 'select' as CanvasTool,
    document: createDefaultProjectDocument(),
    selectedItemIds: [] as string[],
    onGuidesChange: vi.fn(),
    onSelectItem: vi.fn(),
    onUpdateItem: vi.fn(),
    onUpdateItems: undefined as undefined | ReturnType<typeof vi.fn>,
    onAddItem: vi.fn(),
    onSetActiveTool: vi.fn(),
    stageRef: stageRef.ref,
  };
}

function createHookParams(overrides?: Partial<ReturnType<typeof createHookParamsBase>>) {
  return {
    ...createHookParamsBase(),
    ...overrides,
  };
}

describe('useCanvasInteractionSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts a create session from a blank-canvas mouse down', () => {
    const params = createHookParams({
      activeTool: 'rectangle',
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleStageMouseDown(makeStageEvent({ x: 120, y: 160 }));
    });

    expect(result.current.session?.kind).toBe('create');
    expect(result.current.session && 'previewItem' in result.current.session ? result.current.session.previewItem : null).toBeNull();
  });


  it('starts a create session from checkerboard surface clicks', () => {
    const params = createHookParams({
      activeTool: 'rectangle',
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleStageMouseDown(makeStageEvent({ x: 120, y: 160 }, 'canvas-surface'));
    });

    expect(result.current.session?.kind).toBe('create');
  });

  it('commits a created item and returns to arrow mode on mouse up', () => {
    const params = createHookParams({
      activeTool: 'rectangle',
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleStageMouseDown(makeStageEvent({ x: 120, y: 160 }));
    });
    act(() => {
      result.current.handleStageMouseUp(makeStageEvent({ x: 360, y: 280 }));
    });

    expect(params.onAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'rectangle',
        x: 120,
        y: 160,
        width: 240,
        height: 120,
      })
    );
    expect(params.onSetActiveTool).toHaveBeenCalledWith('select');
    expect(result.current.session).toBeNull();
  });

  it('clears selection when the select tool clicks blank canvas', () => {
    const item = createRectangleItem();
    const params = createHookParams({
      document: createDocument([item], [item.id]),
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleStageMouseDown(makeStageEvent({ x: 10, y: 10 }));
    });

    expect(params.onSelectItem).toHaveBeenCalledWith(undefined);
    expect(params.onGuidesChange).toHaveBeenCalledWith([]);
    expect(result.current.session).toBeNull();
  });

  it('commits drag geometry from the final pointer position', () => {
    const item = createRectangleItem({
      x: 200,
      y: 120,
      width: 240,
      height: 120,
    });
    const params = createHookParams({
      document: createDocument([item], [item.id]),
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.beginDrag(item, { x: 300, y: 180 });
    });
    act(() => {
      result.current.handleStageMouseUp(makeStageEvent({ x: 420, y: 210 }, 'shape'));
    });

    expect(params.onUpdateItem).toHaveBeenCalledWith(
      item.id,
      expect.objectContaining({
        x: 320,
        y: 150,
      })
    );
  });

  it('commits resize geometry using the solver output', () => {
    const item = createRectangleItem({
      x: 200,
      y: 120,
      width: 240,
      height: 120,
    });
    const params = createHookParams({
      document: createDocument([item], [item.id]),
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));
    const handlePoint = getShapeHandlePoints(item)['top-center'];

    act(() => {
      result.current.beginResize(item, 'top-center', handlePoint);
    });
    act(() => {
      result.current.handleStageMouseUp(
        makeStageEvent({ x: handlePoint.x, y: item.y + 60 }, 'shape')
      );
    });

    expect(params.onUpdateItem).toHaveBeenCalledWith(
      item.id,
      expect.objectContaining({
        y: 180,
        height: 60,
      })
    );
  });

  it('commits rotate geometry using the resolved preview box', () => {
    const item = createRectangleItem({
      x: 200,
      y: 120,
      width: 240,
      height: 120,
    });
    const params = createHookParams({
      document: createDocument([item], [item.id]),
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));
    const center = { x: item.x + item.width / 2, y: item.y + item.height / 2 };

    act(() => {
      result.current.beginRotate(item, { x: center.x, y: center.y - 100 });
    });
    act(() => {
      result.current.handleStageMouseUp(
        makeStageEvent({ x: center.x + 100, y: center.y }, 'shape')
      );
    });

    const changes = params.onUpdateItem.mock.calls.at(-1)?.[1] as {
      rotation: number;
    };
    expect(changes.rotation).toBeCloseTo(90, 0);
  });

  it('preserves the rotated group selection frame after commit', () => {
    const first = createRectangleItem({ x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ x: 220, y: 100, width: 80, height: 40 });
    const params = createHookParams({
      document: createDocument([first, second]),
      selectedItemIds: [first.id, second.id],
      onUpdateItems: vi.fn(),
    });
    const { result, rerender } = renderHook((hookParams) => useCanvasInteractionSession(hookParams), { initialProps: params });
    const bounds = result.current.renderedGroupBounds!;
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

    act(() => {
      result.current.beginGroupRotate({ x: center.x, y: center.y - 100 });
    });
    act(() => {
      result.current.handleStageMouseUp(makeStageEvent({ x: center.x + 100, y: center.y }, 'shape'));
    });

    const updates = params.onUpdateItems!.mock.calls.at(-1)?.[0] as Array<{ itemId: string; changes: Partial<CanvasItem> }>;
    const rotatedItems = [first, second].map((item) => ({
      ...item,
      ...(updates.find((entry) => entry.itemId === item.id)?.changes ?? {}),
    } as CanvasItem));

    rerender({ ...params, document: createDocument(rotatedItems) });

    expect(result.current.renderedSelectionFrame?.rotation).toBeCloseTo(90, 0);
  });

  it('starts a second group rotation from the committed rotated frame', () => {
    const first = createRectangleItem({ x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ x: 220, y: 100, width: 80, height: 40 });
    const params = createHookParams({
      document: createDocument([first, second]),
      selectedItemIds: [first.id, second.id],
      onUpdateItems: vi.fn(),
    });
    const { result, rerender } = renderHook((hookParams) => useCanvasInteractionSession(hookParams), { initialProps: params });
    const bounds = result.current.renderedGroupBounds!;
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

    act(() => {
      result.current.beginGroupRotate({ x: center.x, y: center.y - 100 });
    });
    act(() => {
      result.current.handleStageMouseUp(makeStageEvent({ x: center.x + 100, y: center.y }, 'shape'));
    });

    const firstUpdates = params.onUpdateItems!.mock.calls.at(-1)?.[0] as Array<{ itemId: string; changes: Partial<CanvasItem> }>;
    const rotatedItems = [first, second].map((item) => ({
      ...item,
      ...(firstUpdates.find((entry) => entry.itemId === item.id)?.changes ?? {}),
    } as CanvasItem));

    rerender({ ...params, document: createDocument(rotatedItems) });

    act(() => {
      result.current.beginGroupRotate({ x: center.x + 100, y: center.y });
    });

    const session = result.current.session;
    expect(session?.kind).toBe('group-rotate');
    if (session?.kind === 'group-rotate') {
      expect(session.frameRotation).toBeCloseTo(90, 0);
      expect(session.bounds).toEqual(bounds);
    }
  });


  it('commits only the dragged line endpoint', () => {
    const item = createLineItem({
      startX: 160,
      startY: 160,
      endX: 400,
      endY: 184,
    });
    const params = createHookParams({
      document: createDocument([item], [item.id]),
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));
    const startHandle = getLineHandleRects(item).start;
    const startCenter = {
      x: startHandle.x + startHandle.width / 2,
      y: startHandle.y + startHandle.height / 2,
    };

    act(() => {
      result.current.beginLineHandle(item, 'start', startCenter);
    });
    act(() => {
      result.current.handleStageMouseUp(makeStageEvent({ x: 240, y: 200 }, 'shape'));
    });

    expect(params.onUpdateItem).toHaveBeenCalledWith(
      item.id,
      expect.objectContaining({
        startX: 240,
        startY: 200,
        endX: 400,
        endY: 184,
      })
    );
  });

  it('updates preview geometry and guides during drag mousemove', () => {
    const item = createRectangleItem({
      x: 200,
      y: 120,
      width: 240,
      height: 120,
    });
    const sibling = createRectangleItem({
      x: 480,
      y: 120,
      width: 240,
      height: 120,
    });
    const params = createHookParams({
      document: createDocument([item, sibling], [item.id]),
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.beginDrag(item, { x: 300, y: 180 });
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 584,
          clientY: 180,
        })
      );
    });

    expect(result.current.session && 'previewItem' in result.current.session ? result.current.session.previewItem : null).toEqual(
      expect.objectContaining({
        x: 480,
      })
    );
    expect(params.onGuidesChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          orientation: 'vertical',
          position: 480,
        }),
      ])
    );
  });

  it('cancels a create session when the active tool changes back to select', () => {
    const initialParams = createHookParams({
      activeTool: 'rectangle',
    });
    const { result, rerender } = renderHook(
      ({ params }) => useCanvasInteractionSession(params),
      {
        initialProps: {
          params: initialParams,
        },
      }
    );

    act(() => {
      result.current.handleStageMouseDown(makeStageEvent({ x: 120, y: 160 }));
    });

    rerender({
      params: {
        ...initialParams,
        activeTool: 'select',
      },
    });

    expect(result.current.session).toBeNull();
    expect(initialParams.onGuidesChange).toHaveBeenCalledWith([]);
  });
});
