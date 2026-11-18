/**
 * The drop shadow of a text layer with tags or with an outline, as one image.
 *
 * A layer with tags is drawn as one Pixi text per fragment (`PixiItemLayer`).
 * A shadow per fragment would be drawn over its neighbours' shadows wherever
 * two of them meet: where the outlines of two fragments overlap, and where two
 * blurred shadows run into each other. A see-through shadow is darker there.
 * And the outline of a layer is not something Pixi draws at all (see
 * `textStroke`), so Pixi cannot cast a shadow from it.
 *
 * So the shadow is cast once, from all of the fragments together (a layer
 * without tags is one fragment):
 *
 * 1. Every fragment is rasterised by Pixi's own text generator, opaque and
 *    without a shadow, and grown by half the outline's width (`alphaOutline`):
 *    exactly the glyphs and the outline the layer shows.
 * 2. Those are copied into one canvas, the silhouette, each on whole texels,
 *    so that none of them is resampled.
 * 3. The shadow of the silhouette is drawn into a second canvas with the
 *    2D canvas's own shadow, which is what Pixi casts a text's shadow with.
 *    It is drawn opaque; whoever shows it applies the shadow's opacity.
 *
 * The result is the shadow one text of that shape would cast: flat where
 * fragments overlap, and blurred across the gaps between them as a whole.
 */
import { CanvasTextGenerator, CanvasTextMetrics, Color, TextStyle } from 'pixi.js';
import type { TextStyleOptions } from 'pixi.js';

import { snapOffsetToTexels } from '../textBaseline';
import { outlinedShapeCoverage } from '../alphaOutline';
import { shadowBlurReach, snapPaddingToTexels } from '../textInkOverhang';
import { shadowCanvasRects } from '../textShadowCanvas';
import type { TexelRect } from '../textShadowCanvas';
import { clampRasterResolution, getMaxTextureSize } from './rasterCaps';
import { measureTextRasterPadding } from './textRasterPadding';

/** A fragment the shadow is cast from. */
export interface ShadowCaster {
  text: string;
  /**
   * The style the fragment is laid out with: its font. No fill, no stroke, no
   * padding and no drop shadow.
   */
  style: TextStyleOptions;
  /** Where the fragment starts, in px of the item, before it is put on whole texels. */
  left: number;
  /** The top of the fragment's line box, in px of the item. */
  lineTop: number;
  /** How far the fragment is moved down from there onto the shared baseline, in px. */
  baselineShift: number;
}

/** Everything the shadow image depends on. Plain data: its JSON is its identity. */
export interface RichTextShadowInput {
  casters: ShadowCaster[];
  /** The width of the layer's outline in px, 0 without one. */
  strokeWidth: number;
  /** The shadow as Pixi's text style has it. */
  shadow: { angle: number; distance: number; blur: number; color: string };
  /** The resolution the current zoom calls for, in texels per px. */
  requestedResolution: number;
}

export interface RichTextShadowImage {
  canvas: HTMLCanvasElement;
  /** Where the canvas goes, in px of the item. */
  x: number;
  y: number;
  /** Texels per px. */
  resolution: number;
}

/** A paint that covers: what the silhouette is drawn with. */
const SOLID = '#000000';

/**
 * Draw the one shadow of `input`'s fragments. Null where there is nothing to
 * draw it with or from.
 */
export function rasteriseRichTextShadow(input: RichTextShadowInput): RichTextShadowImage | null {
  const { casters, shadow, requestedResolution } = input;
  if (typeof document === 'undefined' || casters.length === 0) return null;

  const strokeWidth = input.strokeWidth > 0 ? input.strokeWidth : 0;
  const halfStroke = strokeWidth / 2;
  const offsetX = Math.cos(shadow.angle) * shadow.distance;
  const offsetY = Math.sin(shadow.angle) * shadow.distance;
  const reach = shadowBlurReach(shadow.blur);

  const measured = casters.map((caster) => {
    const size = CanvasTextMetrics.measureText(caster.text || ' ', new TextStyle({ ...caster.style, padding: 0 }));
    return { caster, inkRoom: measureTextRasterPadding(caster.text, caster.style), size };
  });

  // One resolution for the whole image, clamped so that it stays under the
  // GPU's MAX_TEXTURE_SIZE (see `rasterCaps`): the px it covers are those of
  // every fragment's texture and of the shadow they cast. Rounding to blocks
  // of texels adds a little, which the clamp's own margin covers.
  const boxes = measured.map(({ caster, inkRoom, size }) => {
    const left = caster.left - halfStroke - inkRoom;
    const top = caster.lineTop + caster.baselineShift - halfStroke - inkRoom;
    return {
      left,
      top,
      right: left + Math.ceil(Math.max(1, size.width)) + (inkRoom + halfStroke) * 2,
      bottom: top + Math.ceil(Math.max(1, size.height)) + (inkRoom + halfStroke) * 2,
    };
  });
  const span = (low: number[], high: number[], offset: number) =>
    Math.max(...high) - Math.min(...low) + Math.abs(offset) + reach * 2;
  const resolution = clampRasterResolution(
    requestedResolution,
    Math.max(
      span(boxes.map((box) => box.left), boxes.map((box) => box.right), offsetX),
      span(boxes.map((box) => box.top), boxes.map((box) => box.bottom), offsetY),
    ),
    getMaxTextureSize(),
  );

  // Texels are counted from the item's left edge and from the top of the first
  // line. Across, every fragment starts on a whole texel. Down, the fragments
  // of that line do; other lines are a fraction of a texel off wherever the
  // line height is not a whole number of texels, and are put on the nearest.
  const originY = casters[0].lineTop;

  const pieces = measured.map(({ caster, inkRoom }) => {
    // Padding in whole blocks of texels, as the fragment's own texts have it:
    // the glyphs are rasterised exactly as its fill is. A texel more than half
    // the stroke is the outline's soft edge.
    const padding = snapPaddingToTexels(
      inkRoom + halfStroke + (strokeWidth > 0 ? 1 / resolution : 0),
      resolution,
    );
    const x = snapOffsetToTexels(caster.left, resolution) - padding;
    const y = caster.lineTop + snapOffsetToTexels(caster.baselineShift, resolution) - padding;
    const { canvasAndContext, frame } = CanvasTextGenerator.getCanvasAndContext({
      text: caster.text,
      style: new TextStyle({ ...caster.style, fill: SOLID, padding }),
      resolution,
    });
    const filled = canvasAndContext.canvas as CanvasImageSource;
    // Without an outline the fragment is copied as it is.
    let image: CanvasImageSource = filled;
    let release = () => CanvasTextGenerator.returnCanvasAndContext(canvasAndContext);
    if (strokeWidth > 0) {
      const grown = grownBy(canvasAndContext.context, frame.width, frame.height, halfStroke * resolution);
      if (grown) {
        release();
        image = grown;
        release = () => {
          grown.width = 0;
          grown.height = 0;
        };
      }
    }
    const rect: TexelRect = {
      left: Math.round(x * resolution),
      top: Math.round((y - originY) * resolution),
      width: frame.width,
      height: frame.height,
    };
    return { image, release, rect };
  });

  const release = () => {
    for (const piece of pieces) piece.release();
  };

  const rects = shadowCanvasRects(
    pieces.map((piece) => piece.rect),
    offsetX * resolution,
    offsetY * resolution,
    reach * resolution,
  );
  if (!rects) {
    release();
    return null;
  }

  const silhouette = document.createElement('canvas');
  silhouette.width = rects.silhouette.width;
  silhouette.height = rects.silhouette.height;
  const canvas = document.createElement('canvas');
  canvas.width = rects.shadow.width;
  canvas.height = rects.shadow.height;
  const silhouetteContext = silhouette.getContext('2d');
  const context = canvas.getContext('2d');
  if (!silhouetteContext || !context) {
    release();
    return null;
  }

  for (const { image, rect } of pieces) {
    silhouetteContext.drawImage(
      image,
      0,
      0,
      rect.width,
      rect.height,
      rect.left - rects.silhouette.left,
      rect.top - rects.silhouette.top,
      rect.width,
      rect.height,
    );
  }
  release();

  // The silhouette is drawn past the left edge of the canvas and its shadow is
  // moved back by as much, so that only the shadow shows: how Pixi draws the
  // shadow of a text (`CanvasTextGenerator`), with the same blur and offset.
  // Shadow offsets and blur are in texels whatever the transform.
  const away = rects.shadow.width + rects.silhouette.width + 1;
  context.shadowColor = Color.shared.setValue(shadow.color).setAlpha(1).toRgbaString();
  context.shadowBlur = shadow.blur * resolution;
  context.shadowOffsetX = offsetX * resolution + away;
  context.shadowOffsetY = offsetY * resolution;
  context.drawImage(
    silhouette,
    rects.silhouette.left - rects.shadow.left - away,
    rects.silhouette.top - rects.shadow.top,
  );
  // Give the silhouette's memory back now, not when it is collected.
  silhouette.width = 0;
  silhouette.height = 0;

  return {
    canvas,
    x: rects.shadow.left / resolution,
    y: originY + rects.shadow.top / resolution,
    resolution,
  };
}

/**
 * The shape in the first `width` by `height` texels of `context`, grown by
 * `halfWidth` texels on all sides: a fragment together with its outline.
 * Null where there is no canvas to draw it on.
 */
function grownBy(
  context: { getImageData(x: number, y: number, width: number, height: number): { data: ArrayLike<number> } },
  width: number,
  height: number,
  halfWidth: number,
): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const target = canvas.getContext('2d');
  if (!target) return null;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const alpha = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = pixels[i * 4 + 3];
  const coverage = outlinedShapeCoverage(alpha, canvas.width, canvas.height, halfWidth);
  const image = target.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < coverage.length; i += 1) image.data[i * 4 + 3] = coverage[i];
  target.putImageData(image, 0, 0);
  return canvas;
}
