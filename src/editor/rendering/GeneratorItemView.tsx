import { memo, useRef } from 'react';
import { Group, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';

import type { CanvasItem, CanvasTool, GeneratorCanvasItem } from '../document/documentTypes';
import type { Point } from './interactionGeometry';
import { useBlurEffect } from './useBlurEffect';

import { useGeneratorCanvas } from '../generators/useGeneratorCanvas';

interface GeneratorItemViewProps {
  activeTool: CanvasTool;
  canvasWidth: number;
  canvasHeight: number;
  item: GeneratorCanvasItem;
  selectableNodeId: string;
  onItemPointerDown: (
    item: CanvasItem,
    selectionNodeId: string,
    pointer: Point,
    shiftKey: boolean,
    nativeEvent?: MouseEvent,
  ) => void;
  startPanDrag?: (pointer: Point) => void;
  toCanvasPointer: (pointer: Point) => Point;
}

export const GeneratorItemView = memo(function GeneratorItemView({
  activeTool,
  canvasWidth,
  canvasHeight,
  item,
  selectableNodeId,
  onItemPointerDown,
  startPanDrag,
  toCanvasPointer,
}: GeneratorItemViewProps) {
  const generatorCanvas = useGeneratorCanvas(item, canvasWidth, canvasHeight);
  const interactionEnabled = activeTool === 'select';
  const groupRef = useRef<Konva.Group | null>(null);
  useBlurEffect(groupRef, item.blurRadius);

  return (
    <Group
      ref={groupRef}
      id={`render-item-${item.id}`}
      name={`render-item render-item-generator`}
      x={0}
      y={0}
      opacity={item.opacity}
      visible={!item.hidden}
      listening={interactionEnabled}
      onMouseDown={(event) => {
        if (!interactionEnabled) return;
        const pointer = event.target.getStage()?.getPointerPosition();
        if (!pointer) return;
        if (event.evt.button === 1) {
          if (!startPanDrag) return;
          event.cancelBubble = true;
          startPanDrag(pointer);
          return;
        }
        event.cancelBubble = true;
        onItemPointerDown(
          item,
          selectableNodeId,
          toCanvasPointer(pointer),
          event.evt.shiftKey,
          event.evt,
        );
      }}
      onTap={() => {
        if (interactionEnabled) {
          onItemPointerDown(item, selectableNodeId, { x: 0, y: 0 }, false);
        }
      }}
    >
      {generatorCanvas ? (
        <KonvaImage
          image={generatorCanvas}
          width={canvasWidth}
          height={canvasHeight}
          listening={interactionEnabled}
        />
      ) : null}
    </Group>
  );
});
