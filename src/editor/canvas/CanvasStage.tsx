import { useEffect, useMemo, useRef } from 'react';
import {
  Circle,
  Ellipse,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from 'react-konva';
import type Konva from 'konva';

import { getSnappedRect } from './snapping';
import { useImageElement } from './useImageElement';
import type {
  CanvasItem,
  GuideLine,
  LineCanvasItem,
  ProjectDocumentV1,
} from '../model/types';

interface CanvasStageProps {
  activeTool: 'select' | 'text' | 'rectangle' | 'ellipse' | 'line';
  document: ProjectDocumentV1;
  guides: GuideLine[];
  onGuidesChange: (guides: GuideLine[]) => void;
  onLiveUpdateItem: (itemId: string, changes: Partial<CanvasItem>) => void;
  onSelectItem: (itemId?: string) => void;
  onUpdateItem: (itemId: string, changes: Partial<CanvasItem>) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
}

interface ItemViewProps {
  activeTool: CanvasStageProps['activeTool'];
  isSelected: boolean;
  item: CanvasItem;
  siblingItems: CanvasItem[];
  stageSize: { width: number; height: number };
  shapeRef: (node: Konva.Node | null) => void;
  onGuidesChange: (guides: GuideLine[]) => void;
  onSelectItem: (itemId?: string) => void;
  onUpdateItem: (itemId: string, changes: Partial<CanvasItem>) => void;
}

function LineHandles({
  item,
  siblingItems,
  stageSize,
  onGuidesChange,
  onUpdateItem,
}: {
  item: LineCanvasItem;
  siblingItems: CanvasItem[];
  stageSize: { width: number; height: number };
  onGuidesChange: (guides: GuideLine[]) => void;
  onUpdateItem: (itemId: string, changes: Partial<CanvasItem>) => void;
}) {
  const handles = [
    { key: 'start', x: item.startX, y: item.startY },
    { key: 'end', x: item.endX, y: item.endY },
  ] as const;

  return handles.map((handle) => (
    <Circle
      key={`${item.id}-${handle.key}`}
      x={handle.x}
      y={handle.y}
      radius={8}
      fill="#f8fafc"
      stroke="#0f172a"
      strokeWidth={2}
      draggable
      onDragMove={(event) => {
        const handleRect = {
          x: event.target.x() - 1,
          y: event.target.y() - 1,
          width: 2,
          height: 2,
        };
        const snapped = getSnappedRect(
          handleRect,
          siblingItems,
          { x: 0, y: 0, width: stageSize.width, height: stageSize.height }
        );
        event.target.position({
          x: snapped.rect.x + 1,
          y: snapped.rect.y + 1,
        });
        onGuidesChange(snapped.guides);
      }}
      onDragEnd={(event) => {
        onGuidesChange([]);
        if (handle.key === 'start') {
          onUpdateItem(item.id, {
            startX: event.target.x(),
            startY: event.target.y(),
          });
          return;
        }
        onUpdateItem(item.id, {
          endX: event.target.x(),
          endY: event.target.y(),
        });
      }}
    />
  ));
}

function ItemView({
  activeTool,
  isSelected,
  item,
  siblingItems,
  stageSize,
  shapeRef,
  onGuidesChange,
  onSelectItem,
  onUpdateItem,
}: ItemViewProps) {
  const imageElement = useImageElement(item.kind === 'image' ? item.src : '');

  if (item.kind === 'line') {
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
          draggable={activeTool === 'select' && !item.locked}
          onClick={() => onSelectItem(item.id)}
          onTap={() => onSelectItem(item.id)}
          onDragMove={(event) => {
            const deltaX = event.target.x();
            const deltaY = event.target.y();
            const rect = {
              x: Math.min(item.startX, item.endX) + deltaX,
              y: Math.min(item.startY, item.endY) + deltaY,
              width: Math.abs(item.endX - item.startX),
              height: Math.abs(item.endY - item.startY),
            };
            const snapped = getSnappedRect(
              rect,
              siblingItems,
              { x: 0, y: 0, width: stageSize.width, height: stageSize.height }
            );
            event.target.position({
              x: snapped.rect.x - Math.min(item.startX, item.endX),
              y: snapped.rect.y - Math.min(item.startY, item.endY),
            });
            onGuidesChange(snapped.guides);
          }}
          onDragEnd={(event) => {
            const deltaX = event.target.x();
            const deltaY = event.target.y();
            event.target.position({ x: 0, y: 0 });
            onGuidesChange([]);
            onUpdateItem(item.id, {
              startX: item.startX + deltaX,
              startY: item.startY + deltaY,
              endX: item.endX + deltaX,
              endY: item.endY + deltaY,
            });
          }}
        />
        {isSelected ? (
          <LineHandles
            item={item}
            siblingItems={siblingItems}
            stageSize={stageSize}
            onGuidesChange={onGuidesChange}
            onUpdateItem={onUpdateItem}
          />
        ) : null}
      </>
    );
  }

  const commonProps = {
    ref: shapeRef,
    x: item.x,
    y: item.y,
    rotation: item.rotation,
    opacity: item.opacity,
    draggable: activeTool === 'select' && !item.locked,
    visible: !item.hidden,
    onClick: () => onSelectItem(item.id),
    onTap: () => onSelectItem(item.id),
    onDragMove: (event: Konva.KonvaEventObject<DragEvent>) => {
      const node = event.target;
      const rect = {
        x: node.x(),
        y: node.y(),
        width: item.width * item.scaleX,
        height: item.height * item.scaleY,
      };
      const snapped = getSnappedRect(
        rect,
        siblingItems,
        { x: 0, y: 0, width: stageSize.width, height: stageSize.height }
      );
      node.position({ x: snapped.rect.x, y: snapped.rect.y });
      onGuidesChange(snapped.guides);
    },
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
      onGuidesChange([]);
      onUpdateItem(item.id, {
        x: event.target.x(),
        y: event.target.y(),
      });
    },
  };

  switch (item.kind) {
    case 'text':
      return (
        <Text
          {...commonProps}
          fill={item.fill}
          fontFamily={item.fontFamily}
          fontSize={item.fontSize}
          fontStyle={item.fontWeight === 'bold' ? 'bold' : item.fontStyle}
          align={item.align}
          lineHeight={item.lineHeight}
          letterSpacing={item.letterSpacing}
          text={item.text}
          width={item.width}
          scaleX={item.scaleX}
          scaleY={item.scaleY}
          perfectDrawEnabled={false}
        />
      );
    case 'rectangle':
      return (
        <Rect
          {...commonProps}
          fill={item.fill}
          stroke={item.stroke}
          strokeWidth={item.strokeWidth}
          cornerRadius={item.cornerRadius}
          width={item.width}
          height={item.height}
          scaleX={item.scaleX}
          scaleY={item.scaleY}
        />
      );
    case 'ellipse':
      return (
        <Ellipse
          {...commonProps}
          fill={item.fill}
          stroke={item.stroke}
          strokeWidth={item.strokeWidth}
          radiusX={item.width / 2}
          radiusY={item.height / 2}
          offsetX={-item.width / 2}
          offsetY={-item.height / 2}
          scaleX={item.scaleX}
          scaleY={item.scaleY}
        />
      );
    case 'image':
      return (
        <KonvaImage
          {...commonProps}
          image={imageElement ?? undefined}
          width={item.width}
          height={item.height}
          scaleX={item.scaleX}
          scaleY={item.scaleY}
        />
      );
  }
}

export function CanvasStage({
  activeTool,
  document,
  guides,
  onGuidesChange,
  onLiveUpdateItem,
  onSelectItem,
  onUpdateItem,
  stageRef,
}: CanvasStageProps) {
  const transformerRef = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef(new Map<string, Konva.Node>());
  const selectedItemId = document.selectedItemIds[0];
  const selectedItem = document.items.find((item) => item.id === selectedItemId);

  useEffect(() => {
    if (!transformerRef.current) {
      return;
    }
    if (!selectedItemId || selectedItem?.kind === 'line') {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
      return;
    }
    const node = shapeRefs.current.get(selectedItemId);
    if (!node) {
      return;
    }
    transformerRef.current.nodes([node]);
    transformerRef.current.keepRatio(
      selectedItem?.kind === 'image' ? selectedItem.preserveAspectRatio : false
    );
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedItem, selectedItemId]);

  const orderedItems = useMemo(
    () => document.items.slice().sort((left, right) => left.zIndex - right.zIndex),
    [document.items]
  );

  function getTransformerChanges() {
    if (!selectedItemId || !selectedItem || selectedItem.kind === 'line') {
      return null;
    }
    const node = shapeRefs.current.get(selectedItemId);
    if (!node) {
      return null;
    }

    const width = Math.max(20, node.width() * node.scaleX());
    const height = Math.max(20, node.height() * node.scaleY());
    const changes: Partial<CanvasItem> = {
      x: node.x(),
      y: node.y(),
      width,
      height,
      rotation: node.rotation(),
    };

    node.scaleX(1);
    node.scaleY(1);
    return changes;
  }

  return (
    <div className="canvas-frame">
      <div className="canvas-meta">
        <span data-testid="canvas-size">
          {document.canvas.width} x {document.canvas.height}
        </span>
        <span data-testid="guide-count">Guides: {guides.length}</span>
      </div>
      <div className="canvas-scroll">
        <div className="stage-shell">
          <Stage
            ref={stageRef}
            width={document.canvas.width}
            height={document.canvas.height}
            className="editor-stage"
            onMouseDown={(event) => {
              const pointer = event.target.getStage()?.getPointerPosition();
              const isStageClick =
                event.target === event.target.getStage() ||
                event.target.name() === 'canvas-background';
              if (!isStageClick || !pointer) {
                return;
              }
              onGuidesChange([]);
              onSelectItem(undefined);
            }}
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
              {orderedItems.map((item) => (
                <ItemView
                  key={item.id}
                  activeTool={activeTool}
                  isSelected={item.id === selectedItemId}
                  item={item}
                  siblingItems={orderedItems.filter((entry) => entry.id !== item.id)}
                  stageSize={document.canvas}
                  shapeRef={(node) => {
                    if (!node) {
                      shapeRefs.current.delete(item.id);
                      return;
                    }
                    shapeRefs.current.set(item.id, node);
                  }}
                  onGuidesChange={onGuidesChange}
                  onSelectItem={onSelectItem}
                  onUpdateItem={onUpdateItem}
                />
              ))}
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
              <Transformer
                ref={transformerRef}
                rotateEnabled
                flipEnabled={false}
                boundBoxFunc={(oldBox, newBox) => {
                  if (!selectedItem || selectedItem.kind === 'line') {
                    return newBox;
                  }
                  const snapped = getSnappedRect(
                    {
                      x: newBox.x,
                      y: newBox.y,
                      width: Math.max(newBox.width, 20),
                      height: Math.max(newBox.height, 20),
                    },
                    orderedItems.filter((item) => item.id !== selectedItem.id),
                    { x: 0, y: 0, width: document.canvas.width, height: document.canvas.height }
                  );
                  onGuidesChange(snapped.guides);
                  return {
                    ...oldBox,
                    x: snapped.rect.x,
                    y: snapped.rect.y,
                    width: snapped.rect.width,
                    height: snapped.rect.height,
                  };
                }}
                onTransform={() => {
                  const changes = getTransformerChanges();
                  if (!changes || !selectedItemId) {
                    return;
                  }
                  onLiveUpdateItem(selectedItemId, changes);
                }}
                onTransformEnd={() => {
                  const changes = getTransformerChanges();
                  if (!changes || !selectedItemId) {
                    return;
                  }
                  onGuidesChange([]);
                  onUpdateItem(selectedItemId, changes);
                }}
              />
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
}
