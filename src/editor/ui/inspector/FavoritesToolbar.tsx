import { useRef } from 'react';

import type { FavoritesSortDirection, FavoritesSortField } from './favoritesSort';
import { FavoritesSortMenu } from './FavoritesSortMenu';

const CLEAR_ICON = (
  <svg viewBox="0 0 12 12">
    <path d="M3 3l6 6M9 3l-6 6" />
  </svg>
);

export interface FavoritesToolbarProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  sortField: FavoritesSortField;
  sortDirection: FavoritesSortDirection;
  onSortFieldChange: (field: FavoritesSortField) => void;
  onSortDirectionChange: (direction: FavoritesSortDirection) => void;
}

export function FavoritesToolbar({
  searchQuery,
  onSearchQueryChange,
  sortField,
  sortDirection,
  onSortFieldChange,
  onSortDirectionChange,
}: FavoritesToolbarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  function handleClear() {
    onSearchQueryChange('');
    searchInputRef.current?.focus();
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' && searchQuery.length > 0) {
      e.preventDefault();
      handleClear();
    }
  }

  return (
    <div
      className="favorites-toolbar inspector-rail-toolbar"
      role="toolbar"
      aria-label="Favorites filter and sort"
    >
      <div className="favorites-search inspector-rail-field">
        <input
          ref={searchInputRef}
          type="search"
          className="favorites-search-input inspector-rail-text-input"
          aria-label="Filter favorites by name"
          placeholder="Search favorites"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        {searchQuery.length > 0 && (
          <button
            type="button"
            className="favorites-search-clear"
            aria-label="Clear search"
            onClick={handleClear}
          >
            {CLEAR_ICON}
          </button>
        )}
      </div>

      <FavoritesSortMenu
        sortField={sortField}
        sortDirection={sortDirection}
        onSortFieldChange={onSortFieldChange}
        onSortDirectionChange={onSortDirectionChange}
      />
    </div>
  );
}
