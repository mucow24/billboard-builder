import type { ApplicationRef } from '@pixi/react';
import { Container, Rectangle } from 'pixi.js';

import { configureZoomScaledFilters } from '../stage/zoomScaledFilters';
import type { CanvasRendererHandle } from './canvasRendererTypes';
import { extractStraightAlphaCanvas } from './straightAlphaExtract';

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

      // The extract draws the export container at 1:1 with no viewport pan or
      // zoom, but Pixi places each filter's working area with the filtered
      // object's on-screen transform, and the item layer scales filter
      // settings (blur strength, shadow offset) by the zoom. Left alone, a
      // blurred or shadowed item comes out cropped to its on-screen size,
      // moved by the pan, and blurred by a zoom-dependent amount. So for the
      // duration of the (synchronous) extract, take the viewport transform off
      // the ancestors and set the filters for a zoom of 1. Nothing is drawn to
      // the screen in between.
      const restoreViewport = neutralizeAncestorTransforms(exportContainer);
      configureZoomScaledFilters(exportContainer, 1, pixelRatio);
      try {
        const canvas = extractStraightAlphaCanvas(app.renderer, {
          target: exportContainer,
          frame: new Rectangle(0, 0, contentWidth, contentHeight),
          resolution: pixelRatio,
        });

        return canvas.toDataURL(mimeType);
      } finally {
        const zoom = restoreViewport();
        configureZoomScaledFilters(exportContainer, zoom, app.renderer.resolution);
      }
    },
  };
}

/**
 * Reset the position and scale of every ancestor of `container`, so its world
 * transform equals its own. Returns a function that puts them back and reports
 * the zoom (combined ancestor scale) that was in effect.
 */
function neutralizeAncestorTransforms(container: Container): () => number {
  const saved: Array<{ node: Container; x: number; y: number; scaleX: number; scaleY: number }> = [];
  let zoom = 1;
  for (let node = container.parent; node; node = node.parent) {
    saved.push({ node, x: node.x, y: node.y, scaleX: node.scale.x, scaleY: node.scale.y });
    zoom *= node.scale.x;
    node.position.set(0, 0);
    node.scale.set(1, 1);
  }
  return () => {
    for (const { node, x, y, scaleX, scaleY } of saved) {
      node.position.set(x, y);
      node.scale.set(scaleX, scaleY);
    }
    return zoom;
  };
}
