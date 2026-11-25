import type { TextCanvasItem } from '../../document/documentTypes';
import type { TextMeasurer } from './svgExportTypes';
import { graphemes } from '../../rendering/graphemes';

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
 *
 * Whether bold is faked at all is not settled by the weight a file is registered
 * with. Measured on Windows with the Barlow files, each registered as a family
 * of its own at weight 400 and drawn with `bold` (Chromium 145.0.7632.6, Firefox
 * 146.0.1, WebKit 26.0; November 2026):
 *
 * - Firefox and WebKit go by the registered weight alone and fake the bold of
 *   every such file, Barlow Black included. (They stop at a registered weight
 *   of 600, which this app never registers: its files are 400 or 700.)
 * - Chromium also looks into the file, and draws bold exactly as regular where
 *   the file says it is heavy: an OS/2 weight class of 600 or more (Semibold,
 *   Bold, Extrabold and Black; 599 is faked), or the bold bit of OS/2
 *   `fsSelection` on a file of weight class 400. `head.macStyle` alone changes
 *   nothing. Barlow Black and Bold stayed unfaked with weight class 400 and
 *   both bits cleared, so something else counts too, most likely the names in
 *   the file, and what counts is likely to differ by platform.
 *
 * So the file's tables do not say what a browser will do with it, and
 * `syntheticBoldFor` asks the browser instead: bold that it draws exactly as
 * regular is not faked.
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
 * How the browser fakes bold for `item`, whose family has no bold file, told
 * from what it measures and draws rather than from which browser it is: a
 * character that is wider in faked bold than in the regular weight is being
 * smeared, by that difference. Null where the browser does not fake bold with
 * the file after all: it draws the character in bold exactly as in the regular
 * weight (see the top of this file). `text` is the text drawn with the font in
 * question; a grapheme out of it is measured so that the font has a glyph for
 * it.
 *
 * A whole grapheme, because the browser picks the font for a grapheme as a
 * whole: a hand with a skin tone comes from the emoji fallback even when the
 * text's font has the hand, and measuring the hand alone would measure the
 * text's font instead, and its real bold.
 */
export function syntheticBoldFor(
  item: TextCanvasItem,
  text: string,
  measurer: TextMeasurer,
): SyntheticBold | null {
  const sample = graphemes(text).find((piece) => piece.trim().length > 0);
  const smear = sample ? (measurer.syntheticBoldAdvance?.(item, sample) ?? 0) : 0;
  // A smeared character is wider, which settles it without drawing anything.
  if (sample && !(smear > SMEAR_DETECTION_PX) && measurer.drawsBoldAsRegular?.(item, sample)) return null;
  return smear > SMEAR_DETECTION_PX
    ? { kind: 'smear', offsets: smearOffsets(smear, item.fontSize) }
    : { kind: 'stroke', width: syntheticBoldStrokeWidth(item.fontSize) };
}
