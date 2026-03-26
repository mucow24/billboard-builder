import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  createGroupNode,
  createImageItem,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';
import { flattenLayerRows } from '../../document/sceneGraph';

import { LayersInspectorTab } from './LayersInspectorTab';

describe('LayersInspectorTab', () => {
  it('renders layers in z-index order and deletes the current selection from the utility row', async () => {
    const user = userEvent.setup();
    const onSelectNode = vi.fn();
    const onDeleteSelection = vi.fn();
    const backItem = createRectangleItem({ zIndex: 0 });
    const frontItem = createTextItem({ zIndex: 1 });

    render(
      <LayersInspectorTab
        background="#ffffff00"
        canReorder
        rows={flattenLayerRows([backItem, frontItem])}
        onBackgroundChange={vi.fn()}
        onDeleteSelection={onDeleteSelection}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onSelectNode={onSelectNode}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={vi.fn()}
        onToggleNodeHidden={vi.fn()}
        collapsedGroupIds={new Set()}
        onToggleGroupCollapse={vi.fn()}
        selectedNodeIds={[frontItem.id]}
      />,
    );

    const layerRows = screen.getAllByRole('button', { name: /^(Rectangle|Text)$/i });
    expect(layerRows[0]).toHaveTextContent('Text');
    expect(layerRows[1]).toHaveTextContent('Rectangle');

    await user.click(layerRows[0]);
    expect(onSelectNode).toHaveBeenCalledWith(frontItem.id);

    expect(screen.queryByRole('button', { name: 'Delete Rectangle' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete selected (1)' }));
    expect(onDeleteSelection).toHaveBeenCalledTimes(1);
  });

  it('opens properties on double-click and wires layer reorder controls', async () => {
    const user = userEvent.setup();
    const onOpenProperties = vi.fn();
    const onReorder = vi.fn();
    const onSelectNode = vi.fn();
    const item = createRectangleItem();

    render(
      <LayersInspectorTab
        background="#ffffff00"
        canReorder
        rows={flattenLayerRows([item])}
        onBackgroundChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onOpenProperties={onOpenProperties}
        onReorder={onReorder}
        onSelectNode={onSelectNode}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={vi.fn()}
        onToggleNodeHidden={vi.fn()}
        collapsedGroupIds={new Set()}
        onToggleGroupCollapse={vi.fn()}
        selectedNodeIds={[item.id]}
      />,
    );

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Rectangle' }));
    expect(onSelectNode).toHaveBeenCalledWith(item.id);
    expect(onOpenProperties).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Move to top' }));
    expect(onReorder).toHaveBeenCalledWith('front');
  });

  it('disables reorder controls without a selection and updates the canvas background', async () => {
    const user = userEvent.setup();
    const onBackgroundChange = vi.fn();
    const item = createRectangleItem();

    render(
      <LayersInspectorTab
        background="#ffffff00"
        canReorder={false}
        rows={flattenLayerRows([item])}
        onBackgroundChange={onBackgroundChange}
        onDeleteSelection={vi.fn()}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onSelectNode={vi.fn()}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={vi.fn()}
        onToggleNodeHidden={vi.fn()}
        collapsedGroupIds={new Set()}
        onToggleGroupCollapse={vi.fn()}
        selectedNodeIds={[]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Move to top' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete selected' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Canvas background' }));
    await user.clear(screen.getByLabelText('Canvas background hex'));
    await user.type(
      screen.getByLabelText('Canvas background hex'),
      '#11223344{Enter}',
    );

    expect(onBackgroundChange).toHaveBeenCalledWith('#11223344');
  });

  it('renders an image thumbnail preview for image rows instead of the fallback glyph', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 40,
      originalHeight: 20,
    });

    render(
      <LayersInspectorTab
        background="#ffffff00"
        canReorder
        rows={flattenLayerRows([item])}
        onBackgroundChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onSelectNode={vi.fn()}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={vi.fn()}
        onToggleNodeHidden={vi.fn()}
        collapsedGroupIds={new Set()}
        onToggleGroupCollapse={vi.fn()}
        selectedNodeIds={[]}
      />,
    );

    const preview = screen.getByTestId(`layers-preview-anchor-${item.id}`);
    const thumbnail = screen.getByTestId(`layers-thumbnail-${item.id}`);

    expect(thumbnail).toHaveAttribute('src', item.src);
    expect(preview).not.toHaveTextContent('▣');
  });

  it('toggles group disclosure inline and allows selecting child rows from layers', async () => {
    const user = userEvent.setup();
    const onSelectNode = vi.fn();
    const onToggleGroupCollapse = vi.fn();
    const child = createRectangleItem({ id: 'child-1' });
    const group = createGroupNode([child], 'Hero Group');
    group.id = 'group-1';

    const { container, rerender } = render(
      <LayersInspectorTab
        background="#ffffff00"
        canReorder
        rows={flattenLayerRows([group])}
        onBackgroundChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onSelectNode={onSelectNode}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={vi.fn()}
        onToggleNodeHidden={vi.fn()}
        collapsedGroupIds={new Set()}
        onToggleGroupCollapse={onToggleGroupCollapse}
        selectedNodeIds={[]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Hero Group' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rectangle' })).toBeInTheDocument();
    expect(container.querySelector('.layer-row-chevron-button')).toBeNull();
    expect(container.querySelector('.layer-row-type-toggle')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Collapse Hero Group' }));
    expect(onToggleGroupCollapse).toHaveBeenCalledWith(group.id);

    rerender(
      <LayersInspectorTab
        background="#ffffff00"
        canReorder
        rows={flattenLayerRows([group])}
        onBackgroundChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onSelectNode={onSelectNode}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={vi.fn()}
        onToggleNodeHidden={vi.fn()}
        collapsedGroupIds={new Set([group.id])}
        onToggleGroupCollapse={onToggleGroupCollapse}
        selectedNodeIds={[]}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Rectangle' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand Hero Group' })).toBeInTheDocument();

    rerender(
      <LayersInspectorTab
        background="#ffffff00"
        canReorder
        rows={flattenLayerRows([group])}
        onBackgroundChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onSelectNode={onSelectNode}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={vi.fn()}
        onToggleNodeHidden={vi.fn()}
        collapsedGroupIds={new Set()}
        onToggleGroupCollapse={onToggleGroupCollapse}
        selectedNodeIds={[child.id]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Rectangle' }));
    expect(onSelectNode).toHaveBeenCalledWith(child.id);
  });

  it('calls onToggleNodeLocked when clicking the lock button without selecting the row', async () => {
    const user = userEvent.setup();
    const onSelectNode = vi.fn();
    const onToggleNodeLocked = vi.fn();
    const item = createRectangleItem();

    render(
      <LayersInspectorTab
        background="#ffffff00"
        canReorder
        rows={flattenLayerRows([item])}
        onBackgroundChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onSelectNode={onSelectNode}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={onToggleNodeLocked}
        onToggleNodeHidden={vi.fn()}
        collapsedGroupIds={new Set()}
        onToggleGroupCollapse={vi.fn()}
        selectedNodeIds={[]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Lock layer' }));
    expect(onToggleNodeLocked).toHaveBeenCalledWith(item.id);
    expect(onSelectNode).not.toHaveBeenCalled();
  });

  it('calls onToggleNodeHidden when clicking the visibility button without selecting the row', async () => {
    const user = userEvent.setup();
    const onSelectNode = vi.fn();
    const onToggleNodeHidden = vi.fn();
    const item = createRectangleItem();

    render(
      <LayersInspectorTab
        background="#ffffff00"
        canReorder
        rows={flattenLayerRows([item])}
        onBackgroundChange={vi.fn()}
        onDeleteSelection={vi.fn()}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onSelectNode={onSelectNode}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={vi.fn()}
        onToggleNodeHidden={onToggleNodeHidden}
        collapsedGroupIds={new Set()}
        onToggleGroupCollapse={vi.fn()}
        selectedNodeIds={[]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Hide layer' }));
    expect(onToggleNodeHidden).toHaveBeenCalledWith(item.id);
    expect(onSelectNode).not.toHaveBeenCalled();
  });
});
