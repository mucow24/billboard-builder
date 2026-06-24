import type { GeneratorCanvasItem, GeneratorParams } from '../../document/documentTypes';
import { getGenerator } from '../../generators';
import type { NodeRasterizer } from './svgExportTypes';

interface GeneratorSpecLike {
  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    params: GeneratorParams,
    seed: number,
  ): void;
}

interface RasterizerDeps {
  /** Canvas factory — injected so tests can supply a fake (jsdom has no real 2D context). */
  createCanvas?: () => HTMLCanvasElement;
  /** Generator lookup — defaults to the real registry. */
  getGeneratorSpec?: (type: string) => GeneratorSpecLike | undefined;
  /** Supersample factor so embedded bitmaps stay sharp when the SVG is scaled up. */
  pixelRatio?: number;
}

/**
 * Rasterize a generator by replaying the SAME pure `draw(ctx, …)` the editor uses
 * (so the embedded bitmap matches what's on screen), then exporting a PNG data URL.
 * Mirrors `useGeneratorCanvas`'s physical-pixel scaling.
 */
export function createGeneratorRasterizer(deps: RasterizerDeps = {}): NodeRasterizer {
  const createCanvas = deps.createCanvas ?? (() => document.createElement('canvas'));
  const getGeneratorSpec = deps.getGeneratorSpec ?? getGenerator;
  const pixelRatio = deps.pixelRatio ?? 2;

  return {
    rasterizeGenerator(item: GeneratorCanvasItem, canvasWidth: number, canvasHeight: number): string {
      const spec = getGeneratorSpec(item.generatorParams.generatorType);
      if (!spec) return '';

      const canvas = createCanvas();
      canvas.width = Math.max(1, Math.round(canvasWidth * pixelRatio));
      canvas.height = Math.max(1, Math.round(canvasHeight * pixelRatio));
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';

      // Draw in logical units; the transform lifts into physical pixels.
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      spec.draw(ctx, canvasWidth, canvasHeight, item.generatorParams, item.seed);

      return canvas.toDataURL('image/png');
    },
  };
}
