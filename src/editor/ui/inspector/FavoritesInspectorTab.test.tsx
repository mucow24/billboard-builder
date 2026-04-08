import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGroupNode,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';

import type { StoredFavorite } from '../../persistence/favoriteLibraryService';
import { FavoritesInspectorTab } from './FavoritesInspectorTab';
import { FAVORITES_PREFERENCES_STORAGE_KEY } from './useFavoritesPreferences';

function makeFavorite(overrides: Partial<StoredFavorite> & { id: string; name: string }): StoredFavorite {
  return {
    nodes: [createRectangleItem({ id: `${overrides.id}-rect` })],
    fonts: [],
    createdAt: '2026-03-19T12:00:00.000Z',
    updatedAt: '2026-03-19T12:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.removeItem(FAVORITES_PREFERENCES_STORAGE_KEY);
});

afterEach(() => {
  window.localStorage.removeItem(FAVORITES_PREFERENCES_STORAGE_KEY);
});

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

  describe('search + sort toolbar', () => {
    const threeFavorites: StoredFavorite[] = [
      makeFavorite({ id: 'f1', name: 'Charlie', color: '#ee2222' }),
      makeFavorite({ id: 'f2', name: 'Alpha', color: '#22ee22' }),
      makeFavorite({ id: 'f3', name: 'Bravo', color: '#2222ee' }),
    ];

    function renderTab(favorites: StoredFavorite[] = threeFavorites, extra: Partial<React.ComponentProps<typeof FavoritesInspectorTab>> = {}) {
      return render(
        <FavoritesInspectorTab
          onDeleteFavorite={vi.fn()}
          onInsertFavorite={vi.fn()}
          onRenameFavorite={vi.fn()}
          onRecolorFavorite={vi.fn()}
          onReorderFavorite={vi.fn()}
          favorites={favorites}
          {...extra}
        />,
      );
    }

    function getRenderedFavoriteNames(): string[] {
      return screen
        .getAllByRole('button', { name: /^Insert / })
        .map((btn) => (btn.textContent ?? '').trim().replace(/\d+ items?$/, '').trim());
    }

    it('does not render the toolbar when the favorites list is empty', () => {
      renderTab([]);
      expect(screen.queryByRole('toolbar', { name: /Favorites filter and sort/ })).toBeNull();
      expect(screen.queryByRole('searchbox')).toBeNull();
    });

    it('renders the toolbar with a search box and a sort trigger when favorites exist', () => {
      renderTab();
      expect(screen.getByRole('toolbar', { name: /Favorites filter and sort/ })).toHaveClass(
        'inspector-rail-toolbar',
      );
      expect(screen.getByRole('searchbox', { name: /Filter favorites by name/ })).toHaveClass(
        'inspector-rail-text-input',
      );
      expect(screen.getByRole('button', { name: 'Manual sort' })).toHaveClass(
        'inspector-rail-menu-trigger',
      );
    });

    it('filters rendered rows by name as the user types (case-insensitive)', async () => {
      const user = userEvent.setup();
      renderTab();
      const search = screen.getByRole('searchbox', { name: /Filter favorites by name/ });
      await user.type(search, 'AL');
      expect(getRenderedFavoriteNames()).toEqual(['Alpha']);
    });

    it('shows a clear button after typing, and clears the query when clicked', async () => {
      const user = userEvent.setup();
      renderTab();
      expect(screen.queryByRole('button', { name: /Clear search/ })).toBeNull();
      const search = screen.getByRole('searchbox', { name: /Filter favorites by name/ });
      await user.type(search, 'zz');
      const clear = screen.getByRole('button', { name: /Clear search/ });
      expect(clear).toBeInTheDocument();
      await user.click(clear);
      expect(search).toHaveValue('');
      expect(screen.queryByRole('button', { name: /Clear search/ })).toBeNull();
    });

    it('shows a "No matching favorites" message when the query has no matches', async () => {
      const user = userEvent.setup();
      renderTab();
      const search = screen.getByRole('searchbox', { name: /Filter favorites by name/ });
      await user.type(search, 'zzznomatch');
      expect(screen.getByText(/No matching favorites/i)).toBeInTheDocument();
    });

    it('defaults to Manual sort', () => {
      renderTab();
      expect(screen.getByRole('button', { name: 'Manual sort' })).toBeInTheDocument();
    });

    it('sorts favorites alphabetically when Name is selected', async () => {
      const user = userEvent.setup();
      renderTab();
      await user.click(screen.getByRole('button', { name: 'Manual sort' }));
      await user.click(screen.getByRole('button', { name: 'Name' }));
      expect(screen.getByRole('button', { name: 'Name (Asc)' })).toBeInTheDocument();
      expect(getRenderedFavoriteNames()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    });

    it('reverses name sort when direction is toggled', async () => {
      const user = userEvent.setup();
      renderTab();
      await user.click(screen.getByRole('button', { name: 'Manual sort' }));
      await user.click(screen.getByRole('button', { name: 'Name' }));
      await user.click(screen.getByRole('button', { name: 'Name (Asc)' }));
      await user.click(screen.getByRole('button', { name: 'Descending' }));
      expect(screen.getByRole('button', { name: 'Name (Desc)' })).toBeInTheDocument();
      expect(getRenderedFavoriteNames()).toEqual(['Charlie', 'Bravo', 'Alpha']);
    });

    it('persists the sort field and direction across unmount via localStorage', async () => {
      const user = userEvent.setup();
      const { unmount } = renderTab();
      await user.click(screen.getByRole('button', { name: 'Manual sort' }));
      await user.click(screen.getByRole('button', { name: 'Name' }));
      await user.click(screen.getByRole('button', { name: 'Name (Asc)' }));
      await user.click(screen.getByRole('button', { name: 'Descending' }));
      unmount();

      renderTab();
      expect(screen.getByRole('button', { name: 'Name (Desc)' })).toBeInTheDocument();
      expect(getRenderedFavoriteNames()).toEqual(['Charlie', 'Bravo', 'Alpha']);
    });

    it('disables the drag grip when a non-manual sort is active', async () => {
      const user = userEvent.setup();
      renderTab();
      await user.click(screen.getByRole('button', { name: 'Manual sort' }));
      await user.click(screen.getByRole('button', { name: 'Name' }));
      const grips = screen.getAllByRole('button', { name: /Reorder/ });
      grips.forEach((grip) => {
        expect(grip).toHaveAttribute('aria-disabled', 'true');
      });
    });

    it('disables the drag grip when a search query is active in Manual mode', async () => {
      const user = userEvent.setup();
      renderTab();
      await user.type(
        screen.getByRole('searchbox', { name: /Filter favorites by name/ }),
        'a',
      );
      const grips = screen.getAllByRole('button', { name: /Reorder/ });
      grips.forEach((grip) => {
        expect(grip).toHaveAttribute('aria-disabled', 'true');
      });
    });

    it('re-enables the drag grip when switching back to Manual mode with an empty query', async () => {
      const user = userEvent.setup();
      renderTab();
      await user.click(screen.getByRole('button', { name: 'Manual sort' }));
      await user.click(screen.getByRole('button', { name: 'Name' }));
      await user.click(screen.getByRole('button', { name: 'Name (Asc)' }));
      await user.click(screen.getByRole('button', { name: 'Manual sort' }));
      const grips = screen.getAllByRole('button', { name: /Reorder/ });
      grips.forEach((grip) => {
        expect(grip).not.toHaveAttribute('aria-disabled');
      });
    });

    it('does not fire onReorderFavorite via Alt+ArrowDown in a sorted mode', async () => {
      const user = userEvent.setup();
      const onReorderFavorite = vi.fn();
      renderTab(threeFavorites, { onReorderFavorite });
      await user.click(screen.getByRole('button', { name: 'Manual sort' }));
      await user.click(screen.getByRole('button', { name: 'Name' }));
      const firstGrip = screen.getAllByRole('button', { name: /Reorder/ })[0];
      firstGrip.focus();
      await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
      expect(onReorderFavorite).not.toHaveBeenCalled();
    });

    it('clears an in-progress edit when the edited row is filtered out by the query', async () => {
      const user = userEvent.setup();
      renderTab();
      await user.click(screen.getByRole('button', { name: /Rename Alpha/ }));
      // Row body renders an input while editing
      expect(screen.getByDisplayValue('Alpha')).toBeInTheDocument();
      // Now filter so Alpha disappears
      await user.type(
        screen.getByRole('searchbox', { name: /Filter favorites by name/ }),
        'Charlie',
      );
      expect(screen.queryByDisplayValue('Alpha')).toBeNull();
      // Clearing the query brings Alpha back, but it should NOT be in edit mode
      await user.click(screen.getByRole('button', { name: /Clear search/ }));
      expect(screen.queryByDisplayValue('Alpha')).toBeNull();
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
  });
});
