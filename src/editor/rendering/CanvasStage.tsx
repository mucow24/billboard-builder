import { useState } from 'react';
import type Konva from 'konva';

import type {
  CanvasItem,
  CanvasTool,
  GuideLine,
  ProjectDocumentV1,
} from '../document/documentTypes';
import {
  getLineHandleRects,
  getShapeHandleRects,
  localToStage,
  RESIZE_HANDLE_NAMES,
} from './interactionGeometry';
import { getGroupResizeFrame, getRenderBox, getSelectionFrameForRotation } from './transformGeometry';
import { useCanvasInteractionSession } from './useCanvasInteractionSession';
import { CanvasScene } from './stage/CanvasScene';
import { CanvasTestHooks } from './stage/CanvasTestHooks';
import { CanvasViewportHud } from './stage/CanvasViewportHud';
import { useCanvasDebugSnapshot } from './stage/useCanvasDebugSnapshot';
import { useCanvasViewport } from './stage/useCanvasViewport';

export interface CanvasStageProps {
  activeTool: CanvasTool;
  document: ProjectDocumentV1;
  selectedItemIds: string[];
  guides: GuideLine[];
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

export function CanvasStage({
  activeTool,
  document,
  selectedItemIds,
  guides,
  onGuidesChange,
  onSelectItem,
  onToggleSelectItem,
  onToggleSelectItems,
  onUpdateItem,
  onUpdateItems,
  onAddItem,
  onSetActiveTool,
  stageRef,
}: CanvasStageProps) {
  const [lastTestHookEvent, setLastTestHookEvent] = useState<string | null>(null);

  const viewportState = useCanvasViewport({
    activeTool,
    canvasHeight: document.canvas.height,
    canvasWidth: document.canvas.width,
  });

  const {
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
    renderedGroupBounds,
    renderedSelectionFrame,
    renderedItems,
    renderedSelectedItems = [],
    selectedDocumentItem,
    selectedNode,
    selectedRenderedItem,
    selectedItemId,
    session,
  } = useCanvasInteractionSession({
    activeTool,
    document,
    selectedItemIds,
    onGuidesChange,
    onSelectItem,
    onToggleSelectItem,
    onToggleSelectItems,
    onUpdateItem,
    onUpdateItems,
    onAddItem,
    onSetActiveTool,
    stageRef,
    viewport: viewportState.viewport,
  });

  const viewport = viewportState;

  const previewItem = session && 'previewItem' in session ? session.previewItem : null;
  const groupRotateSession = session?.kind === 'group-rotate' ? session : null;
  const groupDragSession = session?.kind === 'group-drag' ? session : null;
  const groupResizeSession = session?.kind === 'group-resize' ? session : null;
  const baseGroupFrame =
    renderedSelectionFrame ??
    (renderedGroupBounds ? { bounds: renderedGroupBounds, rotation: 0 } : null);
  const groupOverlayFrame = groupRotateSession
    ? getSelectionFrameForRotation(
        groupRotateSession.previewItems,
        groupRotateSession.frameRotation +
          (((Math.atan2(
            groupRotateSession.currentPointer.y -
              (groupRotateSession.bounds.y + groupRotateSession.bounds.height / 2),
            groupRotateSession.currentPointer.x -
              (groupRotateSession.bounds.x + groupRotateSession.bounds.width / 2),
          ) -
            Math.atan2(
              groupRotateSession.pointerStart.y -
                (groupRotateSession.bounds.y + groupRotateSession.bounds.height / 2),
              groupRotateSession.pointerStart.x -
                (groupRotateSession.bounds.x + groupRotateSession.bounds.width / 2),
            )) *
            180) /
            Math.PI)
      )
    : groupDragSession
      ? getSelectionFrameForRotation(
          groupDragSession.previewItems,
          groupDragSession.frameRotation,
        )
      : groupResizeSession
        ? getGroupResizeFrame(
            groupResizeSession.bounds,
            groupResizeSession.handle,
            groupResizeSession.currentPointer,
            groupResizeSession.frameRotation,
          )
        : baseGroupFrame;

  const selectedShapeHandleRects =
    renderedSelectedItems.length <= 1 &&
    selectedRenderedItem &&
    selectedRenderedItem.kind !== 'line'
      ? Object.fromEntries(
          Object.entries(
            // The selection hook still owns the canonical handle geometry.
            getShapeHandleRects(selectedRenderedItem),
          ).map(([handle, rect]) => [handle, viewport.toViewportRect(rect)]),
        )
      : null;
  const selectedLineHandleRects =
    renderedSelectedItems.length <= 1 && selectedRenderedItem?.kind === 'line'
      ? Object.fromEntries(
          Object.entries(getLineHandleRects(selectedRenderedItem)).map(([handle, rect]) => [
            handle,
            viewport.toViewportRect(rect),
          ]),
        )
      : null;
  const marqueeViewportRect =
    session?.kind === 'marquee'
      ? viewport.toViewportRect({
          x: Math.min(session.pointerStart.x, session.currentPointer.x),
          y: Math.min(session.pointerStart.y, session.currentPointer.y),
          width: Math.max(1, Math.abs(session.currentPointer.x - session.pointerStart.x)),
          height: Math.max(1, Math.abs(session.currentPointer.y - session.pointerStart.y)),
        })
      : null;
  const groupOverlayViewportRect = groupOverlayFrame
    ? viewport.toViewportRect(groupOverlayFrame.bounds)
    : null;
  const showGroupInteractionHooks = renderedSelectedItems.length > 1;
  const selectedItemViewportRect =
    renderedSelectedItems.length <= 1 && selectedRenderedItem
      ? viewport.toViewportRect(getRenderBox(selectedRenderedItem))
      : null;
  const groupHandleViewportPoints = groupOverlayFrame
    ? Object.fromEntries(
        RESIZE_HANDLE_NAMES.map((handle) => {
          const width = groupOverlayFrame.bounds.width;
          const height = groupOverlayFrame.bounds.height;
          const localPoint = {
            x: handle.includes('left') ? -width / 2 : handle.includes('right') ? width / 2 : 0,
            y: handle.includes('top') ? -height / 2 : handle.includes('bottom') ? height / 2 : 0,
          };
          const center = {
            x: groupOverlayFrame.bounds.x + width / 2,
            y: groupOverlayFrame.bounds.y + height / 2,
          };
          return [handle, viewport.toViewportPoint(localToStage(localPoint, center, groupOverlayFrame.rotation))] as const;
        }),
      )
    : null;
  const groupRotaterViewportPoint = groupOverlayFrame
    ? viewport.toViewportPoint(
        localToStage(
          { x: 0, y: -(groupOverlayFrame.bounds.height / 2) - 50 },
          {
            x: groupOverlayFrame.bounds.x + groupOverlayFrame.bounds.width / 2,
            y: groupOverlayFrame.bounds.y + groupOverlayFrame.bounds.height / 2,
          },
          groupOverlayFrame.rotation,
        ),
      )
    : null;

  const debugInfo = useCanvasDebugSnapshot({
    groupHandleViewportPoints,
    groupOverlayFrame,
    groupOverlayViewportRect,
    groupRotaterViewportPoint,
    lastTestHookEvent,
    marqueeViewportRect,
    nodeClientRect,
    pan: viewport.pan,
    previewItem,
    renderedItems,
    renderedSelectedItems,
    selectedDocumentItem,
    selectedItemIds,
    selectedItemViewportRect,
    selectedNode,
    selectedRenderedItem,
    session,
    stageRef,
    viewportRef: viewport.viewportRef,
    viewportSize: viewport.viewportSize,
    zoom: viewport.zoom,
  });

  return (
    <div
      className="canvas-stage-screen"
      ref={viewport.viewportRef}
      data-testid="canvas-stage-root"
    >
      <CanvasViewportHud
        canvasHeight={document.canvas.height}
        canvasWidth={document.canvas.width}
        guidesCount={guides.length}
        onFitCanvas={viewport.fitCanvasToViewport}
        onSetZoom={viewport.setZoomFromHud}
        zoom={viewport.zoom}
        zoomStep={viewport.zoomOutFromHudStep}
      />
      <CanvasScene
        activeTool={activeTool}
        beginGroupDrag={beginGroupDrag}
        beginGroupResize={beginGroupResize}
        beginGroupRotate={beginGroupRotate}
        beginLineHandle={beginLineHandle}
        beginResize={beginResize}
        beginRotate={beginRotate}
        document={document}
        groupOverlayFrame={groupOverlayFrame}
        guides={guides}
        handleItemPointerDown={handleItemPointerDown}
        onStageMouseDown={(event) => {
          const pointer = event.target.getStage?.()?.getPointerPosition() ?? null;
          if (pointer && viewport.isPanGesture(event.evt, Boolean(session))) {
            event.evt.preventDefault();
            viewport.startPanDrag(pointer);
            return;
          }
          if (activeTool === 'zoom' && pointer) {
            viewport.applyZoomToolClick(pointer, event.evt.altKey);
            return;
          }
          handleStageMouseDown(event as never);
        }}
        onStageMouseLeave={viewport.handleStagePointerLeave}
        onStageMouseMove={(event) => {
          viewport.handleStagePointerMove(event.target.getStage?.()?.getPointerPosition() ?? null);
        }}
        onStageMouseUp={(event) => {
          if (viewport.handleStagePointerUp()) {
            return;
          }
          handleStageMouseUp(event as never);
        }}
        onStageWheel={(event) => {
          event.evt.preventDefault();
          const pointer = event.target.getStage?.()?.getPointerPosition();
          if (!pointer) {
            return;
          }
          viewport.zoomInFromWheel(pointer, event.evt.deltaY);
        }}
        registerShapeRef={registerShapeRef}
        renderedItems={renderedItems}
        renderedSelectedItems={renderedSelectedItems}
        selectedItemId={selectedItemId}
        selectedRenderedItem={selectedRenderedItem}
        session={session as never}
        showGroupSelection={showGroupInteractionHooks}
        size={viewport.viewportSize}
        stageCursor={viewport.getStageCursor(Boolean(session))}
        stageRef={stageRef}
        startPanDrag={viewport.startPanDrag}
        toCanvasPointer={viewport.toCanvasPointer}
        viewportPan={viewport.pan}
        zoom={viewport.zoom}
      />
      <div className="canvas-debug" aria-hidden="true">
        <pre data-testid="stage-debug">{JSON.stringify(debugInfo)}</pre>
        <pre data-testid="selected-item-debug">{JSON.stringify(debugInfo)}</pre>
      </div>
      <CanvasTestHooks
        beginGroupDrag={beginGroupDrag}
        beginGroupResize={beginGroupResize}
        beginGroupRotate={beginGroupRotate}
        beginLineHandle={beginLineHandle}
        beginResize={beginResize}
        beginRotate={beginRotate}
        getViewportPointerFromClient={viewport.getViewportPointerFromClient}
        groupHandleViewportPoints={groupHandleViewportPoints}
        groupOverlayFrame={groupOverlayFrame}
        groupOverlayViewportRect={groupOverlayViewportRect}
        groupRotaterViewportPoint={groupRotaterViewportPoint}
        handleItemPointerDown={handleItemPointerDown}
        marqueeViewportRect={marqueeViewportRect}
        onTestEvent={setLastTestHookEvent}
        selectedItemViewportRect={selectedItemViewportRect}
        selectedLineHandleRects={selectedLineHandleRects}
        selectedRenderedItem={selectedRenderedItem}
        selectedShapeHandleRects={selectedShapeHandleRects}
        session={session as never}
        showGroupInteractionHooks={showGroupInteractionHooks}
        startPanDrag={viewport.startPanDrag}
        toCanvasPointer={viewport.toCanvasPointer}
        toViewportRect={viewport.toViewportRect}
      />
    </div>
  );
}
