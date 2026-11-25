/**
 * The sections of the font menu, and which of its rows go in each.
 *
 * The menu lists its rows (`groupFontOptions`: a font, or a family with a
 * submenu of weights) under "All fonts", and repeats some of them above it:
 * the ones the canvas uses and the ones marked as favorites. A row is the same
 * row wherever it is shown: one name, one favorite star.
 *
 * Pure: no DOM, so it is testable on its own.
 */

import type { FontMenuEntry } from './fontFamilyGroups';

export type FontMenuSectionId = 'canvas' | 'favorites' | 'all';

export interface FontMenuSection {
  id: FontMenuSectionId;
  title: string;
  /** What the section says when it has no rows. */
  emptyText: string;
  /** The rows of the section, as positions in the list of all rows. */
  entryIndexes: number[];
}

/** What a row is called: the family's name, or the font's. Favorites are kept by this name. */
export function fontMenuEntryName<T extends { family: string }>(entry: FontMenuEntry<T>): string {
  return entry.kind === 'family' ? entry.label : entry.option.family;
}

/** The fonts a row stands for: a family's weights, or the one font. */
export function fontMenuEntryFamilies<T extends { family: string }>(
  entry: FontMenuEntry<T>,
): string[] {
  return entry.kind === 'family'
    ? entry.members.map((member) => member.option.family)
    : [entry.option.family];
}

export interface FontMenuSectionSources {
  /** The fonts the text of the canvas is set in. Null when not known: the section is left out. */
  canvasFamilies: readonly string[] | null;
  /** The names of the favorite rows. Null when there are no favorites to keep: the section is left out. */
  favoriteNames: readonly string[] | null;
}

/**
 * The sections of the menu, in order. "All fonts" has every row, the ones of
 * the other sections included; the other sections keep the order of that list.
 */
export function buildFontMenuSections<T extends { family: string }>(
  entries: ReadonlyArray<FontMenuEntry<T>>,
  { canvasFamilies, favoriteNames }: FontMenuSectionSources,
): FontMenuSection[] {
  const sections: FontMenuSection[] = [];
  const indexesWhere = (matches: (entry: FontMenuEntry<T>) => boolean) =>
    entries.flatMap((entry, index) => (matches(entry) ? [index] : []));

  if (canvasFamilies) {
    const inCanvas = new Set(canvasFamilies);
    sections.push({
      id: 'canvas',
      title: 'In this canvas',
      emptyText: 'No text on the canvas yet.',
      entryIndexes: indexesWhere((entry) =>
        fontMenuEntryFamilies(entry).some((family) => inCanvas.has(family)),
      ),
    });
  }
  if (favoriteNames) {
    const favorites = new Set(favoriteNames);
    sections.push({
      id: 'favorites',
      title: 'Favorites',
      emptyText: 'Star a font to keep it here.',
      entryIndexes: indexesWhere((entry) => favorites.has(fontMenuEntryName(entry))),
    });
  }
  sections.push({
    id: 'all',
    title: 'All fonts',
    emptyText: 'No fonts.',
    entryIndexes: entries.map((_, index) => index),
  });
  return sections;
}
