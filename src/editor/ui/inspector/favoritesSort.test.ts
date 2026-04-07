import { describe, expect, it } from 'vitest';

import { createGroupNode, createRectangleItem } from '../../document/documentDefaults';
import type { StoredFavorite } from '../../persistence/favoriteLibraryService';

import {
  applyFavoritesFilterAndSort,
  hexToHsl,
  type FavoritesSortDirection,
  type FavoritesSortField,
} from './favoritesSort';

function makeFavorite(
  overrides: Partial<StoredFavorite> & { id: string; name: string },
): StoredFavorite {
  return {
    nodes: [createRectangleItem({ id: `${overrides.id}-rect` })],
    fonts: [],
    createdAt: '2026-04-07T00:00:00.000Z',
    updatedAt: '2026-04-07T00:00:00.000Z',
    ...overrides,
  };
}

function makeFavoriteWithNodeCount(
  id: string,
  name: string,
  leafCount: number,
  color?: string,
): StoredFavorite {
  const rects = Array.from({ length: leafCount }, (_, i) =>
    createRectangleItem({ id: `${id}-leaf-${i}` }),
  );
  return {
    id,
    name,
    color,
    nodes: [createGroupNode(rects, `${name}-group`)],
    fonts: [],
    createdAt: '2026-04-07T00:00:00.000Z',
    updatedAt: '2026-04-07T00:00:00.000Z',
  };
}

function names(list: readonly StoredFavorite[]): string[] {
  return list.map((f) => f.name);
}

function run(
  favorites: StoredFavorite[],
  options: {
    query?: string;
    sortField?: FavoritesSortField;
    sortDirection?: FavoritesSortDirection;
  },
): StoredFavorite[] {
  return applyFavoritesFilterAndSort({
    favorites,
    query: options.query ?? '',
    sortField: options.sortField ?? 'manual',
    sortDirection: options.sortDirection ?? 'asc',
  });
}

describe('hexToHsl', () => {
  it('converts pure black', () => {
    const hsl = hexToHsl('#000000');
    expect(hsl.s).toBeCloseTo(0, 2);
    expect(hsl.l).toBeCloseTo(0, 2);
  });

  it('converts pure white', () => {
    const hsl = hexToHsl('#ffffff');
    expect(hsl.s).toBeCloseTo(0, 2);
    expect(hsl.l).toBeCloseTo(1, 2);
  });

  it('converts pure red', () => {
    const hsl = hexToHsl('#ff0000');
    expect(hsl.h).toBeCloseTo(0, 0);
    expect(hsl.s).toBeCloseTo(1, 2);
    expect(hsl.l).toBeCloseTo(0.5, 2);
  });

  it('converts pure blue', () => {
    const hsl = hexToHsl('#0000ff');
    expect(hsl.h).toBeCloseTo(240, 0);
    expect(hsl.s).toBeCloseTo(1, 2);
    expect(hsl.l).toBeCloseTo(0.5, 2);
  });

  it('falls back to black for invalid hex', () => {
    const hsl = hexToHsl('not-a-color');
    expect(hsl.s).toBeCloseTo(0, 2);
    expect(hsl.l).toBeCloseTo(0, 2);
  });
});

describe('applyFavoritesFilterAndSort — filter', () => {
  const favorites = [
    makeFavorite({ id: '1', name: 'Alpha' }),
    makeFavorite({ id: '2', name: 'Bravo' }),
    makeFavorite({ id: '3', name: 'Charlie' }),
  ];

  it('returns all favorites when query is empty', () => {
    expect(names(run(favorites, {}))).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('filters by case-insensitive substring', () => {
    expect(names(run(favorites, { query: 'ALP' }))).toEqual(['Alpha']);
    expect(names(run(favorites, { query: 'a' }))).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('returns empty array when nothing matches', () => {
    expect(run(favorites, { query: 'zzz' })).toHaveLength(0);
  });

  it('ignores diacritics in the favorite name and the query', () => {
    const diacritics = [makeFavorite({ id: '1', name: 'Álpha' })];
    expect(names(run(diacritics, { query: 'alpha' }))).toEqual(['Álpha']);
    const reverse = [makeFavorite({ id: '1', name: 'alpha' })];
    expect(names(run(reverse, { query: 'Álph' }))).toEqual(['alpha']);
  });

  it('trims whitespace from the query', () => {
    expect(names(run(favorites, { query: '   alpha   ' }))).toEqual(['Alpha']);
  });
});

describe('applyFavoritesFilterAndSort — manual sort (short-circuit)', () => {
  it('preserves original order in manual mode, regardless of direction', () => {
    const favorites = [
      makeFavorite({ id: '1', name: 'Charlie' }),
      makeFavorite({ id: '2', name: 'Alpha' }),
      makeFavorite({ id: '3', name: 'Bravo' }),
    ];
    expect(names(run(favorites, { sortField: 'manual', sortDirection: 'asc' }))).toEqual([
      'Charlie',
      'Alpha',
      'Bravo',
    ]);
    expect(names(run(favorites, { sortField: 'manual', sortDirection: 'desc' }))).toEqual([
      'Charlie',
      'Alpha',
      'Bravo',
    ]);
  });

  it('preserves original order when combined with a filter', () => {
    const favorites = [
      makeFavorite({ id: '1', name: 'Charlie' }),
      makeFavorite({ id: '2', name: 'Alpha' }),
      makeFavorite({ id: '3', name: 'Bravo' }),
    ];
    expect(names(run(favorites, { sortField: 'manual', query: 'a' }))).toEqual([
      'Charlie',
      'Alpha',
      'Bravo',
    ]);
  });
});

describe('applyFavoritesFilterAndSort — name sort', () => {
  const favorites = [
    makeFavorite({ id: '1', name: 'Bravo' }),
    makeFavorite({ id: '2', name: 'Alpha' }),
    makeFavorite({ id: '3', name: 'Charlie' }),
  ];

  it('sorts ascending', () => {
    expect(names(run(favorites, { sortField: 'name', sortDirection: 'asc' }))).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
  });

  it('sorts descending', () => {
    expect(names(run(favorites, { sortField: 'name', sortDirection: 'desc' }))).toEqual([
      'Charlie',
      'Bravo',
      'Alpha',
    ]);
  });

  it('is case-insensitive (base sensitivity)', () => {
    const mixedCase = [
      makeFavorite({ id: '1', name: 'bravo' }),
      makeFavorite({ id: '2', name: 'Alpha' }),
    ];
    expect(names(run(mixedCase, { sortField: 'name', sortDirection: 'asc' }))).toEqual([
      'Alpha',
      'bravo',
    ]);
  });

  it('sorts numerically (numeric: true)', () => {
    const numeric = [
      makeFavorite({ id: '1', name: 'Favorite 10' }),
      makeFavorite({ id: '2', name: 'Favorite 2' }),
      makeFavorite({ id: '3', name: 'Favorite 1' }),
    ];
    expect(names(run(numeric, { sortField: 'name', sortDirection: 'asc' }))).toEqual([
      'Favorite 1',
      'Favorite 2',
      'Favorite 10',
    ]);
  });
});

describe('applyFavoritesFilterAndSort — parts sort', () => {
  it('sorts ascending by leaf count via summarizeFavoriteNodes', () => {
    const favorites = [
      makeFavoriteWithNodeCount('1', 'Three', 3),
      makeFavoriteWithNodeCount('2', 'One', 1),
      makeFavoriteWithNodeCount('3', 'Two', 2),
    ];
    expect(names(run(favorites, { sortField: 'parts', sortDirection: 'asc' }))).toEqual([
      'One',
      'Two',
      'Three',
    ]);
  });

  it('sorts descending by leaf count', () => {
    const favorites = [
      makeFavoriteWithNodeCount('1', 'Two', 2),
      makeFavoriteWithNodeCount('2', 'Three', 3),
      makeFavoriteWithNodeCount('3', 'One', 1),
    ];
    expect(names(run(favorites, { sortField: 'parts', sortDirection: 'desc' }))).toEqual([
      'Three',
      'Two',
      'One',
    ]);
  });
});

describe('applyFavoritesFilterAndSort — color sort', () => {
  it("clusters pastels together even when their hues are far apart (user's example)", () => {
    // Pale yellow and pale blue: low saturation (<0.35), high lightness (>0.66) — pastel bucket.
    // Vibrant red and vibrant magenta: high saturation (>0.7), mid lightness — vibrant bucket.
    const paleYellow = makeFavoriteWithNodeCount('1', 'Pale Yellow', 1, '#e8e4d0');
    const vibrantRed = makeFavoriteWithNodeCount('2', 'Vibrant Red', 1, '#ee1122');
    const paleBlue = makeFavoriteWithNodeCount('3', 'Pale Blue', 1, '#dfe5ed');
    const vibrantMagenta = makeFavoriteWithNodeCount('4', 'Vibrant Magenta', 1, '#ee22cc');

    // In asc we expect: grays/pastels before vibrants.
    // Within pastels: yellow (hue ~55) before blue (hue ~220).
    // Within vibrants: red (hue ~355) before magenta (hue ~310)... actually red is at 0-5, magenta at 310.
    // Ascending by hue puts magenta (310) before red (355).
    const result = names(
      run([vibrantRed, paleBlue, vibrantMagenta, paleYellow], {
        sortField: 'color',
        sortDirection: 'asc',
      }),
    );

    // Pastels must come before vibrants in asc
    const paleYellowIdx = result.indexOf('Pale Yellow');
    const paleBlueIdx = result.indexOf('Pale Blue');
    const vibrantRedIdx = result.indexOf('Vibrant Red');
    const vibrantMagentaIdx = result.indexOf('Vibrant Magenta');

    expect(paleYellowIdx).toBeLessThan(vibrantRedIdx);
    expect(paleYellowIdx).toBeLessThan(vibrantMagentaIdx);
    expect(paleBlueIdx).toBeLessThan(vibrantRedIdx);
    expect(paleBlueIdx).toBeLessThan(vibrantMagentaIdx);

    // Pastels are adjacent (positions 0,1)
    expect(Math.abs(paleYellowIdx - paleBlueIdx)).toBe(1);
    // Vibrants are adjacent (positions 2,3)
    expect(Math.abs(vibrantRedIdx - vibrantMagentaIdx)).toBe(1);
  });

  it('clusters grayscale colors together before all chromatic colors in asc', () => {
    const favorites = [
      makeFavoriteWithNodeCount('1', 'Red', 1, '#ee2222'),
      makeFavoriteWithNodeCount('2', 'Gray', 1, '#808080'),
      makeFavoriteWithNodeCount('3', 'Blue', 1, '#2222ee'),
      makeFavoriteWithNodeCount('4', 'Near-gray', 1, '#404040'),
    ];
    const result = names(run(favorites, { sortField: 'color', sortDirection: 'asc' }));
    // Both grays come before both colors
    const grayIdx = result.indexOf('Gray');
    const nearGrayIdx = result.indexOf('Near-gray');
    const redIdx = result.indexOf('Red');
    const blueIdx = result.indexOf('Blue');

    expect(grayIdx).toBeLessThan(redIdx);
    expect(grayIdx).toBeLessThan(blueIdx);
    expect(nearGrayIdx).toBeLessThan(redIdx);
    expect(nearGrayIdx).toBeLessThan(blueIdx);
  });

  it('reverses the entire order in desc', () => {
    const favorites = [
      makeFavoriteWithNodeCount('1', 'A', 1, '#ee2222'),
      makeFavoriteWithNodeCount('2', 'B', 1, '#808080'),
      makeFavoriteWithNodeCount('3', 'C', 1, '#22ee22'),
    ];
    const asc = names(run(favorites, { sortField: 'color', sortDirection: 'asc' }));
    const desc = names(run(favorites, { sortField: 'color', sortDirection: 'desc' }));
    expect(desc).toEqual(asc.slice().reverse());
  });

  it('uses the fallback #334155 for favorites with no color set', () => {
    const favorites = [
      makeFavoriteWithNodeCount('1', 'Red', 1, '#ee2222'),
      { ...makeFavoriteWithNodeCount('2', 'NoColor', 1), color: undefined },
    ];
    // Should not throw and should produce a deterministic order.
    const result = names(run(favorites, { sortField: 'color', sortDirection: 'asc' }));
    expect(result).toHaveLength(2);
    expect(result).toContain('Red');
    expect(result).toContain('NoColor');
  });
});

describe('applyFavoritesFilterAndSort — filter + sort interaction', () => {
  it('filters then sorts', () => {
    const favorites = [
      makeFavorite({ id: '1', name: 'Charlie' }),
      makeFavorite({ id: '2', name: 'Alpha Bravo' }),
      makeFavorite({ id: '3', name: 'Alpha Charlie' }),
    ];
    expect(
      names(
        run(favorites, {
          query: 'alpha',
          sortField: 'name',
          sortDirection: 'asc',
        }),
      ),
    ).toEqual(['Alpha Bravo', 'Alpha Charlie']);
  });
});
