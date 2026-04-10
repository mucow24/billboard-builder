import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { Application, extend, type ApplicationRef } from '@pixi/react';
import { Container, Graphics, Rectangle } from 'pixi.js';
import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';

import type { CanvasRendererHandle } from '../renderer/canvasRendererTypes';
import { normalizePixiEvent } from '../renderer/normalizePixiEvent';
import { createPixiRendererHandle } from '../renderer/pixiRendererHandle';
import type { CanvasSceneProps } from './CanvasScene';

import { PixiItemLayer } from './PixiItemLayer';
import { BACKDROP_SIZE, CANVAS_SURFACE_FILL } from './renderConstants';

// Register PixiJS components for @pixi/react's JSX.
extend({ Container, Graphics });

type PixiCanvasSceneProps = Omit<CanvasSceneProps, 'stageRef'>;

export const PixiCanvasScene = forwardRef<CanvasRendererHandle, PixiCanvasSceneProps>(
  function PixiCanvasScene(
    {
      document: doc,
      onStageMouseDown,
      onStageMouseLeave,
      onStageMouseMove,
      onStageMouseUp,
      onStageWheel,
      renderedItems,
      size,
      stageCursor,
      viewportPan,
      zoom,
    },
    ref,
  ) {
    const appRef = useRef<ApplicationRef>(null);

    useImperativeHandle(ref, () => createPixiRendererHandle(appRef), []);

    // --- Federated event wrappers -------------------------------------------
    const handleMouseDown = useCallback(
      (e: FederatedPointerEvent) => onStageMouseDown(normalizePixiEvent(e)),
      [onStageMouseDown],
    );
    const handleMouseMove = useCallback(
      (e: FederatedPointerEvent) => onStageMouseMove(normalizePixiEvent(e)),
      [onStageMouseMove],
    );
    const handleMouseUp = useCallback(
      (e: FederatedPointerEvent) => onStageMouseUp(normalizePixiEvent(e)),
      [onStageMouseUp],
    );
    const handleWheel = useCallback(
      (e: FederatedWheelEvent) => onStageWheel(normalizePixiEvent(e)),
      [onStageWheel],
    );
    const handleMouseLeave = useCallback(
      () => onStageMouseLeave(),
      [onStageMouseLeave],
    );

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

    const hitArea = new Rectangle(0, 0, size.width, size.height);

    return (
      <Application
        ref={appRef}
        width={size.width}
        height={size.height}
        antialias
        backgroundAlpha={0}
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
            <pixiGraphics label="canvas-surface" draw={drawBackground} eventMode="none" />
            {/* Document items */}
            <PixiItemLayer items={renderedItems} />
          </pixiContainer>
        </pixiContainer>
      </Application>
    );
  },
);
