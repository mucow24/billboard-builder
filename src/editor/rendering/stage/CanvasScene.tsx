import { Group, Layer, Rect, Stage } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';

import type {
  CanvasItem,
  CanvasTool,
  GeneratorCanvasItem,
  GuideLine,
  LineCanvasItem,
  ProjectDocument,
} from '../../document/documentTypes';
import type { Point, ResizeHandle } from '../interactionGeometry';
import type { PointerGestureSource } from '../interactionSession';
import type { RenderableCanvasItem } from '../renderAdapter';

import { CanvasGuidesLayer } from './CanvasGuidesLayer';
import { CanvasItemLayer } from './CanvasItemLayer';
import { CanvasPreviewLayer } from './CanvasPreviewLayer';
import { CanvasSurface, CanvasWorkspaceBackdrop } from './CanvasSurface';
import { GroupSelectionOverlay } from './GroupSelectionOverlay';
import { ImageCropOverlay } from './ImageCropOverlay';
import { SELECTION_STROKE } from './renderConstants';
import { SingleSelectionOverlay } from './SingleSelectionOverlay';

interface CanvasSceneProps {
  activeTool: CanvasTool;
  beginCropFullResize: (handle: ResizeHandle, pointer: Point, source?: PointerGestureSource) => void;
  beginCropFullRotate: (pointer: Point, source?: PointerGestureSource) => void;
  beginCropPan: (pointer: Point, source?: PointerGestureSource) => void;
  beginCropResize: (handle: ResizeHandle, pointer: Point, source?: PointerGestureSource) => void;
  commitCropSession: () => boolean;
  beginGroupResize: (handle: ResizeHandle, pointer: Point, source?: PointerGestureSource) => void;
  beginGroupRotate: (pointer: Point, source?: PointerGestureSource) => void;
  beginLineHandle: (
    item: Extract<CanvasItem, { kind: 'line' }>,
    handle: 'start' | 'end',
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  beginResize: (
    item: Exclude<CanvasItem, LineCanvasItem | GeneratorCanvasItem>,
    handle: ResizeHandle,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  beginRotate: (
    item: Exclude<CanvasItem, LineCanvasItem | GeneratorCanvasItem>,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  cropSession: {
    itemId: string;
    previewItem: Extract<CanvasItem, { kind: 'image' }>;
    fullImageItem: Extract<CanvasItem, { kind: 'image' }>;
  } | null;
  document: ProjectDocument;
  groupOverlayFrame: {
    bounds: { x: number; y: number; width: number; height: number };
    rotation: number;
  } | null;
  guides: GuideLine[];
  handleItemDoubleClick: (item: CanvasItem) => void;
  handleItemPointerDown: (
    item: CanvasItem,
    selectionNodeId: string,
    pointer: Point,
    shiftKey: boolean,
    nativeEvent?: MouseEvent,
  ) => void;
  onStageMouseDown: (event: KonvaEventObject<MouseEvent>) => void;
  onStageMouseLeave: () => void;
  onStageMouseMove: (event: KonvaEventObject<MouseEvent>) => void;
  onStageMouseUp: (event: KonvaEventObject<MouseEvent>) => void;
  onStageWheel: (event: KonvaEventObject<WheelEvent>) => void;
  registerShapeRef: (itemId: string, node: Konva.Node | null) => void;
  renderedItems: RenderableCanvasItem[];
  renderedSelectedItems: RenderableCanvasItem[];
  selectedItemId?: string;
  selectedRenderedItem: RenderableCanvasItem | null;
  session: {
    kind: string;
    tool?: string;
    pointerStart?: { x: number; y: number };
    currentPointer?: { x: number; y: number };
    previewItem?: {
      kind: string;
      x: number;
      y: number;
      width: number;
      height: number;
    };
  } | null;
  showGroupSelection: boolean;
  size: { width: number; height: number };
  spacebarHeld: boolean;
  stageCursor: string;
  stageRef: React.RefObject<Konva.Stage | null>;
  startPanDrag: (pointer: Point) => void;
  subgroupOutlineFrames: Array<{
    nodeId: string;
    bounds: { x: number; y: number; width: number; height: number };
  }>;
  toCanvasPointer: (pointer: Point) => Point;
  viewportPan: { x: number; y: number };
  zoom: number;
}

export function CanvasScene({
  activeTool,
  beginCropFullResize,
  beginCropFullRotate,
  beginCropPan,
  beginCropResize,
  commitCropSession,
  beginGroupResize,
  beginGroupRotate,
  beginLineHandle,
  beginResize,
  beginRotate,
  cropSession,
  document,
  groupOverlayFrame,
  guides,
  handleItemDoubleClick,
  handleItemPointerDown,
  onStageMouseDown,
  onStageMouseLeave,
  onStageMouseMove,
  onStageMouseUp,
  onStageWheel,
  registerShapeRef,
  renderedItems,
  renderedSelectedItems,
  selectedItemId,
  selectedRenderedItem,
  session,
  showGroupSelection,
  size,
  spacebarHeld,
  stageCursor,
  stageRef,
  startPanDrag,
  subgroupOutlineFrames,
  toCanvasPointer,
  viewportPan,
  zoom,
}: CanvasSceneProps) {
  const sceneItems = cropSession
    ? renderedItems.filter((item) => item.id !== cropSession.itemId)
    : renderedItems;

  return (
    <Stage
      ref={stageRef}
      width={size.width}
      height={size.height}
      className="editor-stage editor-stage-fullscreen"
      style={{ cursor: stageCursor }}
      onWheel={onStageWheel}
      onMouseDown={onStageMouseDown}
      onMouseMove={onStageMouseMove}
      onMouseUp={onStageMouseUp}
      onMouseLeave={onStageMouseLeave}
    >
      <Layer>
        <Group
          x={viewportPan.x}
          y={viewportPan.y}
          scaleX={zoom}
          scaleY={zoom}
          name="export-root"
          width={document.canvas.width}
          height={document.canvas.height}
        >
          <CanvasWorkspaceBackdrop />
          <CanvasSurface document={document} />
          <Group name="export-content">
            <CanvasItemLayer
              activeTool={activeTool}
              canvasWidth={document.canvas.width}
              canvasHeight={document.canvas.height}
              items={sceneItems}
              onBeginLineHandle={beginLineHandle}
              onBeginResize={beginResize}
              onBeginRotate={beginRotate}
              onItemDoubleClick={handleItemDoubleClick}
              onItemPointerDown={handleItemPointerDown}
              registerShapeRef={registerShapeRef}
              selectedItemId={selectedItemId}
              spacebarHeld={spacebarHeld}
              startPanDrag={startPanDrag}
              toCanvasPointer={toCanvasPointer}
            />
            <CanvasPreviewLayer session={session} />
            <CanvasGuidesLayer document={document} guides={guides} zoom={zoom} />
          </Group>
          <Group name="selection-overlay export-exclude">
            {subgroupOutlineFrames.map((frame) => (
              <Rect
                key={`subgroup-selection-outline-${frame.nodeId}`}
                name="subgroup-selection-outline"
                x={frame.bounds.x}
                y={frame.bounds.y}
                width={frame.bounds.width}
                height={frame.bounds.height}
                stroke={SELECTION_STROKE}
                strokeWidth={1}
                dash={[6, 6]}
                opacity={0.55}
                fillEnabled={false}
                listening={false}
              />
            ))}
            {showGroupSelection && groupOverlayFrame ? (
              <GroupSelectionOverlay
                activeTool={activeTool}
                beginGroupResize={beginGroupResize}
                beginGroupRotate={beginGroupRotate}
                beginLineHandle={beginLineHandle}
                beginResize={beginResize}
                beginRotate={beginRotate}
                groupOverlayFrame={groupOverlayFrame}
                handleItemDoubleClick={handleItemDoubleClick}
                handleItemPointerDown={handleItemPointerDown}
                renderedSelectedItems={renderedSelectedItems}
                spacebarHeld={spacebarHeld}
                startPanDrag={startPanDrag}
                toCanvasPointer={toCanvasPointer}
                zoom={zoom}
              />
            ) : null}
            {cropSession ? (
              <ImageCropOverlay
                beginCropFullResize={beginCropFullResize}
                beginCropFullRotate={beginCropFullRotate}
                beginCropPan={beginCropPan}
                beginCropResize={beginCropResize}
                commitCropSession={commitCropSession}
                fullImageItem={cropSession.fullImageItem}
                previewItem={cropSession.previewItem}
                registerShapeRef={registerShapeRef}
                toCanvasPointer={toCanvasPointer}
                zoom={zoom}
              />
            ) : null}
            {!cropSession && !showGroupSelection && selectedRenderedItem ? (
              <SingleSelectionOverlay
                activeTool={activeTool}
                beginLineHandle={beginLineHandle}
                beginResize={beginResize}
                beginRotate={beginRotate}
                handleItemDoubleClick={handleItemDoubleClick}
                handleItemPointerDown={handleItemPointerDown}
                selectedItemId={selectedItemId}
                selectedRenderedItem={selectedRenderedItem}
                spacebarHeld={spacebarHeld}
                startPanDrag={startPanDrag}
                toCanvasPointer={toCanvasPointer}
                zoom={zoom}
              />
            ) : null}
          </Group>
        </Group>
      </Layer>
    </Stage>
  );
}
