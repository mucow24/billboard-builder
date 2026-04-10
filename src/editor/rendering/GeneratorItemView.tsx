import { memo, useRef } from 'react';
import { Group, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';

import type { CanvasItem, CanvasTool, GeneratorCanvasItem } from '../document/documentTypes';
import type { Point } from './interactionGeometry';
import { createItemPointerDownHandler } from './stage/itemPointerHandlers';
import { asKonvaMouseDown } from './renderer/normalizeKonvaEvent';
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
  spacebarHeld?: boolean;
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
  spacebarHeld = false,
  startPanDrag,
  toCanvasPointer,
}: GeneratorItemViewProps) {
  const generatorCanvas = useGeneratorCanvas(item, canvasWidth, canvasHeight);
  const interactionEnabled = activeTool === 'select';
  const groupRef = useRef<Konva.Group | null>(null);
  useBlurEffect(groupRef, item.blurRadius, item);

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
      onMouseDown={asKonvaMouseDown(createItemPointerDownHandler({
        isInteractive: () => interactionEnabled,
        panModifierHeld: spacebarHeld,
        startPanDrag,
        toCanvasPointer,
        onAction: (pointer, shiftKey, nativeEvent) =>
          onItemPointerDown(item, selectableNodeId, pointer, shiftKey, nativeEvent),
      }))}
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
