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

const baseProps = {
  availableFonts: [] as [],
  background: '#ffffff00',
  fonts: [] as [],
  missingFontFamilies: [] as string[],
  onBackgroundChange: vi.fn(),
  onGroupOpacityChange: vi.fn(),
  onDeleteNode: vi.fn(),
  onItemChange: vi.fn(),
  onSelectNode: vi.fn(),
  onReorder: vi.fn(),
  onToggleNode: vi.fn(),
  onToggleNodeLocked: vi.fn(),
  onToggleNodeHidden: vi.fn(),
  selectedNodeIds: [] as string[],
};

describe('PropertiesPanel', () => {
  it('shows the missing font warning on the properties tab', () => {
    const item = createRectangleItem();

    render(
      <PropertiesPanel
        {...baseProps}
        activeTab="properties"
        layerRows={flattenLayerRows([item])}
        missingFontFamilies={['Ghost Sans']}
      />,
    );

    expect(screen.getByText('Ghost Sans')).toBeInTheDocument();
    expect(screen.getByTestId('properties-tab-body')).toHaveClass('rail-tab-body');
  });

  it('renders the layers tab body when activeTab is layers', () => {
    const item = createRectangleItem();

    render(
      <PropertiesPanel
        {...baseProps}
        activeTab="layers"
        layerRows={flattenLayerRows([item])}
      />,
    );

    expect(screen.getByTestId('layers-tab-body')).toHaveClass('rail-tab-body');
    expect(screen.getByRole('button', { name: 'Canvas background' })).toBeInTheDocument();
  });

  it('renders the favorites tab body when activeTab is favorites', () => {
    render(
      <PropertiesPanel
        {...baseProps}
        activeTab="favorites"
        layerRows={[]}
      />,
    );

    expect(screen.getByTestId('favorites-tab-body')).toHaveClass('rail-tab-body');
    expect(screen.getByText('No favorites yet')).toBeInTheDocument();
  });

  it('calls onOpenProperties when a layer is double-clicked', () => {
    const item = createTextItem({ zIndex: 1 });
    const onOpenProperties = vi.fn();

    render(
      <PropertiesPanel
        {...baseProps}
        activeTab="layers"
        layerRows={flattenLayerRows([item])}
        selectedItem={item}
        selectedNodeIds={[item.id]}
        onOpenProperties={onOpenProperties}
      />,
    );

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Text' }));
    expect(onOpenProperties).toHaveBeenCalled();
  });

  it('passes the properties tab through to the selection inspector', () => {
    render(
      <PropertiesPanel
        {...baseProps}
        activeTab="properties"
        availableFonts={[
          {
            family: 'Session Sans',
            sourceName: 'SessionSans.ttf',
            weight: '400',
            style: 'normal',
            kind: 'uploaded',
          },
        ]}
        layerRows={[]}
      />,
    );

    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
    expect(screen.getByText('1 uploaded font(s) ready in this session.')).toBeInTheDocument();
  });

  it('preserves collapsed layer groups when switching tabs and re-expands ancestors of the selection', () => {
    const child = createRectangleItem({ id: 'child-1' });
    const group = createGroupNode([child], 'Content Group');
    group.id = 'group-1';

    const { rerender } = render(
      <PropertiesPanel
        {...baseProps}
        activeTab="layers"
        layerRows={flattenLayerRows([group])}
      />,
    );

    // Collapse the group
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Content Group' }));
    expect(screen.queryByRole('button', { name: 'Rectangle' })).not.toBeInTheDocument();

    // Switch away and back — group should stay collapsed
    rerender(
      <PropertiesPanel
        {...baseProps}
        activeTab="properties"
        layerRows={flattenLayerRows([group])}
      />,
    );
    rerender(
      <PropertiesPanel
        {...baseProps}
        activeTab="layers"
        layerRows={flattenLayerRows([group])}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Rectangle' })).not.toBeInTheDocument();

    // Select the child — ancestor group should auto-expand
    rerender(
      <PropertiesPanel
        {...baseProps}
        activeTab="layers"
        layerRows={flattenLayerRows([group])}
        selectedItem={child}
        selectedNodeIds={[child.id]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Rectangle' })).toBeInTheDocument();
  });

  it('preserves per-tab scroll positions across tab switches', () => {
    const item = createTextItem({ zIndex: 1 });

    const { rerender } = render(
      <PropertiesPanel
        {...baseProps}
        activeTab="properties"

        layerRows={flattenLayerRows([item])}
        selectedItem={item}
        selectedNodeIds={[item.id]}
      />,
    );

    const propertiesBody = screen.getByTestId('properties-tab-body');
    Object.defineProperty(propertiesBody, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 140,
    });

    // Switch to layers
    rerender(
      <PropertiesPanel
        {...baseProps}
        activeTab="layers"

        layerRows={flattenLayerRows([item])}
        selectedItem={item}
        selectedNodeIds={[item.id]}
      />,
    );

    const layersBody = screen.getByTestId('layers-tab-body');
    Object.defineProperty(layersBody, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 84,
    });

    // Switch to favorites
    rerender(
      <PropertiesPanel
        {...baseProps}
        activeTab="favorites"

        layerRows={flattenLayerRows([item])}
        selectedItem={item}
        selectedNodeIds={[item.id]}
      />,
    );

    // Switch back to properties — scroll should be restored
    rerender(
      <PropertiesPanel
        {...baseProps}
        activeTab="properties"

        layerRows={flattenLayerRows([item])}
        selectedItem={item}
        selectedNodeIds={[item.id]}
      />,
    );
    expect(screen.getByTestId('properties-tab-body').scrollTop).toBe(140);

    // Switch back to layers
    rerender(
      <PropertiesPanel
        {...baseProps}
        activeTab="layers"

        layerRows={flattenLayerRows([item])}
        selectedItem={item}
        selectedNodeIds={[item.id]}
      />,
    );
    expect(screen.getByTestId('layers-tab-body').scrollTop).toBe(84);
  });

  it('renders favorites as thin rows with swatch, name, count, and action buttons', () => {
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
        {...baseProps}
        activeTab="favorites"

        layerRows={flattenLayerRows([rect])}
        favorites={[favorite]}
      />,
    );

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
        {...baseProps}
        activeTab="favorites"

        layerRows={flattenLayerRows([rect])}
        favorites={[favorite]}
        onRenameFavorite={onRenameFavorite}
      />,
    );

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
        {...baseProps}
        activeTab="favorites"

        layerRows={flattenLayerRows([rect])}
        favorites={[favorite]}
        onRenameFavorite={onRenameFavorite}
      />,
    );

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
        {...baseProps}
        activeTab="favorites"

        layerRows={flattenLayerRows([rect])}
        favorites={[favorite]}
        onRenameFavorite={onRenameFavorite}
      />,
    );

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
        {...baseProps}
        activeTab="favorites"

        layerRows={flattenLayerRows([rect])}
        favorites={[favorite]}
        onDeleteFavorite={onDeleteFavorite}
        onInsertFavorite={onInsertFavorite}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete favorite Doomed' }));

    expect(onDeleteFavorite).toHaveBeenCalledWith('fav-1');
    expect(onInsertFavorite).not.toHaveBeenCalled();
  });
});
