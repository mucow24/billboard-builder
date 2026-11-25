/**
 * What bold text is drawn with.
 *
 * A text is set in one weight of a typeface, a font picker entry ("Barlow
 * Light"), and may be bold on top of that. Bold is a heavier weight of the same
 * typeface wherever the typeface has one: the weight nearest to 300 above the
 * text's own, which is the step from regular (400) to bold (700). Only where
 * nothing heavier is to be had (the heaviest weight of a family, a font with
 * one weight, a system font) is the bold left to the browser, which draws the
 * text's own file and fakes the rest.
 *
 * The weights of a typeface are told apart by name, as the font menu groups
 * them (`splitFontFamilyVariant`): entries whose names differ only in a weight
 * word at the end. Each is a CSS family of its own with its file registered as
 * the regular weight, so drawing "Barlow Light" in bold means drawing "Barlow
 * SemiBold" in its regular weight. The one weight that is not an entry of its
 * own is a family's Bold, the 700 face of the entry without a weight word.
 *
 * Pure: no DOM, so it is testable on its own, and the document's own code can
 * use it.
 */
import type { TextCanvasItem, UploadedFont } from '../document/documentTypes';
import { parseRichText } from '../document/richText';
import { splitFontFamilyVariant } from './fontFamilyGroups';

/** How much heavier than a text's own weight its bold aims to be. */
export const BOLD_WEIGHT_STEP = 300;

const BOLD_FACE_WEIGHT = 700;

type FontFile = Pick<UploadedFont, 'family' | 'weight' | 'style'>;
type FontOfText = Pick<TextCanvasItem, 'fontFamily' | 'fontWeight' | 'fontStyle'>;

/**
 * What the weights of one typeface have in common: the name without its weight
 * word, without regard to case, as the browser matches family names.
 */
export function fontFamilyGroupKey(family: string): string {
  return splitFontFamilyVariant(family).base.trim().toLowerCase();
}

/** The CSS weight a file stands for in its typeface, or null where its name does not say. */
function typefaceWeightOf(font: FontFile): number | null {
  const split = splitFontFamilyVariant(font.family);
  if (font.weight !== '700') return split.weight;
  // The bold face of an entry that is itself a weight ("Light" in bold) is no weight of the typeface.
  return split.variant === null ? BOLD_FACE_WEIGHT : null;
}

/**
 * The real font that text set in `family`, in `style`, is drawn with when it is
 * bold: a family to draw it in and the weight to ask the browser for there.
 * Null when `fonts` has nothing heavier for it, and its bold is the browser's
 * to fake.
 *
 * `fonts` are the registered font files. Of the weights heavier than the
 * text's own, the one nearest to `BOLD_WEIGHT_STEP` above it is taken, the
 * heavier of two that are equally near. Style comes before weight, as it does
 * when the browser picks a face: where the text's own entry has a file in
 * `style`, only weights that have one too are considered, so real italic is
 * never given up for real bold.
 */
export function resolveBoldFont(
  family: string,
  style: UploadedFont['style'],
  fonts: readonly FontFile[],
): Pick<TextCanvasItem, 'fontFamily' | 'fontWeight'> | null {
  const group = fontFamilyGroupKey(family);
  const ownWeight = splitFontFamilyVariant(family).weight;
  const target = ownWeight + BOLD_WEIGHT_STEP;
  const keepStyle = fonts.some((font) => font.family === family && font.style === style);

  const isBetter = (font: FontFile, weight: number, than: FontFile, thanWeight: number): boolean => {
    const distance = Math.abs(weight - target);
    const thanDistance = Math.abs(thanWeight - target);
    if (distance !== thanDistance) return distance < thanDistance;
    if (weight !== thanWeight) return weight > thanWeight;
    // The same weight twice: the text's own family first, then by name, so the answer never depends on order.
    if ((font.family === family) !== (than.family === family)) return font.family === family;
    return font.family < than.family;
  };

  let best: { font: FontFile; weight: number } | null = null;
  for (const font of fonts) {
    if (keepStyle && font.style !== style) continue;
    if (fontFamilyGroupKey(font.family) !== group) continue;
    const weight = typefaceWeightOf(font);
    if (weight === null || weight <= ownWeight) continue;
    if (best === null || isBetter(font, weight, best.font, best.weight)) {
      best = { font, weight };
    }
  }
  if (best === null) return null;
  return { fontFamily: best.font.family, fontWeight: best.font.weight === '700' ? 'bold' : 'normal' };
}

/**
 * `item` as it is drawn: itself, or, where it is bold and its typeface has a
 * heavier weight, the same text in that weight's family (see `resolveBoldFont`).
 * Everything that measures, draws or exports a text takes its family and its
 * weight from here. Drawing the result draws the same again.
 */
export function drawnFontOf<T extends FontOfText>(item: T, fonts: readonly FontFile[]): T {
  if (item.fontWeight !== 'bold') return item;
  const bold = resolveBoldFont(item.fontFamily, item.fontStyle, fonts);
  if (!bold || (bold.fontFamily === item.fontFamily && bold.fontWeight === item.fontWeight)) {
    return item;
  }
  return { ...item, ...bold };
}

/** Whether any of `item`'s text is bold: all of it, or a run tagged `<b>`. */
export function usesBold(item: Pick<TextCanvasItem, 'fontWeight' | 'text'>): boolean {
  if (item.fontWeight === 'bold') return true;
  if (!item.text.includes('<')) return false;
  // Asked for every text item after every edit: the answer is kept by the text.
  let tagged = taggedBold.get(item.text);
  if (tagged === undefined) {
    tagged = parseRichText(item.text).runs.some((run) => run.bold);
    if (taggedBold.size >= TAGGED_BOLD_KEPT) taggedBold.clear();
    taggedBold.set(item.text, tagged);
  }
  return tagged;
}

const TAGGED_BOLD_KEPT = 500;
const taggedBold = new Map<string, boolean>();

/** The families of `drawnFontFamiliesOf`'s bold text, kept by the list of fonts they were found in. */
const boldFamiliesByFonts = new WeakMap<readonly FontFile[], Map<string, string[]>>();

function boldFontFamiliesOf(family: string, fonts: readonly FontFile[]): string[] {
  let kept = boldFamiliesByFonts.get(fonts);
  if (!kept) {
    kept = new Map();
    boldFamiliesByFonts.set(fonts, kept);
  }
  let families = kept.get(family);
  if (!families) {
    families = (['normal', 'italic'] as const).flatMap((style) => {
      const bold = resolveBoldFont(family, style, fonts);
      return bold ? [bold.fontFamily] : [];
    });
    kept.set(family, families);
  }
  return families;
}

/**
 * The families `item` is drawn with: the one it is set in, and the heavier
 * weights its bold text is drawn in, upright or italic. `fonts` is taken to be
 * a list that is replaced, not changed, when a font joins it.
 */
export function drawnFontFamiliesOf(
  item: Pick<TextCanvasItem, 'fontFamily' | 'fontWeight' | 'text'>,
  fonts: readonly FontFile[],
): string[] {
  if (!usesBold(item)) return [item.fontFamily];
  return [...new Set([item.fontFamily, ...boldFontFamiliesOf(item.fontFamily, fonts)])];
}

/**
 * Tells which families the text items `items` may be drawn with, by name alone:
 * the families they are set in, and every heavier weight of the typeface of an
 * item with bold text. For deciding which font references a document keeps
 * where the fonts themselves are not known (`drawnFontFamiliesOf` is exact).
 */
export function fontFamilyUseOf(
  items: ReadonlyArray<Pick<TextCanvasItem, 'fontFamily' | 'fontWeight' | 'text'>>,
): (family: string) => boolean {
  const setIn = new Set(items.map((item) => item.fontFamily));
  const lightestBoldByGroup = new Map<string, number>();
  for (const item of items) {
    if (!usesBold(item)) continue;
    const group = fontFamilyGroupKey(item.fontFamily);
    const weight = splitFontFamilyVariant(item.fontFamily).weight;
    lightestBoldByGroup.set(group, Math.min(weight, lightestBoldByGroup.get(group) ?? weight));
  }
  return (family) => {
    if (setIn.has(family)) return true;
    const lightest = lightestBoldByGroup.get(fontFamilyGroupKey(family));
    return lightest !== undefined && splitFontFamilyVariant(family).weight > lightest;
  };
}
