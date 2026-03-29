import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  createGroupNode,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';

import type { StoredFavorite } from '../../persistence/favoriteLibraryService';
import { FavoritesInspectorTab } from './FavoritesInspectorTab';

function makeFavorite(overrides: Partial<StoredFavorite> & { id: string; name: string }): StoredFavorite {
  return {
    nodes: [createRectangleItem({ id: `${overrides.id}-rect` })],
    fonts: [],
    createdAt: '2026-03-19T12:00:00.000Z',
    updatedAt: '2026-03-19T12:00:00.000Z',
    ...overrides,
  };
}

describe('FavoritesInspectorTab', () => {
  it('renders an empty state when no favorites have been saved', () => {
    render(
      <FavoritesInspectorTab
        onDeleteFavorite={vi.fn()}
        onInsertFavorite={vi.fn()}
        onRenameFavorite={vi.fn()}
        onRecolorFavorite={vi.fn()}
        onReorderFavorite={vi.fn()}
        favorites={[]}
      />,
    );

    expect(screen.getByText('No favorites yet')).toBeInTheDocument();
  });

  it('renders saved favorites and wires insert and delete actions', async () => {
    const user = userEvent.setup();
    const onDeleteFavorite = vi.fn();
    const onInsertFavorite = vi.fn();
    const rectangle = createRectangleItem({
      id: 'rectangle-node',
      fill: '#123456',
      stroke: '#abcdef',
      strokeWidth: 2,
    });
    const text = createTextItem({
      id: 'text-node',
      fill: '#fedcba',
    });
    const group = createGroupNode([rectangle, text], 'Reusable Group');
    group.id = 'group-node';

    render(
      <FavoritesInspectorTab
        onDeleteFavorite={onDeleteFavorite}
        onInsertFavorite={onInsertFavorite}
        onRenameFavorite={vi.fn()}
        onRecolorFavorite={vi.fn()}
        onReorderFavorite={vi.fn()}
        favorites={[
          {
            id: 'favorite-1',
            name: 'Hero favorite',
            color: '#123456',
            nodes: [group],
            fonts: [],
            createdAt: '2026-03-19T12:00:00.000Z',
            updatedAt: '2026-03-19T12:00:00.000Z',
          },
        ]}
      />,
    );

    expect(screen.getByText('Hero favorite')).toBeInTheDocument();
    expect(screen.getByText('2 items')).toBeInTheDocument();

    const swatch = screen.getByRole('button', { name: 'Swatch color for Hero favorite' });
    expect(swatch).toHaveStyle({ background: '#123456' });

    // Clicking the row body inserts the favorite
    await user.click(screen.getByText('Hero favorite'));
    expect(onInsertFavorite).toHaveBeenCalledWith('favorite-1');

    await user.click(
      screen.getByRole('button', { name: 'Delete favorite Hero favorite' }),
    );
    expect(onDeleteFavorite).toHaveBeenCalledWith('favorite-1');
  });

  it('renders a drag grip on each favorite row', () => {
    render(
      <FavoritesInspectorTab
        onDeleteFavorite={vi.fn()}
        onInsertFavorite={vi.fn()}
        onRenameFavorite={vi.fn()}
        onRecolorFavorite={vi.fn()}
        onReorderFavorite={vi.fn()}
        favorites={[
          makeFavorite({ id: 'fav-1', name: 'Alpha' }),
          makeFavorite({ id: 'fav-2', name: 'Bravo' }),
        ]}
      />,
    );

    const grips = screen.getAllByRole('button', { name: /Reorder/ });
    expect(grips).toHaveLength(2);
  });

  it('makes the grip inert during edit mode', async () => {
    const user = userEvent.setup();
    render(
      <FavoritesInspectorTab
        onDeleteFavorite={vi.fn()}
        onInsertFavorite={vi.fn()}
        onRenameFavorite={vi.fn()}
        onRecolorFavorite={vi.fn()}
        onReorderFavorite={vi.fn()}
        favorites={[makeFavorite({ id: 'fav-1', name: 'Alpha' })]}
      />,
    );

    // Enter edit mode
    await user.click(screen.getByRole('button', { name: 'Rename Alpha' }));

    const grip = screen.getByRole('button', { name: /Reorder Alpha/ });
    expect(grip).toHaveAttribute('aria-disabled', 'true');
  });

  it('fires onReorderFavorite on keyboard Alt+ArrowDown', async () => {
    const onReorderFavorite = vi.fn();
    render(
      <FavoritesInspectorTab
        onDeleteFavorite={vi.fn()}
        onInsertFavorite={vi.fn()}
        onRenameFavorite={vi.fn()}
        onRecolorFavorite={vi.fn()}
        onReorderFavorite={onReorderFavorite}
        favorites={[
          makeFavorite({ id: 'fav-1', name: 'Alpha' }),
          makeFavorite({ id: 'fav-2', name: 'Bravo' }),
        ]}
      />,
    );

    const grip = screen.getAllByRole('button', { name: /Reorder/ })[0];
    grip.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');

    expect(onReorderFavorite).toHaveBeenCalledWith(0, 1);
  });

  it('does not fire onInsertFavorite when grip is clicked', async () => {
    const user = userEvent.setup();
    const onInsertFavorite = vi.fn();
    render(
      <FavoritesInspectorTab
        onDeleteFavorite={vi.fn()}
        onInsertFavorite={onInsertFavorite}
        onRenameFavorite={vi.fn()}
        onRecolorFavorite={vi.fn()}
        onReorderFavorite={vi.fn()}
        favorites={[makeFavorite({ id: 'fav-1', name: 'Alpha' })]}
      />,
    );

    const grip = screen.getByRole('button', { name: /Reorder/ });
    await user.click(grip);

    expect(onInsertFavorite).not.toHaveBeenCalled();
  });
});
