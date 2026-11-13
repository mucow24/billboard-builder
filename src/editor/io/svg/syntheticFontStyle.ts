import type { TextCanvasItem } from '../../document/documentTypes';
import type { TextMeasurer } from './svgExportTypes';

/**
 * Bold and italic that the browser fakes, reproduced for the SVG export.
 *
 * When a family has no file for the weight or style a text asks for, the browser
 * draws the nearest file it has and fakes the rest, and that is what the canvas
 * shows. The export outlines that same file, so it has to fake the same things.
 * The numbers here were measured against canvas `fillText` in Chromium 145,
 * Firefox 146 and WebKit 26 (November 2026); each construction matched the canvas
 * as closely as plain outlines match unfaked text.
 *
 * Only shapes are faked here. Where the faking moves glyphs or changes a line's
 * width, the canvas measurer already reports it, because it measures with the
 * font declaration the canvas draws with.
 */

/**
 * How far faked italic leans a glyph: the distance a point moves right for each
 * unit of its height above the baseline. All three browsers use exactly this
 * (about 14 degrees) and leave advances as they are.
 */
export const SYNTHETIC_OBLIQUE_SLANT = 0.25;

/**
 * How the browser fakes bold, which differs by engine:
 *
 * - `stroke` (Chromium, WebKit): the outline grows evenly on all sides, which is
 *   the glyph filled and also stroked `width` wide with mitered joins. Advances
 *   stay as they are.
 * - `smear` (Firefox): the glyph is drawn smeared to the right over a distance,
 *   and every advance grows by that distance. `offsets` are the pen offsets of
 *   the copies that make up the smear, the first of them 0.
 */
export type SyntheticBold =
  | { kind: 'stroke'; width: number }
  | { kind: 'smear'; offsets: readonly number[] };

/**
 * Width of the stroke that turns a glyph into Chromium's and WebKit's faked bold.
 * This is Skia's rule: 1/32 of the font size from 36 px up, 1/24 at 9 px and
 * below, and a straight line between the two. It goes by the text's own font
 * size, whatever the zoom.
 */
export function syntheticBoldStrokeWidth(fontSize: number): number {
  const SMALL = 9;
  const LARGE = 36;
  const AT_SMALL = 1 / 24;
  const AT_LARGE = 1 / 32;
  if (fontSize <= SMALL) return fontSize * AT_SMALL;
  if (fontSize >= LARGE) return fontSize * AT_LARGE;
  return fontSize * (AT_SMALL + ((fontSize - SMALL) / (LARGE - SMALL)) * (AT_LARGE - AT_SMALL));
}

/** Copies of a smeared glyph are never further apart than this share of the font size. */
const SMEAR_STEP_PER_FONT_SIZE = 1 / 192;
const MIN_SMEAR_COPIES = 3;
const MAX_SMEAR_COPIES = 9;

/**
 * Pen offsets of the copies that reproduce a glyph smeared `distance` px to the
 * right. Copies in one `<path>` paint as their union, so the smear is whole
 * wherever a stroke of the glyph is at least as wide as the step between copies.
 * At Firefox's usual distance (1/48 of the font size) that is five copies, which
 * was enough for the thinnest bundled face (Bungee Hairline); three leave gaps
 * in it.
 */
export function smearOffsets(distance: number, fontSize: number): number[] {
  const step = Math.max(fontSize * SMEAR_STEP_PER_FONT_SIZE, Number.EPSILON);
  const copies = Math.min(
    MAX_SMEAR_COPIES,
    Math.max(MIN_SMEAR_COPIES, Math.ceil(distance / step) + 1),
  );
  return Array.from({ length: copies }, (_, index) => (distance * index) / (copies - 1));
}

/** An advance has to grow by more than this for the browser to count as smearing. */
const SMEAR_DETECTION_PX = 0.01;

/**
 * How the browser fakes bold for `item`, told from what it measures rather than
 * from which browser it is: a character that is wider in faked bold than in the
 * regular weight is being smeared, by that difference. `text` is the item's
 * text; a character out of it is measured so that the font has a glyph for it.
 */
export function syntheticBoldFor(
  item: TextCanvasItem,
  text: string,
  measurer: TextMeasurer,
): SyntheticBold {
  const sample = [...text].find((ch) => ch.trim().length > 0);
  const smear = sample ? (measurer.syntheticBoldAdvance?.(item, sample) ?? 0) : 0;
  return smear > SMEAR_DETECTION_PX
    ? { kind: 'smear', offsets: smearOffsets(smear, item.fontSize) }
    : { kind: 'stroke', width: syntheticBoldStrokeWidth(item.fontSize) };
}
