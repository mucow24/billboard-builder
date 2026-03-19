interface CanvasViewportHudProps {
  canvasHeight: number;
  canvasWidth: number;
  guidesCount: number;
  onFitCanvas: () => void;
  onSetZoom: (nextZoom: number) => void;
  zoom: number;
  zoomStep: number;
}

export function CanvasViewportHud({
  canvasHeight,
  canvasWidth,
  guidesCount,
  onFitCanvas,
  onSetZoom,
  zoom,
  zoomStep,
}: CanvasViewportHudProps) {
  return (
    <div className="canvas-hud">
      <div className="canvas-hud-pill" data-testid="canvas-size">
        {canvasWidth} x {canvasHeight}
      </div>
      <div className="canvas-hud-pill" data-testid="guide-count">
        Guides: {guidesCount}
      </div>
      <div className="canvas-hud-controls" aria-label="Viewport controls">
        <button
          type="button"
          className="canvas-hud-button"
          aria-label="Zoom out"
          onClick={() => onSetZoom(zoom - zoomStep)}
        >
          −
        </button>
        <span className="canvas-hud-pill canvas-hud-readout" data-testid="viewport-zoom">
          Zoom: {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          className="canvas-hud-button"
          aria-label="Zoom in"
          onClick={() => onSetZoom(zoom + zoomStep)}
        >
          +
        </button>
        <button
          type="button"
          className="canvas-hud-button"
          aria-label="Set zoom to 100%"
          onClick={() => onSetZoom(1)}
        >
          100%
        </button>
        <button
          type="button"
          className="canvas-hud-button"
          aria-label="Fit canvas to viewport"
          onClick={onFitCanvas}
        >
          Fit
        </button>
      </div>
    </div>
  );
}
