import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PropertiesPanel } from './PropertiesPanel';
import {
  createGroupNode,
  createRectangleItem,
  createTextItem,
} from '../document/documentDefaults';
import { flattenLayerRows } from '../document/sceneGraph';

describe('PropertiesPanel', () => {
  it('shows the missing font warning and shell tabs', async () => {
    const user = userEvent.setup();
    const item = createRectangleItem();

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[item]}
        layerRows={flattenLayerRows([item])}
        missingFontFamilies={['Ghost Sans']}
        onBackgroundChange={vi.fn()}
        onGroupOpacityChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onItemChange={vi.fn()}
        onSelectNode={vi.fn()}
        onReorder={vi.fn()}
        selectedNodeIds={[]}
      />,
    );

    expect(screen.getByText('Ghost Sans')).toBeInTheDocument();
    expect(screen.getByTestId('properties-tab-body')).toHaveClass('rail-tab-body');

    await user.click(screen.getByRole('tab', { name: /Layers/i }));
    expect(screen.getByTestId('layers-tab-body')).toHaveClass('rail-tab-body');
    expect(screen.getByRole('button', { name: 'Canvas background' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Favorites/i }));
    expect(screen.getByTestId('favorites-tab-body')).toHaveClass('rail-tab-body');
    expect(screen.getByText('No favorites yet')).toBeInTheDocument();
  });

  it('routes a layer double-click back to the properties tab', async () => {
    const user = userEvent.setup();
    const item = createTextItem({ zIndex: 1 });

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[item]}
        layerRows={flattenLayerRows([item])}
        missingFontFamilies={[]}
        selectedItem={item}
        onBackgroundChange={vi.fn()}
        onGroupOpacityChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onItemChange={vi.fn()}
        onSelectNode={vi.fn()}
        onReorder={vi.fn()}
        selectedNodeIds={[item.id]}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Layers/i }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Text' }));

    expect(screen.getByRole('tab', { name: /Properties/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('passes the properties tab through to the selection inspector', () => {
    render(
      <PropertiesPanel
        availableFonts={[
          {
            family: 'Session Sans',
            sourceName: 'SessionSans.ttf',
            weight: '400',
            style: 'normal',
            kind: 'uploaded',
          },
        ]}
        background="#ffffff00"
        fonts={[]}
        items={[]}
        layerRows={[]}
        missingFontFamilies={[]}
        onBackgroundChange={vi.fn()}
        onGroupOpacityChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onItemChange={vi.fn()}
        onSelectNode={vi.fn()}
        onReorder={vi.fn()}
        selectedNodeIds={[]}
      />,
    );

    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
    expect(screen.getByText('1 uploaded font(s) ready in this session.')).toBeInTheDocument();
  });

  it('preserves collapsed layer groups when switching tabs and re-expands ancestors of the selection', async () => {
    const user = userEvent.setup();
    const child = createRectangleItem({ id: 'child-1' });
    const group = createGroupNode([child], 'Content Group');
    group.id = 'group-1';

    const { rerender } = render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[child]}
        layerRows={flattenLayerRows([group])}
        missingFontFamilies={[]}
        onBackgroundChange={vi.fn()}
        onGroupOpacityChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onItemChange={vi.fn()}
        onSelectNode={vi.fn()}
        onReorder={vi.fn()}
        selectedNodeIds={[]}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Layers/i }));
    await user.click(screen.getByRole('button', { name: 'Collapse Content Group' }));
    expect(screen.queryByRole('button', { name: 'Rectangle' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Properties/i }));
    await user.click(screen.getByRole('tab', { name: /Layers/i }));
    expect(screen.queryByRole('button', { name: 'Rectangle' })).not.toBeInTheDocument();

    rerender(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[child]}
        layerRows={flattenLayerRows([group])}
        missingFontFamilies={[]}
        onBackgroundChange={vi.fn()}
        onGroupOpacityChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onItemChange={vi.fn()}
        onSelectNode={vi.fn()}
        onReorder={vi.fn()}
        selectedItem={child}
        selectedNodeIds={[child.id]}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Layers/i }));
    expect(screen.getByRole('button', { name: 'Rectangle' })).toBeInTheDocument();
  });

  it('preserves per-tab scroll positions on the shell-owned tab bodies', async () => {
    const user = userEvent.setup();
    const item = createTextItem({ zIndex: 1 });

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[item]}
        layerRows={flattenLayerRows([item])}
        missingFontFamilies={[]}
        selectedItem={item}
        onBackgroundChange={vi.fn()}
        onGroupOpacityChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onItemChange={vi.fn()}
        onSelectNode={vi.fn()}
        onReorder={vi.fn()}
        selectedNodeIds={[item.id]}
      />,
    );

    const propertiesBody = screen.getByTestId('properties-tab-body');
    Object.defineProperty(propertiesBody, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 140,
    });

    await user.click(screen.getByRole('tab', { name: /Layers/i }));

    const layersBody = screen.getByTestId('layers-tab-body');
    Object.defineProperty(layersBody, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 84,
    });

    await user.click(screen.getByRole('tab', { name: /Favorites/i }));

    const favoritesBody = screen.getByTestId('favorites-tab-body');
    Object.defineProperty(favoritesBody, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 32,
    });

    await user.click(screen.getByRole('tab', { name: /Properties/i }));
    expect(screen.getByTestId('properties-tab-body').scrollTop).toBe(140);

    await user.click(screen.getByRole('tab', { name: /Layers/i }));
    expect(screen.getByTestId('layers-tab-body').scrollTop).toBe(84);

    await user.click(screen.getByRole('tab', { name: /Favorites/i }));
    expect(screen.getByTestId('favorites-tab-body').scrollTop).toBe(32);
  });

  it('renders favorites as thin rows with swatch, name, count, and action buttons', async () => {
    const user = userEvent.setup();
    const rect = createRectangleItem({ fill: '#ef4444' });
    const text = createTextItem({ zIndex: 1 });
    const favorite = {
      id: 'fav-1',
      name: 'Hero banner',
      color: '#ef4444',
      nodes: [rect, text],
      fonts: [],
      createdAt: '2026-03-25T12:00:00.000Z',
      updatedAt: '2026-03-25T12:00:00.000Z',
    };

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[rect]}
        layerRows={flattenLayerRows([rect])}
        missingFontFamilies={[]}
        favorites={[favorite]}
        onBackgroundChange={vi.fn()}
        onGroupOpacityChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onItemChange={vi.fn()}
        onSelectNode={vi.fn()}
        onReorder={vi.fn()}
        selectedNodeIds={[]}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Favorites/i }));

    expect(screen.getByText('Hero banner')).toBeInTheDocument();
    expect(screen.getByText('2 items')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename Hero banner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete favorite Hero banner' })).toBeInTheDocument();
  });

  it('enters edit mode when pencil button is clicked and saves on Enter', async () => {
    const user = userEvent.setup();
    const rect = createRectangleItem();
    const onRenameFavorite = vi.fn();
    const favorite = {
      id: 'fav-1',
      name: 'Old name',
      color: '#3b82f6',
      nodes: [rect],
      fonts: [],
      createdAt: '2026-03-25T12:00:00.000Z',
      updatedAt: '2026-03-25T12:00:00.000Z',
    };

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[rect]}
        layerRows={flattenLayerRows([rect])}
        missingFontFamilies={[]}
        favorites={[favorite]}
        onBackgroundChange={vi.fn()}
        onGroupOpacityChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onItemChange={vi.fn()}
        onSelectNode={vi.fn()}
        onReorder={vi.fn()}
        onRenameFavorite={onRenameFavorite}
        selectedNodeIds={[]}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Favorites/i }));
    await user.click(screen.getByRole('button', { name: 'Rename Old name' }));

    const input = screen.getByDisplayValue('Old name');
    expect(input).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'New name{Enter}');

    expect(onRenameFavorite).toHaveBeenCalledWith('fav-1', 'New name');
  });

  it('cancels rename on Escape without calling onRenameFavorite', async () => {
    const user = userEvent.setup();
    const rect = createRectangleItem();
    const onRenameFavorite = vi.fn();
    const favorite = {
      id: 'fav-1',
      name: 'Keep this',
      color: '#22c55e',
      nodes: [rect],
      fonts: [],
      createdAt: '2026-03-25T12:00:00.000Z',
      updatedAt: '2026-03-25T12:00:00.000Z',
    };

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[rect]}
        layerRows={flattenLayerRows([rect])}
        missingFontFamilies={[]}
        favorites={[favorite]}
        onBackgroundChange={vi.fn()}
        onGroupOpacityChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onItemChange={vi.fn()}
        onSelectNode={vi.fn()}
        onReorder={vi.fn()}
        onRenameFavorite={onRenameFavorite}
        selectedNodeIds={[]}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Favorites/i }));
    await user.click(screen.getByRole('button', { name: 'Rename Keep this' }));
    await user.type(screen.getByDisplayValue('Keep this'), 'Changed{Escape}');

    expect(onRenameFavorite).not.toHaveBeenCalled();
    expect(screen.getByText('Keep this')).toBeInTheDocument();
  });

  it('reverts to the original name when the input is cleared and blurred', async () => {
    const user = userEvent.setup();
    const rect = createRectangleItem();
    const onRenameFavorite = vi.fn();
    const favorite = {
      id: 'fav-1',
      name: 'Do not lose',
      color: '#f59e0b',
      nodes: [rect],
      fonts: [],
      createdAt: '2026-03-25T12:00:00.000Z',
      updatedAt: '2026-03-25T12:00:00.000Z',
    };

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[rect]}
        layerRows={flattenLayerRows([rect])}
        missingFontFamilies={[]}
        favorites={[favorite]}
        onBackgroundChange={vi.fn()}
        onGroupOpacityChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onItemChange={vi.fn()}
        onSelectNode={vi.fn()}
        onReorder={vi.fn()}
        onRenameFavorite={onRenameFavorite}
        selectedNodeIds={[]}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Favorites/i }));
    await user.click(screen.getByRole('button', { name: 'Rename Do not lose' }));

    const input = screen.getByDisplayValue('Do not lose');
    await user.clear(input);
    await user.tab(); // blur

    expect(onRenameFavorite).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText('Do not lose')).toBeInTheDocument();
    });
  });

  it('calls onDeleteFavorite when the delete button is clicked', async () => {
    const user = userEvent.setup();
    const rect = createRectangleItem();
    const onDeleteFavorite = vi.fn();
    const onInsertFavorite = vi.fn();
    const favorite = {
      id: 'fav-1',
      name: 'Doomed',
      color: '#ef4444',
      nodes: [rect],
      fonts: [],
      createdAt: '2026-03-25T12:00:00.000Z',
      updatedAt: '2026-03-25T12:00:00.000Z',
    };

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[rect]}
        layerRows={flattenLayerRows([rect])}
        missingFontFamilies={[]}
        favorites={[favorite]}
        onBackgroundChange={vi.fn()}
        onGroupOpacityChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onItemChange={vi.fn()}
        onSelectNode={vi.fn()}
        onReorder={vi.fn()}
        onDeleteFavorite={onDeleteFavorite}
        onInsertFavorite={onInsertFavorite}
        selectedNodeIds={[]}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Favorites/i }));
    await user.click(screen.getByRole('button', { name: 'Delete favorite Doomed' }));

    expect(onDeleteFavorite).toHaveBeenCalledWith('fav-1');
    expect(onInsertFavorite).not.toHaveBeenCalled();
  });

  it('keeps the favorites tab active after favorite insertion-style rerenders', async () => {
    const user = userEvent.setup();
    const item = createTextItem({ zIndex: 1 });
    const favorite = {
      id: 'favorite-1',
      name: 'Text favorite',
      nodes: [item],
      fonts: [],
      createdAt: '2026-03-19T12:00:00.000Z',
      updatedAt: '2026-03-19T12:00:00.000Z',
    };
    const { rerender } = render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[item]}
        layerRows={flattenLayerRows([item])}
        missingFontFamilies={[]}
        selectedItem={item}
        selectedNodeIds={[item.id]}
        favorites={[favorite]}
        onBackgroundChange={vi.fn()}
        onGroupOpacityChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onItemChange={vi.fn()}
        onInsertFavorite={vi.fn()}
        onSelectNode={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Favorites/i }));
    expect(screen.getByRole('tab', { name: /Favorites/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    rerender(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[item, createRectangleItem({ id: 'new-rectangle', x: 220 })]}
        layerRows={flattenLayerRows([item])}
        missingFontFamilies={[]}
        selectedItem={item}
        selectedNodeIds={[item.id]}
        favorites={[favorite]}
        onBackgroundChange={vi.fn()}
        onGroupOpacityChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onItemChange={vi.fn()}
        onInsertFavorite={vi.fn()}
        onSelectNode={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: /Favorites/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
