import { useRef } from 'react';

import type { FavoritesSortDirection, FavoritesSortField } from './favoritesSort';
import { InspectorRailIconButton } from './InspectorRailIconButton';

const CLEAR_ICON = (
  <svg viewBox="0 0 12 12">
    <path d="M3 3l6 6M9 3l-6 6" />
  </svg>
);

const ARROW_UP_ICON = (
  <svg viewBox="0 0 12 12">
    <path d="M6 10V2M2.5 5.5L6 2l3.5 3.5" />
  </svg>
);

const ARROW_DOWN_ICON = (
  <svg viewBox="0 0 12 12">
    <path d="M6 2v8M2.5 6.5L6 10l3.5-3.5" />
  </svg>
);

const SORT_FIELD_LABELS: Record<FavoritesSortField, string> = {
  manual: 'Manual',
  name: 'Name',
  parts: 'Parts',
  color: 'Color',
};

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

  const directionDisabled = sortField === 'manual';
  const directionNextLabel =
    sortDirection === 'asc'
      ? `Toggle sort direction (currently ascending by ${SORT_FIELD_LABELS[sortField].toLowerCase()})`
      : `Toggle sort direction (currently descending by ${SORT_FIELD_LABELS[sortField].toLowerCase()})`;

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

  function handleDirectionClick() {
    if (directionDisabled) return;
    onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc');
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

      <div className="favorites-sort">
        <div className="favorites-sort-field inspector-rail-select-wrap">
          <select
            className="favorites-sort-select inspector-rail-select"
            aria-label="Sort favorites by"
            value={sortField}
            onChange={(e) => onSortFieldChange(e.target.value as FavoritesSortField)}
          >
            <option value="manual">Manual</option>
            <option value="name">Name</option>
            <option value="parts">Parts</option>
            <option value="color">Color</option>
          </select>
        </div>
        <InspectorRailIconButton
          className="favorites-sort-direction"
          label={directionNextLabel}
          onClick={handleDirectionClick}
          disabled={directionDisabled}
          ariaDisabled={directionDisabled}
        >
          {sortDirection === 'asc' ? ARROW_UP_ICON : ARROW_DOWN_ICON}
        </InspectorRailIconButton>
      </div>
    </div>
  );
}
