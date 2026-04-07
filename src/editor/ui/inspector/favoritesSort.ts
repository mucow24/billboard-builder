import { summarizeFavoriteNodes } from '../../document/favoriteLibrary';
import type { StoredFavorite } from '../../persistence/favoriteLibraryService';

export type FavoritesSortField = 'manual' | 'name' | 'parts' | 'color';
export type FavoritesSortDirection = 'asc' | 'desc';

export interface FavoritesFilterSortOptions {
  favorites: readonly StoredFavorite[];
  query: string;
  sortField: FavoritesSortField;
  sortDirection: FavoritesSortDirection;
}

const FALLBACK_SWATCH_COLOR = '#334155';

function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getFavoriteSwatchColor(favorite: StoredFavorite): string {
  return favorite.color ?? FALLBACK_SWATCH_COLOR;
}

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

function parseRgb(hex: string): { r: number; g: number; b: number } {
  const trimmed = hex.trim();
  const match = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(trimmed);
  if (!match) {
    return { r: 0, g: 0, b: 0 };
  }
  const body = match[1];
  return {
    r: Number.parseInt(body.slice(0, 2), 16),
    g: Number.parseInt(body.slice(2, 4), 16),
    b: Number.parseInt(body.slice(4, 6), 16),
  };
}

export function hexToHsl(hex: string): HslColor {
  const { r, g, b } = parseRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
      break;
    case gn:
      h = ((bn - rn) / d + 2) * 60;
      break;
    default:
      h = ((rn - gn) / d + 4) * 60;
      break;
  }
  return { h, s, l };
}

interface ColorSortKey {
  chromaBucket: number;
  lightnessBucket: number;
  hue: number;
}

export function buildColorSortKey(hex: string): ColorSortKey {
  const { h, s, l } = hexToHsl(hex);
  let chromaBucket: number;
  if (s < 0.08) chromaBucket = 0;
  else if (s < 0.35) chromaBucket = 1;
  else if (s < 0.7) chromaBucket = 2;
  else chromaBucket = 3;

  let lightnessBucket: number;
  if (l < 0.33) lightnessBucket = 0;
  else if (l < 0.66) lightnessBucket = 1;
  else lightnessBucket = 2;

  return { chromaBucket, lightnessBucket, hue: h };
}

function compareColorKeys(a: ColorSortKey, b: ColorSortKey): number {
  if (a.chromaBucket !== b.chromaBucket) return a.chromaBucket - b.chromaBucket;
  if (a.lightnessBucket !== b.lightnessBucket) return a.lightnessBucket - b.lightnessBucket;
  return a.hue - b.hue;
}

function compareFavorites(
  a: StoredFavorite,
  b: StoredFavorite,
  field: Exclude<FavoritesSortField, 'manual'>,
): number {
  switch (field) {
    case 'name':
      return a.name.localeCompare(b.name, undefined, {
        sensitivity: 'base',
        numeric: true,
      });
    case 'parts': {
      const aCount = summarizeFavoriteNodes(a.nodes).itemCount;
      const bCount = summarizeFavoriteNodes(b.nodes).itemCount;
      return aCount - bCount;
    }
    case 'color':
      return compareColorKeys(
        buildColorSortKey(getFavoriteSwatchColor(a)),
        buildColorSortKey(getFavoriteSwatchColor(b)),
      );
  }
}

export function applyFavoritesFilterAndSort({
  favorites,
  query,
  sortField,
  sortDirection,
}: FavoritesFilterSortOptions): StoredFavorite[] {
  const trimmedQuery = query.trim();
  const needle = trimmedQuery ? normalizeForSearch(trimmedQuery) : '';

  const filtered = needle
    ? favorites.filter((favorite) => normalizeForSearch(favorite.name).includes(needle))
    : favorites.slice();

  if (sortField === 'manual') {
    return filtered;
  }

  const sorted = filtered.slice().sort((a, b) => compareFavorites(a, b, sortField));
  return sortDirection === 'desc' ? sorted.reverse() : sorted;
}
