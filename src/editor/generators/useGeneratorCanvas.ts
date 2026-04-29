import { useEffect, useReducer, useRef } from 'react';

import type { GeneratorCanvasItem } from '../document/documentTypes';

import { getGenerator } from './index';

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

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }

    const canvas = canvasRef.current;
    // Render at higher physical resolution so the bitmap stays sharp when
    // the editor zooms past 100%. Generators draw in logical units (canvasW
    // × canvasH); ctx.scale lifts that into physical pixels.
    canvas.width = Math.max(1, Math.round(canvasWidth * pixelScale));
    canvas.height = Math.max(1, Math.round(canvasHeight * pixelScale));

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    spec.draw(ctx, canvasWidth, canvasHeight, item.generatorParams, item.seed);

    forceRender();
  }, [item.generatorParams, item.seed, canvasWidth, canvasHeight, pixelScale]);

  return canvasRef.current;
}
