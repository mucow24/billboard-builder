import { useCallback, useState } from 'react';
import { z } from 'zod';

import type { FavoritesSortDirection, FavoritesSortField } from './favoritesSort';

export const FAVORITES_PREFERENCES_STORAGE_KEY = 'billboard-builder:favorites-prefs:v1';

export interface FavoritesPreferences {
  sortField: FavoritesSortField;
  sortDirection: FavoritesSortDirection;
}

const DEFAULTS: FavoritesPreferences = {
  sortField: 'manual',
  sortDirection: 'asc',
};

const preferencesSchema = z.object({
  version: z.literal(1),
  sortField: z.enum(['manual', 'name', 'parts', 'color']),
  sortDirection: z.enum(['asc', 'desc']),
});

export function loadFavoritesPreferences(): FavoritesPreferences {
  try {
    const raw = window.localStorage.getItem(FAVORITES_PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = preferencesSchema.parse(JSON.parse(raw));
    return { sortField: parsed.sortField, sortDirection: parsed.sortDirection };
  } catch {
    window.localStorage.removeItem(FAVORITES_PREFERENCES_STORAGE_KEY);
    return { ...DEFAULTS };
  }
}

export function saveFavoritesPreferences(prefs: FavoritesPreferences): void {
  window.localStorage.setItem(
    FAVORITES_PREFERENCES_STORAGE_KEY,
    JSON.stringify({ version: 1, ...prefs }),
  );
}

export interface UseFavoritesPreferencesResult extends FavoritesPreferences {
  setSortField: (field: FavoritesSortField) => void;
  setSortDirection: (direction: FavoritesSortDirection) => void;
}

export function useFavoritesPreferences(): UseFavoritesPreferencesResult {
  const [prefs, setPrefs] = useState<FavoritesPreferences>(() => loadFavoritesPreferences());

  const setSortField = useCallback((sortField: FavoritesSortField) => {
    setPrefs((prev) => {
      const next = { ...prev, sortField };
      saveFavoritesPreferences(next);
      return next;
    });
  }, []);

  const setSortDirection = useCallback((sortDirection: FavoritesSortDirection) => {
    setPrefs((prev) => {
      const next = { ...prev, sortDirection };
      saveFavoritesPreferences(next);
      return next;
    });
  }, []);

  return {
    sortField: prefs.sortField,
    sortDirection: prefs.sortDirection,
    setSortField,
    setSortDirection,
  };
}
