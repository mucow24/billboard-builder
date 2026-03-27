import { useRef, useState } from 'react';

import { FavoriteRow } from './FavoriteRow';
import { useFavoriteReorder } from './useFavoriteReorder';
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
  const listRef = useRef<HTMLDivElement>(null);
  const { dragIndex, dropTargetIndex, getDragHandleProps } = useFavoriteReorder(
    listRef,
    favorites.length,
    onReorderFavorite,
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
    <div className="favorite-library-list" ref={listRef}>
      {favorites.map((favorite, index) => (
        <FavoriteRow
          key={favorite.id}
          favorite={favorite}
          isEditing={editingId === favorite.id}
          isDragging={dragIndex === index}
          dragHandleProps={getDragHandleProps(index)}
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
          className="favorite-drop-indicator"
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
  );
}

function getDropIndicatorOffset(list: HTMLElement | null, dropIndex: number): number {
  if (!list) return 0;
  const children = Array.from(list.children).filter(
    (el) => !el.classList.contains('favorite-drop-indicator'),
  ) as HTMLElement[];
  if (dropIndex >= children.length) {
    const last = children[children.length - 1];
    return last ? last.offsetTop + last.offsetHeight : 0;
  }
  return children[dropIndex]?.offsetTop ?? 0;
}
