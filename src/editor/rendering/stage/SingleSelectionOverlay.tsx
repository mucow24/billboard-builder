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
  handleItemPointerDown: (
    item: CanvasItem,
    selectionNodeId: string,
    pointer: Point,
    shiftKey: boolean
  ) => void;
  selectedItemId?: string;
  selectedRenderedItem: RenderableCanvasItem;
  toCanvasPointer: (pointer: Point) => Point;
}

export function SingleSelectionOverlay({
  activeTool,
  beginLineHandle,
  beginResize,
  beginRotate,
  handleItemPointerDown,
  selectedItemId,
  selectedRenderedItem,
  toCanvasPointer,
}: SingleSelectionOverlayProps) {
  return selectedRenderedItem.kind === 'line' ? (
    <LineItemView
      key={`${selectedRenderedItem.id}-selection`}
      activeTool={activeTool}
      isSelected={selectedRenderedItem.id === selectedItemId}
      item={selectedRenderedItem}
      selectableNodeId={selectedRenderedItem.selectableNodeId}
      onBeginLineHandle={beginLineHandle}
      onItemPointerDown={handleItemPointerDown as SingleSelectionOverlayProps['handleItemPointerDown']}
      renderContent={false}
      shapeRef={() => {}}
      toCanvasPointer={toCanvasPointer}
    />
  ) : (
    <ShapeItemView
      key={`${selectedRenderedItem.id}-selection`}
      activeTool={activeTool}
      isSelected={selectedRenderedItem.id === selectedItemId}
      item={selectedRenderedItem}
      selectableNodeId={selectedRenderedItem.selectableNodeId}
      onBeginResize={beginResize}
      onBeginRotate={beginRotate}
      onItemPointerDown={handleItemPointerDown as SingleSelectionOverlayProps['handleItemPointerDown']}
      renderContent={false}
      shapeRef={() => {}}
      toCanvasPointer={toCanvasPointer}
    />
  );
}
