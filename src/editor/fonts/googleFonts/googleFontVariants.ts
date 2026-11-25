/**
 * The styles of a Google Fonts family, and what each becomes in the editor.
 *
 * Google lists a family's styles as keys: "regular", "italic", "300",
 * "300italic". The editor knows two weights per family, regular and bold, so a
 * Google family is imported the way the bundled families are laid out: its
 * regular and bold styles, with their italics, are the faces of one entry under
 * the family's own name, and every other weight is an entry of its own, named
 * after the family and the weight ("Roboto Light"), with that weight's italic as
 * its italic face. The font menu gathers those entries under the family again
 * (see `groupFontOptions`).
 *
 * Pure: no DOM, so it is testable on its own.
 */
import type { ParsedFontMetadata } from '../fontModel';

export interface GoogleFontVariant {
  /** Google's key for the style: "regular", "italic", "300", "300italic". */
  key: string;
  /** Its CSS weight, 100 to 900. */
  weight: number;
  italic: boolean;
}

const REGULAR_WEIGHT = 400;
const BOLD_WEIGHT = 700;

/** Google's own names for the weights. */
const WEIGHT_NAMES: Readonly<Record<number, string>> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
};

const VARIANT_KEY = /^(\d{1,4})?(regular|italic)?$/;

/** Reads one of Google's style keys. Null for a key that is not one. */
export function parseGoogleFontVariant(key: string): GoogleFontVariant | null {
  const match = VARIANT_KEY.exec(key);
  if (!match || key === '') {
    return null;
  }
  const [, weightText, word] = match;
  if (weightText !== undefined && word === 'regular') {
    return null;
  }
  const weight = weightText === undefined ? REGULAR_WEIGHT : Number(weightText);
  if (weight < 1 || weight > 1000) {
    return null;
  }
  return { key, weight, italic: word === 'italic' };
}

/** Lightest first, and each weight's upright style before its italic. */
export function sortGoogleFontVariants(variants: readonly GoogleFontVariant[]): GoogleFontVariant[] {
  return variants
    .slice()
    .sort((left, right) => left.weight - right.weight || Number(left.italic) - Number(right.italic));
}

function weightName(weight: number): string {
  return WEIGHT_NAMES[weight] ?? `Weight ${weight}`;
}

/** What a style is called: "Light", "Light Italic", "Regular", "Italic". */
export function describeGoogleFontVariant(variant: GoogleFontVariant): string {
  if (!variant.italic) {
    return weightName(variant.weight);
  }
  return variant.weight === REGULAR_WEIGHT ? 'Italic' : `${weightName(variant.weight)} Italic`;
}

/**
 * The font-list entry a style of `family` belongs to: the family's own for its
 * regular and bold weights, and one named after the weight for any other.
 */
export function googleFontEntryName(family: string, variant: GoogleFontVariant): string {
  return variant.weight === REGULAR_WEIGHT || variant.weight === BOLD_WEIGHT
    ? family
    : `${family} ${weightName(variant.weight)}`;
}

/**
 * How a style of `family` is registered in the editor. Its file is named as
 * Google names the family's static files ("Roboto-LightItalic.ttf"); importing
 * the same style again replaces the stored file instead of adding a second one.
 */
export function toImportedFontMetadata(
  family: string,
  variant: GoogleFontVariant,
): ParsedFontMetadata {
  const styleName = describeGoogleFontVariant(variant).replace(/\s+/g, '');
  return {
    family: googleFontEntryName(family, variant),
    sourceName: `${family.replace(/\s+/g, '')}-${styleName}.ttf`,
    weight: variant.weight === BOLD_WEIGHT ? '700' : '400',
    style: variant.italic ? 'italic' : 'normal',
  };
}
