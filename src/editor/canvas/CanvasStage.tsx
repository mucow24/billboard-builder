import {
  Circle,
  Ellipse,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
} from 'react-konva';
import type Konva from 'konva';

import {
  getLineHandleRects,
  getSelectionOutlinePoints,
  getShapeHandlePoints,
  getShapeHandleRects,
  RESIZE_HANDLE_NAMES,
  type Point,
  type ResizeHandle,
} from './interactionGeometry';
import { getRenderBox } from './transformGeometry';
import { useCanvasInteractionSession } from './useCanvasInteractionSession';
import { useImageElement } from './useImageElement';
import type {
  CanvasItem,
  CanvasTool,
  GuideLine,
  LineCanvasItem,
  ProjectDocumentV1,
} from '../model/types';

interface CanvasStageProps {
  activeTool: CanvasTool;
  document: ProjectDocumentV1;
  guides: GuideLine[];
  onGuidesChange: (guides: GuideLine[]) => void;
  onSelectItem: (itemId?: string) => void;
  onUpdateItem: (itemId: string, changes: Partial<CanvasItem>) => void;
  onAddItem: (item: CanvasItem) => void;
  onSetActiveTool: (tool: CanvasTool) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
}

type ShapeItem = Exclude<CanvasItem, LineCanvasItem>;

function buildHandleDebug(clientRect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return {
    rightMiddle: {
      x: clientRect.x + clientRect.width,
      y: clientRect.y + clientRect.height / 2,
    },
    rotater: {
      x: clientRect.x + clientRect.width / 2,
      y: clientRect.y - 50,
    },
  };
}

function ShapeItemView({
  activeTool,
  isSelected,
  item,
  onBeginDrag,
  onBeginResize,
  onBeginRotate,
  onSelectItem,
  shapeRef,
}: {
  activeTool: CanvasTool;
  isSelected: boolean;
  item: ShapeItem;
  onBeginDrag: (item: ShapeItem, pointer: Point) => void;
  onBeginResize: (item: ShapeItem, handle: ResizeHandle, pointer: Point) => void;
  onBeginRotate: (item: ShapeItem, pointer: Point) => void;
  onSelectItem: (itemId?: string) => void;
  shapeRef: (node: Konva.Node | null) => void;
}) {
  const imageElement = useImageElement(item.kind === 'image' ? item.src : '');
  const renderBox = getRenderBox(item);
  const handlePoints = getShapeHandlePoints(item);
  const outlinePoints = getSelectionOutlinePoints(item);

  return (
    <>
      <Group
        ref={shapeRef}
        x={renderBox.x}
        y={renderBox.y}
        rotation={item.rotation}
        opacity={item.opacity}
        visible={!item.hidden}
        listening={activeTool === 'select'}
        onMouseDown={(event) => {
          if (activeTool !== 'select' || item.locked) {
            return;
          }
          const pointer = event.target.getStage()?.getPointerPosition();
          if (!pointer) {
            return;
          }
          event.cancelBubble = true;
          onSelectItem(item.id);
          onBeginDrag(item, pointer);
        }}
        onTap={() => {
          if (activeTool === 'select') {
            onSelectItem(item.id);
          }
        }}
      >
        <Rect
          x={0}
          y={0}
          width={renderBox.width}
          height={renderBox.height}
          fill="rgba(0,0,0,0)"
          strokeEnabled={false}
          listening={activeTool === 'select'}
        />
        {item.kind === 'text' ? (
          <Text
            x={0}
            y={0}
            fill={item.fill}
            fontFamily={item.fontFamily}
            fontSize={item.fontSize}
            fontStyle={item.fontWeight === 'bold' ? 'bold' : item.fontStyle}
            align={item.align}
            lineHeight={item.lineHeight}
            letterSpacing={item.letterSpacing}
            text={item.text}
            width={renderBox.width}
            height={renderBox.height}
            perfectDrawEnabled={false}
            listening={false}
          />
        ) : null}
        {item.kind === 'rectangle' ? (
          <Rect
            x={0}
            y={0}
            fill={item.fill}
            stroke={item.stroke}
            strokeWidth={item.strokeWidth}
            cornerRadius={item.cornerRadius}
            width={renderBox.width}
            height={renderBox.height}
            listening={false}
          />
        ) : null}
        {item.kind === 'ellipse' ? (
          <Ellipse
            x={renderBox.width / 2}
            y={renderBox.height / 2}
            fill={item.fill}
            stroke={item.stroke}
            strokeWidth={item.strokeWidth}
            radiusX={renderBox.width / 2}
            radiusY={renderBox.height / 2}
            listening={false}
          />
        ) : null}
        {item.kind === 'image' ? (
          <KonvaImage
            x={0}
            y={0}
            image={imageElement ?? undefined}
            width={renderBox.width}
            height={renderBox.height}
            listening={false}
          />
        ) : null}
      </Group>
      {isSelected && activeTool === 'select' ? (
        <>
          <Line
            points={[...outlinePoints, outlinePoints[0], outlinePoints[1]]}
            stroke="#38bdf8"
            strokeWidth={2}
            dash={[8, 4]}
            listening={false}
          />
          <Line
            points={[
              handlePoints['top-center'].x,
              handlePoints['top-center'].y,
              handlePoints.rotater.x,
              handlePoints.rotater.y,
            ]}
            stroke="#38bdf8"
            strokeWidth={2}
            listening={false}
          />
          {RESIZE_HANDLE_NAMES.map((handle) => {
            const point = handlePoints[handle];
            return (
              <Circle
                key={`${item.id}-${handle}`}
                x={point.x}
                y={point.y}
                radius={8}
                fill="#f8fafc"
                stroke="#38bdf8"
                strokeWidth={2}
                onMouseDown={(event) => {
                  if (item.locked) {
                    return;
                  }
                  const pointer = event.target.getStage()?.getPointerPosition();
                  if (!pointer) {
                    return;
                  }
                  event.cancelBubble = true;
                  onBeginResize(item, handle, pointer);
                }}
              />
            );
          })}
          <Circle
            x={handlePoints.rotater.x}
            y={handlePoints.rotater.y}
            radius={8}
            fill="#f8fafc"
            stroke="#38bdf8"
            strokeWidth={2}
            onMouseDown={(event) => {
              if (item.locked) {
                return;
              }
              const pointer = event.target.getStage()?.getPointerPosition();
              if (!pointer) {
                return;
              }
              event.cancelBubble = true;
              onBeginRotate(item, pointer);
            }}
          />
        </>
      ) : null}
    </>
  );
}

function LineItemView({
  activeTool,
  isSelected,
  item,
  onBeginDrag,
  onBeginLineHandle,
  onSelectItem,
  shapeRef,
}: {
  activeTool: CanvasTool;
  isSelected: boolean;
  item: LineCanvasItem;
  onBeginDrag: (item: LineCanvasItem, pointer: Point) => void;
  onBeginLineHandle: (item: LineCanvasItem, handle: 'start' | 'end', pointer: Point) => void;
  onSelectItem: (itemId?: string) => void;
  shapeRef: (node: Konva.Node | null) => void;
}) {
  const lineHandleRects = getLineHandleRects(item);

  return (
    <>
      <Line
        ref={shapeRef}
        points={[item.startX, item.startY, item.endX, item.endY]}
        stroke={item.stroke}
        strokeWidth={item.strokeWidth}
        opacity={item.opacity}
        visible={!item.hidden}
        hitStrokeWidth={Math.max(item.strokeWidth + 12, 20)}
        listening={activeTool === 'select'}
        onMouseDown={(event) => {
          if (activeTool !== 'select' || item.locked) {
            return;
          }
          const pointer = event.target.getStage()?.getPointerPosition();
          if (!pointer) {
            return;
          }
          event.cancelBubble = true;
          onSelectItem(item.id);
          onBeginDrag(item, pointer);
        }}
        onTap={() => {
          if (activeTool === 'select') {
            onSelectItem(item.id);
          }
        }}
      />
      {isSelected && activeTool === 'select' ? (
        <>
          {(['start', 'end'] as const).map((handle) => {
            const rect = lineHandleRects[handle];
            return (
              <Circle
                key={`${item.id}-${handle}`}
                x={rect.x + rect.width / 2}
                y={rect.y + rect.height / 2}
                radius={8}
                fill="#f8fafc"
                stroke="#0f172a"
                strokeWidth={2}
                onMouseDown={(event) => {
                  if (item.locked) {
                    return;
                  }
                  const pointer = event.target.getStage()?.getPointerPosition();
                  if (!pointer) {
                    return;
                  }
                  event.cancelBubble = true;
                  onBeginLineHandle(item, handle, pointer);
                }}
              />
            );
          })}
        </>
      ) : null}
    </>
  );
}

export function CanvasStage({
  activeTool,
  document,
  guides,
  onGuidesChange,
  onSelectItem,
  onUpdateItem,
  onAddItem,
  onSetActiveTool,
  stageRef,
}: CanvasStageProps) {
  const {
    beginDrag,
    beginLineHandle,
    beginResize,
    beginRotate,
    handleStageMouseDown,
    handleStageMouseUp,
    nodeClientRect,
    registerShapeRef,
    renderedItems,
    selectedDocumentItem,
    selectedNode,
    selectedRenderedItem,
    selectedItemId,
    session,
  } = useCanvasInteractionSession({
    activeTool,
    document,
    onGuidesChange,
    onSelectItem,
    onUpdateItem,
    onAddItem,
    onSetActiveTool,
    stageRef,
  });
  const previewItem = session?.previewItem ?? null;
  const debugInfo = {
    stageSize: {
      width: document.canvas.width,
      height: document.canvas.height,
    },
    sessionKind: session?.kind ?? null,
    sessionHandle:
      session?.kind === 'resize' ||
      session?.kind === 'rotate' ||
      session?.kind === 'line-handle'
        ? session.handle
        : null,
    activeAnchor:
      session?.kind === 'resize' ||
      session?.kind === 'rotate'
        ? session.handle
        : null,
    documentItem: selectedDocumentItem
      ? {
          ...getRenderBox(selectedDocumentItem),
          rotation: selectedDocumentItem.rotation,
          kind: selectedDocumentItem.kind,
          id: selectedDocumentItem.id,
        }
      : null,
    previewItem: previewItem
      ? {
          ...getRenderBox(previewItem),
          rotation: previewItem.rotation,
          kind: previewItem.kind,
          id: previewItem.id,
        }
      : null,
    node: selectedNode
      ? {
          x: selectedNode.x(),
          y: selectedNode.y(),
          rotation: selectedNode.rotation(),
          scaleX: selectedNode.scaleX(),
          scaleY: selectedNode.scaleY(),
        }
      : null,
    nodeClientRect,
    anchorClientRects:
      selectedRenderedItem && selectedRenderedItem.kind !== 'line'
        ? getShapeHandleRects(selectedRenderedItem)
        : null,
    handles: nodeClientRect ? buildHandleDebug(nodeClientRect) : null,
    lineHandleRects:
      selectedRenderedItem?.kind === 'line'
        ? getLineHandleRects(selectedRenderedItem)
        : null,
  };

  return (
    <div className="canvas-frame">
      <div className="canvas-meta">
        <span data-testid="canvas-size">
          {document.canvas.width} x {document.canvas.height}
        </span>
        <span data-testid="guide-count">Guides: {guides.length}</span>
      </div>
      <div className="canvas-scroll">
        <div className="stage-shell" data-testid="canvas-transform-debug">
          <Stage
            ref={stageRef}
            width={document.canvas.width}
            height={document.canvas.height}
            className="editor-stage"
            style={{
              cursor: activeTool === 'select' ? 'default' : 'crosshair',
            }}
            onMouseDown={handleStageMouseDown}
            onMouseUp={handleStageMouseUp}
          >
            <Layer>
              <Rect
                name="canvas-background"
                x={0}
                y={0}
                width={document.canvas.width}
                height={document.canvas.height}
                fill={document.background}
              />
              {renderedItems.map((item) =>
                item.kind === 'line' ? (
                  <LineItemView
                    key={item.id}
                    activeTool={activeTool}
                    isSelected={item.id === selectedItemId}
                    item={item}
                    onBeginDrag={beginDrag}
                    onBeginLineHandle={beginLineHandle}
                    onSelectItem={onSelectItem}
                    shapeRef={(node) => registerShapeRef(item.id, node)}
                  />
                ) : (
                  <ShapeItemView
                    key={item.id}
                    activeTool={activeTool}
                    isSelected={item.id === selectedItemId}
                    item={item}
                    onBeginDrag={beginDrag}
                    onBeginResize={beginResize}
                    onBeginRotate={beginRotate}
                    onSelectItem={onSelectItem}
                    shapeRef={(node) => registerShapeRef(item.id, node)}
                  />
                )
              )}
              {guides.map((guide) =>
                guide.orientation === 'vertical' ? (
                  <Line
                    key={`guide-v-${guide.position}`}
                    points={[guide.position, 0, guide.position, document.canvas.height]}
                    stroke="#38bdf8"
                    dash={[8, 4]}
                    listening={false}
                  />
                ) : (
                  <Line
                    key={`guide-h-${guide.position}`}
                    points={[0, guide.position, document.canvas.width, guide.position]}
                    stroke="#38bdf8"
                    dash={[8, 4]}
                    listening={false}
                  />
                )
              )}
            </Layer>
          </Stage>
        </div>
        <div className="canvas-debug" aria-hidden="true">
          <pre data-testid="stage-debug">{JSON.stringify(debugInfo)}</pre>
          <pre data-testid="selected-item-debug">{JSON.stringify(debugInfo)}</pre>
        </div>
      </div>
    </div>
  );
}
