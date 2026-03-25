import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  createGroupNode,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';

import { FavoritesInspectorTab } from './FavoritesInspectorTab';

describe('FavoritesInspectorTab', () => {
  it('renders an empty state when no favorites have been saved', () => {
    render(
      <FavoritesInspectorTab
        onDeleteFavorite={vi.fn()}
        onInsertFavorite={vi.fn()}
        onRenameFavorite={vi.fn()}
        onRecolorFavorite={vi.fn()}
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
});
