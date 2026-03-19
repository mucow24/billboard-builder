import type { CanvasItem } from '../../document/documentTypes';
import { type ResizeHandle } from '../interactionGeometry';

import { toOverlayStyle } from './viewportMath';

interface CanvasTestHooksProps {
  beginGroupDrag: (pointer: { x: number; y: number }) => void;
  beginGroupResize: (
    handle: ResizeHandle,
    pointer: { x: number; y: number },
  ) => void;
  beginGroupRotate: (pointer: { x: number; y: number }) => void;
  beginLineHandle: (
    item: Extract<CanvasItem, { kind: 'line' }>,
    handle: 'start' | 'end',
    pointer: { x: number; y: number },
  ) => void;
  beginResize: (
    item: Exclude<CanvasItem, Extract<CanvasItem, { kind: 'line' }>>,
    handle: ResizeHandle,
    pointer: { x: number; y: number },
  ) => void;
  beginRotate: (
    item: Exclude<CanvasItem, Extract<CanvasItem, { kind: 'line' }>>,
    pointer: { x: number; y: number },
  ) => void;
  getViewportPointerFromClient: (clientX: number, clientY: number) => { x: number; y: number } | null;
  groupHandleViewportPoints: Record<string, { x: number; y: number }> | null;
  groupOverlayFrame: { rotation: number } | null;
  groupOverlayViewportRect: { left: number; top: number; width: number; height: number } | null;
  groupRotaterViewportPoint: { x: number; y: number } | null;
  handleItemPointerDown: (item: CanvasItem, pointer: { x: number; y: number }, shiftKey: boolean) => void;
  marqueeViewportRect: { left: number; top: number; width: number; height: number } | null;
  onTestEvent: (eventName: string) => void;
  selectedItemViewportRect: { left: number; top: number; width: number; height: number } | null;
  selectedLineHandleRects: Record<string, { left: number; top: number; width: number; height: number }> | null;
  selectedRenderedItem: CanvasItem | null;
  selectedShapeHandleRects: Record<string, { left: number; top: number; width: number; height: number }> | null;
  session: {
    kind: string;
    tool?: string;
    previewItem?: { kind: string; x: number; y: number; width: number; height: number };
  } | null;
  showGroupInteractionHooks: boolean;
  startPanDrag: (pointer: { x: number; y: number }) => void;
  toCanvasPointer: (pointer: { x: number; y: number }) => { x: number; y: number };
  toViewportRect: (rect: { x: number; y: number; width: number; height: number }) => {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export function CanvasTestHooks({
  beginGroupDrag,
  beginGroupResize,
  beginGroupRotate,
  beginLineHandle,
  beginResize,
  beginRotate,
  getViewportPointerFromClient,
  groupHandleViewportPoints,
  groupOverlayFrame,
  groupOverlayViewportRect,
  groupRotaterViewportPoint,
  handleItemPointerDown,
  marqueeViewportRect,
  onTestEvent,
  selectedItemViewportRect,
  selectedLineHandleRects,
  selectedRenderedItem,
  selectedShapeHandleRects,
  session,
  showGroupInteractionHooks,
  startPanDrag,
  toCanvasPointer,
  toViewportRect,
}: CanvasTestHooksProps) {
  return (
    <>
      <div
        aria-hidden="true"
        data-testid="canvas-test-previews"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 4,
        }}
      >
        {marqueeViewportRect ? (
          <div
            data-testid="canvas-marquee-preview"
            style={{
              position: 'absolute',
              opacity: 0,
              ...toOverlayStyle(marqueeViewportRect),
            }}
          />
        ) : null}
        {session?.kind === 'create' &&
        session.tool === 'text' &&
        session.previewItem &&
        session.previewItem.kind === 'text' ? (
          <div
            data-testid="canvas-text-create-preview"
            style={{
              position: 'absolute',
              opacity: 0,
              ...toOverlayStyle(
                toViewportRect({
                  x: session.previewItem.x,
                  y: session.previewItem.y,
                  width: session.previewItem.width,
                  height: session.previewItem.height,
                }),
              ),
            }}
          />
        ) : null}
      </div>
      <div
        aria-hidden="true"
        data-testid="canvas-test-hooks"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        {selectedItemViewportRect && selectedRenderedItem ? (
          <div
            data-testid="canvas-selected-item-overlay"
            onMouseDown={(event) => {
              if (event.button === 1) {
                return;
              }
              onTestEvent('selected-item-overlay');
              const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
              if (!pointer) {
                return;
              }
              handleItemPointerDown(
                selectedRenderedItem,
                toCanvasPointer(pointer),
                false,
              );
            }}
            style={{
              position: 'absolute',
              pointerEvents: 'auto',
              background: 'rgba(0, 0, 0, 0.001)',
              transform: `rotate(${selectedRenderedItem.rotation}deg)`,
              transformOrigin: 'center',
              ...toOverlayStyle(selectedItemViewportRect),
            }}
          />
        ) : null}
        {selectedShapeHandleRects
          ? Object.entries(selectedShapeHandleRects).map(([handle, rect]) => (
              <div
                key={`shape-handle-${handle}`}
                data-testid={`canvas-shape-handle-${handle}`}
                onMouseDown={(event) => {
                  if (
                    !selectedRenderedItem ||
                    selectedRenderedItem.kind === 'line' ||
                    event.button === 1
                  ) {
                    return;
                  }
                  onTestEvent(`shape-handle-${handle}`);
                  const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                  if (!pointer) {
                    return;
                  }
                  if (handle === 'rotater') {
                    beginRotate(selectedRenderedItem, toCanvasPointer(pointer));
                    return;
                  }
                  beginResize(
                    selectedRenderedItem,
                    handle as ResizeHandle,
                    toCanvasPointer(pointer),
                  );
                }}
                style={{
                  position: 'absolute',
                  pointerEvents: 'auto',
                  background: 'rgba(0, 0, 0, 0.001)',
                  ...toOverlayStyle(rect),
                }}
              />
            ))
          : null}
        {selectedLineHandleRects
          ? Object.entries(selectedLineHandleRects).map(([handle, rect]) => (
              <div
                key={`line-handle-${handle}`}
                data-testid={`canvas-line-handle-${handle}`}
                onMouseDown={(event) => {
                  if (
                    !selectedRenderedItem ||
                    selectedRenderedItem.kind !== 'line' ||
                    event.button === 1
                  ) {
                    return;
                  }
                  onTestEvent(`line-handle-${handle}`);
                  const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                  if (!pointer) {
                    return;
                  }
                  beginLineHandle(
                    selectedRenderedItem,
                    handle as 'start' | 'end',
                    toCanvasPointer(pointer),
                  );
                }}
                style={{
                  position: 'absolute',
                  pointerEvents: 'auto',
                  background: 'rgba(0, 0, 0, 0.001)',
                  ...toOverlayStyle(rect),
                }}
              />
            ))
          : null}
        {showGroupInteractionHooks && groupOverlayViewportRect ? (
          <div
            data-testid="canvas-group-overlay"
            onMouseDown={(event) => {
              if (event.button === 1) {
                const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                if (pointer) {
                  startPanDrag(pointer);
                }
                return;
              }
              onTestEvent('group-overlay');
              const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
              if (!pointer) {
                return;
              }
              beginGroupDrag(toCanvasPointer(pointer));
            }}
            style={{
              position: 'absolute',
              pointerEvents: 'auto',
              background: 'rgba(0, 0, 0, 0.001)',
              transform: `rotate(${groupOverlayFrame?.rotation ?? 0}deg)`,
              transformOrigin: 'center',
              ...toOverlayStyle(groupOverlayViewportRect),
            }}
          />
        ) : null}
        {showGroupInteractionHooks && groupHandleViewportPoints
          ? Object.entries(groupHandleViewportPoints).map(([handle, point]) => (
              <div
                key={`group-handle-${handle}`}
                data-testid={`canvas-group-handle-${handle}`}
                onMouseDown={(event) => {
                  if (event.button === 1) {
                    const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                    if (pointer) {
                      startPanDrag(pointer);
                    }
                    return;
                  }
                  onTestEvent(`group-handle-${handle}`);
                  const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                  if (!pointer) {
                    return;
                  }
                  beginGroupResize(handle as ResizeHandle, toCanvasPointer(pointer));
                }}
                style={{
                  position: 'absolute',
                  pointerEvents: 'auto',
                  background: 'rgba(0, 0, 0, 0.001)',
                  left: `${point.x - 8}px`,
                  top: `${point.y - 8}px`,
                  width: '16px',
                  height: '16px',
                }}
              />
            ))
          : null}
        {showGroupInteractionHooks && groupRotaterViewportPoint ? (
          <div
            data-testid="canvas-group-rotater"
            onMouseDown={(event) => {
              if (event.button === 1) {
                const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                if (pointer) {
                  startPanDrag(pointer);
                }
                return;
              }
              onTestEvent('group-rotater');
              const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
              if (!pointer) {
                return;
              }
              beginGroupRotate(toCanvasPointer(pointer));
            }}
            style={{
              position: 'absolute',
              pointerEvents: 'auto',
              background: 'rgba(0, 0, 0, 0.001)',
              left: `${groupRotaterViewportPoint.x - 8}px`,
              top: `${groupRotaterViewportPoint.y - 8}px`,
              width: '16px',
              height: '16px',
            }}
          />
        ) : null}
      </div>
    </>
  );
}
