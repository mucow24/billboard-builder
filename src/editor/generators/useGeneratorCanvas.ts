import { useEffect, useRef, useState } from 'react';

import type { GeneratorCanvasItem } from '../document/documentTypes';

import { getGenerator } from './index';

export function useGeneratorCanvas(
  item: GeneratorCanvasItem,
  canvasWidth: number,
  canvasHeight: number,
): HTMLCanvasElement | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevParamsRef = useRef<GeneratorCanvasItem['generatorParams'] | null>(null);
  const prevWidthRef = useRef(0);
  const prevHeightRef = useRef(0);
  const prevSeedRef = useRef(0);
  const [, setRenderCount] = useState(0);

  useEffect(() => {
    if (
      prevParamsRef.current === item.generatorParams &&
      prevWidthRef.current === canvasWidth &&
      prevHeightRef.current === canvasHeight &&
      prevSeedRef.current === item.seed
    ) {
      return;
    }

    prevParamsRef.current = item.generatorParams;
    prevWidthRef.current = canvasWidth;
    prevHeightRef.current = canvasHeight;
    prevSeedRef.current = item.seed;

    const spec = getGenerator(item.generatorParams.generatorType);
    if (!spec) return;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }

    const canvas = canvasRef.current;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    spec.draw(ctx, canvasWidth, canvasHeight, item.generatorParams, item.seed);

    setRenderCount((n) => n + 1);
  }, [item.generatorParams, item.seed, canvasWidth, canvasHeight]);

  return canvasRef.current;
}
