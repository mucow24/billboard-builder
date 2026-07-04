import { useEffect, useState } from 'react';

/**
 * Rasterizes a loaded SVG image element onto a canvas at the given pixel
 * size. Browsers render SVG image sources at the destination size of a
 * drawImage call, so redrawing on size changes is what keeps vector content
 * crisp across zoom and stretch.
 *
 * Each redraw returns a NEW canvas element on purpose: Pixi's Sprite only
 * re-derives its width/height-driven scale when the texture object identity
 * changes (`Sprite.set texture` early-returns on the same texture), so
 * resizing a canvas behind a reused texture leaves sprites rendering with a
 * stale scale. A fresh canvas per raster forces a fresh texture downstream.
 */
export function useSvgImageCanvas(
  imageElement: HTMLImageElement | null,
  pixelWidth: number,
  pixelHeight: number,
): HTMLCanvasElement | null {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!imageElement) {
      setCanvas(null);
      return;
    }

    const nextCanvas = document.createElement('canvas');
    nextCanvas.width = Math.max(1, Math.round(pixelWidth));
    nextCanvas.height = Math.max(1, Math.round(pixelHeight));

    const ctx = nextCanvas.getContext('2d');
    if (!ctx) {
      setCanvas(null);
      return;
    }
    // drawImage re-rasterizes the SVG using the image's *computed* color scheme.
    // useImageElement loads SVGs inside a forced-light host so imports don't pick
    // up a dark-mode variant (which often paints solid black), but when the host
    // was only just attached the light scheme may not be committed yet — the
    // first raster then samples the stale dark scheme and bakes a black canvas.
    // Force a style + layout flush so the light scheme is applied before drawing.
    if (imageElement.parentElement) {
      void getComputedStyle(imageElement).colorScheme;
      void imageElement.offsetWidth;
    }
    ctx.drawImage(imageElement, 0, 0, nextCanvas.width, nextCanvas.height);

    setCanvas(nextCanvas);
  }, [imageElement, pixelWidth, pixelHeight]);

  return canvas;
}
