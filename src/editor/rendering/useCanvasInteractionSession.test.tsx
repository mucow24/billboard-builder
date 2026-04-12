import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanvasPointerEvent, CanvasRendererHandle } from './renderer/canvasRendererTypes';
import { useCanvasInteractionSession } from './useCanvasInteractionSession';
import { getLineHandleRects, getShapeHandlePoints } from './interactionGeometry';
import { getSelectionFrameForRotation } from './transformGeometry';
import {
  createGroupNode,
  createDefaultProjectDocument,
  createImageItem,
  createLineItem,
  createRectangleItem,
} from '../document/documentDefaults';
import type {
  CanvasItem,
  CanvasNode,
  CanvasTool,
  ProjectDocument,
} from '../document/documentTypes';

function rotatePoint(
  point: { x: number; y: number },
  origin: { x: number; y: number },
  rotation: number
) {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: origin.x + (point.x - origin.x) * cos - (point.y - origin.y) * sin,
    y: origin.y + (point.x - origin.x) * sin + (point.y - origin.y) * cos,
  };
}

function mapPointBetweenFrames(
  point: { x: number; y: number },
  fromFrame: { bounds: { x: number; y: number; width: number; height: number }; rotation: number },
  toFrame: { bounds: { x: number; y: number; width: number; height: number }; rotation: number }
) {
  const fromCenter = {
    x: fromFrame.bounds.x + fromFrame.bounds.width / 2,
    y: fromFrame.bounds.y + fromFrame.bounds.height / 2,
  };
  const toCenter = {
    x: toFrame.bounds.x + toFrame.bounds.width / 2,
    y: toFrame.bounds.y + toFrame.bounds.height / 2,
  };
  const local = rotatePoint(point, fromCenter, -fromFrame.rotation);
  const normalized = {
    x: (local.x - fromFrame.bounds.x) / Math.max(fromFrame.bounds.width, 1),
    y: (local.y - fromFrame.bounds.y) / Math.max(fromFrame.bounds.height, 1),
  };
  return rotatePoint(
    {
      x: toFrame.bounds.x + normalized.x * toFrame.bounds.width,
      y: toFrame.bounds.y + normalized.y * toFrame.bounds.height,
    },
    toCenter,
    toFrame.rotation
  );
}

function makeStageRef() {
  let bounds = {
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } satisfies DOMRect;
  const handle: CanvasRendererHandle = {
    getContainerElement() {
      return {
        getBoundingClientRect: () => bounds,
      } as unknown as HTMLElement;
    },
    getPointerPosition(event?: MouseEvent) {
      if (!event) return null;
      return { x: event.clientX, y: event.clientY };
    },
    async exportToDataURL() {
      return '';
    },
  };

  return {
    ref: {
      current: handle,
    } as React.RefObject<CanvasRendererHandle | null>,
    setBounds(nextBounds: Partial<DOMRect>) {
      bounds = {
        ...bounds,
        ...nextBounds,
      };
    },
  };
}

function makeStageEvent(
  pointer: { x: number; y: number } | null,
  name = 'canvas-background',
  evtOverrides: Partial<MouseEvent> = {},
): CanvasPointerEvent {
  const isCanvasSurface =
    name === 'canvas-background' ||
    name === 'canvas-surface' ||
    name === 'canvas-backdrop';
  const nativeEvent = {
    button: 0,
    buttons: 1,
    clientX: pointer?.x ?? 0,
    clientY: pointer?.y ?? 0,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    timeStamp: 0,
    detail: 1,
    ...evtOverrides,
  } as MouseEvent;
  return {
    viewportPointer: pointer,
    nativeEvent,
    stopPropagation() {},
    isCanvasSurface,
  };
}

function createDocument(nodes: CanvasNode[] = []) {
  return {
    ...createDefaultProjectDocument(),
    nodes,
  } satisfies ProjectDocument;
}

function createHookParamsBase() {
  const stageRef = makeStageRef();

  return {
    activeTool: 'select' as CanvasTool,
    document: createDefaultProjectDocument(),
    selectedNodeIds: [] as string[],
    onGuidesChange: vi.fn(),
    onSelectNode: vi.fn(),
    onToggleSelectNode: undefined as undefined | ReturnType<typeof vi.fn>,
    onToggleSelectNodes: undefined as undefined | ReturnType<typeof vi.fn>,
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
      document: createDocument([item]),
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleStageMouseDown(makeStageEvent({ x: 10, y: 10 }));
    });

    expect(params.onSelectNode).toHaveBeenCalledWith(undefined);
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
      document: createDocument([item]),
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

  it('commits an active drag on window mouseup even when the release stays inside the stage', () => {
    const stageRef = makeStageRef();
    stageRef.setBounds({ right: 1000, bottom: 1000, width: 1000, height: 1000 });
    const item = createRectangleItem({
      x: 200,
      y: 120,
      width: 240,
      height: 120,
    });
    const params = createHookParams({
      document: createDocument([item]),
      stageRef: stageRef.ref,
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.beginDrag(item, { x: 300, y: 180 });
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          clientX: 420,
          clientY: 210,
        }),
      );
    });

    expect(params.onUpdateItem).toHaveBeenCalledWith(
      item.id,
      expect.objectContaining({
        x: 320,
        y: 150,
      }),
    );
    expect(result.current.session).toBeNull();
  });

  it('commits resize geometry using the solver output', () => {
    const item = createRectangleItem({
      x: 200,
      y: 120,
      width: 240,
      height: 120,
    });
    const params = createHookParams({
      document: createDocument([item]),
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
      document: createDocument([item]),
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
      selectedNodeIds: [first.id, second.id],
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
      selectedNodeIds: [first.id, second.id],
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

  it('resizes a rotated group using the rotated frame axes', () => {
    const first = createRectangleItem({ x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ x: 220, y: 100, width: 80, height: 40 });
    const params = createHookParams({
      document: createDocument([first, second]),
      selectedNodeIds: [first.id, second.id],
      onUpdateItems: vi.fn(),
    });
    const { result, rerender } = renderHook((hookParams) => useCanvasInteractionSession(hookParams), {
      initialProps: params,
    });
    const bounds = result.current.renderedGroupBounds!;
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

    act(() => {
      result.current.beginGroupRotate({ x: center.x, y: center.y - 100 });
    });
    act(() => {
      result.current.handleStageMouseUp(makeStageEvent({ x: center.x + 100, y: center.y }, 'shape'));
    });

    const rotationUpdates = params.onUpdateItems!.mock.calls.at(-1)?.[0] as Array<{
      itemId: string;
      changes: Partial<CanvasItem>;
    }>;
    const rotatedItems = [first, second].map((item) => ({
      ...item,
      ...(rotationUpdates.find((entry) => entry.itemId === item.id)?.changes ?? {}),
    } as CanvasItem));

    rerender({ ...params, document: createDocument(rotatedItems) });
    const rotatedFrame = result.current.renderedSelectionFrame;
    if (!rotatedFrame) {
      throw new Error('Expected a committed rotated selection frame.');
    }

    act(() => {
      result.current.beginGroupResize('middle-right', {
        x: center.x,
        y: center.y + bounds.width / 2,
      });
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: center.x,
          clientY: center.y + bounds.width / 2 + 80,
        })
      );
    });

    const session = result.current.session;
    expect(session?.kind).toBe('group-resize');
    if (session?.kind !== 'group-resize') {
      throw new Error('Expected a group-resize session.');
    }

    const resizedFrame = getSelectionFrameForRotation(
      session.previewItems,
      rotatedFrame.rotation,
      {
        x: rotatedFrame.bounds.x + rotatedFrame.bounds.width / 2,
        y: rotatedFrame.bounds.y + rotatedFrame.bounds.height / 2,
      }
    );
    if (!resizedFrame) {
      throw new Error('Expected a resized selection frame.');
    }
    session.previewItems.forEach((item, index) => {
      const expected = mapPointBetweenFrames(
        { x: rotatedItems[index].x, y: rotatedItems[index].y },
        rotatedFrame,
        resizedFrame
      );
      expect(item.x).toBeCloseTo(expected.x, 5);
      expect(item.y).toBeCloseTo(expected.y, 5);
    });
  });

  it('keeps rotated group preview frames aligned across all resize handles', () => {
    const handles = [
      'top-left',
      'top-center',
      'top-right',
      'middle-left',
      'middle-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
    ] as const;
    const first = createRectangleItem({ x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ x: 220, y: 100, width: 80, height: 40 });

    for (const handle of handles) {
      const params = createHookParams({
        document: createDocument([first, second]),
        selectedNodeIds: [first.id, second.id],
        onUpdateItems: vi.fn(),
      });
      const { result, rerender, unmount } = renderHook((hookParams) => useCanvasInteractionSession(hookParams), {
        initialProps: params,
      });
      const bounds = result.current.renderedGroupBounds!;
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

      act(() => {
        result.current.beginGroupRotate({ x: center.x, y: center.y - 100 });
      });
      act(() => {
        result.current.handleStageMouseUp(makeStageEvent({ x: center.x + 100, y: center.y }, 'shape'));
      });

      const rotationUpdates = params.onUpdateItems!.mock.calls.at(-1)?.[0] as Array<{
        itemId: string;
        changes: Partial<CanvasItem>;
      }>;
      const rotatedItems = [first, second].map((item) => ({
        ...item,
        ...(rotationUpdates.find((entry) => entry.itemId === item.id)?.changes ?? {}),
      } as CanvasItem));

      rerender({ ...params, document: createDocument(rotatedItems) });
      const rotatedFrame = result.current.renderedSelectionFrame;
      if (!rotatedFrame) {
        throw new Error(`Expected a committed rotated selection frame for ${handle}.`);
      }

      const rotatedCenter = {
        x: rotatedFrame.bounds.x + rotatedFrame.bounds.width / 2,
        y: rotatedFrame.bounds.y + rotatedFrame.bounds.height / 2,
      };
      const handleStart = rotatePoint(
        {
          x: rotatedCenter.x + (handle.includes('left') ? -rotatedFrame.bounds.width / 2 : handle.includes('right') ? rotatedFrame.bounds.width / 2 : 0),
          y: rotatedCenter.y + (handle.includes('top') ? -rotatedFrame.bounds.height / 2 : handle.includes('bottom') ? rotatedFrame.bounds.height / 2 : 0),
        },
        rotatedCenter,
        rotatedFrame.rotation
      );
      const resizeTarget = rotatePoint(
        {
          x: handleStart.x + (handle.includes('left') ? -40 : handle.includes('right') ? 40 : 0),
          y: handleStart.y + (handle.includes('top') ? -30 : handle.includes('bottom') ? 30 : 0),
        },
        handleStart,
        rotatedFrame.rotation
      );

      act(() => {
        result.current.beginGroupResize(handle, handleStart);
      });
      act(() => {
        window.dispatchEvent(
          new MouseEvent('mousemove', {
            clientX: resizeTarget.x,
            clientY: resizeTarget.y,
          })
        );
      });

      const session = result.current.session;
      expect(session?.kind, `Expected a group-resize session for ${handle}.`).toBe('group-resize');
      if (session?.kind !== 'group-resize') {
        unmount();
        continue;
      }

      const frame = getSelectionFrameForRotation(
        session.previewItems,
        rotatedFrame.rotation,
        {
          x: rotatedFrame.bounds.x + rotatedFrame.bounds.width / 2,
          y: rotatedFrame.bounds.y + rotatedFrame.bounds.height / 2,
        }
      );
      expect(frame, `Expected a preview frame for ${handle}.`).toBeTruthy();
      unmount();
    }
  });

  it('preserves the logical rotated group frame after a resize commit', () => {
    const first = createRectangleItem({ x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ x: 220, y: 100, width: 80, height: 40 });
    const params = createHookParams({
      document: createDocument([first, second]),
      selectedNodeIds: [first.id, second.id],
      onUpdateItems: vi.fn(),
    });
    const { result, rerender } = renderHook((hookParams) => useCanvasInteractionSession(hookParams), {
      initialProps: params,
    });
    const bounds = result.current.renderedGroupBounds!;
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

    act(() => {
      result.current.beginGroupRotate({ x: center.x, y: center.y - 100 });
    });
    act(() => {
      result.current.handleStageMouseUp(makeStageEvent({ x: center.x + 100, y: center.y }, 'shape'));
    });

    const rotationUpdates = params.onUpdateItems!.mock.calls.at(-1)?.[0] as Array<{
      itemId: string;
      changes: Partial<CanvasItem>;
    }>;
    const rotatedItems = [first, second].map((item) => ({
      ...item,
      ...(rotationUpdates.find((entry) => entry.itemId === item.id)?.changes ?? {}),
    } as CanvasItem));

    rerender({ ...params, document: createDocument(rotatedItems) });

    act(() => {
      result.current.beginGroupResize('middle-right', {
        x: center.x,
        y: center.y + bounds.width / 2,
      });
    });
    act(() => {
      result.current.handleStageMouseUp(
        makeStageEvent({ x: center.x, y: center.y + bounds.width / 2 + 80 }, 'shape')
      );
    });

    const resizeUpdates = params.onUpdateItems!.mock.calls.at(-1)?.[0] as Array<{
      itemId: string;
      changes: Partial<CanvasItem>;
    }>;
    const resizedItems = rotatedItems.map((item) => ({
      ...item,
      ...(resizeUpdates.find((entry) => entry.itemId === item.id)?.changes ?? {}),
    } as CanvasItem));

    rerender({ ...params, document: createDocument(resizedItems) });

    expect(result.current.renderedSelectionFrame).toEqual(
      getSelectionFrameForRotation(
        resizedItems,
        90,
        center
      )
    );
  });


  it('commits only the dragged line endpoint', () => {
    const item = createLineItem({
      startX: 160,
      startY: 160,
      endX: 400,
      endY: 184,
    });
    const params = createHookParams({
      document: createDocument([item]),
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
      document: createDocument([item, sibling]),
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

  it('ignores window mousemove while the pointer remains inside the stage bounds for stage-owned drags', () => {
    const stageRef = makeStageRef();
    stageRef.setBounds({ right: 1000, bottom: 1000, width: 1000, height: 1000 });
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
      document: createDocument([item, sibling]),
      stageRef: stageRef.ref,
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.beginDrag(item, { x: 300, y: 180 });
    });

    params.onGuidesChange.mockClear();

    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 584,
          clientY: 180,
        }),
      );
    });

    expect(result.current.session?.kind).toBe('drag');
    if (result.current.session?.kind !== 'drag') {
      throw new Error('Expected drag session.');
    }
    expect(result.current.session.previewItem).toMatchObject({
      x: 200,
      y: 120,
    });
    expect(params.onGuidesChange).not.toHaveBeenCalled();
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

  it('toggles marquee hits when shift-selecting across multiple items', () => {
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 220, y: 100, width: 80, height: 40 });
    const params = createHookParams({
      document: createDocument([first, second]),
      onToggleSelectNodes: vi.fn(),
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleStageMouseDown({
        ...makeStageEvent({ x: 90, y: 90 }),
        nativeEvent: { ...makeStageEvent({ x: 90, y: 90 }).nativeEvent, shiftKey: true } as MouseEvent,
      });
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 320,
          clientY: 180,
        })
      );
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          clientX: 320,
          clientY: 180,
        })
      );
    });

    expect(params.onToggleSelectNodes).toHaveBeenCalledWith([first.id, second.id]);
  });

  it('clears a pending marquee without committing when the pointer never moves', () => {
    const params = createHookParams();
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleStageMouseDown(makeStageEvent({ x: 10, y: 10 }));
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          clientX: 10,
          clientY: 10,
        })
      );
    });

    expect(result.current.session).toBeNull();
    expect(params.onGuidesChange).toHaveBeenLastCalledWith([]);
  });

  it('clears a pending marquee on stage mouseup when the release stays inside the stage', () => {
    const stageRef = makeStageRef();
    stageRef.setBounds({ right: 1000, bottom: 1000, width: 1000, height: 1000 });
    const params = createHookParams({
      stageRef: stageRef.ref,
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleStageMouseDown(makeStageEvent({ x: 10, y: 10 }));
    });
    act(() => {
      result.current.handleStageMouseUp(makeStageEvent({ x: 10, y: 10 }));
    });

    expect(result.current.session).toBeNull();
    expect(params.onGuidesChange).toHaveBeenLastCalledWith([]);
  });

  it('locks drag motion to a dominant axis while shift is held', () => {
    const item = createRectangleItem({
      x: 200,
      y: 120,
      width: 120,
      height: 80,
    });
    const params = createHookParams({
      document: createDocument([item]),
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.beginDrag(item, { x: 220, y: 140 });
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 320,
          clientY: 200,
          shiftKey: true,
        })
      );
    });

    expect(result.current.session?.kind).toBe('drag');
    if (result.current.session?.kind !== 'drag') {
      throw new Error('Expected drag session.');
    }
    expect(result.current.session.axisLock).toBe('x');
    expect(result.current.session.previewItem).toMatchObject({
      x: 300,
      y: 120,
    });
  });

  it('prefers explicit pointer-move modifier state over previously tracked keyboard state', () => {
    const item = createRectangleItem({
      x: 200,
      y: 120,
      width: 120,
      height: 80,
    });
    const params = createHookParams({
      document: createDocument([item]),
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Shift',
          shiftKey: true,
        }),
      );
    });
    act(() => {
      result.current.beginDrag(item, { x: 220, y: 140 });
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 320,
          clientY: 200,
          shiftKey: false,
        }),
      );
    });

    expect(result.current.session?.kind).toBe('drag');
    if (result.current.session?.kind !== 'drag') {
      throw new Error('Expected drag session.');
    }
    expect(result.current.session.axisLock).toBeUndefined();
    expect(result.current.session.previewItem).toMatchObject({
      x: 300,
      y: 180,
    });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keyup', {
          key: 'Shift',
        }),
      );
    });
  });

  it('updates overlay-owned drags from window mousemove events that stay inside the stage', () => {
    const stageRef = makeStageRef();
    stageRef.setBounds({ right: 1000, bottom: 1000, width: 1000, height: 1000 });
    const item = createRectangleItem({
      x: 200,
      y: 120,
      width: 120,
      height: 80,
    });
    const params = createHookParams({
      document: createDocument([item]),
      stageRef: stageRef.ref,
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.beginDrag(item, { x: 220, y: 140 }, 'overlay');
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 320,
          clientY: 200,
          shiftKey: true,
        }),
      );
    });

    expect(result.current.session?.kind).toBe('drag');
    if (result.current.session?.kind !== 'drag') {
      throw new Error('Expected drag session.');
    }
    expect(result.current.session.axisLock).toBe('x');
    expect(result.current.session.previewItem).toMatchObject({
      x: 300,
      y: 120,
    });
  });

  it('updates overlay-owned resize sessions from window mousemove events that stay inside the stage', () => {
    const stageRef = makeStageRef();
    stageRef.setBounds({ right: 1000, bottom: 1000, width: 1000, height: 1000 });
    const item = createRectangleItem({
      x: 200,
      y: 120,
      width: 120,
      height: 80,
    });
    const params = createHookParams({
      document: createDocument([item]),
      stageRef: stageRef.ref,
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));
    const handlePoint = getShapeHandlePoints(item)['middle-right'];

    act(() => {
      result.current.beginResize(item, 'middle-right', handlePoint, 'overlay');
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 420,
          clientY: 160,
        }),
      );
    });

    expect(result.current.session?.kind).toBe('resize');
    if (result.current.session?.kind !== 'resize') {
      throw new Error('Expected resize session.');
    }
    expect(result.current.session.previewItem).toMatchObject({
      width: expect.any(Number),
    });
    expect(result.current.session.previewItem.width).toBeGreaterThan(item.width);
  });

  it('disables snapping while ctrl-dragging', () => {
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
      document: createDocument([item, sibling]),
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
          ctrlKey: true,
        })
      );
    });

    expect(result.current.session?.kind).toBe('drag');
    if (result.current.session?.kind !== 'drag') {
      throw new Error('Expected drag session.');
    }
    expect(result.current.session.previewItem).toMatchObject({
      x: 484,
    });
    expect(result.current.session.guides).toEqual([]);
  });

  it('toggles selection instead of dragging when shift-clicking an item', () => {
    const item = createRectangleItem({ id: 'toggle-me' });
    const params = createHookParams({
      document: createDocument([item]),
      onToggleSelectNode: vi.fn(),
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleItemPointerDown(item, item.id, { x: 10, y: 20 }, true);
    });

    expect(params.onToggleSelectNode).toHaveBeenCalledWith(item.id);
    expect(result.current.session).toBeNull();
  });

  it('starts dragging instead of toggling when shift is held on an already-selected item', () => {
    const item = createRectangleItem({ id: 'selected-item', x: 200, y: 120, width: 120, height: 80 });
    const params = createHookParams({
      document: createDocument([item]),
      selectedNodeIds: [item.id],
      onToggleSelectNode: vi.fn(),
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleItemPointerDown(item, item.id, { x: 220, y: 140 }, true);
    });

    expect(params.onToggleSelectNode).not.toHaveBeenCalled();
    expect(result.current.session).toBeNull();

    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 320,
          clientY: 200,
          shiftKey: true,
        }),
      );
    });

    expect(params.onToggleSelectNode).not.toHaveBeenCalled();
    expect(result.current.session?.kind).toBe('drag');

  });

  it('toggles selection on mouseup when shift-clicking an already-selected item without dragging', () => {
    const item = createRectangleItem({ id: 'selected-item', x: 200, y: 120, width: 120, height: 80 });
    const params = createHookParams({
      document: createDocument([item]),
      selectedNodeIds: [item.id],
      onToggleSelectNode: vi.fn(),
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleItemPointerDown(item, item.id, { x: 220, y: 140 }, true);
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          clientX: 220,
          clientY: 140,
        }),
      );
    });

    expect(params.onToggleSelectNode).toHaveBeenCalledWith(item.id);
    expect(result.current.session).toBeNull();
  });

  it('starts a group drag when clicking an already-selected item in a multi-selection', () => {
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 220, y: 100, width: 80, height: 40 });
    const params = createHookParams({
      document: createDocument([first, second]),
      selectedNodeIds: [first.id, second.id],
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleItemPointerDown(first, first.id, { x: 120, y: 120 }, false);
    });

    expect(result.current.session?.kind).toBe('group-drag');
  });

  it('selects a group without committing movement when clicking grouped content that is not already selected', () => {
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 220, y: 100, width: 80, height: 40 });
    const group = createGroupNode([first, second], 'Poster Group');
    group.id = 'group-1';
    const params = createHookParams({
      document: createDocument([group]),
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleItemPointerDown(first, group.id, { x: 120, y: 120 }, false);
    });

    expect(params.onSelectNode).toHaveBeenCalledWith(group.id);
    expect(result.current.session?.kind).toBe('group-drag');

    act(() => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          clientX: 120,
          clientY: 120,
        }),
      );
    });

    expect(params.onUpdateItem).not.toHaveBeenCalled();
    expect(result.current.session).toBeNull();
  });

  it('starts a pickup drag for an unselected leaf item after the pointer moves', () => {
    const item = createRectangleItem({ id: 'pickup-item', x: 100, y: 100, width: 80, height: 40 });
    let params = createHookParams({
      document: createDocument([item]),
    });
    const { result, rerender } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleItemPointerDown(item, item.id, { x: 120, y: 120 }, false);
    });

    expect(params.onSelectNode).toHaveBeenCalledWith(item.id);
    expect(result.current.session?.kind).toBe('drag');

    params = {
      ...params,
      selectedNodeIds: [item.id],
    };

    rerender();

    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 150,
          clientY: 145,
        }),
      );
    });

    expect(result.current.session?.kind).toBe('drag');
  });

  it('starts a pickup drag for an unselected group after the pointer moves', () => {
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 220, y: 100, width: 80, height: 40 });
    const group = createGroupNode([first, second], 'Poster Group');
    group.id = 'group-1';
    let params = createHookParams({
      document: createDocument([group]),
    });
    const { result, rerender } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleItemPointerDown(first, group.id, { x: 120, y: 120 }, false);
    });

    expect(params.onSelectNode).toHaveBeenCalledWith(group.id);
    expect(result.current.session?.kind).toBe('group-drag');

    params = {
      ...params,
      selectedNodeIds: [group.id],
    };

    rerender();

    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 160,
          clientY: 150,
        }),
      );
    });

    expect(result.current.session?.kind).toBe('group-drag');
  });

  it('commits a pickup drag for an unselected leaf item on mouseup when move events were missed', () => {
    const item = createRectangleItem({ id: 'pickup-item', x: 100, y: 100, width: 80, height: 40 });
    let params = createHookParams({
      document: createDocument([item]),
    });
    const { result, rerender } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleItemPointerDown(item, item.id, { x: 120, y: 120 }, false);
    });

    params = {
      ...params,
      selectedNodeIds: [item.id],
    };
    rerender();

    act(() => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          clientX: 170,
          clientY: 150,
        }),
      );
    });

    expect(params.onUpdateItem).toHaveBeenCalledWith(
      item.id,
      expect.objectContaining({
        x: 150,
        y: 130,
      }),
    );
  });

  it('commits a pickup drag for an unselected group on mouseup when move events were missed', () => {
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 220, y: 100, width: 80, height: 40 });
    const group = createGroupNode([first, second], 'Poster Group');
    group.id = 'group-1';
    let params = createHookParams({
      document: createDocument([group]),
    });
    const { result, rerender } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleItemPointerDown(first, group.id, { x: 120, y: 120 }, false);
    });

    params = {
      ...params,
      selectedNodeIds: [group.id],
    };
    rerender();

    act(() => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          clientX: 180,
          clientY: 150,
        }),
      );
    });

    expect(params.onUpdateItem).toHaveBeenCalledTimes(2);
    expect(params.onUpdateItem).toHaveBeenNthCalledWith(
      1,
      first.id,
      expect.objectContaining({
        x: 160,
        y: 130,
      }),
    );
    expect(params.onUpdateItem).toHaveBeenNthCalledWith(
      2,
      second.id,
      expect.objectContaining({
        x: 280,
        y: 130,
      }),
    );
  });

  it('uses the outermost group as the selectable target before drill-in for nested groups', () => {
    const first = createRectangleItem({ id: 'first' });
    const second = createRectangleItem({ id: 'second' });
    const third = createRectangleItem({ id: 'third' });
    const fourth = createRectangleItem({ id: 'fourth' });
    const leftGroup = createGroupNode([first, second], 'Left');
    leftGroup.id = 'left-group';
    const rightGroup = createGroupNode([third, fourth], 'Right');
    rightGroup.id = 'right-group';
    const parentGroup = createGroupNode([leftGroup, rightGroup], 'Parent');
    parentGroup.id = 'parent-group';
    const params = createHookParams({
      document: createDocument([parentGroup]),
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    const selectableById = new Map(
      result.current.renderedItems.map((item) => [item.id, item.selectableNodeId]),
    );

    expect(selectableById.get(first.id)).toBe(parentGroup.id);
    expect(selectableById.get(fourth.id)).toBe(parentGroup.id);
  });

  it('makes sibling leaves directly selectable when editing a child inside a group', () => {
    const first = createRectangleItem({ id: 'first' });
    const second = createRectangleItem({ id: 'second' });
    const nestedLeaf = createRectangleItem({ id: 'nested-leaf' });
    const nestedGroup = createGroupNode([nestedLeaf], 'Nested');
    nestedGroup.id = 'nested-group';
    const group = createGroupNode([first, second, nestedGroup], 'Outer');
    group.id = 'outer-group';
    const params = createHookParams({
      document: createDocument([group]),
      selectedNodeIds: [first.id],
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    const selectableById = new Map(
      result.current.renderedItems.map((item) => [item.id, item.selectableNodeId]),
    );

    expect(selectableById.get(first.id)).toBe(first.id);
    expect(selectableById.get(second.id)).toBe(second.id);
    expect(selectableById.get(nestedLeaf.id)).toBe(nestedGroup.id);
  });

  it('computes rendered bounds for multi-group selections and drilled-in child editing', () => {
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 40, height: 30 });
    const second = createRectangleItem({ id: 'second', x: 180, y: 100, width: 40, height: 30 });
    const third = createRectangleItem({ id: 'third', x: 320, y: 140, width: 50, height: 30 });
    const fourth = createRectangleItem({ id: 'fourth', x: 420, y: 140, width: 50, height: 30 });
    const leftGroup = createGroupNode([first, second], 'Left');
    leftGroup.id = 'left-group';
    const rightGroup = createGroupNode([third, fourth], 'Right');
    rightGroup.id = 'right-group';
    const document = createDocument([leftGroup, rightGroup]);

    const { result, rerender } = renderHook(
      (hookParams) => useCanvasInteractionSession(hookParams),
      {
        initialProps: createHookParams({
          document,
          selectedNodeIds: [leftGroup.id, rightGroup.id],
        }),
      },
    );

    expect(result.current.renderedGroupBounds).toEqual({
      x: 100,
      y: 100,
      width: 370,
      height: 70,
    });

    rerender(
      createHookParams({
        document,
        selectedNodeIds: [first.id],
      }),
    );

    expect(result.current.renderedGroupBounds).toEqual({
      x: 100,
      y: 100,
      width: 40,
      height: 30,
    });
  });

  it('does not drill into the next descendant on single click when a group is selected', () => {
    const nestedLeaf = createRectangleItem({ id: 'nested-leaf' });
    const nestedGroup = createGroupNode([nestedLeaf], 'Nested');
    nestedGroup.id = 'nested-group';
    const outerGroup = createGroupNode([nestedGroup], 'Outer');
    outerGroup.id = 'outer-group';
    const params = createHookParams({
      document: createDocument([outerGroup]),
      selectedNodeIds: [outerGroup.id],
    });
    const { result } = renderHook(
      (hookParams) => useCanvasInteractionSession(hookParams),
      { initialProps: params },
    );

    act(() => {
      result.current.handleItemPointerDown(nestedLeaf, nestedGroup.id, { x: 120, y: 120 }, false);
    });

    expect(params.onSelectNode).not.toHaveBeenCalled();
    expect(result.current.lastDrilldownSource).toBeNull();
  });

  it('treats stage-surface descendant single-click as a no-op when a group is selected', () => {
    const nestedLeaf = createRectangleItem({
      id: 'nested-leaf',
      x: 340,
      y: 180,
      width: 130,
      height: 76,
    });
    const nestedGroup = createGroupNode([nestedLeaf], 'Nested');
    nestedGroup.id = 'nested-group';
    const outerGroup = createGroupNode([nestedGroup], 'Outer');
    outerGroup.id = 'outer-group';
    const params = createHookParams({
      document: createDocument([outerGroup]),
      selectedNodeIds: [outerGroup.id],
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleStageMouseDown(
        makeStageEvent({ x: 360, y: 200 }, 'canvas-background'),
      );
    });

    expect(params.onSelectNode).not.toHaveBeenCalled();
    expect(result.current.session).toBeNull();
    expect(result.current.lastDrilldownSource).toBeNull();
  });

  it('treats selected-group descendant drag as group movement instead of drill-in', () => {
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 220, y: 100, width: 80, height: 40 });
    const group = createGroupNode([first, second], 'Poster Group');
    group.id = 'group-1';
    const params = createHookParams({
      document: createDocument([group]),
      selectedNodeIds: [group.id],
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleItemPointerDown(first, first.id, { x: 120, y: 120 }, false);
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 160,
          clientY: 150,
        }),
      );
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          clientX: 160,
          clientY: 150,
        }),
      );
    });

    expect(params.onSelectNode).not.toHaveBeenCalled();
    expect(result.current.lastDrilldownSource).toBeNull();
    expect(params.onUpdateItem).toHaveBeenCalledTimes(2);
    expect(params.onUpdateItem).toHaveBeenNthCalledWith(
      1,
      first.id,
      expect.objectContaining({
        x: 140,
        y: 130,
      }),
    );
    expect(params.onUpdateItem).toHaveBeenNthCalledWith(
      2,
      second.id,
      expect.objectContaining({
        x: 260,
        y: 130,
      }),
    );
  });

  it('drills into the next descendant on item double-click when a group is selected', () => {
    const nestedLeaf = createRectangleItem({ id: 'nested-leaf' });
    const nestedGroup = createGroupNode([nestedLeaf], 'Nested');
    nestedGroup.id = 'nested-group';
    const outerGroup = createGroupNode([nestedGroup], 'Outer');
    outerGroup.id = 'outer-group';
    const params = createHookParams({
      document: createDocument([outerGroup]),
      selectedNodeIds: [outerGroup.id],
    });
    const { result, rerender } = renderHook(
      (hookParams) => useCanvasInteractionSession(hookParams),
      { initialProps: params },
    );

    act(() => {
      result.current.handleItemPointerDown(
        nestedLeaf,
        nestedGroup.id,
        { x: 120, y: 120 },
        false,
        new MouseEvent('mousedown', { button: 0, clientX: 120, clientY: 120 }),
      );
    });
    act(() => {
      result.current.handleItemPointerDown(
        nestedLeaf,
        nestedGroup.id,
        { x: 120, y: 120 },
        false,
        new MouseEvent('mousedown', { button: 0, clientX: 120, clientY: 120 }),
      );
    });

    act(() => {
      result.current.handleItemDoubleClick(nestedLeaf);
    });

    expect(params.onSelectNode).toHaveBeenCalledWith(nestedGroup.id);
    expect(result.current.lastDrilldownSource).toBe('item-hit');

    const innerParams = {
      ...params,
      onSelectNode: vi.fn(),
      selectedNodeIds: [nestedGroup.id],
    };
    rerender(innerParams);

    act(() => {
      result.current.handleItemPointerDown(
        nestedLeaf,
        nestedLeaf.id,
        { x: 120, y: 120 },
        false,
        new MouseEvent('mousedown', { button: 0, clientX: 120, clientY: 120 }),
      );
    });
    act(() => {
      result.current.handleItemPointerDown(
        nestedLeaf,
        nestedLeaf.id,
        { x: 120, y: 120 },
        false,
        new MouseEvent('mousedown', { button: 0, clientX: 120, clientY: 120 }),
      );
    });

    act(() => {
      result.current.handleItemDoubleClick(nestedLeaf);
    });

    expect(innerParams.onSelectNode).toHaveBeenCalledWith(nestedLeaf.id);
    expect(result.current.lastDrilldownSource).toBe('item-hit');
  });

  it('drills into the next descendant on stage-surface fallback double-click when a group is selected', () => {
    const nestedLeaf = createRectangleItem({
      id: 'nested-leaf',
      x: 340,
      y: 180,
      width: 130,
      height: 76,
    });
    const nestedGroup = createGroupNode([nestedLeaf], 'Nested');
    nestedGroup.id = 'nested-group';
    const outerGroup = createGroupNode([nestedGroup], 'Outer');
    outerGroup.id = 'outer-group';
    const params = createHookParams({
      document: createDocument([outerGroup]),
      selectedNodeIds: [outerGroup.id],
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleStageMouseDown(
        makeStageEvent({ x: 360, y: 200 }, 'canvas-background', { detail: 1, timeStamp: 10 }),
      );
    });

    act(() => {
      result.current.handleStageMouseDown(
        makeStageEvent({ x: 360, y: 200 }, 'canvas-background', { detail: 2, timeStamp: 120 }),
      );
    });

    expect(params.onSelectNode).toHaveBeenCalledWith(nestedGroup.id);
    expect(result.current.lastDrilldownSource).toBe('stage-surface');
  });

  it('keeps grouped-image double-click drill-in precedence before entering crop mode', () => {
    const groupedImage = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 90,
    });
    groupedImage.id = 'grouped-image';
    const group = createGroupNode([groupedImage], 'Images');
    group.id = 'image-group';
    const params = createHookParams({
      document: createDocument([group]),
      selectedNodeIds: [group.id],
    });
    const { result, rerender } = renderHook(
      (hookParams) => useCanvasInteractionSession(hookParams),
      { initialProps: params },
    );

    act(() => {
      result.current.handleItemPointerDown(
        groupedImage,
        groupedImage.id,
        { x: 140, y: 140 },
        false,
        new MouseEvent('mousedown', { button: 0, clientX: 140, clientY: 140 }),
      );
    });
    act(() => {
      result.current.handleItemPointerDown(
        groupedImage,
        groupedImage.id,
        { x: 140, y: 140 },
        false,
        new MouseEvent('mousedown', { button: 0, clientX: 140, clientY: 140 }),
      );
    });
    act(() => {
      result.current.handleItemDoubleClick(groupedImage);
    });

    expect(params.onSelectNode).toHaveBeenCalledWith(groupedImage.id);
    expect(result.current.cropSession).toBeNull();

    const selectedImageParams = {
      ...params,
      onSelectNode: vi.fn(),
      selectedNodeIds: [groupedImage.id],
    };
    rerender(selectedImageParams);

    act(() => {
      result.current.handleItemPointerDown(
        groupedImage,
        groupedImage.id,
        { x: 140, y: 140 },
        false,
        new MouseEvent('mousedown', { button: 0, clientX: 140, clientY: 140 }),
      );
    });
    act(() => {
      result.current.handleItemPointerDown(
        groupedImage,
        groupedImage.id,
        { x: 140, y: 140 },
        false,
        new MouseEvent('mousedown', { button: 0, clientX: 140, clientY: 140 }),
      );
    });
    act(() => {
      result.current.handleItemDoubleClick(groupedImage);
    });

    expect(selectedImageParams.onSelectNode).not.toHaveBeenCalled();
    expect(result.current.cropSession).toMatchObject({
      itemId: groupedImage.id,
      crop: groupedImage.crop,
    });
  });

  it('enters crop mode from a selected image double-click without requiring custom pointer cadence samples', () => {
    const image = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 90,
    });
    image.id = 'selected-image';
    const params = createHookParams({
      document: createDocument([image]),
      selectedNodeIds: [image.id],
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleItemDoubleClick(image);
    });

    expect(result.current.cropSession).toMatchObject({
      itemId: image.id,
      crop: image.crop,
    });
  });

  it('enters crop mode when a direct image double-click outruns the selection rerender', () => {
    const image = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 90,
    });
    image.id = 'stale-selection-image';
    const params = createHookParams({
      document: createDocument([image]),
      selectedNodeIds: [],
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleItemPointerDown(
        image,
        image.id,
        { x: 140, y: 140 },
        false,
        new MouseEvent('mousedown', { button: 0, clientX: 140, clientY: 140 }),
      );
    });
    act(() => {
      result.current.handleItemDoubleClick(image);
    });

    expect(params.onSelectNode).toHaveBeenCalledWith(image.id);
    expect(result.current.cropSession).toMatchObject({
      itemId: image.id,
      crop: image.crop,
    });
  });

  it('cancels crop mode on Escape before selection-climb behavior can run', () => {
    const image = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 90,
    });
    image.id = 'selected-image';
    const params = createHookParams({
      document: createDocument([image]),
      selectedNodeIds: [image.id],
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleItemPointerDown(
        image,
        image.id,
        { x: 140, y: 140 },
        false,
        new MouseEvent('mousedown', { button: 0, clientX: 140, clientY: 140 }),
      );
    });
    act(() => {
      result.current.handleItemPointerDown(
        image,
        image.id,
        { x: 140, y: 140 },
        false,
        new MouseEvent('mousedown', { button: 0, clientX: 140, clientY: 140 }),
      );
    });
    act(() => {
      result.current.handleItemDoubleClick(image);
    });

    expect(result.current.cropSession).not.toBeNull();

    act(() => {
      window.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(result.current.cropSession).toBeNull();
    expect(params.onUpdateItem).not.toHaveBeenCalled();
  });

  it('keeps the crop frame fixed while crop-mode rotation changes only the source transform', () => {
    const image = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 90,
      x: 520,
      y: 320,
      width: 160,
      height: 90,
    });
    image.id = 'crop-rotate-image';
    image.crop = {
      x: 20,
      y: 10,
      width: 100,
      height: 60,
    };
    const params = createHookParams({
      document: createDocument([image]),
      selectedNodeIds: [image.id],
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleItemDoubleClick(image);
    });

    const initialCropSession = result.current.cropSession;
    expect(initialCropSession).not.toBeNull();
    if (!initialCropSession) {
      throw new Error('Expected crop session to be active.');
    }

    const rotater = getShapeHandlePoints(initialCropSession.fullImageItem).rotater;
    const fullImageCenter = {
      x: initialCropSession.fullImageItem.x + initialCropSession.fullImageItem.width / 2,
      y: initialCropSession.fullImageItem.y + initialCropSession.fullImageItem.height / 2,
    };

    act(() => {
      result.current.beginCropFullRotate(rotater);
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: fullImageCenter.x + initialCropSession.fullImageItem.width / 2 + 40,
          clientY: fullImageCenter.y,
        }),
      );
    });

    expect(result.current.cropSession?.previewItem.x).toBe(initialCropSession.previewItem.x);
    expect(result.current.cropSession?.previewItem.y).toBe(initialCropSession.previewItem.y);
    expect(result.current.cropSession?.previewItem.width).toBe(initialCropSession.previewItem.width);
    expect(result.current.cropSession?.previewItem.height).toBe(initialCropSession.previewItem.height);
    expect(result.current.cropSession?.previewItem.rotation).toBe(image.rotation);
    expect(Math.abs(result.current.cropSession?.previewItem.sourceTransform.rotation ?? 0)).toBeGreaterThan(10);
    expect(Math.abs(result.current.cropSession?.fullImageItem.rotation ?? 0)).toBeGreaterThan(10);

    act(() => {
      result.current.commitCropSession();
    });

    expect(params.onUpdateItem).toHaveBeenCalledWith(
      image.id,
      expect.objectContaining({
        rotation: image.rotation,
        sourceTransform: expect.objectContaining({
          rotation: expect.any(Number),
        }),
      }),
    );
  });

  it('snaps crop-resize previews to guides and disables that snapping while ctrl is held', () => {
    const image = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 50,
      x: 20,
      y: 10,
      width: 100,
      height: 50,
    });
    image.id = 'crop-image';
    image.crop = {
      x: 20,
      y: 0,
      width: 100,
      height: 50,
    };
    const sibling = createRectangleItem({
      id: 'snap-target',
      x: 132,
      y: 0,
      width: 40,
      height: 80,
    });
    const params = createHookParams({
      document: createDocument([image, sibling]),
      selectedNodeIds: [image.id],
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.handleItemDoubleClick(image);
    });
    act(() => {
      result.current.beginCropResize('middle-right', { x: 120, y: 35 });
    });
    params.onGuidesChange.mockClear();
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 126,
          clientY: 35,
        }),
      );
    });

    expect(params.onGuidesChange).toHaveBeenCalledWith([
      { orientation: 'vertical', position: 132 },
    ]);
    expect(result.current.cropSession?.previewItem.width).toBeCloseTo(112, 10);

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 126, clientY: 35 }));
    });

    act(() => {
      result.current.beginCropResize('middle-right', { x: 132, y: 35 });
    });
    params.onGuidesChange.mockClear();
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 126,
          clientY: 35,
          ctrlKey: true,
        }),
      );
    });

    expect(params.onGuidesChange).toHaveBeenCalledWith([]);
    expect(result.current.cropSession?.previewItem.width).toBeCloseTo(106, 10);
  });

  it('snaps group drag previews and emits guides', () => {
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 220, y: 100, width: 80, height: 40 });
    const params = createHookParams({
      document: createDocument([first, second]),
      selectedNodeIds: [first.id, second.id],
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.beginGroupDrag({ x: 200, y: 120 });
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 104,
          clientY: 120,
        })
      );
    });

    expect(result.current.session?.kind).toBe('group-drag');
    if (result.current.session?.kind !== 'group-drag') {
      throw new Error('Expected group-drag session.');
    }
    expect(result.current.session.guides).toEqual([
      expect.objectContaining({
        orientation: 'vertical',
        position: 0,
      }),
    ]);
    expect(result.current.session.currentPointer).toEqual({ x: 100, y: 120 });
    expect(result.current.renderedGroupBounds).toMatchObject({
      x: 0,
      y: 100,
      width: 200,
      height: 40,
    });
  });

  it('disables group drag snapping while ctrl is held', () => {
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 220, y: 100, width: 80, height: 40 });
    const params = createHookParams({
      document: createDocument([first, second]),
      selectedNodeIds: [first.id, second.id],
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.beginGroupDrag({ x: 200, y: 120 });
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 104,
          clientY: 120,
          ctrlKey: true,
        })
      );
    });

    expect(result.current.session?.kind).toBe('group-drag');
    if (result.current.session?.kind !== 'group-drag') {
      throw new Error('Expected group-drag session.');
    }
    expect(result.current.session.guides).toEqual([]);
    expect(result.current.session.currentPointer).toEqual({ x: 104, y: 120 });
    expect(result.current.renderedGroupBounds).toMatchObject({
      x: 4,
      y: 100,
      width: 200,
      height: 40,
    });
  });

  it('snaps unrotated group resize previews and emits guides', () => {
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 220, y: 100, width: 80, height: 40 });
    const sibling = createRectangleItem({ id: 'sibling', x: 366, y: 260, width: 80, height: 40 });
    const params = createHookParams({
      document: createDocument([first, second, sibling]),
      selectedNodeIds: [first.id, second.id],
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.beginGroupResize('middle-right', { x: 300, y: 120 });
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 360,
          clientY: 120,
        })
      );
    });

    expect(result.current.session?.kind).toBe('group-resize');
    if (result.current.session?.kind !== 'group-resize') {
      throw new Error('Expected group-resize session.');
    }
    expect(result.current.session.guides).toEqual([
      expect.objectContaining({
        orientation: 'vertical',
        position: 366,
      }),
    ]);
    expect(result.current.session.currentPointer).toEqual({ x: 366, y: 120 });
    expect(result.current.renderedGroupBounds).toMatchObject({
      x: 100,
      y: 100,
      width: 266,
      height: 40,
    });
  });

  it('disables unrotated group resize snapping while ctrl is held', () => {
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 220, y: 100, width: 80, height: 40 });
    const sibling = createRectangleItem({ id: 'sibling', x: 366, y: 260, width: 80, height: 40 });
    const params = createHookParams({
      document: createDocument([first, second, sibling]),
      selectedNodeIds: [first.id, second.id],
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.beginGroupResize('middle-right', { x: 300, y: 120 });
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 360,
          clientY: 120,
          ctrlKey: true,
        })
      );
    });

    expect(result.current.session?.kind).toBe('group-resize');
    if (result.current.session?.kind !== 'group-resize') {
      throw new Error('Expected group-resize session.');
    }
    expect(result.current.session.guides).toEqual([]);
    expect(result.current.session.currentPointer).toEqual({ x: 360, y: 120 });
    expect(result.current.renderedGroupBounds).toMatchObject({
      x: 100,
      y: 100,
      width: 260,
      height: 40,
    });
  });

  it('ignores non-canvas stage mouse downs and clears selection for pan tool clicks', () => {
    const panParams = createHookParams({
      activeTool: 'pan',
    });
    const nonCanvasParams = createHookParams();

    const { result: panResult } = renderHook(() => useCanvasInteractionSession(panParams));
    const { result: nonCanvasResult } = renderHook(() => useCanvasInteractionSession(nonCanvasParams));

    act(() => {
      panResult.current.handleStageMouseDown(makeStageEvent({ x: 50, y: 60 }));
    });
    act(() => {
      nonCanvasResult.current.handleStageMouseDown(makeStageEvent({ x: 50, y: 60 }, 'shape'));
    });

    expect(panParams.onSelectNode).toHaveBeenCalledWith(undefined);
    expect(nonCanvasParams.onSelectNode).not.toHaveBeenCalled();
  });

  it('blocks group drag when any selected item is locked', () => {
    const unlocked = createRectangleItem({ id: 'unlocked', x: 100, y: 100, width: 80, height: 40 });
    const locked = createRectangleItem({ id: 'locked', x: 220, y: 100, width: 80, height: 40, locked: true });
    const params = createHookParams({
      document: createDocument([unlocked, locked]),
      selectedNodeIds: [unlocked.id, locked.id],
    });
    const { result } = renderHook(() => useCanvasInteractionSession(params));

    act(() => {
      result.current.beginGroupDrag({ x: 200, y: 120 });
    });

    expect(result.current.session).toBeNull();
  });
});
