import type { ApplicationRef } from '@pixi/react';

import type { CanvasRendererHandle } from './canvasRendererTypes';

/**
 * Create a CanvasRendererHandle backed by a PixiJS Application.
 *
 * The appRef is read lazily — the Application may still be initializing when
 * this handle is first created, but it will be ready before any user interaction.
 */
export function createPixiRendererHandle(
  appRef: React.RefObject<ApplicationRef | null>,
): CanvasRendererHandle {
  return {
    getContainerElement() {
      return appRef.current?.getCanvas() ?? null;
    },

    getPointerPosition(event?: MouseEvent) {
      const canvas = appRef.current?.getCanvas();
      if (!event || !canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    },

    async exportToDataURL({ contentWidth, contentHeight, pixelRatio, mimeType = 'image/png' }) {
      const app = appRef.current?.getApplication();
      if (!app) return '';

      // Phase 5: implement full export (snapshot/restore, hide overlays, etc.)
      // For now return a basic canvas export.
      const canvas = app.canvas as HTMLCanvasElement;
      return canvas.toDataURL(mimeType);
    },
  };
}
