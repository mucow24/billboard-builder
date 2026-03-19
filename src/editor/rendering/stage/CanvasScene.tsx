import { Group, Layer, Rect, Stage } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';

import type {
  CanvasItem,
  CanvasTool,
  GuideLine,
  ProjectDocument,
} from '../../document/documentTypes';
import type { Point, ResizeHandle } from '../interactionGeometry';
import type { RenderableCanvasItem } from '../renderAdapter';

import { CanvasGuidesLayer } from './CanvasGuidesLayer';
import { CanvasPreviewLayer } from './CanvasPreviewLayer';
import { CanvasSurface } from './CanvasSurface';
import { GroupSelectionOverlay } from './GroupSelectionOverlay';
import { LineItemView } from './LineItemView';
import { SELECTION_STROKE } from './renderConstants';
import { ShapeItemView } from './ShapeItemView';
import { SingleSelectionOverlay } from './SingleSelectionOverlay';

interface CanvasSceneProps {
  activeTool: CanvasTool;
  beginGroupDrag: (pointer: Point) => void;
  beginGroupResize: (handle: ResizeHandle, pointer: Point) => void;
  beginGroupRotate: (pointer: Point) => void;
  beginLineHandle: (
    item: Extract<CanvasItem, { kind: 'line' }>,
    handle: 'start' | 'end',
    pointer: Point,
  ) => void;
  beginResize: (
    item: Exclude<CanvasItem, Extract<CanvasItem, { kind: 'line' }>>,
    handle: ResizeHandle,
    pointer: Point,
  ) => void;
  beginRotate: (
    item: Exclude<CanvasItem, Extract<CanvasItem, { kind: 'line' }>>,
    pointer: Point,
  ) => void;
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
    shiftKey: boolean
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
  beginGroupDrag,
  beginGroupResize,
  beginGroupRotate,
  beginLineHandle,
  beginResize,
  beginRotate,
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
  stageCursor,
  stageRef,
  startPanDrag,
  subgroupOutlineFrames,
  toCanvasPointer,
  viewportPan,
  zoom,
}: CanvasSceneProps) {
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
          <CanvasSurface document={document} />
          <Group
            name="export-content"
            clipX={0}
            clipY={0}
            clipWidth={document.canvas.width}
            clipHeight={document.canvas.height}
          >
            {renderedItems.map((item) =>
              item.kind === 'line' ? (
                <LineItemView
                  key={item.id}
                  activeTool={activeTool}
                  isSelected={item.id === selectedItemId}
                  item={item}
                  selectableNodeId={item.selectableNodeId}
                  onItemDoubleClick={handleItemDoubleClick}
                  onBeginLineHandle={beginLineHandle}
                  onItemPointerDown={handleItemPointerDown}
                  renderSelection={false}
                  shapeRef={(node) => registerShapeRef(item.id, node)}
                  toCanvasPointer={toCanvasPointer}
                />
              ) : (
                <ShapeItemView
                  key={item.id}
                  activeTool={activeTool}
                  isSelected={item.id === selectedItemId}
                  item={item}
                  selectableNodeId={item.selectableNodeId}
                  onItemDoubleClick={handleItemDoubleClick}
                  onBeginResize={beginResize}
                  onBeginRotate={beginRotate}
                  onItemPointerDown={handleItemPointerDown}
                  renderSelection={false}
                  shapeRef={(node) => registerShapeRef(item.id, node)}
                  toCanvasPointer={toCanvasPointer}
                />
              ),
            )}
            <CanvasPreviewLayer session={session} />
            <CanvasGuidesLayer document={document} guides={guides} />
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
                beginGroupDrag={beginGroupDrag}
                beginGroupResize={beginGroupResize}
                beginGroupRotate={beginGroupRotate}
                beginLineHandle={beginLineHandle}
                beginResize={beginResize}
                beginRotate={beginRotate}
                groupOverlayFrame={groupOverlayFrame}
                handleItemPointerDown={handleItemPointerDown}
                renderedSelectedItems={renderedSelectedItems}
                startPanDrag={startPanDrag}
                toCanvasPointer={toCanvasPointer}
              />
            ) : null}
            {!showGroupSelection && selectedRenderedItem ? (
              <SingleSelectionOverlay
                activeTool={activeTool}
                beginLineHandle={beginLineHandle}
                beginResize={beginResize}
                beginRotate={beginRotate}
                handleItemPointerDown={handleItemPointerDown}
                selectedItemId={selectedItemId}
                selectedRenderedItem={selectedRenderedItem}
                toCanvasPointer={toCanvasPointer}
              />
            ) : null}
          </Group>
        </Group>
      </Layer>
    </Stage>
  );
}
