import { Group, Layer, Stage } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';

import type {
  CanvasItem,
  CanvasTool,
  GuideLine,
  ProjectDocumentV1,
} from '../../document/documentTypes';
import type { Point, ResizeHandle } from '../interactionGeometry';

import { CanvasGuidesLayer } from './CanvasGuidesLayer';
import { CanvasPreviewLayer } from './CanvasPreviewLayer';
import { CanvasSurface } from './CanvasSurface';
import { GroupSelectionOverlay } from './GroupSelectionOverlay';
import { LineItemView } from './LineItemView';
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
  document: ProjectDocumentV1;
  groupOverlayFrame: {
    bounds: { x: number; y: number; width: number; height: number };
    rotation: number;
  } | null;
  guides: GuideLine[];
  handleItemPointerDown: (item: CanvasItem, pointer: Point, shiftKey: boolean) => void;
  onStageMouseDown: (event: KonvaEventObject<MouseEvent>) => void;
  onStageMouseLeave: () => void;
  onStageMouseMove: (event: KonvaEventObject<MouseEvent>) => void;
  onStageMouseUp: (event: KonvaEventObject<MouseEvent>) => void;
  onStageWheel: (event: KonvaEventObject<WheelEvent>) => void;
  registerShapeRef: (itemId: string, node: Konva.Node | null) => void;
  renderedItems: CanvasItem[];
  renderedSelectedItems: CanvasItem[];
  selectedItemId?: string;
  selectedRenderedItem: CanvasItem | null;
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
