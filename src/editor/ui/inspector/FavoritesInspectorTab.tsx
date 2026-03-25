import { useRef, useState } from 'react';

import { collectLeafItems } from '../../document/sceneGraph';
import { summarizeFavoriteNodes } from '../../document/favoriteLibrary';
import type { StoredFavorite } from '../../persistence/favoriteLibraryService';

import type { FavoritesInspectorTabProps } from './types';

const PENCIL_ICON = (
  <svg viewBox="0 0 12 12">
    <path d="M7.5 2.5l2 2M2.5 7.5l5-5 2 2-5 5H2.5V7.5z" />
  </svg>
);

const DELETE_ICON = (
  <svg viewBox="0 0 12 12">
    <path d="M3 3l6 6M9 3l-6 6" />
  </svg>
);

function FavoriteRow({
  favorite,
  isEditing,
  onStartEdit,
  onCommitRename,
  onCancelEdit,
  onInsert,
  onDelete,
  onRecolor,
}: {
  favorite: StoredFavorite;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommitRename: (name: string) => void;
  onCancelEdit: () => void;
  onInsert: () => void;
  onDelete: () => void;
  onRecolor: (color: string) => void;
}) {
  const [editName, setEditName] = useState(favorite.name);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const blurRafRef = useRef<number | null>(null);

  const leafItems = favorite.nodes.flatMap(collectLeafItems);
  const { previewColors } = summarizeFavoriteNodes(favorite.nodes);
  const itemCount = leafItems.length;
  const swatchColor = favorite.color ?? previewColors[0] ?? '#334155';

  function commitRename() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== favorite.name) {
      onCommitRename(trimmed);
    }
    onCancelEdit();
  }

  function handlePencilClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isEditing) {
      if (blurRafRef.current !== null) {
        cancelAnimationFrame(blurRafRef.current);
        blurRafRef.current = null;
      }
      commitRename();
    } else {
      setEditName(favorite.name);
      onStartEdit();
    }
  }

  function handleBlur() {
    blurRafRef.current = requestAnimationFrame(() => {
      blurRafRef.current = null;
      commitRename();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditName(favorite.name);
      onCancelEdit();
    }
  }

  return (
    <div className="favorite-row">
      <button
        type="button"
        className={`favorite-swatch${isEditing ? ' favorite-swatch-editing' : ''}`}
        style={{ background: swatchColor }}
        aria-label={`Swatch color for ${favorite.name}`}
        onClick={(e) => {
          e.stopPropagation();
          if (isEditing) {
            colorInputRef.current?.click();
          } else {
            onInsert();
          }
        }}
      >
        <input
          ref={colorInputRef}
          type="color"
          className="favorite-color-input-hidden"
          value={swatchColor}
          tabIndex={-1}
          onChange={(e) => onRecolor(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      </button>

      <button
        type="button"
        className="favorite-row-body"
        aria-label={`Insert ${favorite.name}`}
        onClick={(e) => {
          if (!isEditing) {
            onInsert();
          }
          e.stopPropagation();
        }}
      >
        {isEditing ? (
          <input
            className="favorite-name-input"
            value={editName}
            autoFocus
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <strong className="favorite-row-name">{favorite.name}</strong>
            <small className="favorite-row-count">
              {itemCount} item{itemCount === 1 ? '' : 's'}
            </small>
          </>
        )}
      </button>

      <div className="favorite-row-actions">
        <button
          type="button"
          className={`toolbar-button favorite-edit-btn${isEditing ? ' active' : ''}`}
          aria-label={`Rename ${favorite.name}`}
          onClick={handlePencilClick}
        >
          {PENCIL_ICON}
        </button>
        <button
          type="button"
          className="delete-button favorite-delete-btn"
          aria-label={`Delete favorite ${favorite.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          {DELETE_ICON}
        </button>
      </div>
    </div>
  );
}

export function FavoritesInspectorTab({
  favorites,
  onDeleteFavorite,
  onInsertFavorite,
  onRenameFavorite,
  onRecolorFavorite,
}: FavoritesInspectorTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (favorites.length === 0) {
    return (
      <section className="empty-panel-inner">
        <span className="eyebrow">No favorites yet</span>
        <p>Save a selection as a favorite to reuse it later from this library.</p>
      </section>
    );
  }

  return (
    <div className="favorite-library-list">
      {favorites.map((favorite) => (
        <FavoriteRow
          key={favorite.id}
          favorite={favorite}
          isEditing={editingId === favorite.id}
          onStartEdit={() => setEditingId(favorite.id)}
          onCommitRename={(name) => onRenameFavorite(favorite.id, name)}
          onCancelEdit={() => setEditingId(null)}
          onInsert={() => onInsertFavorite(favorite.id)}
          onDelete={() => onDeleteFavorite(favorite.id)}
          onRecolor={(color) => onRecolorFavorite(favorite.id, color)}
        />
      ))}
    </div>
  );
}
