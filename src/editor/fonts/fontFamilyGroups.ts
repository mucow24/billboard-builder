/**
 * Groups the font picker's entries into families, for its menu.
 *
 * The editor knows two weights per family, regular and bold, so every other
 * weight of a typeface is an entry of its own: "Barlow", "Barlow Light",
 * "Barlow Black". The menu shows those as one "Barlow" row with a submenu of
 * weights. The grouping is by name alone: entries whose names differ only in
 * a weight word at the end belong together, and the one without a weight word
 * is the family's "Regular". Nothing about a document changes, and the flat
 * list, which the picker's arrow buttons step through, stays as it is.
 *
 * Pure: no DOM, so it is testable on its own.
 */

/** What a font is called in its family's submenu when its name has no weight word. */
export const REGULAR_VARIANT_LABEL = 'Regular';

const REGULAR_WEIGHT = 400;

/**
 * The weight words a family name can end in, with the CSS weight each stands
 * for. A two-part word may be written with or without the space ("Extra Light",
 * "ExtraLight", "Extralight"). "Bold" is not among them: bold is a face of the
 * regular entry, reached with the Bold button.
 */
const WEIGHT_WORDS: ReadonlyArray<readonly [pattern: string, weight: number]> = [
  ['hairline', 50],
  ['thin', 100],
  ['extra ?light', 200],
  ['ultra ?light', 200],
  ['light', 300],
  ['medium', 500],
  ['semi ?bold', 600],
  ['demi ?bold', 600],
  ['extra ?bold', 800],
  ['ultra ?bold', 800],
  ['black', 900],
  ['heavy', 900],
  ['extra ?black', 950],
  ['ultra ?black', 950],
];

// The name before the weight word is matched lazily, so the longest weight word
// the name ends in is the one found: "Extra Light", not "Light".
const WEIGHT_SUFFIX = new RegExp(
  `^(.*?\\S) +(${WEIGHT_WORDS.map(([pattern]) => pattern).join('|')})$`,
  'i',
);

const WEIGHT_MATCHERS = WEIGHT_WORDS.map(
  ([pattern, weight]) => [new RegExp(`^${pattern}$`, 'i'), weight] as const,
);

export interface FontFamilyVariant {
  /** The name without its weight word: "Barlow" for "Barlow Extra Light". */
  base: string;
  /** The weight word as the name writes it ("Extra Light"), or null when it has none. */
  variant: string | null;
  /** The CSS weight the weight word stands for; 400 when there is none. */
  weight: number;
}

/** Splits a picker entry's name into its family and its weight word. */
export function splitFontFamilyVariant(family: string): FontFamilyVariant {
  const match = WEIGHT_SUFFIX.exec(family.trim());
  if (!match) {
    return { base: family, variant: null, weight: REGULAR_WEIGHT };
  }
  const [, base, variant] = match;
  const weight =
    WEIGHT_MATCHERS.find(([matcher]) => matcher.test(variant))?.[1] ?? REGULAR_WEIGHT;
  return { base, variant, weight };
}

export interface FontMenuMember<T> {
  option: T;
  /** The option's position in the flat list. */
  index: number;
  /** What the submenu calls it: its weight word, or "Regular". */
  label: string;
}

export type FontMenuEntry<T> =
  | { kind: 'font'; option: T; index: number }
  | { kind: 'family'; label: string; members: Array<FontMenuMember<T>> };

/** The names of one family are matched without regard to case, as the browser matches them. */
function familyKey(base: string): string {
  return base.trim().toLowerCase();
}

/**
 * The rows of the font menu for a flat list of fonts.
 *
 * Fonts that share a family, with at least two different weights between them,
 * become one family row, placed where the first of them stood; its members are
 * in weight order, lightest first. Every other font is a row of its own, in
 * list order.
 */
export function groupFontOptions<T extends { family: string }>(
  options: readonly T[],
): Array<FontMenuEntry<T>> {
  const splits = options.map((option) => splitFontFamilyVariant(option.family));
  const indexesByFamily = new Map<string, number[]>();
  splits.forEach((split, index) => {
    const key = familyKey(split.base);
    indexesByFamily.set(key, [...(indexesByFamily.get(key) ?? []), index]);
  });

  const entries: Array<FontMenuEntry<T>> = [];
  const emittedFamilies = new Set<string>();

  options.forEach((option, index) => {
    const key = familyKey(splits[index].base);
    const indexes = indexesByFamily.get(key) ?? [index];
    const distinctVariants = new Set(
      indexes.map((memberIndex) => (splits[memberIndex].variant ?? '').toLowerCase()),
    );
    if (distinctVariants.size < 2) {
      entries.push({ kind: 'font', option, index });
      return;
    }
    if (emittedFamilies.has(key)) {
      return;
    }
    emittedFamilies.add(key);

    const regularIndex = indexes.find((memberIndex) => splits[memberIndex].variant === null);
    entries.push({
      kind: 'family',
      label: splits[regularIndex ?? indexes[0]].base,
      members: indexes
        .slice()
        .sort((left, right) => splits[left].weight - splits[right].weight || left - right)
        .map((memberIndex) => ({
          option: options[memberIndex],
          index: memberIndex,
          label: splits[memberIndex].variant ?? REGULAR_VARIANT_LABEL,
        })),
    });
  });

  return entries;
}
