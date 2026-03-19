import { useState } from 'react';
import type Konva from 'konva';

import type {
  CanvasItem,
  CanvasTool,
  GuideLine,
  ProjectDocument,
} from '../document/documentTypes';
import {
} from './interactionGeometry';
import { useCanvasInteractionSession } from './useCanvasInteractionSession';
import { CanvasScene } from './stage/CanvasScene';
import { CanvasTestHooks } from './stage/CanvasTestHooks';
import { CanvasViewportHud } from './stage/CanvasViewportHud';
import { buildStageDerivedState } from './stage/stageDerived';
import { buildStageSceneHandlers } from './stage/stageHandlers';
import { useCanvasDebugSnapshot } from './stage/useCanvasDebugSnapshot';
import { useCanvasViewport } from './stage/useCanvasViewport';

export interface CanvasStageProps {
  activeTool: CanvasTool;
  document: ProjectDocument;
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
    handleItemDoubleClick,
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
    lastDrilldownSource,
    selectedNode,
    selectedRenderedItem,
    selectedItemId,
    session,
    subgroupOutlineFrames = [],
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
  const {
    groupHandleViewportPoints,
    groupOverlayFrame,
    groupOverlayViewportRect,
    groupRotaterViewportPoint,
    marqueeViewportRect,
    selectedItemViewportRect,
    selectedLineHandleRects,
    selectedShapeHandleRects,
    showGroupInteractionHooks,
  } = buildStageDerivedState({
    renderedGroupBounds,
    renderedSelectedItems,
    renderedSelectionFrame,
    selectedRenderedItem,
    session: session as never,
    viewport,
  });

  const sceneHandlers = buildStageSceneHandlers({
    activeTool,
    applyZoomToolClick: viewport.applyZoomToolClick,
    handleScenePointerMove: viewport.handleStagePointerMove,
    handleScenePointerUp: viewport.handleStagePointerUp,
    handleStageMouseDown,
    handleStageMouseUp,
    hasActiveSession: Boolean(session),
    isPanGesture: viewport.isPanGesture,
    startPanDrag: viewport.startPanDrag,
    zoomInFromWheel: viewport.zoomInFromWheel,
  });

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
    lastDrilldownSource,
    selectedItemIds,
    selectedItemViewportRect,
    selectedLineHandleRects,
    selectedNode,
    selectedRenderedItem,
    selectedShapeHandleRects,
    session,
    showGroupInteractionHooks,
    stageRef,
    subgroupOutlineFrames,
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
        beginGroupResize={beginGroupResize}
        beginGroupRotate={beginGroupRotate}
        beginLineHandle={beginLineHandle}
        beginResize={beginResize}
        beginRotate={beginRotate}
        document={document}
        groupOverlayFrame={groupOverlayFrame}
        guides={guides}
        handleItemDoubleClick={handleItemDoubleClick}
        handleItemPointerDown={handleItemPointerDown}
        onStageMouseDown={sceneHandlers.onStageMouseDown}
        onStageMouseLeave={viewport.handleStagePointerLeave}
        onStageMouseMove={sceneHandlers.onStageMouseMove}
        onStageMouseUp={sceneHandlers.onStageMouseUp}
        onStageWheel={sceneHandlers.onStageWheel}
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
        subgroupOutlineFrames={subgroupOutlineFrames}
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
