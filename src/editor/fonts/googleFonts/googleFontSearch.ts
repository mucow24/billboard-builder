/**
 * Finds the Google Fonts families that match what has been typed.
 *
 * Pure: no DOM, so it is testable on its own.
 */
import type { GoogleFontFamily } from './googleFontsApi';

/** Lower case, with every run of spaces as one. */
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * How well a family's name matches, lower is better; null for no match.
 * Spaces are optional: "opensans" finds "Open Sans".
 */
function rankMatch(name: string, query: string): number | null {
  const compactName = name.replace(/ /g, '');
  const compactQuery = query.replace(/ /g, '');
  if (name === query || compactName === compactQuery) {
    return 0;
  }
  if (name.startsWith(query) || compactName.startsWith(compactQuery)) {
    return 1;
  }
  if (name.split(' ').some((word) => word.startsWith(query))) {
    return 2;
  }
  if (name.includes(query) || compactName.includes(compactQuery)) {
    return 3;
  }
  return null;
}

/**
 * The families whose names match `query`, best first: the family of exactly
 * that name, then names that start with it, then names with a word that starts
 * with it, then names that contain it. Within each, `catalog` order is kept,
 * which is most used first. Nothing matches an empty query.
 */
export function searchGoogleFonts(
  catalog: readonly GoogleFontFamily[],
  query: string,
  limit: number,
): GoogleFontFamily[] {
  const normalizedQuery = normalize(query);
  if (normalizedQuery === '') {
    return [];
  }
  const matches: Array<{ family: GoogleFontFamily; rank: number; order: number }> = [];
  catalog.forEach((family, order) => {
    const rank = rankMatch(normalize(family.family), normalizedQuery);
    if (rank !== null) {
      matches.push({ family, rank, order });
    }
  });
  return matches
    .sort((left, right) => left.rank - right.rank || left.order - right.order)
    .slice(0, limit)
    .map((match) => match.family);
}
