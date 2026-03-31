import type Konva from 'konva';

import type { CanvasItem, CanvasTool, GeneratorCanvasItem, LineCanvasItem } from '../../document/documentTypes';
import type { Point, ResizeHandle } from '../interactionGeometry';
import type { RenderableCanvasItem } from '../renderAdapter';

import { GeneratorItemView } from '../GeneratorItemView';
import { LineItemView } from './LineItemView';
import { ShapeItemView } from './ShapeItemView';

type ShapeItem = Exclude<CanvasItem, LineCanvasItem | GeneratorCanvasItem>;

interface CanvasItemLayerProps {
  activeTool: CanvasTool;
  canvasWidth: number;
  canvasHeight: number;
  interactive?: boolean;
  items: RenderableCanvasItem[];
  onBeginLineHandle?: (
    item: Extract<CanvasItem, { kind: 'line' }>,
    handle: 'start' | 'end',
    pointer: Point,
  ) => void;
  onBeginResize?: (
    item: ShapeItem,
    handle: ResizeHandle,
    pointer: Point,
  ) => void;
  onBeginRotate?: (
    item: ShapeItem,
    pointer: Point,
  ) => void;
  onItemDoubleClick?: (item: CanvasItem) => void;
  onItemPointerDown?: (
    item: CanvasItem,
    selectionNodeId: string,
    pointer: Point,
    shiftKey: boolean,
    nativeEvent?: MouseEvent,
  ) => void;
  registerShapeRef?: (itemId: string, node: Konva.Node | null) => void;
  selectedItemId?: string;
  startPanDrag?: (pointer: Point) => void;
  toCanvasPointer: (pointer: Point) => Point;
}

const NOOP_REGISTER_SHAPE_REF = () => {};
const NOOP_BEGIN_LINE_HANDLE = () => {};
const NOOP_BEGIN_RESIZE = () => {};
const NOOP_BEGIN_ROTATE = () => {};
const NOOP_ITEM_DOUBLE_CLICK = () => {};
const NOOP_ITEM_POINTER_DOWN = () => {};
const NOOP_START_PAN_DRAG = () => {};

export function CanvasItemLayer({
  activeTool,
  canvasWidth,
  canvasHeight,
  interactive = true,
  items,
  onBeginLineHandle = NOOP_BEGIN_LINE_HANDLE,
  onBeginResize = NOOP_BEGIN_RESIZE,
  onBeginRotate = NOOP_BEGIN_ROTATE,
  onItemDoubleClick = NOOP_ITEM_DOUBLE_CLICK,
  onItemPointerDown = NOOP_ITEM_POINTER_DOWN,
  registerShapeRef = NOOP_REGISTER_SHAPE_REF,
  selectedItemId,
  startPanDrag = NOOP_START_PAN_DRAG,
  toCanvasPointer,
}: CanvasItemLayerProps) {
  const effectiveTool: CanvasTool = interactive ? activeTool : 'pan';

  return (
    <>
      {items.map((item) =>
        item.kind === 'generator' ? (
          <GeneratorItemView
            key={item.id}
            activeTool={effectiveTool}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            item={item}
            selectableNodeId={item.selectableNodeId}
            onItemPointerDown={onItemPointerDown}
            startPanDrag={startPanDrag}
            toCanvasPointer={toCanvasPointer}
          />
        ) : item.kind === 'line' ? (
          <LineItemView
            key={item.id}
            activeTool={effectiveTool}
            isSelected={interactive && item.id === selectedItemId}
            item={item}
            selectableNodeId={item.selectableNodeId}
            onItemDoubleClick={onItemDoubleClick as (item: Extract<CanvasItem, { kind: 'line' }>) => void}
            onBeginLineHandle={onBeginLineHandle}
            onItemPointerDown={onItemPointerDown as (
              item: Extract<CanvasItem, { kind: 'line' }>,
              selectionNodeId: string,
              pointer: Point,
              shiftKey: boolean,
              nativeEvent?: MouseEvent,
            ) => void}
            renderSelection={false}
            registerShapeRef={registerShapeRef}
            startPanDrag={startPanDrag}
            toCanvasPointer={toCanvasPointer}
          />
        ) : (
          <ShapeItemView
            key={item.id}
            activeTool={effectiveTool}
            isSelected={interactive && item.id === selectedItemId}
            item={item as RenderableCanvasItem & ShapeItem}
            selectableNodeId={item.selectableNodeId}
            onItemDoubleClick={onItemDoubleClick as (item: ShapeItem) => void}
            onBeginResize={onBeginResize}
            onBeginRotate={onBeginRotate}
            onItemPointerDown={onItemPointerDown as (
              item: ShapeItem,
              selectionNodeId: string,
              pointer: Point,
              shiftKey: boolean,
              nativeEvent?: MouseEvent,
            ) => void}
            renderSelection={false}
            registerShapeRef={registerShapeRef}
            startPanDrag={startPanDrag}
            toCanvasPointer={toCanvasPointer}
          />
        ),
      )}
    </>
  );
}
