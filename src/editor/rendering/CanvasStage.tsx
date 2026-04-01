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

const NOOP_TEST_EVENT = () => {};

export interface CanvasStageProps {
  activeTool: CanvasTool;
  debugMode?: boolean;
  showCanvasTestHooks?: boolean;
  showExportBoundsCue?: boolean;
  document: ProjectDocument;
  selectedNodeIds: string[];
  guides: GuideLine[];
  onGuidesChange: (guides: GuideLine[]) => void;
  onSelectNode: (nodeId?: string) => void;
  onToggleSelectNode?: (nodeId: string) => void;
  onToggleSelectNodes?: (nodeIds: string[]) => void;
  onUpdateItem: (itemId: string, changes: Partial<CanvasItem>) => void;
  onUpdateItems?: (changesById: Array<{ itemId: string; changes: Partial<CanvasItem> }>) => void;
  onAddItem: (item: CanvasItem) => void;
  onSetActiveTool: (tool: CanvasTool) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
}

export function CanvasStage({
  activeTool,
  debugMode = false,
  showCanvasTestHooks = false,
  showExportBoundsCue = false,
  document,
  selectedNodeIds,
  guides,
  onGuidesChange,
  onSelectNode,
  onToggleSelectNode,
  onToggleSelectNodes,
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
    commitCropSession,
    beginCropFullResize,
    beginCropFullRotate,
    beginCropPan,
    beginCropResize,
    beginLineHandle,
    beginResize,
    beginRotate,
    cropSession,
    handleItemDoubleClick,
    handleItemPointerDown,
    handleStageMouseDown,
    handleStagePointerMove,
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
    selectedNodeIds,
    onGuidesChange,
    onSelectNode,
    onToggleSelectNode,
    onToggleSelectNodes,
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
    cropFullImageHandleViewportPoints,
    cropFullImageRotaterViewportPoint,
    cropHandleViewportPoints,
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
    activeTool,
    canvasBounds: { x: 0, y: 0, width: document.canvas.width, height: document.canvas.height },
    renderedGroupBounds,
    renderedSelectedItems,
    renderedSelectionFrame,
    selectedRenderedItem,
    session: session as never,
    cropSession: cropSession as never,
    zoom: viewport.zoom,
    viewport,
  });

  const sceneHandlers = buildStageSceneHandlers({
    activeTool,
    applyZoomToolClick: (point, zoomOut) => {
      viewport.applyZoomToolClick(point, zoomOut);
      onSetActiveTool('select');
    },
    handleScenePointerMove: viewport.handleStagePointerMove,
    handleScenePointerUp: viewport.handleStagePointerUp,
    handleStageMouseDown,
    handleStagePointerMove,
    handleStageMouseUp,
    hasActiveSession: Boolean(session),
    isPanGesture: viewport.isPanGesture,
    startPanDrag: viewport.startPanDrag,
    zoomInFromWheel: viewport.zoomInFromWheel,
  });

  const exportCuePanels = buildExportCuePanels(
    viewport.toViewportRect({
      x: 0,
      y: 0,
      width: document.canvas.width,
      height: document.canvas.height,
    }),
    viewport.viewportSize,
  );

  return (
    <div
      className="canvas-stage-screen"
      ref={viewport.viewportRef}
      data-testid="canvas-stage-root"
    >
      <div
        className={showExportBoundsCue ? 'canvas-export-bounds-cue active' : 'canvas-export-bounds-cue'}
        data-testid="export-bounds-cue"
        aria-hidden="true"
      >
        {exportCuePanels.map((panel) => (
          <div
            key={panel.side}
            className={`canvas-export-bounds-panel canvas-export-bounds-panel-${panel.side}`}
            data-testid={`export-bounds-cue-${panel.side}`}
            style={toBoundsCueStyle(panel.rect)}
          />
        ))}
      </div>
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
        beginCropFullResize={beginCropFullResize}
        beginCropFullRotate={beginCropFullRotate}
        beginCropPan={beginCropPan}
        beginCropResize={beginCropResize}
        commitCropSession={commitCropSession}
        beginGroupResize={beginGroupResize}
        beginGroupRotate={beginGroupRotate}
        beginLineHandle={beginLineHandle}
        beginResize={beginResize}
        beginRotate={beginRotate}
        cropSession={cropSession as never}
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
      {debugMode ? (
        <CanvasStageDebug
          cropFullImageHandleViewportPoints={cropFullImageHandleViewportPoints}
          cropFullImageRotaterViewportPoint={cropFullImageRotaterViewportPoint}
          cropHandleViewportPoints={cropHandleViewportPoints}
          cropSession={cropSession as never}
          groupHandleViewportPoints={groupHandleViewportPoints}
          groupOverlayFrame={groupOverlayFrame}
          groupOverlayViewportRect={groupOverlayViewportRect}
          groupRotaterViewportPoint={groupRotaterViewportPoint}
          lastTestHookEvent={lastTestHookEvent}
          lastDrilldownSource={lastDrilldownSource}
          marqueeViewportRect={marqueeViewportRect}
          nodeClientRect={nodeClientRect}
          pan={viewport.pan}
          previewItem={previewItem}
          renderedItems={renderedItems}
          renderedSelectedItems={renderedSelectedItems}
          selectedDocumentItem={selectedDocumentItem}
          selectedNodeIds={selectedNodeIds}
          selectedItemViewportRect={selectedItemViewportRect}
          selectedLineHandleRects={selectedLineHandleRects}
          selectedNode={selectedNode}
          selectedRenderedItem={selectedRenderedItem}
          selectedShapeHandleRects={selectedShapeHandleRects}
          session={session as never}
          showGroupInteractionHooks={showGroupInteractionHooks}
          stageRef={stageRef}
          subgroupOutlineFrames={subgroupOutlineFrames}
          viewportRef={viewport.viewportRef}
          viewportSize={viewport.viewportSize}
          zoom={viewport.zoom}
        />
      ) : null}
      {showCanvasTestHooks ? (
        <CanvasTestHooks
          beginCropFullResize={beginCropFullResize}
          beginCropFullRotate={beginCropFullRotate}
          beginCropPan={beginCropPan}
          beginCropResize={beginCropResize}
          beginGroupDrag={beginGroupDrag}
          beginGroupResize={beginGroupResize}
          beginGroupRotate={beginGroupRotate}
          beginLineHandle={beginLineHandle}
          beginResize={beginResize}
          beginRotate={beginRotate}
          cropFullImageHandleViewportPoints={cropFullImageHandleViewportPoints}
          cropFullImageRotaterViewportPoint={cropFullImageRotaterViewportPoint}
          cropHandleViewportPoints={cropHandleViewportPoints}
          cropSession={cropSession as never}
          getViewportPointerFromClient={viewport.getViewportPointerFromClient}
          groupHandleViewportPoints={groupHandleViewportPoints}
          groupOverlayFrame={groupOverlayFrame}
          groupOverlayViewportRect={groupOverlayViewportRect}
          groupRotaterViewportPoint={groupRotaterViewportPoint}
          handleItemPointerDown={handleItemPointerDown}
          marqueeViewportRect={marqueeViewportRect}
          onTestEvent={debugMode ? setLastTestHookEvent : NOOP_TEST_EVENT}
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
      ) : null}
    </div>
  );
}

type ExportCuePanel = {
  side: 'top' | 'right' | 'bottom' | 'left';
  rect: { left: number; top: number; width: number; height: number };
};

function buildExportCuePanels(
  canvasRect: { left: number; top: number; width: number; height: number },
  viewportSize: { width: number; height: number },
): ExportCuePanel[] {
  const viewportWidth = Math.max(0, viewportSize.width);
  const viewportHeight = Math.max(0, viewportSize.height);
  const canvasLeft = clampNumber(canvasRect.left, 0, viewportWidth);
  const canvasTop = clampNumber(canvasRect.top, 0, viewportHeight);
  const canvasRight = clampNumber(canvasRect.left + canvasRect.width, 0, viewportWidth);
  const canvasBottom = clampNumber(canvasRect.top + canvasRect.height, 0, viewportHeight);
  const visibleCanvasWidth = canvasRight - canvasLeft;
  const visibleCanvasHeight = canvasBottom - canvasTop;

  if (visibleCanvasWidth <= 0 || visibleCanvasHeight <= 0) {
    return [
      {
        side: 'top',
        rect: { left: 0, top: 0, width: viewportWidth, height: viewportHeight },
      },
      { side: 'right', rect: { left: viewportWidth, top: 0, width: 0, height: 0 } },
      { side: 'bottom', rect: { left: 0, top: viewportHeight, width: 0, height: 0 } },
      { side: 'left', rect: { left: 0, top: 0, width: 0, height: 0 } },
    ];
  }

  return [
    {
      side: 'top',
      rect: { left: 0, top: 0, width: viewportWidth, height: canvasTop },
    },
    {
      side: 'right',
      rect: {
        left: canvasRight,
        top: canvasTop,
        width: viewportWidth - canvasRight,
        height: visibleCanvasHeight,
      },
    },
    {
      side: 'bottom',
      rect: {
        left: 0,
        top: canvasBottom,
        width: viewportWidth,
        height: viewportHeight - canvasBottom,
      },
    },
    {
      side: 'left',
      rect: { left: 0, top: canvasTop, width: canvasLeft, height: visibleCanvasHeight },
    },
  ];
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toBoundsCueStyle(rect: { left: number; top: number; width: number; height: number }) {
  return {
    left: `${Math.max(0, rect.left)}px`,
    top: `${Math.max(0, rect.top)}px`,
    width: `${Math.max(0, rect.width)}px`,
    height: `${Math.max(0, rect.height)}px`,
  };
}

function CanvasStageDebug({
  cropFullImageHandleViewportPoints,
  cropFullImageRotaterViewportPoint,
  cropHandleViewportPoints,
  cropSession,
  groupHandleViewportPoints,
  groupOverlayFrame,
  groupOverlayViewportRect,
  groupRotaterViewportPoint,
  lastTestHookEvent,
  lastDrilldownSource,
  marqueeViewportRect,
  nodeClientRect,
  pan,
  previewItem,
  renderedItems,
  renderedSelectedItems,
  selectedDocumentItem,
  selectedNodeIds,
  selectedItemViewportRect,
  selectedLineHandleRects,
  selectedNode,
  selectedRenderedItem,
  selectedShapeHandleRects,
  session,
  showGroupInteractionHooks,
  stageRef,
  subgroupOutlineFrames,
  viewportRef,
  viewportSize,
  zoom,
}: Parameters<typeof useCanvasDebugSnapshot>[0]) {
  const debugInfo = useCanvasDebugSnapshot({
    cropFullImageHandleViewportPoints,
    cropFullImageRotaterViewportPoint,
    cropHandleViewportPoints,
    cropSession,
    groupHandleViewportPoints,
    groupOverlayFrame,
    groupOverlayViewportRect,
    groupRotaterViewportPoint,
    lastTestHookEvent,
    marqueeViewportRect,
    nodeClientRect,
    pan,
    previewItem,
    renderedItems,
    renderedSelectedItems,
    selectedDocumentItem,
    lastDrilldownSource,
    selectedNodeIds,
    selectedItemViewportRect,
    selectedLineHandleRects,
    selectedNode,
    selectedRenderedItem,
    selectedShapeHandleRects,
    session,
    showGroupInteractionHooks,
    stageRef,
    subgroupOutlineFrames,
    viewportRef,
    viewportSize,
    zoom,
  });

  return (
    <div className="canvas-debug" aria-hidden="true">
      <pre data-testid="stage-debug">{JSON.stringify(debugInfo)}</pre>
      <pre data-testid="selected-item-debug">{JSON.stringify(debugInfo)}</pre>
    </div>
  );
}
