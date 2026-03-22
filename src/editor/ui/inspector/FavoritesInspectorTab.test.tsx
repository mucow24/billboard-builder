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
        favorites={[
          {
            id: 'favorite-1',
            name: 'Hero favorite',
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
    const preview = screen.getByTestId('favorite-preview-favorite-1');
    expect(preview).toHaveAttribute(
      'style',
      expect.stringContaining('repeat(3, minmax(0, 1fr))'),
    );
    const swatches = preview.querySelectorAll('.favorite-card-swatch');
    expect(swatches).toHaveLength(3);
    expect(swatches[0]).toHaveStyle({ background: 'rgb(18, 52, 86)' });
    expect(swatches[1]).toHaveStyle({ background: 'rgb(171, 205, 239)' });
    expect(swatches[2]).toHaveStyle({ background: 'rgb(254, 220, 186)' });

    await user.click(screen.getByRole('button', { name: 'Insert Hero favorite' }));
    expect(onInsertFavorite).toHaveBeenCalledWith('favorite-1');

    await user.click(
      screen.getByRole('button', { name: 'Delete favorite Hero favorite' }),
    );
    expect(onDeleteFavorite).toHaveBeenCalledWith('favorite-1');
  });
});
