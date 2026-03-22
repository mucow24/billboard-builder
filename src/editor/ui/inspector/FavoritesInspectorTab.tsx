import { collectLeafItems } from '../../document/sceneGraph';
import { summarizeFavoriteNodes } from '../../document/favoriteLibrary';

import type { FavoritesInspectorTabProps } from './types';

function buildKindSummary(favoriteLeafKinds: string[]) {
  const kindCounts = new Map<string, number>();

  for (const kind of favoriteLeafKinds) {
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }

  return Array.from(kindCounts.entries())
    .map(([kind, count]) => `${count} ${kind}`)
    .join(' · ');
}

export function FavoritesInspectorTab({
  favorites,
  onDeleteFavorite,
  onInsertFavorite,
}: FavoritesInspectorTabProps) {
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
      {favorites.map((favorite) => {
        const leafItems = favorite.nodes.flatMap(collectLeafItems);
        const { previewColors } = summarizeFavoriteNodes(favorite.nodes);
        const itemCount = leafItems.length;
        const kindSummary = buildKindSummary(leafItems.map((item) => item.kind));

        return (
          <article key={favorite.id} className="favorite-card">
            <button
              type="button"
              className="favorite-card-button"
              onClick={() => onInsertFavorite(favorite.id)}
              aria-label={`Insert ${favorite.name}`}
            >
              <span className="favorite-card-preview" aria-hidden="true">
                <span
                  className="favorite-card-swatch-strip"
                  data-testid={`favorite-preview-${favorite.id}`}
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(previewColors.length, 1)}, minmax(0, 1fr))`,
                  }}
                >
                  {(previewColors.length > 0 ? previewColors : ['#334155']).map((color, index) => (
                    <span
                      key={`${favorite.id}-${index}`}
                      className="favorite-card-swatch"
                      style={{ background: color }}
                    />
                  ))}
                </span>
              </span>
              <span className="favorite-card-copy">
                <strong>{favorite.name}</strong>
                <small>
                  {itemCount} item{itemCount === 1 ? '' : 's'}
                </small>
                <small>{kindSummary}</small>
              </span>
            </button>
            <button
              type="button"
              className="favorite-card-delete"
              aria-label={`Delete favorite ${favorite.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onDeleteFavorite(favorite.id);
              }}
            >
              ×
            </button>
          </article>
        );
      })}
    </div>
  );
}
