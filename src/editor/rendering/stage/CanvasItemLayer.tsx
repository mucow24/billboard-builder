import type Konva from 'konva';

import type { CanvasItem, CanvasTool, GeneratorCanvasItem, LineCanvasItem } from '../../document/documentTypes';
import type { Point, ResizeHandle } from '../interactionGeometry';
import type { RenderableCanvasItem } from '../renderAdapter';

import { NOOP } from '../noop';
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

export function CanvasItemLayer({
  activeTool,
  canvasWidth,
  canvasHeight,
  interactive = true,
  items,
  onBeginLineHandle = NOOP,
  onBeginResize = NOOP,
  onBeginRotate = NOOP,
  onItemDoubleClick = NOOP,
  onItemPointerDown = NOOP,
  registerShapeRef = NOOP,
  selectedItemId,
  startPanDrag = NOOP,
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
