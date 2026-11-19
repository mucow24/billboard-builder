/**
 * The outline of a text layer: a stroke `strokeWidth` px wide, centred on the
 * edge of every glyph and drawn under the fill. The half outside the glyph
 * shows, and the half behind it too where the fill is see-through.
 *
 * Its joins and caps are round on the canvas and in the SVG export alike. A
 * round join reaches exactly half the stroke past the glyph, which bounds the
 * room the stroke needs; a mitered one reaches several times as far at the
 * sharp corners of letters such as "M" and "V".
 */
import { splitColorAlpha } from '../generators/colorUtils';
import type { TextCanvasItem } from '../document/documentTypes';
import { snapPaddingToTexels } from './textInkOverhang';

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

/**
 * Where a Pixi text with a stroke goes so that its glyphs land on those of the
 * same text without one.
 *
 * Pixi draws a stroked text half the stroke further right and down inside its
 * texture, so the text is moved back by `offset` on both axes. That alone would
 * leave the glyphs between the texels the unstroked text has them on. Its
 * `padding` is therefore chosen so that padding and half the stroke together
 * come to whole blocks of texels (see `snapPaddingToTexels`): the stroke is
 * then rasterised around glyphs that sit texel for texel where the fill's do.
 *
 * `inkRoom` is the room the stroked text needs as padding
 * (`measureTextRasterPadding`), `resolution` the texels per px it is
 * rasterised at.
 */
export function strokedTextPlacement(
  inkRoom: number,
  strokeWidth: number,
  resolution: number,
): { padding: number; offset: number } {
  const halfStroke = strokeWidth > 0 && Number.isFinite(strokeWidth) ? strokeWidth / 2 : 0;
  if (halfStroke === 0) return { padding: snapPaddingToTexels(inkRoom, resolution), offset: 0 };
  const room = Number.isFinite(inkRoom) ? Math.max(0, inkRoom) : 0;
  return {
    padding: snapPaddingToTexels(room + halfStroke, resolution) - halfStroke,
    offset: -halfStroke,
  };
}
