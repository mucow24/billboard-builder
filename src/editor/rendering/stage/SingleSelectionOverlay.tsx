import { Rect } from 'react-konva';

import type { CanvasItem, CanvasTool, GeneratorCanvasItem, LineCanvasItem } from '../../document/documentTypes';

type ShapeItem = Exclude<CanvasItem, LineCanvasItem | GeneratorCanvasItem>;
import type { Point, ResizeHandle } from '../interactionGeometry';
import type { PointerGestureSource } from '../interactionSession';
import type { RenderableCanvasItem } from '../renderAdapter';

import { LineItemView } from './LineItemView';
import { getCanvasOverlayMetrics } from './overlayGeometry';
import { SELECTION_STROKE } from './renderConstants';
import { ShapeItemView } from './ShapeItemView';

interface SingleSelectionOverlayProps {
  activeTool: CanvasTool;
  beginLineHandle: (
    item: Extract<CanvasItem, { kind: 'line' }>,
    handle: 'start' | 'end',
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  beginResize: (
    item: ShapeItem,
    handle: ResizeHandle,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  beginRotate: (
    item: ShapeItem,
    pointer: Point,
    source?: PointerGestureSource,
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
  zoom: number;
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
  zoom,
}: SingleSelectionOverlayProps) {
  if (selectedRenderedItem.kind === 'generator') {
    const overlayMetrics = getCanvasOverlayMetrics(zoom);
    return (
      <Rect
        x={0}
        y={0}
        width={selectedRenderedItem.width}
        height={selectedRenderedItem.height}
        stroke={SELECTION_STROKE}
        strokeWidth={overlayMetrics.selectionStrokeWidth}
        dash={overlayMetrics.selectionDash}
        listening={false}
      />
    );
  }

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
      zoom={zoom}
    />
  ) : (
    <ShapeItemView
      key={`${selectedRenderedItem.id}-selection`}
      activeTool={activeTool}
      isSelected={selectedRenderedItem.id === selectedItemId}
      item={selectedRenderedItem}
      selectableNodeId={selectedRenderedItem.selectableNodeId}
      onItemDoubleClick={handleItemDoubleClick as (item: ShapeItem) => void}
      onBeginResize={beginResize}
      onBeginRotate={beginRotate}
      onItemPointerDown={handleItemPointerDown as SingleSelectionOverlayProps['handleItemPointerDown']}
      renderContent={false}
      startPanDrag={startPanDrag}
      toCanvasPointer={toCanvasPointer}
      zoom={zoom}
    />
  );
}
