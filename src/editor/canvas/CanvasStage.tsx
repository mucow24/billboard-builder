import { useEffect, useMemo, useRef, useState } from 'react';
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
  Transformer,
} from 'react-konva';
import type Konva from 'konva';

import { getResizeSnappedRect, getSnappedRect } from './snapping';
import {
  applyPreviewToItem,
  buildTransformCommit,
  getRenderBox,
  type TransformPreview,
  type TransformSnapshot,
} from './transformGeometry';
import { shouldApplyLiveTransform } from './transformMode';
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
  onSelectItem: (itemId?: string) => void;
  onUpdateItem: (itemId: string, changes: Partial<CanvasItem>) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
}

interface LineItemViewProps {
  activeTool: CanvasStageProps['activeTool'];
  isSelected: boolean;
  item: LineCanvasItem;
  siblingItems: CanvasItem[];
  stageSize: { width: number; height: number };
  shapeRef: (node: Konva.Node | null) => void;
  onGuidesChange: (guides: GuideLine[]) => void;
  onPreviewItem: (preview: LineCanvasItem | null) => void;
  onSelectItem: (itemId?: string) => void;
  onUpdateItem: (itemId: string, changes: Partial<CanvasItem>) => void;
}

interface ShapeItemViewProps {
  activeTool: CanvasStageProps['activeTool'];
  item: Exclude<CanvasItem, LineCanvasItem>;
  siblingItems: CanvasItem[];
  stageSize: { width: number; height: number };
  shapeRef: (node: Konva.Node | null) => void;
  onGuidesChange: (guides: GuideLine[]) => void;
  onSelectItem: (itemId?: string) => void;
  onUpdateItem: (itemId: string, changes: Partial<CanvasItem>) => void;
}

function applyLinePreview<T extends CanvasItem>(
  item: T,
  preview: LineCanvasItem | null
): T {
  if (!preview || item.kind !== 'line' || item.id !== preview.id) {
    return item;
  }

  return preview as T;
}

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

function getLineHandleRects(item: LineCanvasItem | undefined) {
  if (!item) {
    return null;
  }

  return {
    start: {
      x: item.startX - 8,
      y: item.startY - 8,
      width: 16,
      height: 16,
    },
    end: {
      x: item.endX - 8,
      y: item.endY - 8,
      width: 16,
      height: 16,
    },
  };
}

function getTransformerAnchorRects(
  transformer: Konva.Transformer | null,
  stage: Konva.Stage | null
) {
  if (!transformer || !stage) {
    return null;
  }

  const anchorNames = [
    'top-left',
    'top-center',
    'top-right',
    'middle-left',
    'middle-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
    'rotater',
  ] as const;

  return Object.fromEntries(
    anchorNames.map((anchorName) => {
      const anchor = transformer.findOne(`.${anchorName}`);
      if (!anchor) {
        return [anchorName, null];
      }
      return [anchorName, anchor.getClientRect({ relativeTo: stage })];
    })
  );
}

function LineHandles({
  item,
  siblingItems,
  stageSize,
  onGuidesChange,
  onPreviewItem,
  onUpdateItem,
}: {
  item: LineCanvasItem;
  siblingItems: CanvasItem[];
  stageSize: { width: number; height: number };
  onGuidesChange: (guides: GuideLine[]) => void;
  onPreviewItem: (preview: LineCanvasItem | null) => void;
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
        const snapped = getSnappedRect(handleRect, siblingItems, {
          x: 0,
          y: 0,
          width: stageSize.width,
          height: stageSize.height,
        });
        event.target.position({
          x: snapped.rect.x + 1,
          y: snapped.rect.y + 1,
        });
        const nextX = snapped.rect.x + 1;
        const nextY = snapped.rect.y + 1;
        onPreviewItem({
          ...item,
          startX: handle.key === 'start' ? nextX : item.startX,
          startY: handle.key === 'start' ? nextY : item.startY,
          endX: handle.key === 'end' ? nextX : item.endX,
          endY: handle.key === 'end' ? nextY : item.endY,
        });
        onGuidesChange(snapped.guides);
      }}
      onDragEnd={(event) => {
        onGuidesChange([]);
        onPreviewItem(null);
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

function LineItemView({
  activeTool,
  isSelected,
  item,
  siblingItems,
  stageSize,
  shapeRef,
  onGuidesChange,
  onPreviewItem,
  onSelectItem,
  onUpdateItem,
}: LineItemViewProps) {
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
          const snapped = getSnappedRect(rect, siblingItems, {
            x: 0,
            y: 0,
            width: stageSize.width,
            height: stageSize.height,
          });
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
          onPreviewItem={onPreviewItem}
          onUpdateItem={onUpdateItem}
        />
      ) : null}
    </>
  );
}

function ShapeItemView({
  activeTool,
  item,
  siblingItems,
  stageSize,
  shapeRef,
  onGuidesChange,
  onSelectItem,
  onUpdateItem,
}: ShapeItemViewProps) {
  const imageElement = useImageElement(item.kind === 'image' ? item.src : '');
  const renderBox = getRenderBox(item);

  return (
    <Group
      ref={shapeRef}
      x={renderBox.x}
      y={renderBox.y}
      rotation={item.rotation}
      opacity={item.opacity}
      draggable={activeTool === 'select' && !item.locked}
      visible={!item.hidden}
      onClick={() => onSelectItem(item.id)}
      onTap={() => onSelectItem(item.id)}
      onDragMove={(event) => {
        const node = event.target;
        const rect = {
          x: node.x(),
          y: node.y(),
          width: renderBox.width,
          height: renderBox.height,
        };
        const snapped = getSnappedRect(rect, siblingItems, {
          x: 0,
          y: 0,
          width: stageSize.width,
          height: stageSize.height,
        });
        node.position({ x: snapped.rect.x, y: snapped.rect.y });
        onGuidesChange(snapped.guides);
      }}
      onDragEnd={(event) => {
        onGuidesChange([]);
        onUpdateItem(item.id, {
          x: event.target.x(),
          y: event.target.y(),
        });
      }}
    >
      <Rect
        x={0}
        y={0}
        width={renderBox.width}
        height={renderBox.height}
        fill="rgba(0,0,0,0)"
        strokeEnabled={false}
        listening={false}
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
        />
      ) : null}
      {item.kind === 'image' ? (
        <KonvaImage
          x={0}
          y={0}
          image={imageElement ?? undefined}
          width={renderBox.width}
          height={renderBox.height}
        />
      ) : null}
    </Group>
  );
}

export function CanvasStage({
  activeTool,
  document,
  guides,
  onGuidesChange,
  onSelectItem,
  onUpdateItem,
  stageRef,
}: CanvasStageProps) {
  const transformerRef = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef(new Map<string, Konva.Node>());
  const [transformPreview, setTransformPreview] = useState<TransformPreview | null>(null);
  const [linePreview, setLinePreview] = useState<LineCanvasItem | null>(null);

  const selectedItemId = document.selectedItemIds[0];
  const orderedItems = useMemo(
    () => document.items.slice().sort((left, right) => left.zIndex - right.zIndex),
    [document.items]
  );
  const renderedItems = useMemo(
    () =>
      orderedItems.map((item) =>
        applyLinePreview(applyPreviewToItem(item, transformPreview), linePreview)
      ),
    [orderedItems, transformPreview, linePreview]
  );

  const selectedDocumentItem = orderedItems.find((item) => item.id === selectedItemId);
  const selectedRenderedItem = renderedItems.find((item) => item.id === selectedItemId);

  useEffect(() => {
    if (transformPreview && transformPreview.itemId !== selectedItemId) {
      setTransformPreview(null);
    }
  }, [selectedItemId, transformPreview]);

  useEffect(() => {
    if (linePreview && linePreview.id !== selectedItemId) {
      setLinePreview(null);
    }
  }, [selectedItemId, linePreview]);

  useEffect(() => {
    if (!transformerRef.current) {
      return;
    }
    if (!selectedItemId || selectedRenderedItem?.kind === 'line') {
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
      selectedRenderedItem?.kind === 'image'
        ? selectedRenderedItem.preserveAspectRatio
        : false
    );
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedItemId, selectedRenderedItem]);

  function readSelectedNodeSnapshot() {
    if (!selectedItemId || !selectedRenderedItem || selectedRenderedItem.kind === 'line') {
      return null;
    }

    const node = shapeRefs.current.get(selectedItemId);
    if (!node) {
      return null;
    }

    const renderBox = getRenderBox(selectedRenderedItem);
    const snapshot: TransformSnapshot = {
      x: node.x(),
      y: node.y(),
      width: renderBox.width,
      height: renderBox.height,
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
      rotation: node.rotation(),
    };

    return {
      node,
      renderBox,
      snapshot,
    };
  }

  function updatePreviewFromNode() {
    const current = readSelectedNodeSnapshot();
    if (!current || !selectedItemId) {
      return null;
    }

    const commit = buildTransformCommit(current.renderBox, current.snapshot);
    current.node.scaleX(1);
    current.node.scaleY(1);

    const preview = {
      itemId: selectedItemId,
      x: commit.x,
      y: commit.y,
      width: commit.width,
      height: commit.height,
      rotation: commit.rotation,
    };

    setTransformPreview(preview);
    return commit;
  }

  const selectedNode = selectedItemId ? shapeRefs.current.get(selectedItemId) : null;
  const nodeClientRect =
    selectedNode && stageRef.current
      ? selectedNode.getClientRect({ relativeTo: stageRef.current })
      : null;
  const debugInfo = {
    stageSize: {
      width: document.canvas.width,
      height: document.canvas.height,
    },
    activeAnchor: transformerRef.current?.getActiveAnchor() ?? null,
    documentItem: selectedDocumentItem
      ? {
          ...getRenderBox(selectedDocumentItem),
          rotation: selectedDocumentItem.rotation,
          kind: selectedDocumentItem.kind,
          id: selectedDocumentItem.id,
        }
      : null,
    previewItem:
      transformPreview ??
      (selectedRenderedItem?.kind === 'line' && linePreview
        ? {
            ...getRenderBox(selectedRenderedItem),
            kind: selectedRenderedItem.kind,
            id: selectedRenderedItem.id,
          }
        : null),
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
    anchorClientRects: getTransformerAnchorRects(transformerRef.current, stageRef.current),
    handles: nodeClientRect ? buildHandleDebug(nodeClientRect) : null,
    lineHandleRects:
      selectedRenderedItem?.kind === 'line' ? getLineHandleRects(selectedRenderedItem) : null,
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
              {renderedItems.map((item) =>
                item.kind === 'line' ? (
                  <LineItemView
                    key={item.id}
                    activeTool={activeTool}
                    isSelected={item.id === selectedItemId}
                    item={item}
                    siblingItems={renderedItems.filter((entry) => entry.id !== item.id)}
                    stageSize={document.canvas}
                    shapeRef={(node) => {
                      if (!node) {
                        shapeRefs.current.delete(item.id);
                        return;
                      }
                      shapeRefs.current.set(item.id, node);
                    }}
                    onGuidesChange={onGuidesChange}
                    onPreviewItem={setLinePreview}
                    onSelectItem={onSelectItem}
                    onUpdateItem={onUpdateItem}
                  />
                ) : (
                  <ShapeItemView
                    key={item.id}
                    activeTool={activeTool}
                    item={item}
                    siblingItems={renderedItems.filter((entry) => entry.id !== item.id)}
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
              <Transformer
                ref={transformerRef}
                rotateEnabled
                flipEnabled
                onTransformStart={() => {
                  if (!selectedRenderedItem || selectedRenderedItem.kind === 'line') {
                    return;
                  }
                  const renderBox = getRenderBox(selectedRenderedItem);
                  setTransformPreview({
                    itemId: selectedRenderedItem.id,
                    x: renderBox.x,
                    y: renderBox.y,
                    width: renderBox.width,
                    height: renderBox.height,
                    rotation: selectedRenderedItem.rotation,
                  });
                }}
                boundBoxFunc={(oldBox, newBox) => {
                  if (!selectedRenderedItem || selectedRenderedItem.kind === 'line') {
                    return newBox;
                  }
                  const activeAnchor = transformerRef.current?.getActiveAnchor() ?? null;
                  if (!shouldApplyLiveTransform(activeAnchor)) {
                    onGuidesChange([]);
                    return newBox;
                  }
                  const snapped = getResizeSnappedRect(
                    newBox,
                    renderedItems.filter((item) => item.id !== selectedRenderedItem.id),
                    { x: 0, y: 0, width: document.canvas.width, height: document.canvas.height },
                    activeAnchor
                  );
                  onGuidesChange(snapped.guides);
                  return {
                    ...newBox,
                    x: snapped.rect.x,
                    y: snapped.rect.y,
                    width: snapped.rect.width,
                    height: snapped.rect.height,
                  };
                }}
                onTransform={() => {
                  updatePreviewFromNode();
                }}
                onTransformEnd={() => {
                  const commit = updatePreviewFromNode();
                  if (!commit || !selectedItemId) {
                    setTransformPreview(null);
                    return;
                  }
                  onGuidesChange([]);
                  onUpdateItem(selectedItemId, commit);
                  setTransformPreview(null);
                }}
              />
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
