import { useEffect, useRef, useState } from 'react';

import { parseZoomPercentInput } from './viewportMath';

interface CanvasViewportHudProps {
  canvasHeight: number;
  canvasWidth: number;
  onFitCanvas: () => void;
  onSetZoom: (nextZoom: number) => void;
  zoom: number;
  zoomStep: number;
}

function formatZoomPercent(zoom: number) {
  return `${Math.round(zoom * 100)}`;
}

function ZoomReadout({ onSetZoom, zoom }: { onSetZoom: (nextZoom: number) => void; zoom: number }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  // Set when Enter or Escape already finished the edit, so the blur that
  // follows the input unmounting does not apply the draft a second time.
  const finishedRef = useRef(false);
  const refocusButtonRef = useRef(false);
  const initialDraftRef = useRef('');

  useEffect(() => {
    if (editing) {
      const node = inputRef.current;
      node?.focus();
      node?.select();
    } else if (refocusButtonRef.current) {
      refocusButtonRef.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  function beginEditing() {
    finishedRef.current = false;
    initialDraftRef.current = formatZoomPercent(zoom);
    setDraft(initialDraftRef.current);
    setEditing(true);
  }

  function finish(apply: boolean) {
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;
    setEditing(false);
    // Leave the zoom alone when the text was not edited. The field opens with
    // the zoom rounded to a whole percent, and applying that rounded value
    // snaps to a different step at DPR 2 and above (12.5% becomes 13.28% at
    // DPR 2). It also keeps a stale draft from undoing a wheel zoom made while
    // the field was open.
    if (!apply || draft.trim() === initialDraftRef.current) {
      return;
    }
    const nextZoom = parseZoomPercentInput(draft);
    if (nextZoom !== null) {
      onSetZoom(nextZoom);
    }
  }

  if (editing) {
    return (
      <span className="canvas-hud-pill canvas-hud-readout canvas-hud-readout-editing">
        <label htmlFor="viewport-zoom-input">Zoom:</label>
        <input
          ref={inputRef}
          id="viewport-zoom-input"
          data-testid="viewport-zoom-input"
          className="canvas-hud-zoom-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              refocusButtonRef.current = true;
              finish(true);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              refocusButtonRef.current = true;
              finish(false);
            }
          }}
        />
        %
      </span>
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className="canvas-hud-pill canvas-hud-readout canvas-hud-readout-button"
      data-testid="viewport-zoom"
      title="Click to enter a zoom level"
      aria-label={`Zoom: ${formatZoomPercent(zoom)}%. Click to enter a zoom level`}
      onClick={beginEditing}
    >
      Zoom: {formatZoomPercent(zoom)}%
    </button>
  );
}

export function CanvasViewportHud({
  canvasHeight,
  canvasWidth,
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
      <div className="canvas-hud-controls" aria-label="Viewport controls">
        <button
          type="button"
          className="canvas-hud-button"
          aria-label="Zoom out"
          onClick={() => onSetZoom(zoom - zoomStep)}
        >
          −
        </button>
        <ZoomReadout onSetZoom={onSetZoom} zoom={zoom} />
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
