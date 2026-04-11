import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Application, extend, type ApplicationRef } from '@pixi/react';
import { Container, Graphics, Rectangle, Sprite, Text, TextureSource } from 'pixi.js';
import type { Container as PixiContainer, FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';

import type {
  CanvasItem,
  CanvasTool,
  GeneratorCanvasItem,
  GuideLine,
  LineCanvasItem,
  ProjectDocument,
} from '../../document/documentTypes';
import type { Point, ResizeHandle } from '../interactionGeometry';
import type { PointerGestureSource } from '../interactionSession';
import type { RenderableCanvasItem } from '../renderAdapter';
import type { CanvasPointerEvent, CanvasRendererHandle } from '../renderer/canvasRendererTypes';
import { normalizePixiEvent } from '../renderer/normalizePixiEvent';
import { createPixiRendererHandle } from '../renderer/pixiRendererHandle';

import { PixiImageCropOverlay } from './PixiImageCropOverlay';
import { PixiItemLayer } from './PixiItemLayer';
import { PixiSelectionOverlay } from './PixiSelectionOverlay';
import { BACKDROP_SIZE, CANVAS_SURFACE_FILL } from './renderConstants';

// Register PixiJS components for @pixi/react's JSX.
extend({ Container, Graphics, Sprite, Text });

// Enable mipmaps for all textures (text, images, generators).
// Without mipmaps, zooming out causes heavy minification artifacts because the
// GPU skips most texels.  Mipmaps provide pre-averaged versions at every
// power-of-two size so minification filtering stays smooth.
TextureSource.defaultOptions.autoGenerateMipmaps = true;

interface PixiCanvasSceneProps {
  activeTool: CanvasTool;
  beginCropFullResize: (handle: ResizeHandle, pointer: Point, source?: PointerGestureSource) => void;
  beginCropFullRotate: (pointer: Point, source?: PointerGestureSource) => void;
  beginCropPan: (pointer: Point, source?: PointerGestureSource) => void;
  beginCropResize: (handle: ResizeHandle, pointer: Point, source?: PointerGestureSource) => void;
  beginGroupResize: (handle: ResizeHandle, pointer: Point, source?: PointerGestureSource) => void;
  beginGroupRotate: (pointer: Point, source?: PointerGestureSource) => void;
  beginLineHandle: (
    item: Extract<CanvasItem, { kind: 'line' }>,
    handle: 'start' | 'end',
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  beginResize: (
    item: Exclude<CanvasItem, LineCanvasItem | GeneratorCanvasItem>,
    handle: ResizeHandle,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  beginRotate: (
    item: Exclude<CanvasItem, LineCanvasItem | GeneratorCanvasItem>,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  commitCropSession: () => boolean;
  cropSession: {
    itemId: string;
    previewItem: Extract<CanvasItem, { kind: 'image' }>;
    fullImageItem: Extract<CanvasItem, { kind: 'image' }>;
  } | null;
  document: ProjectDocument;
  groupOverlayFrame: {
    bounds: { x: number; y: number; width: number; height: number };
    rotation: number;
  } | null;
  guides: GuideLine[];
  handleItemDoubleClick: (item: CanvasItem) => void;
  handleItemPointerDown: (
    item: CanvasItem,
    selectionNodeId: string,
    pointer: Point,
    shiftKey: boolean,
    nativeEvent?: MouseEvent,
  ) => void;
  onStageMouseDown: (event: CanvasPointerEvent) => void;
  onStageMouseLeave: () => void;
  onStageMouseMove: (event: CanvasPointerEvent) => void;
  onStageMouseUp: (event: CanvasPointerEvent) => void;
  onStageWheel: (event: CanvasPointerEvent) => void;
  renderedItems: RenderableCanvasItem[];
  renderedSelectedItems: RenderableCanvasItem[];
  selectedRenderedItem: RenderableCanvasItem | null;
  session: {
    kind: string;
    tool?: string;
    pointerStart?: { x: number; y: number };
    currentPointer?: { x: number; y: number };
    previewItem?: {
      kind: string;
      x: number;
      y: number;
      width: number;
      height: number;
    };
  } | null;
  showGroupSelection: boolean;
  size: { width: number; height: number };
  spacebarHeld: boolean;
  stageCursor: string;
  startPanDrag: (pointer: Point) => void;
  toCanvasPointer: (pointer: Point) => Point;
  viewportPan: { x: number; y: number };
  zoom: number;
}

export const PixiCanvasScene = forwardRef<CanvasRendererHandle, PixiCanvasSceneProps>(
  function PixiCanvasScene(
    {
      activeTool,
      beginCropFullResize,
      beginCropFullRotate,
      beginCropPan,
      beginCropResize,
      beginGroupResize,
      beginGroupRotate,
      beginLineHandle,
      beginResize,
      beginRotate,
      commitCropSession,
      cropSession,
      document: doc,
      groupOverlayFrame,
      guides,
      handleItemDoubleClick,
      handleItemPointerDown,
      onStageMouseDown,
      onStageMouseLeave,
      onStageMouseMove,
      onStageMouseUp,
      onStageWheel,
      renderedItems,
      renderedSelectedItems,
      selectedRenderedItem,
      session,
      showGroupSelection,
      size,
      spacebarHeld,
      stageCursor,
      startPanDrag,
      toCanvasPointer,
      viewportPan,
      zoom,
    },
    ref,
  ) {
    const appRef = useRef<ApplicationRef>(null);
    const exportContainerRef = useRef<PixiContainer>(null);
    const [rendererReady, setRendererReady] = useState(false);

    useImperativeHandle(ref, () => createPixiRendererHandle(appRef, exportContainerRef), []);

    // Keep the renderer sized to the viewport.  @pixi/react's app.init() is
    // async, so the renderer may not exist when this effect first fires.  The
    // rendererReady flag (set by onInit) re-triggers the effect once init
    // completes so the resize is never missed.
    useEffect(() => {
      const app = appRef.current?.getApplication();
      if (app?.renderer) {
        app.renderer.resize(size.width, size.height);
      }
    }, [size.width, size.height, rendererReady]);

    // @pixi/react uses a ConcurrentRoot reconciler whose scene-tree commits
    // lag 1-2 React render cycles behind the DOM.  The default 60 fps ticker
    // eventually renders, but on slow renderers (CI SwiftShader, 50-200 ms per
    // frame) a Playwright click can arrive before transforms are current.
    //
    // Fix: stop the idle ticker and render on-demand — once per React commit
    // (useEffect) for visual updates, and once before every hit-test (patch)
    // so worldTransform values are always fresh for pointer interactions.
    useEffect(() => {
      const app = appRef.current?.getApplication();
      if (!app?.renderer) return;

      app.ticker.stop();

      const boundary = (app.renderer.events as any).rootBoundary;
      const origHitTest = boundary.hitTest.bind(boundary);
      boundary.hitTest = (x: number, y: number) => {
        app.render();
        return origHitTest(x, y);
      };
    }, [rendererReady]);

    // Visual render after every React commit.
    useEffect(() => {
      const app = appRef.current?.getApplication();
      if (app?.renderer) app.render();
    });

    // --- Federated event wrappers -------------------------------------------
    // @pixi/react sets event handlers as `container.onwheel = fn` properties.
    // PixiJS calls these properties during ALL propagation phases (capture,
    // at-target, bubble).  When the cursor is over a child display object the
    // handler fires twice — once in capture and once in bubble.  Skip the
    // capture phase so every handler fires exactly once.
    const handleMouseDown = useCallback(
      (e: FederatedPointerEvent) => {
        if (e.eventPhase === e.CAPTURING_PHASE) return;
        onStageMouseDown(normalizePixiEvent(e));
      },
      [onStageMouseDown],
    );
    const handleMouseMove = useCallback(
      (e: FederatedPointerEvent) => {
        if (e.eventPhase === e.CAPTURING_PHASE) return;
        onStageMouseMove(normalizePixiEvent(e));
      },
      [onStageMouseMove],
    );
    const handleMouseUp = useCallback(
      (e: FederatedPointerEvent) => {
        if (e.eventPhase === e.CAPTURING_PHASE) return;
        onStageMouseUp(normalizePixiEvent(e));
      },
      [onStageMouseUp],
    );
    const handleWheel = useCallback(
      (e: FederatedWheelEvent) => {
        if (e.eventPhase === e.CAPTURING_PHASE) return;
        onStageWheel(normalizePixiEvent(e));
      },
      [onStageWheel],
    );
    const handleMouseLeave = useCallback(
      () => onStageMouseLeave(),
      [onStageMouseLeave],
    );

    // --- Filter cropped item out of normal rendering -----------------------
    const sceneItems = cropSession
      ? renderedItems.filter((item) => item.id !== cropSession.itemId)
      : renderedItems;

    // --- Drawing callbacks ------------------------------------------------
    const canvasWidth = doc.canvas.width;
    const canvasHeight = doc.canvas.height;
    const background = doc.background;

    const drawBackdrop = useCallback(
      (g: Graphics) => {
        g.clear();
        g.rect(-BACKDROP_SIZE / 2, -BACKDROP_SIZE / 2, BACKDROP_SIZE, BACKDROP_SIZE);
        g.fill({ color: 0x000000, alpha: 0.001 });
      },
      [],
    );

    const drawCanvasBorder = useCallback(
      (g: Graphics) => {
        g.clear();
        // Glow/shadow border (cosmetic)
        g.rect(0, 0, canvasWidth, canvasHeight);
        g.stroke({ color: 0x80b0ff, alpha: 0.18, width: 1 });
      },
      [canvasWidth, canvasHeight],
    );

    const drawCanvasBackground = useCallback(
      (g: Graphics) => {
        g.clear();
        g.rect(0, 0, canvasWidth, canvasHeight);
        g.fill(CANVAS_SURFACE_FILL);
        g.stroke({ color: 0x000000, alpha: 0.14, width: 1 });
      },
      [canvasWidth, canvasHeight],
    );

    const drawCheckerboard = useCallback(
      (g: Graphics) => {
        g.clear();
        const cellSize = 20;
        const cols = Math.ceil(canvasWidth / cellSize);
        const rows = Math.ceil(canvasHeight / cellSize);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if ((r + c) % 2 !== 0) continue;
            g.rect(c * cellSize, r * cellSize, cellSize, cellSize);
          }
        }
        g.fill({ color: 0xffffff, alpha: 0.025 });
      },
      [canvasWidth, canvasHeight],
    );

    const drawBackground = useCallback(
      (g: Graphics) => {
        g.clear();
        g.rect(0, 0, canvasWidth, canvasHeight);
        g.fill(background);
      },
      [canvasWidth, canvasHeight, background],
    );

    // --- Marquee preview (during drag-select) --------------------------------
    const isMarquee = session?.kind === 'marquee';
    const mStart = isMarquee ? session.pointerStart : null;
    const mCurrent = isMarquee ? session.currentPointer : null;
    const marqueeRect = useMemo(() => {
      if (!mStart || !mCurrent) return null;
      return {
        x: Math.min(mStart.x, mCurrent.x),
        y: Math.min(mStart.y, mCurrent.y),
        w: Math.max(1, Math.abs(mCurrent.x - mStart.x)),
        h: Math.max(1, Math.abs(mCurrent.y - mStart.y)),
      };
    }, [mStart, mCurrent]);

    const drawMarquee = useCallback(
      (g: Graphics) => {
        g.clear();
        if (!marqueeRect) return;
        g.rect(marqueeRect.x, marqueeRect.y, marqueeRect.w, marqueeRect.h);
        g.fill({ color: 0x38bdf8, alpha: 0.08 });
        g.stroke({ color: 0x7dd3fc, width: 1.5 });
      },
      [marqueeRect],
    );

    // --- Guide lines ---------------------------------------------------------
    const nz = zoom > 0 ? zoom : 1;
    const guideStrokeWidth = 1 / nz;
    const GUIDE_EXTENT = 100_000;

    const drawGuides = useCallback(
      (g: Graphics) => {
        g.clear();
        if (!guides || guides.length === 0) return;
        for (const guide of guides) {
          if (guide.orientation === 'vertical') {
            g.moveTo(guide.position, -GUIDE_EXTENT);
            g.lineTo(guide.position, canvasHeight + GUIDE_EXTENT);
          } else {
            g.moveTo(-GUIDE_EXTENT, guide.position);
            g.lineTo(canvasWidth + GUIDE_EXTENT, guide.position);
          }
        }
        g.stroke({ color: 0x7dd3fc, width: guideStrokeWidth });
      },
      [guides, canvasWidth, canvasHeight, guideStrokeWidth],
    );

    const hitArea = useMemo(
      () => new Rectangle(0, 0, size.width, size.height),
      [size.width, size.height],
    );

    return (
      <Application
        ref={appRef}
        width={size.width}
        height={size.height}
        resolution={window.devicePixelRatio || 1}
        autoDensity
        antialias
        backgroundAlpha={0}
        onInit={() => setRendererReady(true)}
        className="editor-stage editor-stage-fullscreen"
      >
        {/* Root event container — covers the full viewport for stage-level events. */}
        <pixiContainer
          label="event-root"
          eventMode="static"
          hitArea={hitArea}
          cursor={stageCursor}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onMouseLeave={handleMouseLeave}
        >
          {/* Viewport transform group — pan + zoom. */}
          <pixiContainer x={viewportPan.x} y={viewportPan.y} scale={zoom}>
            <pixiGraphics label="canvas-backdrop" draw={drawBackdrop} eventMode="none" />
            <pixiGraphics draw={drawCanvasBorder} eventMode="none" />
            <pixiGraphics label="canvas-background" draw={drawCanvasBackground} eventMode="none" />
            <pixiGraphics draw={drawCheckerboard} eventMode="none" />
            {/* Export container — background + items only (no overlays/guides). */}
            <pixiContainer ref={exportContainerRef} label="export-content">
              <pixiGraphics label="canvas-surface" draw={drawBackground} eventMode="none" />
              <PixiItemLayer
                activeTool={activeTool}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
                items={sceneItems}
                onItemPointerDown={handleItemPointerDown}
                onItemDoubleClick={handleItemDoubleClick}
                spacebarHeld={spacebarHeld}
                startPanDrag={startPanDrag}
                toCanvasPointer={toCanvasPointer}
                zoom={zoom}
              />
            </pixiContainer>
            {/* Marquee preview */}
            {marqueeRect ? (
              <pixiGraphics label="marquee-preview" draw={drawMarquee} eventMode="none" />
            ) : null}
            {/* Guide lines (below selection handles) */}
            {guides && guides.length > 0 ? (
              <pixiGraphics label="guide-lines" draw={drawGuides} eventMode="none" />
            ) : null}
            {/* Crop overlay (replaces selection overlay when active) */}
            {cropSession ? (
              <PixiImageCropOverlay
                beginCropFullResize={beginCropFullResize}
                beginCropFullRotate={beginCropFullRotate}
                beginCropPan={beginCropPan}
                beginCropResize={beginCropResize}
                commitCropSession={commitCropSession}
                fullImageItem={cropSession.fullImageItem}
                previewItem={cropSession.previewItem}
                toCanvasPointer={toCanvasPointer}
                zoom={zoom}
              />
            ) : (
              <PixiSelectionOverlay
                selectedRenderedItem={selectedRenderedItem}
                renderedSelectedItems={renderedSelectedItems}
                showGroupSelection={showGroupSelection}
                groupOverlayFrame={groupOverlayFrame}
                zoom={zoom}
                beginResize={beginResize}
                beginRotate={beginRotate}
                beginGroupResize={beginGroupResize}
                beginGroupRotate={beginGroupRotate}
                beginLineHandle={beginLineHandle}
                toCanvasPointer={toCanvasPointer}
              />
            )}
          </pixiContainer>
        </pixiContainer>
      </Application>
    );
  },
);
