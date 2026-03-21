import type { CanvasItem, CanvasTool } from '../../document/documentTypes';
import type { Point, ResizeHandle } from '../interactionGeometry';
import type { RenderableCanvasItem } from '../renderAdapter';

import { LineItemView } from './LineItemView';
import { ShapeItemView } from './ShapeItemView';

interface SingleSelectionOverlayProps {
  activeTool: CanvasTool;
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
  handleItemDoubleClick?: (item: CanvasItem) => void;
  handleItemPointerDown: (
    item: CanvasItem,
    selectionNodeId: string,
    pointer: Point,
    shiftKey: boolean,
    nativeEvent?: MouseEvent,
  ) => void;
  selectedItemId?: string;
  selectedRenderedItem: RenderableCanvasItem;
  startPanDrag: (pointer: Point) => void;
  toCanvasPointer: (pointer: Point) => Point;
}

export function SingleSelectionOverlay({
  activeTool,
  beginLineHandle,
  beginResize,
  beginRotate,
  handleItemDoubleClick,
  handleItemPointerDown,
  selectedItemId,
  selectedRenderedItem,
  startPanDrag,
  toCanvasPointer,
}: SingleSelectionOverlayProps) {
  return selectedRenderedItem.kind === 'line' ? (
    <LineItemView
      key={`${selectedRenderedItem.id}-selection`}
      activeTool={activeTool}
      isSelected={selectedRenderedItem.id === selectedItemId}
      item={selectedRenderedItem}
      selectableNodeId={selectedRenderedItem.selectableNodeId}
      onItemDoubleClick={handleItemDoubleClick as (item: Extract<CanvasItem, { kind: 'line' }>) => void}
      onBeginLineHandle={beginLineHandle}
      onItemPointerDown={handleItemPointerDown as SingleSelectionOverlayProps['handleItemPointerDown']}
      renderContent={false}
      startPanDrag={startPanDrag}
      toCanvasPointer={toCanvasPointer}
    />
  ) : (
    <ShapeItemView
      key={`${selectedRenderedItem.id}-selection`}
      activeTool={activeTool}
      isSelected={selectedRenderedItem.id === selectedItemId}
      item={selectedRenderedItem}
      selectableNodeId={selectedRenderedItem.selectableNodeId}
      onItemDoubleClick={handleItemDoubleClick as (item: Exclude<CanvasItem, Extract<CanvasItem, { kind: 'line' }>>) => void}
      onBeginResize={beginResize}
      onBeginRotate={beginRotate}
      onItemPointerDown={handleItemPointerDown as SingleSelectionOverlayProps['handleItemPointerDown']}
      renderContent={false}
      startPanDrag={startPanDrag}
      toCanvasPointer={toCanvasPointer}
    />
  );
}
