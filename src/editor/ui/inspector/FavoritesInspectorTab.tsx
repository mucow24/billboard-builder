import { useEffect, useMemo, useRef, useState } from 'react';

import { FavoriteRow } from './FavoriteRow';
import { FavoritesToolbar } from './FavoritesToolbar';
import { applyFavoritesFilterAndSort } from './favoritesSort';
import { useFavoritesPreferences } from './useFavoritesPreferences';
import { useListReorder } from './useListReorder';
import type { FavoritesInspectorTabProps } from './types';

export function FavoritesInspectorTab({
  favorites,
  onDeleteFavorite,
  onInsertFavorite,
  onRenameFavorite,
  onRecolorFavorite,
  onReorderFavorite,
}: FavoritesInspectorTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { sortField, sortDirection, setSortField, setSortDirection } =
    useFavoritesPreferences();
  const listRef = useRef<HTMLDivElement>(null);

  const visibleFavorites = useMemo(
    () =>
      applyFavoritesFilterAndSort({
        favorites,
        query: searchQuery,
        sortField,
        sortDirection,
      }),
    [favorites, searchQuery, sortField, sortDirection],
  );

  const dragEnabled = sortField === 'manual' && searchQuery.trim() === '';

  // Clear stale edit state if the edited row drops out of the visible list
  // (e.g. the user filtered it away while it was in rename mode).
  useEffect(() => {
    if (editingId && !visibleFavorites.some((fav) => fav.id === editingId)) {
      setEditingId(null);
    }
  }, [editingId, visibleFavorites]);

  const { dragIndex, dropTargetIndex, getDragHandleProps } = useListReorder(
    listRef,
    dragEnabled ? visibleFavorites.length : 0,
    (fromIndex, rawGapIndex) => {
      if (!dragEnabled) return;
      // Adjust raw gap index for flat list: when dropping after the dragged item,
      // the visual position is off by one because the item hasn't been removed yet.
      const adjusted = rawGapIndex > fromIndex ? rawGapIndex - 1 : rawGapIndex;
      if (adjusted !== fromIndex) {
        onReorderFavorite(fromIndex, adjusted);
      }
    },
  );

  if (favorites.length === 0) {
    return (
      <section className="empty-panel-inner">
        <span className="eyebrow">No favorites yet</span>
        <p>Save a selection as a favorite to reuse it later from this library.</p>
      </section>
    );
  }

  return (
    <>
      <FavoritesToolbar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortFieldChange={setSortField}
        onSortDirectionChange={setSortDirection}
      />
      {visibleFavorites.length === 0 ? (
        <section
          className="empty-panel-inner favorites-empty-search"
          role="status"
          aria-live="polite"
        >
          <span className="eyebrow">No matching favorites</span>
          <p>Try a different search term or clear the filter.</p>
        </section>
      ) : (
        <div className="favorite-library-list" ref={listRef}>
          {visibleFavorites.map((favorite, index) => (
            <FavoriteRow
              key={favorite.id}
              favorite={favorite}
              isEditing={editingId === favorite.id}
              isDragging={dragIndex === index}
              dragHandleProps={dragEnabled ? getDragHandleProps(index) : undefined}
              onStartEdit={() => setEditingId(favorite.id)}
              onCommitRename={(name) => onRenameFavorite(favorite.id, name)}
              onCancelEdit={() => setEditingId(null)}
              onInsert={() => onInsertFavorite(favorite.id)}
              onDelete={() => onDeleteFavorite(favorite.id)}
              onRecolor={(color) => onRecolorFavorite(favorite.id, color)}
            />
          ))}
          {dropTargetIndex !== null && dragIndex !== null && (
            <div
              className="list-drop-indicator"
              data-drop-indicator
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                transform: `translateY(${getDropIndicatorOffset(listRef.current, dropTargetIndex)}px)`,
              }}
            />
          )}
        </div>
      )}
    </>
  );
}

function getDropIndicatorOffset(list: HTMLElement | null, dropIndex: number): number {
  if (!list) return 0;
  const children = Array.from(list.children).filter(
    (el) => !el.classList.contains('list-drop-indicator'),
  ) as HTMLElement[];
  if (dropIndex >= children.length) {
    const last = children[children.length - 1];
    return last ? last.offsetTop + last.offsetHeight : 0;
  }
  return children[dropIndex]?.offsetTop ?? 0;
}
