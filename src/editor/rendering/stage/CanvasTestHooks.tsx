import type { CanvasItem, GeneratorCanvasItem, LineCanvasItem } from '../../document/documentTypes';

type ShapeItem = Exclude<CanvasItem, LineCanvasItem | GeneratorCanvasItem>;
import { type Point, type ResizeHandle } from '../interactionGeometry';
import type { PointerGestureSource } from '../interactionSession';
import type { RenderableCanvasItem } from '../renderAdapter';

import { toOverlayStyle } from './viewportMath';

const OVERLAY_POINTER_SOURCE = 'overlay' as const;

interface CanvasTestHooksProps {
  beginCropFullResize?: (
    handle: ResizeHandle,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  beginCropFullRotate?: (pointer: Point, source?: PointerGestureSource) => void;
  beginCropPan?: (pointer: Point, source?: PointerGestureSource) => void;
  beginCropResize?: (handle: ResizeHandle, pointer: Point, source?: PointerGestureSource) => void;
  beginGroupDrag: (pointer: Point, source?: PointerGestureSource) => void;
  beginGroupResize: (
    handle: ResizeHandle,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  beginGroupRotate: (pointer: Point, source?: PointerGestureSource) => void;
  beginLineHandle: (
    item: Extract<CanvasItem, { kind: 'line' }>,
    handle: 'start' | 'end',
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  beginResize: (
    item: ShapeItem,
    handle: ResizeHandle,
    pointer: { x: number; y: number },
    source?: PointerGestureSource,
  ) => void;
  beginRotate: (
    item: ShapeItem,
    pointer: { x: number; y: number },
    source?: PointerGestureSource,
  ) => void;
  cropFullImageHandleViewportPoints?: Record<string, { x: number; y: number }> | null;
  cropFullImageRotaterViewportPoint?: { x: number; y: number } | null;
  cropHandleViewportPoints?: Record<string, { x: number; y: number }> | null;
  cropSession?: {
    fullImageItem: { rotation: number; x: number; y: number; width: number; height: number };
    previewItem: { rotation: number; x: number; y: number; width: number; height: number };
  } | null;
  getViewportPointerFromClient: (clientX: number, clientY: number) => { x: number; y: number } | null;
  groupHandleViewportPoints: Record<string, { x: number; y: number }> | null;
  groupOverlayFrame: { rotation: number } | null;
  groupOverlayViewportRect: { left: number; top: number; width: number; height: number } | null;
  groupRotaterViewportPoint: { x: number; y: number } | null;
  handleItemPointerDown: (
    item: CanvasItem,
    selectionNodeId: string,
    pointer: { x: number; y: number },
    shiftKey: boolean,
    nativeEvent?: MouseEvent,
    source?: PointerGestureSource,
  ) => void;
  marqueeViewportRect: { left: number; top: number; width: number; height: number } | null;
  onTestEvent: (eventName: string) => void;
  selectedItemViewportRect: { left: number; top: number; width: number; height: number } | null;
  selectedLineHandleRects: Record<string, { left: number; top: number; width: number; height: number }> | null;
  selectedRenderedItem: RenderableCanvasItem | null;
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
  beginCropFullResize = () => {},
  beginCropFullRotate = () => {},
  beginCropPan = () => {},
  beginCropResize = () => {},
  beginGroupDrag,
  beginGroupResize,
  beginGroupRotate,
  beginLineHandle,
  beginResize,
  beginRotate,
  cropFullImageHandleViewportPoints = null,
  cropFullImageRotaterViewportPoint = null,
  cropHandleViewportPoints = null,
  cropSession = null,
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
        {cropSession ? (
          <>
            <div
              data-testid="canvas-crop-pan-overlay"
              onMouseDown={(event) => {
                const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                if (!pointer || event.button !== 0) {
                  return;
                }
                beginCropPan(toCanvasPointer(pointer), OVERLAY_POINTER_SOURCE);
              }}
              style={{
                position: 'absolute',
                pointerEvents: 'auto',
                background: 'rgba(0, 0, 0, 0.001)',
                transform: `rotate(${cropSession.fullImageItem.rotation}deg)`,
                transformOrigin: 'center',
                ...toOverlayStyle(
                  toViewportRect({
                    x: cropSession.fullImageItem.x,
                    y: cropSession.fullImageItem.y,
                    width: cropSession.fullImageItem.width,
                    height: cropSession.fullImageItem.height,
                  }),
                ),
              }}
            />
            {cropHandleViewportPoints
              ? Object.entries(cropHandleViewportPoints).map(([handle, point]) => (
                  <div
                    key={`crop-handle-${handle}`}
                    data-testid={`canvas-crop-handle-${handle}`}
                    onMouseDown={(event) => {
                      const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                      if (!pointer || event.button !== 0) {
                        return;
                      }
                      beginCropResize(handle as ResizeHandle, toCanvasPointer(pointer), OVERLAY_POINTER_SOURCE);
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
            {cropFullImageHandleViewportPoints
              ? Object.entries(cropFullImageHandleViewportPoints).map(([handle, point]) => (
                  <div
                    key={`crop-full-handle-${handle}`}
                    data-testid={`canvas-crop-full-handle-${handle}`}
                    onMouseDown={(event) => {
                      const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                      if (!pointer || event.button !== 0) {
                        return;
                      }
                      beginCropFullResize(handle as ResizeHandle, toCanvasPointer(pointer), OVERLAY_POINTER_SOURCE);
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
            {cropFullImageRotaterViewportPoint ? (
              <div
                data-testid="canvas-crop-full-rotater"
                onMouseDown={(event) => {
                  const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                  if (!pointer || event.button !== 0) {
                    return;
                  }
                  beginCropFullRotate(toCanvasPointer(pointer), OVERLAY_POINTER_SOURCE);
                }}
                style={{
                  position: 'absolute',
                  pointerEvents: 'auto',
                  background: 'rgba(0, 0, 0, 0.001)',
                  left: `${cropFullImageRotaterViewportPoint.x - 8}px`,
                  top: `${cropFullImageRotaterViewportPoint.y - 8}px`,
                  width: '16px',
                  height: '16px',
                }}
              />
            ) : null}
          </>
        ) : null}
        {selectedItemViewportRect && selectedRenderedItem ? (
          <div
            data-testid="canvas-selected-item-overlay"
            onMouseDown={(event) => {
              if (event.button === 1) {
                const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                if (pointer) {
                  startPanDrag(pointer);
                }
                return;
              }
              onTestEvent('selected-item-overlay');
              const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
              if (!pointer) {
                return;
              }
              handleItemPointerDown(
                selectedRenderedItem,
                selectedRenderedItem.selectableNodeId,
                toCanvasPointer(pointer),
                event.shiftKey,
                event.nativeEvent,
                OVERLAY_POINTER_SOURCE,
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
                    selectedRenderedItem.kind === 'line'
                  ) {
                    return;
                  }
                  if (event.button === 1) {
                    const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                    if (pointer) {
                      startPanDrag(pointer);
                    }
                    return;
                  }
                  onTestEvent(`shape-handle-${handle}`);
                  const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                  if (!pointer) {
                    return;
                  }
                  if (selectedRenderedItem.kind === 'generator') return;
                  if (handle === 'rotater') {
                    beginRotate(selectedRenderedItem, toCanvasPointer(pointer), OVERLAY_POINTER_SOURCE);
                    return;
                  }
                  beginResize(
                    selectedRenderedItem,
                    handle as ResizeHandle,
                    toCanvasPointer(pointer),
                    OVERLAY_POINTER_SOURCE,
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
                    selectedRenderedItem.kind !== 'line'
                  ) {
                    return;
                  }
                  if (event.button === 1) {
                    const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                    if (pointer) {
                      startPanDrag(pointer);
                    }
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
                    OVERLAY_POINTER_SOURCE,
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
              beginGroupDrag(toCanvasPointer(pointer), OVERLAY_POINTER_SOURCE);
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
                  beginGroupResize(handle as ResizeHandle, toCanvasPointer(pointer), OVERLAY_POINTER_SOURCE);
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
              beginGroupRotate(toCanvasPointer(pointer), OVERLAY_POINTER_SOURCE);
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
