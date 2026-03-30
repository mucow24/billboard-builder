import {
  buildCreatedItem,
  getCreatePreview,
  getLineHandleRects,
  getShapeHandlePoints,
  solveDragSession,
  solveLineHandleSession,
  solveResizeSession,
  solveRotateSession,
  type Point,
  type ResizeHandle,
} from './interactionGeometry';
import {
  buildGroupDragPreviews,
  buildGroupResizePreviews,
  buildGroupRotatePreviews,
  getGroupResizeFrame,
  itemIntersectsSelectionRect,
  type RenderBox,
} from './transformGeometry';
import { buildCandidateCache, getResizeSnappedRect, getSnappedRect, SNAP_THRESHOLD, type SnapCandidateCache } from './snapping';
import type { RenderableCanvasItem } from './renderAdapter';
import type {
  CanvasItem,
  CanvasTool,
  GeneratorCanvasItem,
  GuideLine,
  LineCanvasItem,
} from '../document/documentTypes';

export type ShapeItem = Exclude<CanvasItem, LineCanvasItem | GeneratorCanvasItem>;
export type PointerGestureSource = 'stage' | 'overlay';

export interface SelectionFrame {
  bounds: RenderBox;
  rotation: number;
}

interface InteractionSessionBase {
  kind:
    | 'create'
    | 'drag'
    | 'resize'
    | 'rotate'
    | 'line-handle'
    | 'marquee'
    | 'group-drag'
    | 'group-resize'
    | 'group-rotate';
  pointerStart: Point;
  pointerSource: PointerGestureSource;
  guides: GuideLine[];
  snapDisabled?: boolean;
  snapCache?: SnapCandidateCache;
}

export interface CreateSession extends InteractionSessionBase {
  kind: 'create';
  tool: Extract<CanvasTool, 'text' | 'rectangle' | 'ellipse' | 'line'>;
  previewItem: CanvasItem | null;
}

interface ItemSession extends InteractionSessionBase {
  kind: 'drag' | 'resize' | 'rotate' | 'line-handle';
  itemId: string;
  originalItem: CanvasItem;
  previewItem: CanvasItem;
  siblingItems: CanvasItem[];
}

export interface DragSession extends ItemSession {
  kind: 'drag';
  axisLock?: 'x' | 'y';
}

export interface ResizeSession extends ItemSession {
  kind: 'resize';
  handle: ResizeHandle;
  pointerOffset: Point;
}

export interface RotateSession extends ItemSession {
  kind: 'rotate';
  handle: 'rotater';
}

export interface LineHandleSession extends ItemSession {
  kind: 'line-handle';
  handle: 'start' | 'end';
  pointerOffset: Point;
}

export interface MarqueeSession extends InteractionSessionBase {
  kind: 'marquee';
  currentPointer: Point;
  toggleMode: boolean;
}

interface GroupSessionBase extends InteractionSessionBase {
  kind: 'group-drag' | 'group-resize' | 'group-rotate';
  itemIds: string[];
  originalItems: CanvasItem[];
  previewItems: CanvasItem[];
  siblingItems: CanvasItem[];
  bounds: RenderBox;
  frameRotation: number;
}

export interface GroupDragSession extends GroupSessionBase {
  kind: 'group-drag';
  currentPointer: Point;
}

export interface GroupResizeSession extends GroupSessionBase {
  kind: 'group-resize';
  handle: ResizeHandle;
  currentPointer: Point;
}

export interface GroupRotateSession extends GroupSessionBase {
  kind: 'group-rotate';
  handle: 'rotater';
  currentPointer: Point;
}

export type InteractionSession =
  | CreateSession
  | DragSession
  | ResizeSession
  | RotateSession
  | LineHandleSession
  | MarqueeSession
  | GroupDragSession
  | GroupResizeSession
  | GroupRotateSession;

export type SessionWithModifiers = InteractionSession & { shiftConstrain?: boolean };

export type InteractionCommit =
  | { kind: 'create'; item: CanvasItem; nextTool: 'select' }
  | { kind: 'marquee'; hitIds: string[]; toggleMode: boolean }
  | { kind: 'single-item'; itemId: string; changes: Partial<CanvasItem> }
  | {
      kind: 'group';
      updates: Array<{ itemId: string; changes: Partial<CanvasItem> }>;
      selectionFrame: SelectionFrame | null;
    };

export function currentSelectionSetSignature(itemIds: string[]): string {
  return [...itemIds].sort().join('\u0000');
}

export function rotateGroupPointerDelta(
  bounds: RenderBox,
  startPointer: Point,
  currentPointer: Point,
  snap = false
): number {
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const startAngle = Math.atan2(startPointer.y - center.y, startPointer.x - center.x);
  const currentAngle = Math.atan2(currentPointer.y - center.y, currentPointer.x - center.x);
  let deltaDegrees = ((currentAngle - startAngle) * 180) / Math.PI;
  if (snap) {
    deltaDegrees = Math.round(deltaDegrees / 15) * 15;
  }
  return deltaDegrees;
}

export function buildRenderedItems(
  orderedItems: CanvasItem[],
  session: InteractionSession | null
): CanvasItem[] {
  const previewItem = session && 'previewItem' in session ? session.previewItem : null;
  const previewItems = session && 'previewItems' in session ? session.previewItems : null;
  const previewMap = new Map(previewItems?.map((item) => [item.id, item] as const) ?? []);
  const baseItems = orderedItems.map((item) => {
    if (previewMap.has(item.id)) {
      return previewMap.get(item.id)!;
    }
    if (
      previewItem &&
      session &&
      'itemId' in session &&
      item.id === session.itemId
    ) {
      return previewItem;
    }
    return item;
  });
  return session?.kind === 'create' && session.previewItem
    ? [...baseItems, session.previewItem]
    : baseItems;
}

function buildPreviewRenderable(
  previewItem: CanvasItem,
  baseRenderable: RenderableCanvasItem | null
): RenderableCanvasItem {
  if (!baseRenderable) {
    return {
      ...previewItem,
      groupPath: [],
      selectableNodeId: previewItem.id,
      opacity: previewItem.opacity,
    };
  }

  return {
    ...previewItem,
    groupPath: baseRenderable.groupPath,
    selectableNodeId: baseRenderable.selectableNodeId,
    opacity: baseRenderable.opacity,
  };
}

export function buildRenderedRenderables(
  baseRenderables: RenderableCanvasItem[],
  session: InteractionSession | null
): RenderableCanvasItem[] {
  const previewItem = session && 'previewItem' in session ? session.previewItem : null;
  const previewItems = session && 'previewItems' in session ? session.previewItems : null;
  const previewMap = new Map(previewItems?.map((item) => [item.id, item] as const) ?? []);
  let didChange = false;

  const nextRenderables = baseRenderables.map((renderable) => {
    const groupPreview = previewMap.get(renderable.id);
    if (groupPreview) {
      didChange = true;
      return buildPreviewRenderable(groupPreview, renderable);
    }
    if (
      previewItem &&
      session &&
      'itemId' in session &&
      renderable.id === session.itemId
    ) {
      didChange = true;
      return buildPreviewRenderable(previewItem, renderable);
    }
    return renderable;
  });

  if (session?.kind === 'create' && session.previewItem) {
    return [...(didChange ? nextRenderables : baseRenderables), buildPreviewRenderable(session.previewItem, null)];
  }

  return didChange ? nextRenderables : baseRenderables;
}

export function normalizeRectFromPoints(start: Point, current: Point): RenderBox {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.max(1, Math.abs(current.x - start.x)),
    height: Math.max(1, Math.abs(current.y - start.y)),
  };
}

export function intersectRenderBoxes(first: RenderBox, second: RenderBox): RenderBox | null {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function getCanvasConstrainedMarqueeRect(
  pointerStart: Point,
  currentPointer: Point,
  canvasBounds: RenderBox
): RenderBox | null {
  return intersectRenderBoxes(
    normalizeRectFromPoints(pointerStart, currentPointer),
    canvasBounds
  );
}

export function getCommitChanges(item: CanvasItem): Partial<CanvasItem> {
  if (item.kind === 'line') {
    return {
      startX: item.startX,
      startY: item.startY,
      endX: item.endX,
      endY: item.endY,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      scaleX: 1,
      scaleY: 1,
    };
  }

  if (item.kind === 'image') {
    return {
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
      crop: item.crop,
      sourceTransform: item.sourceTransform,
      scaleX: 1,
      scaleY: 1,
    };
  }

  return {
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    rotation: item.rotation,
    scaleX: 1,
    scaleY: 1,
  };
}

function getGroupResizeRect(bounds: RenderBox, handle: ResizeHandle, pointer: Point): RenderBox {
  const edges = {
    left: bounds.x,
    right: bounds.x + bounds.width,
    top: bounds.y,
    bottom: bounds.y + bounds.height,
  };

  if (handle.includes('left')) {
    edges.left = pointer.x;
  }
  if (handle.includes('right')) {
    edges.right = pointer.x;
  }
  if (handle.includes('top')) {
    edges.top = pointer.y;
  }
  if (handle.includes('bottom')) {
    edges.bottom = pointer.y;
  }
  if (handle === 'top-center' || handle === 'bottom-center') {
    edges.left = bounds.x;
    edges.right = bounds.x + bounds.width;
  }
  if (handle === 'middle-left' || handle === 'middle-right') {
    edges.top = bounds.y;
    edges.bottom = bounds.y + bounds.height;
  }

  return {
    x: edges.left,
    y: edges.top,
    width: edges.right - edges.left,
    height: edges.bottom - edges.top,
  };
}

function getGroupResizePointer(
  rect: RenderBox,
  handle: ResizeHandle,
  bounds: RenderBox
): Point {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  return {
    x: handle.includes('left') ? rect.x : handle.includes('right') ? right : centerX,
    y: handle.includes('top') ? rect.y : handle.includes('bottom') ? bottom : centerY,
  };
}

export function createCreateSession(
  tool: Extract<CanvasTool, 'text' | 'rectangle' | 'ellipse' | 'line'>,
  pointer: Point,
  pointerSource: PointerGestureSource = 'stage',
): CreateSession {
  return {
    kind: 'create',
    tool,
    pointerStart: pointer,
    pointerSource,
    previewItem: null,
    guides: [],
    snapDisabled: false,
  };
}

export function createDragSession(
  item: CanvasItem,
  pointer: Point,
  siblingItems: CanvasItem[],
  pointerSource: PointerGestureSource = 'stage',
): DragSession {
  return {
    kind: 'drag',
    itemId: item.id,
    originalItem: item,
    previewItem: item,
    siblingItems,
    pointerStart: pointer,
    pointerSource,
    guides: [],
    snapDisabled: false,
    axisLock: undefined,
  };
}

export function createResizeSession(
  item: ShapeItem,
  handle: ResizeHandle,
  pointer: Point,
  siblingItems: CanvasItem[],
  pointerSource: PointerGestureSource = 'stage',
): ResizeSession {
  const handlePoint = getShapeHandlePoints(item)[handle];
  return {
    kind: 'resize',
    itemId: item.id,
    originalItem: item,
    previewItem: item,
    siblingItems,
    pointerStart: pointer,
    pointerSource,
    pointerOffset: { x: pointer.x - handlePoint.x, y: pointer.y - handlePoint.y },
    handle,
    guides: [],
    snapDisabled: false,
  };
}

export function createRotateSession(
  item: ShapeItem,
  pointer: Point,
  siblingItems: CanvasItem[],
  pointerSource: PointerGestureSource = 'stage',
): RotateSession {
  return {
    kind: 'rotate',
    itemId: item.id,
    originalItem: item,
    previewItem: item,
    siblingItems,
    pointerStart: pointer,
    pointerSource,
    handle: 'rotater',
    guides: [],
    snapDisabled: false,
  };
}

export function createLineHandleSession(
  item: LineCanvasItem,
  handle: 'start' | 'end',
  pointer: Point,
  siblingItems: CanvasItem[],
  pointerSource: PointerGestureSource = 'stage',
): LineHandleSession {
  const rect = getLineHandleRects(item)[handle];
  return {
    kind: 'line-handle',
    itemId: item.id,
    originalItem: item,
    previewItem: item,
    siblingItems,
    pointerStart: pointer,
    pointerSource,
    pointerOffset: {
      x: pointer.x - (rect.x + rect.width / 2),
      y: pointer.y - (rect.y + rect.height / 2),
    },
    handle,
    guides: [],
    snapDisabled: false,
  };
}

interface GroupSessionArgs {
  selectedItems: CanvasItem[];
  siblingItems: CanvasItem[];
  activeSelectionFrame: SelectionFrame | null;
}

export function createGroupDragSession(
  pointer: Point,
  args: GroupSessionArgs,
  pointerSource: PointerGestureSource = 'stage',
): GroupDragSession | null {
  const { activeSelectionFrame, selectedItems, siblingItems } = args;
  if (!activeSelectionFrame || selectedItems.length <= 1) {
    return null;
  }
  return {
    kind: 'group-drag',
    itemIds: selectedItems.map((item) => item.id),
    originalItems: selectedItems,
    previewItems: selectedItems,
    siblingItems,
    bounds: activeSelectionFrame.bounds,
    frameRotation: activeSelectionFrame.rotation,
    pointerStart: pointer,
    pointerSource,
    currentPointer: pointer,
    guides: [],
    snapDisabled: false,
  };
}

export function createGroupResizeSession(
  handle: ResizeHandle,
  pointer: Point,
  args: GroupSessionArgs,
  pointerSource: PointerGestureSource = 'stage',
): GroupResizeSession | null {
  const { activeSelectionFrame, selectedItems, siblingItems } = args;
  if (!activeSelectionFrame || selectedItems.length <= 1) {
    return null;
  }
  return {
    kind: 'group-resize',
    itemIds: selectedItems.map((item) => item.id),
    originalItems: selectedItems,
    previewItems: selectedItems,
    siblingItems,
    bounds: activeSelectionFrame.bounds,
    frameRotation: activeSelectionFrame.rotation,
    pointerStart: pointer,
    pointerSource,
    currentPointer: pointer,
    handle,
    guides: [],
    snapDisabled: false,
  };
}

export function createGroupRotateSession(
  pointer: Point,
  args: GroupSessionArgs,
  pointerSource: PointerGestureSource = 'stage',
): GroupRotateSession | null {
  const { activeSelectionFrame, selectedItems, siblingItems } = args;
  if (!activeSelectionFrame || selectedItems.length <= 1) {
    return null;
  }
  return {
    kind: 'group-rotate',
    itemIds: selectedItems.map((item) => item.id),
    originalItems: selectedItems,
    previewItems: selectedItems,
    siblingItems,
    bounds: activeSelectionFrame.bounds,
    frameRotation: activeSelectionFrame.rotation,
    pointerStart: pointer,
    pointerSource,
    currentPointer: pointer,
    handle: 'rotater',
    guides: [],
  };
}

function getOrBuildCache(
  session: InteractionSession,
  stageBounds: RenderBox
): SnapCandidateCache | undefined {
  if (session.snapCache) {
    return session.snapCache;
  }
  const siblingItems = 'siblingItems' in session ? session.siblingItems : undefined;
  if (!siblingItems) {
    return undefined;
  }
  return buildCandidateCache(siblingItems, stageBounds);
}

export function resolveInteractionSession(
  current: InteractionSession,
  pointer: Point,
  context: { stageBounds: RenderBox; zoom?: number }
): InteractionSession {
  const { stageBounds, zoom = 1 } = context;
  const threshold = SNAP_THRESHOLD / zoom;
  const currentWithModifiers = current as SessionWithModifiers;
  const cache = getOrBuildCache(current, stageBounds);

  switch (current.kind) {
    case 'create':
      return { ...current, previewItem: getCreatePreview(current.tool, current.pointerStart, pointer) };
    case 'drag': {
      let resolvedPointer = pointer;
      let axisLock = current.axisLock;
      const deltaX = pointer.x - current.pointerStart.x;
      const deltaY = pointer.y - current.pointerStart.y;
      if (currentWithModifiers.shiftConstrain) {
        if (!axisLock && Math.hypot(deltaX, deltaY) >= 6) {
          axisLock = Math.abs(deltaX) >= Math.abs(deltaY) ? 'x' : 'y';
        }
        if (axisLock === 'x') {
          resolvedPointer = { ...pointer, y: current.pointerStart.y };
        }
        if (axisLock === 'y') {
          resolvedPointer = { ...pointer, x: current.pointerStart.x };
        }
      }
      const next = solveDragSession(
        current.originalItem,
        current.pointerStart,
        resolvedPointer,
        current.siblingItems,
        stageBounds,
        !current.snapDisabled,
        threshold,
        cache
      );
      return { ...current, snapCache: cache, axisLock, previewItem: next.item, guides: next.guides };
    }
    case 'resize': {
      const next = solveResizeSession(
        current.originalItem as ShapeItem,
        current.handle,
        pointer,
        current.pointerOffset,
        current.siblingItems,
        stageBounds,
        !current.snapDisabled,
        threshold,
        cache
      );
      return { ...current, snapCache: cache, previewItem: next.item, guides: next.guides };
    }
    case 'rotate': {
      const next = solveRotateSession(
        current.originalItem as ShapeItem,
        current.pointerStart,
        pointer,
        Boolean(currentWithModifiers.shiftConstrain)
      );
      return { ...current, previewItem: next.item, guides: [] };
    }
    case 'line-handle': {
      const next = solveLineHandleSession(
        current.originalItem as LineCanvasItem,
        current.handle,
        pointer,
        current.pointerOffset,
        current.siblingItems,
        stageBounds,
        !current.snapDisabled,
        threshold,
        cache
      );
      return { ...current, snapCache: cache, previewItem: next.item, guides: next.guides };
    }
    case 'marquee':
      return { ...current, currentPointer: pointer };
    case 'group-drag': {
      const rawRect = {
        x: current.bounds.x + (pointer.x - current.pointerStart.x),
        y: current.bounds.y + (pointer.y - current.pointerStart.y),
        width: current.bounds.width,
        height: current.bounds.height,
      };
      const snapped = current.snapDisabled
        ? { rect: rawRect, guides: [] }
        : getSnappedRect(rawRect, current.siblingItems, stageBounds, threshold, cache);
      const resolvedPointer = {
        x: current.pointerStart.x + (snapped.rect.x - current.bounds.x),
        y: current.pointerStart.y + (snapped.rect.y - current.bounds.y),
      };
      return {
        ...current,
        snapCache: cache,
        currentPointer: resolvedPointer,
        guides: snapped.guides,
        previewItems: buildGroupDragPreviews(
          current.originalItems,
          snapped.rect.x - current.bounds.x,
          snapped.rect.y - current.bounds.y
        ),
      };
    }
    case 'group-resize': {
      // Guide snapping is intentionally disabled for rotated group resize.
      // Computing snap targets for rotated bounding boxes requires projecting
      // rotated corners onto axis-aligned guides, which is not yet implemented.
      if (current.snapDisabled || Math.abs(current.frameRotation) >= 0.001) {
        return {
          ...current,
          currentPointer: pointer,
          guides: [],
          previewItems: buildGroupResizePreviews(
            current.originalItems,
            current.bounds,
            current.handle,
            pointer,
            current.frameRotation
          ),
        };
      }
      const rawRect = getGroupResizeRect(current.bounds, current.handle, pointer);
      const snapped = getResizeSnappedRect(
        rawRect,
        current.siblingItems,
        stageBounds,
        current.handle,
        threshold,
        cache
      );
      const resolvedPointer = getGroupResizePointer(
        snapped.rect,
        current.handle,
        current.bounds
      );
      return {
        ...current,
        snapCache: cache,
        currentPointer: resolvedPointer,
        guides: snapped.guides,
        previewItems: buildGroupResizePreviews(
          current.originalItems,
          current.bounds,
          current.handle,
          resolvedPointer,
          current.frameRotation
        ),
      };
    }
    case 'group-rotate':
      return {
        ...current,
        currentPointer: pointer,
        previewItems: buildGroupRotatePreviews(
          current.originalItems,
          current.bounds,
          current.pointerStart,
          pointer,
          Boolean(currentWithModifiers.shiftConstrain)
        ),
      };
  }
}

export function buildInteractionCommit(
  resolved: InteractionSession,
  context: { orderedItems: CanvasItem[]; pointer: Point; canvasBounds: RenderBox }
): InteractionCommit {
  const { orderedItems, pointer } = context;

  if (resolved.kind === 'create') {
    return {
      kind: 'create',
      item: resolved.previewItem ?? buildCreatedItem(resolved.tool, resolved.pointerStart, pointer),
      nextTool: 'select',
    };
  }

  if (resolved.kind === 'marquee') {
    const rect = normalizeRectFromPoints(resolved.pointerStart, resolved.currentPointer);
    const hitIds = orderedItems
      .filter((item) => !item.hidden && itemIntersectsSelectionRect(item, rect))
      .map((item) => item.id);
    return {
      kind: 'marquee',
      hitIds,
      toggleMode: resolved.toggleMode,
    };
  }

  if ('previewItems' in resolved) {
    let selectionFrame: SelectionFrame | null = null;

    if (resolved.kind === 'group-drag') {
      selectionFrame = {
        bounds: {
          x: resolved.bounds.x + (resolved.currentPointer.x - resolved.pointerStart.x),
          y: resolved.bounds.y + (resolved.currentPointer.y - resolved.pointerStart.y),
          width: resolved.bounds.width,
          height: resolved.bounds.height,
        },
        rotation: resolved.frameRotation,
      };
    } else if (resolved.kind === 'group-rotate') {
      selectionFrame = {
        bounds: resolved.bounds,
        rotation:
          resolved.frameRotation +
          rotateGroupPointerDelta(
            resolved.bounds,
            resolved.pointerStart,
            resolved.currentPointer,
            Boolean((resolved as SessionWithModifiers).shiftConstrain)
          ),
      };
    } else if (resolved.kind === 'group-resize') {
      selectionFrame = getGroupResizeFrame(
        resolved.bounds,
        resolved.handle,
        resolved.currentPointer,
        resolved.frameRotation
      );
    }

    return {
      kind: 'group',
      updates: resolved.previewItems.map((item) => ({
        itemId: item.id,
        changes: getCommitChanges(item),
      })),
      selectionFrame,
    };
  }

  return {
    kind: 'single-item',
    itemId: resolved.itemId,
    changes: getCommitChanges(resolved.previewItem),
  };
}
