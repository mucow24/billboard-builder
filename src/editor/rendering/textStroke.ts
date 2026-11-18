/**
 * The outline of a text layer: a stroke `strokeWidth` px wide, centred on the
 * edge of every glyph and drawn under the fill. The half outside the glyph
 * shows, and the half behind it too where the fill is see-through.
 *
 * Its joins and caps are round on the canvas and in the SVG export alike. A
 * round join reaches exactly half the stroke past the glyph, which bounds the
 * room the stroke needs; a mitered one reaches several times as far at the
 * sharp corners of letters such as "M" and "V".
 *
 * The canvas does not draw it with the 2D canvas's `strokeText`, which gets
 * two things wrong (measured in Chromium on Windows, November 2026):
 *
 * - Below a certain size the browser grid-fits filled glyphs and not stroked
 *   ones, so the stroke does not sit on the fill: a filled 150 px "C" of
 *   Poiret One is drawn 1.8 px higher than its own outline.
 * - Where a family has no bold file the browser fakes one by growing the
 *   glyphs, and the path it strokes then holds the regular outline and both
 *   edges of the growth: rings inside every stem, which show wherever the fill
 *   is see-through. (Firefox fakes bold by smearing the glyph sideways, and
 *   strokes every copy.)
 *
 * So the outline is worked out from the image of the filled text
 * (`alphaOutline`, `stage/textOutlineImage`): a band around the edge of the
 * glyphs exactly as the layer shows them. The SVG export strokes the glyphs'
 * contours themselves, which have neither problem (`io/svg/svgText`).
 */
import { splitColorAlpha } from '../generators/colorUtils';
import type { TextCanvasItem } from '../document/documentTypes';

export const TEXT_STROKE_JOIN = 'round';

/** The outline of a text item as it is painted. */
export interface TextStrokePaint {
  /** Width in px. */
  width: number;
  /** The colour without its alpha, as `#rrggbb`. */
  color: string;
  /**
   * The colour's alpha, 0 to 1. The outline is painted opaque and made
   * see-through as a whole: painted see-through, it would come out darker
   * wherever the strokes of two glyphs overlap.
   */
  alpha: number;
}

/** The outline `item` is drawn with, or null where it has none to show. */
export function textStrokeOf(
  item: Pick<TextCanvasItem, 'stroke' | 'strokeWidth'>,
): TextStrokePaint | null {
  if (!(item.strokeWidth > 0) || !Number.isFinite(item.strokeWidth)) return null;
  if (!item.stroke || item.stroke === 'transparent') return null;
  const { alpha, color } = splitColorAlpha(item.stroke);
  if (!(alpha > 0)) return null;
  return { width: item.strokeWidth, color, alpha };
}
