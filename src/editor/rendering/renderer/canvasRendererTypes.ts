/**
 * Thin abstraction layer between business logic and the canvas rendering backend.
 *
 * Targets the three seams where renderer identity leaks into renderer-agnostic code:
 * 1. Event objects (KonvaEventObject → CanvasPointerEvent)
 * 2. Stage handle (Konva.Stage → CanvasRendererHandle)
 * 3. Export API (stage.toDataURL → handle.exportToDataURL)
 */

/** Normalized pointer event — replaces KonvaEventObject in event handlers. */
export interface CanvasPointerEvent {
  /** Pointer position in viewport (stage pixel) coordinates. */
  viewportPointer: { x: number; y: number } | null;
  /** The underlying browser event (both Konva and PixiJS expose this). */
  nativeEvent: MouseEvent | WheelEvent;
  /** Stop propagation within the renderer's scene graph. */
  stopPropagation(): void;
  /** Whether the event hit the canvas surface/backdrop (not an item). Determined by the renderer. */
  isCanvasSurface?: boolean;
}

/** Abstraction over the renderer's stage/application — replaces Konva.Stage ref. */
export interface CanvasRendererHandle {
  /** The DOM element containing the canvas (for getBoundingClientRect). */
  getContainerElement(): HTMLElement | null;

  /** Get pointer position in viewport coordinates from a mouse event. */
  getPointerPosition(event?: MouseEvent): { x: number; y: number } | null;

  /**
   * Export canvas content to a data URL.
   * Implementation hides overlays, resets viewport, renders, and restores.
   */
  exportToDataURL(options: {
    contentWidth: number;
    contentHeight: number;
    pixelRatio: number;
    mimeType?: string;
  }): Promise<string>;
}
