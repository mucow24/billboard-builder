import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FavoritesSortMenu } from './FavoritesSortMenu';

function renderFavoritesSortMenu(
  overrides: Partial<ComponentProps<typeof FavoritesSortMenu>> = {},
) {
  const props: ComponentProps<typeof FavoritesSortMenu> = {
    onSortDirectionChange: vi.fn(),
    onSortFieldChange: vi.fn(),
    sortDirection: 'asc',
    sortField: 'manual',
    ...overrides,
  };

  render(
    <div>
      <FavoritesSortMenu {...props} />
      <button type="button">Outside</button>
    </div>,
  );

  return {
    outsideButton: screen.getByRole('button', { name: 'Outside' }),
    props,
  };
}

describe('FavoritesSortMenu', () => {
  it('renders the trigger label from the current sort selection', () => {
    const { rerender } = render(
      <FavoritesSortMenu
        onSortDirectionChange={vi.fn()}
        onSortFieldChange={vi.fn()}
        sortDirection="asc"
        sortField="manual"
      />,
    );

    expect(screen.getByRole('button', { name: 'Manual sort' })).toBeInTheDocument();

    rerender(
      <FavoritesSortMenu
        onSortDirectionChange={vi.fn()}
        onSortFieldChange={vi.fn()}
        sortDirection="desc"
        sortField="color"
      />,
    );

    expect(screen.getByRole('button', { name: 'Color (Desc)' })).toBeInTheDocument();
  });

  it('opens and closes via click, outside pointerdown, escape, and tab', async () => {
    const user = userEvent.setup();
    const { outsideButton } = renderFavoritesSortMenu();

    const trigger = screen.getByRole('button', { name: 'Manual sort' });
    await user.click(trigger);
    expect(screen.getByRole('group', { name: 'Sort favorites' })).toBeInTheDocument();

    fireEvent.pointerDown(outsideButton);
    expect(screen.queryByRole('group', { name: 'Sort favorites' })).not.toBeInTheDocument();

    await user.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Sort favorites' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });

    await user.click(trigger);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.queryByRole('group', { name: 'Sort favorites' })).not.toBeInTheDocument();
  });

  it('shows the menu rows in the expected order with a divider between field and direction sections', async () => {
    const user = userEvent.setup();
    renderFavoritesSortMenu();

    await user.click(screen.getByRole('button', { name: 'Manual sort' }));

    const panel = screen.getByRole('group', { name: 'Sort favorites' });
    expect(
      Array.from(panel.children).map((child) =>
        child.getAttribute('aria-hidden') === 'true' ? 'divider' : child.textContent?.trim(),
      ),
    ).toEqual([
      'Manual sort',
      'Name',
      'Color',
      'Parts',
      'divider',
      'Ascending',
      'Descending',
    ]);
  });

  it('highlights the selected field and selected direction rows', async () => {
    const user = userEvent.setup();
    renderFavoritesSortMenu({ sortDirection: 'desc', sortField: 'parts' });

    await user.click(screen.getByRole('button', { name: 'Parts (Desc)' }));

    const panel = screen.getByRole('group', { name: 'Sort favorites' });
    expect(within(panel).getByRole('button', { name: 'Parts' })).toHaveClass(
      'inspector-rail-menu-item',
      'selected',
    );
    expect(within(panel).getByRole('button', { name: 'Descending' })).toHaveClass(
      'inspector-rail-menu-item',
      'selected',
    );
  });

  it('updates the field and direction independently and closes after selection', async () => {
    const user = userEvent.setup();
    const onSortFieldChange = vi.fn();
    const onSortDirectionChange = vi.fn();

    renderFavoritesSortMenu({ onSortDirectionChange, onSortFieldChange });

    await user.click(screen.getByRole('button', { name: 'Manual sort' }));
    await user.click(screen.getByRole('button', { name: 'Name' }));
    expect(onSortFieldChange).toHaveBeenCalledWith('name');
    expect(onSortDirectionChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Sort favorites' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Manual sort' }));
    await user.click(screen.getByRole('button', { name: 'Descending' }));
    expect(onSortDirectionChange).toHaveBeenCalledWith('desc');
    expect(screen.queryByRole('group', { name: 'Sort favorites' })).not.toBeInTheDocument();
  });
});
