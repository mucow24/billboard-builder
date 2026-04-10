import type { ApplicationRef } from '@pixi/react';
import { Container, Rectangle } from 'pixi.js';

import type { CanvasRendererHandle } from './canvasRendererTypes';

/**
 * Create a CanvasRendererHandle backed by a PixiJS Application.
 *
 * The appRef is read lazily — the Application may still be initializing when
 * this handle is first created, but it will be ready before any user interaction.
 *
 * exportContainerRef points to the Container that wraps only the exportable
 * content (background + items, no overlays/guides).
 */
export function createPixiRendererHandle(
  appRef: React.RefObject<ApplicationRef | null>,
  exportContainerRef: React.RefObject<Container | null>,
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
      const exportContainer = exportContainerRef.current;
      if (!app?.renderer || !exportContainer) return '';

      const canvas = app.renderer.extract.canvas({
        target: exportContainer,
        frame: new Rectangle(0, 0, contentWidth, contentHeight),
        resolution: pixelRatio,
      }) as HTMLCanvasElement;

      return canvas.toDataURL(mimeType);
    },
  };
}
