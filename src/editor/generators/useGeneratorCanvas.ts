import { useEffect, useReducer, useRef } from 'react';

import type { GeneratorCanvasItem } from '../document/documentTypes';

import { getGenerator } from './index';

/**
 * Rasterizes a generator into an offscreen canvas and keeps it up to date.
 *
 * The returned canvas keeps its identity while only the pattern changes
 * (params, seed), so callers can re-upload the same texture. Whenever its
 * pixel dimensions change (canvas resize, pixel scale) a NEW canvas is
 * returned: a Pixi sprite derives its scale from its texture's size only when
 * the texture object changes, so resizing a canvas behind a texture that is
 * still in use leaves the sprite drawing at the old size.
 */
export function useGeneratorCanvas(
  item: GeneratorCanvasItem,
  canvasWidth: number,
  canvasHeight: number,
  pixelScale: number = 1,
): HTMLCanvasElement | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevParamsRef = useRef<GeneratorCanvasItem['generatorParams'] | null>(null);
  const prevWidthRef = useRef(0);
  const prevHeightRef = useRef(0);
  const prevSeedRef = useRef(0);
  const prevPixelScaleRef = useRef(0);
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (
      prevParamsRef.current === item.generatorParams &&
      prevWidthRef.current === canvasWidth &&
      prevHeightRef.current === canvasHeight &&
      prevSeedRef.current === item.seed &&
      prevPixelScaleRef.current === pixelScale
    ) {
      return;
    }

    prevParamsRef.current = item.generatorParams;
    prevWidthRef.current = canvasWidth;
    prevHeightRef.current = canvasHeight;
    prevSeedRef.current = item.seed;
    prevPixelScaleRef.current = pixelScale;

    const spec = getGenerator(item.generatorParams.generatorType);
    if (!spec) return;

    // Render at higher physical resolution so the bitmap stays sharp when
    // the editor zooms past 100%. Generators draw in logical units (canvasW
    // × canvasH); the transform lifts that into physical pixels.
    const pixelWidth = Math.max(1, Math.round(canvasWidth * pixelScale));
    const pixelHeight = Math.max(1, Math.round(canvasHeight * pixelScale));

    let canvas = canvasRef.current;
    if (!canvas || canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas = document.createElement('canvas');
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvasRef.current = canvas;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    spec.draw(ctx, canvasWidth, canvasHeight, item.generatorParams, item.seed);

    forceRender();
  }, [item.generatorParams, item.seed, canvasWidth, canvasHeight, pixelScale]);

  return canvasRef.current;
}
