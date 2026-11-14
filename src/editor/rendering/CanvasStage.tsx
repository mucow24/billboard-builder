import { useCallback, useState } from 'react';

import type {
  CanvasItem,
  GuideLine,
} from '../document/documentTypes';
import {
} from './interactionGeometry';
import type { CanvasRendererHandle } from './renderer/canvasRendererTypes';
import { useCanvasInteractionSession } from './useCanvasInteractionSession';
import { PixiCanvasScene } from './stage/PixiCanvasScene';
import { CanvasTestHooks } from './stage/CanvasTestHooks';
import { CanvasViewportHud } from './stage/CanvasViewportHud';
import { buildStageDerivedState } from './stage/stageDerived';
import { buildStageSceneHandlers } from './stage/stageHandlers';
import { useCanvasDebugSnapshot } from './stage/useCanvasDebugSnapshot';
import { useCanvasViewport, type FitObstructionRefs } from './stage/useCanvasViewport';
import { useEditorStore } from '../state/store';

import { NOOP } from './noop';

export interface CanvasStageProps {
  debugMode?: boolean;
  showCanvasTestHooks?: boolean;
  showExportBoundsCue?: boolean;
  guides: GuideLine[];
  onGuidesChange: (guides: GuideLine[]) => void;
  // The toolbar, tool palette and inspector panel floating over the stage's
  // edges; Fit keeps the canvas clear of them.
  fitObstructionRefs?: FitObstructionRefs;
  stageRef: React.RefObject<CanvasRendererHandle | null>;
}

export function CanvasStage({
  debugMode = false,
  showCanvasTestHooks = false,
  showExportBoundsCue = false,
  guides,
  onGuidesChange,
  fitObstructionRefs,
  stageRef,
}: CanvasStageProps) {
  const document = useEditorStore((s) => s.editor.document);
  const activeTool = useEditorStore((s) => s.editor.session.activeTool);
  const selectedNodeIds = useEditorStore((s) => s.editor.session.selectedNodeIds);
  const dispatch = useEditorStore((s) => s.dispatch);
  const selectSingleNode = useEditorStore((s) => s.selectSingleNode);
  const toggleSelectedNode = useEditorStore((s) => s.toggleSelectedNode);
  const toggleSelectedNodes = useEditorStore((s) => s.toggleSelectedNodes);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const updateSelectedItems = useEditorStore((s) => s.updateSelectedItems);
  const selectedPolygonVertex = useEditorStore((s) => s.editor.session.selectedPolygonVertex);
  const setSelectedPolygonVertex = useEditorStore((s) => s.setSelectedPolygonVertex);

  const onUpdateItem = useCallback(
    (itemId: string, changes: Partial<CanvasItem>) => {
      dispatch({ type: 'update_node', itemId, changes });
    },
    [dispatch],
  );

  const onAddItem = useCallback(
    (item: CanvasItem) => {
      dispatch({ type: 'add_node', item });
    },
    [dispatch],
  );

  const [lastTestHookEvent, setLastTestHookEvent] = useState<string | null>(null);
  const [rendererReady, setRendererReady] = useState(false);

  const viewportState = useCanvasViewport({
    activeTool,
    canvasHeight: document.canvas.height,
    canvasWidth: document.canvas.width,
    fitObstructionRefs,
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
    beginPolygonEdgeInsert,
    beginPolygonVertexHandle,
    beginResize,
    beginRotate,
    cropSession,
    handleItemDoubleClick,
    handleItemPointerDown,
    handleStageMouseDown,
    handleStagePointerMove,
    handleStageMouseUp,
    nodeClientRect,
    renderedGroupBounds,
    renderedSelectionFrame,
    renderedItems,
    renderedSelectedItems = [],
    selectedDocumentItem,
    lastDrilldownSource,
    selectedNode,
    selectedRenderedItem,
    selectionLocked = false,
    session,
    subgroupOutlineFrames = [],
  } = useCanvasInteractionSession({
    activeTool,
    document,
    selectedNodeIds,
    onGuidesChange,
    onSelectNode: selectSingleNode,
    onToggleSelectNode: toggleSelectedNode,
    onToggleSelectNodes: toggleSelectedNodes,
    onUpdateItem,
    onUpdateItems: updateSelectedItems,
    onAddItem,
    onSetActiveTool: setActiveTool,
    onSelectPolygonVertex: setSelectedPolygonVertex,
    stageRef: stageRef,
    viewport: viewportState.viewport,
  });

  // The overlay highlights a vertex only on the polygon it belongs to.
  const selectedPolygonVertexIndex =
    selectedPolygonVertex && selectedRenderedItem?.id === selectedPolygonVertex.itemId
      ? selectedPolygonVertex.vertexIndex
      : null;

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
    selectionLocked,
    session: session as never,
    cropSession: cropSession as never,
    zoom: viewport.zoom,
    viewport,
  });

  const sceneHandlers = buildStageSceneHandlers({
    activeTool,
    applyZoomToolClick: (point, zoomOut) => {
      viewport.applyZoomToolClick(point, zoomOut);
      setActiveTool('select');
    },
    handleScenePointerUp: viewport.handleStagePointerUp,
    handleStageMouseDown,
    handleStagePointerMove,
    handleStageMouseUp,
    hasActiveSession: Boolean(session),
    isPanGesture: viewport.isPanGesture,
    startPanDrag: viewport.startPanDrag,
    zoomInFromWheel: viewport.zoomInFromWheel,
  });

  return (
    <div
      className="canvas-stage-screen"
      ref={viewport.viewportRef}
      data-testid="canvas-stage-root"
      // The veil itself is drawn by the scene, over the items only.
      data-export-bounds-cue={showExportBoundsCue ? 'active' : 'inactive'}
      style={{ cursor: viewport.getStageCursor(Boolean(session)) }}
    >
      <CanvasViewportHud
        canvasHeight={document.canvas.height}
        canvasWidth={document.canvas.width}
        onFitCanvas={viewport.fitCanvasToViewport}
        onSetZoom={viewport.setZoomFromHud}
        zoom={viewport.zoom}
        zoomStep={viewport.zoomOutFromHudStep}
      />
      <PixiCanvasScene
        ref={stageRef}
        activeTool={activeTool}
        onRendererReady={() => setRendererReady(true)}
        beginCropFullResize={beginCropFullResize}
        beginCropFullRotate={beginCropFullRotate}
        beginCropPan={beginCropPan}
        beginCropResize={beginCropResize}
        commitCropSession={commitCropSession}
        beginGroupResize={beginGroupResize}
        beginGroupRotate={beginGroupRotate}
        beginLineHandle={beginLineHandle}
        beginPolygonVertexHandle={beginPolygonVertexHandle}
        beginPolygonEdgeInsert={beginPolygonEdgeInsert}
        selectedPolygonVertexIndex={selectedPolygonVertexIndex}
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
        renderedItems={renderedItems}
        renderedSelectedItems={renderedSelectedItems}
        selectedRenderedItem={selectedRenderedItem}
        selectionLocked={selectionLocked}
        session={session as never}
        showFocusVeil={showExportBoundsCue}
        showGroupSelection={showGroupInteractionHooks}
        size={viewport.viewportSize}

        spacebarHeld={viewport.spacebarHeld}
        startPanDrag={viewport.startPanDrag}
        toCanvasPointer={viewport.toCanvasPointer}
        viewportPan={viewport.pan}
        zoom={viewport.zoom}
      />
      {debugMode ? (
        <CanvasStageDebug
          beginGroupDrag={beginGroupDrag}
          beginGroupResize={beginGroupResize}
          beginGroupRotate={beginGroupRotate}
          cropFullImageHandleViewportPoints={cropFullImageHandleViewportPoints}
          cropFullImageRotaterViewportPoint={cropFullImageRotaterViewportPoint}
          cropHandleViewportPoints={cropHandleViewportPoints}
          cropSession={cropSession as never}
          groupHandleViewportPoints={groupHandleViewportPoints}
          groupOverlayFrame={groupOverlayFrame}
          guideCount={guides.length}
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
          selectedNode={selectedNode as Parameters<typeof useCanvasDebugSnapshot>[0]['selectedNode']}
          selectedRenderedItem={selectedRenderedItem}
          selectedShapeHandleRects={selectedShapeHandleRects}
          session={session as never}
          rendererReady={rendererReady}
          showGroupInteractionHooks={showGroupInteractionHooks}
          stageRef={stageRef}
          startPanDrag={viewport.startPanDrag}
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
          onTestEvent={debugMode ? setLastTestHookEvent : NOOP}
          selectedItemViewportRect={selectedItemViewportRect}
          selectedLineHandleRects={selectedLineHandleRects}
          selectedRenderedItem={selectedRenderedItem}
          selectedShapeHandleRects={selectedShapeHandleRects}
          session={session as never}
          showGroupInteractionHooks={showGroupInteractionHooks}
          spacebarHeld={viewport.spacebarHeld}
          startPanDrag={viewport.startPanDrag}
          toCanvasPointer={viewport.toCanvasPointer}
          toViewportRect={viewport.toViewportRect}
        />
      ) : null}
    </div>
  );
}

function CanvasStageDebug({
  beginGroupDrag,
  beginGroupResize,
  beginGroupRotate,
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
  rendererReady,
  selectedRenderedItem,
  selectedShapeHandleRects,
  session,
  showGroupInteractionHooks,
  stageRef,
  startPanDrag,
  subgroupOutlineFrames,
  viewportRef,
  viewportSize,
  zoom,
  guideCount,
}: Parameters<typeof useCanvasDebugSnapshot>[0] & { guideCount: number }) {
  const debugInfo = useCanvasDebugSnapshot({
    beginGroupDrag,
    beginGroupResize,
    beginGroupRotate,
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
    rendererReady,
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
    startPanDrag,
    subgroupOutlineFrames,
    viewportRef,
    viewportSize,
    zoom,
  });

  return (
    <div className="canvas-debug" aria-hidden="true">
      <pre data-testid="stage-debug">{JSON.stringify(debugInfo)}</pre>
      <pre data-testid="selected-item-debug">{JSON.stringify(debugInfo)}</pre>
      <pre data-testid="guide-count">{guideCount}</pre>
    </div>
  );
}
