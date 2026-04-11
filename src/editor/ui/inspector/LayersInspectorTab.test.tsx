import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  createGroupNode,
  createImageItem,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';
import type { CanvasNode } from '../../document/documentTypes';
import { flattenLayerRows } from '../../document/sceneGraph';

import { LayersInspectorTab } from './LayersInspectorTab';

const CANVAS_STUB_PROPS = {
  background: '#ffffff',
  canvas: { width: 2048, height: 2048, presetId: 'square-lg' as const },
  onBackgroundChange: vi.fn(),
  onCanvasSizeChange: vi.fn(),
} as const;

describe('LayersInspectorTab', () => {
  it('renders layers in z-index order and deletes a layer via its inline delete button', async () => {
    const user = userEvent.setup();
    const onSelectNode = vi.fn();
    const onDeleteNode = vi.fn();
    const backItem = createRectangleItem({ zIndex: 0 });
    const frontItem = createTextItem({ zIndex: 1 });

    render(
      <LayersInspectorTab
        {...CANVAS_STUB_PROPS}
        canReorder
        rows={flattenLayerRows([backItem, frontItem])}
        onDeleteNode={onDeleteNode}
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

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete layer' });
    expect(deleteButtons).toHaveLength(2);

    await user.click(deleteButtons[0]);
    expect(onDeleteNode).toHaveBeenCalledWith(frontItem.id);
    expect(onSelectNode).toHaveBeenCalledTimes(1);
  });

  it('opens properties on double-click and wires layer reorder controls', async () => {
    const user = userEvent.setup();
    const onOpenProperties = vi.fn();
    const onReorder = vi.fn();
    const onSelectNode = vi.fn();
    const item = createRectangleItem();

    render(
      <LayersInspectorTab
        {...CANVAS_STUB_PROPS}
        canReorder
        rows={flattenLayerRows([item])}
        onDeleteNode={vi.fn()}
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
    expect(screen.getByRole('group', { name: 'Layer order controls' })).toHaveClass(
      'inspector-rail-toolbar-group',
    );
    expect(screen.getByRole('button', { name: 'Move to top' })).toHaveClass(
      'inspector-rail-icon-button',
    );

    await user.click(screen.getByRole('button', { name: 'Move to top' }));
    expect(onReorder).toHaveBeenCalledWith('front');
  });

  it('disables reorder controls without a selection', () => {
    const item = createRectangleItem();

    render(
      <LayersInspectorTab
        {...CANVAS_STUB_PROPS}
        canReorder={false}
        rows={flattenLayerRows([item])}
        onDeleteNode={vi.fn()}
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
        {...CANVAS_STUB_PROPS}
        canReorder
        rows={flattenLayerRows([item])}
        onDeleteNode={vi.fn()}
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
        {...CANVAS_STUB_PROPS}
        canReorder
        rows={flattenLayerRows([group])}
        onDeleteNode={vi.fn()}
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
        {...CANVAS_STUB_PROPS}
        canReorder
        rows={flattenLayerRows([group])}
        onDeleteNode={vi.fn()}
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
        {...CANVAS_STUB_PROPS}
        canReorder
        rows={flattenLayerRows([group])}
        onDeleteNode={vi.fn()}
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
        {...CANVAS_STUB_PROPS}
        canReorder
        rows={flattenLayerRows([item])}
        onDeleteNode={vi.fn()}
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
        {...CANVAS_STUB_PROPS}
        canReorder
        rows={flattenLayerRows([item])}
        onDeleteNode={vi.fn()}
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

  it('shows a rename button only on group rows, not on item rows', () => {
    const child = createRectangleItem({ id: 'child-1' });
    const group = createGroupNode([child], 'Hero Group');
    group.id = 'group-1';
    const topLevelItem = createTextItem({ zIndex: 1 });

    render(
      <LayersInspectorTab
        {...CANVAS_STUB_PROPS}
        canReorder
        rows={flattenLayerRows([group, topLevelItem])}
        onDeleteNode={vi.fn()}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onSelectNode={vi.fn()}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={vi.fn()}
        onToggleNodeHidden={vi.fn()}
        onRenameGroup={vi.fn()}
        collapsedGroupIds={new Set()}
        onToggleGroupCollapse={vi.fn()}
        selectedNodeIds={[]}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Rename group' })).toHaveLength(1);
  });

  it('shows an input with the current group name when the rename button is clicked', async () => {
    const user = userEvent.setup();
    const child = createRectangleItem({ id: 'child-1' });
    const group = createGroupNode([child], 'Hero Group');
    group.id = 'group-1';

    render(
      <LayersInspectorTab
        {...CANVAS_STUB_PROPS}
        canReorder
        rows={flattenLayerRows([group])}
        onDeleteNode={vi.fn()}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onSelectNode={vi.fn()}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={vi.fn()}
        onToggleNodeHidden={vi.fn()}
        onRenameGroup={vi.fn()}
        collapsedGroupIds={new Set()}
        onToggleGroupCollapse={vi.fn()}
        selectedNodeIds={[]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Rename group' }));
    expect(screen.getByDisplayValue('Hero Group')).toBeInTheDocument();
  });

  it('commits the new name on Enter and calls onRenameGroup', async () => {
    const user = userEvent.setup();
    const onRenameGroup = vi.fn();
    const child = createRectangleItem({ id: 'child-1' });
    const group = createGroupNode([child], 'Hero Group');
    group.id = 'group-1';

    render(
      <LayersInspectorTab
        {...CANVAS_STUB_PROPS}
        canReorder
        rows={flattenLayerRows([group])}
        onDeleteNode={vi.fn()}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onSelectNode={vi.fn()}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={vi.fn()}
        onToggleNodeHidden={vi.fn()}
        onRenameGroup={onRenameGroup}
        collapsedGroupIds={new Set()}
        onToggleGroupCollapse={vi.fn()}
        selectedNodeIds={[]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Rename group' }));
    const input = screen.getByDisplayValue('Hero Group');
    await user.clear(input);
    await user.type(input, 'New Name{Enter}');

    expect(onRenameGroup).toHaveBeenCalledWith('group-1', 'New Name');
  });

  it('cancels rename on Escape without calling onRenameGroup', async () => {
    const user = userEvent.setup();
    const onRenameGroup = vi.fn();
    const child = createRectangleItem({ id: 'child-1' });
    const group = createGroupNode([child], 'Hero Group');
    group.id = 'group-1';

    render(
      <LayersInspectorTab
        {...CANVAS_STUB_PROPS}
        canReorder
        rows={flattenLayerRows([group])}
        onDeleteNode={vi.fn()}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onSelectNode={vi.fn()}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={vi.fn()}
        onToggleNodeHidden={vi.fn()}
        onRenameGroup={onRenameGroup}
        collapsedGroupIds={new Set()}
        onToggleGroupCollapse={vi.fn()}
        selectedNodeIds={[]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Rename group' }));
    await user.type(screen.getByDisplayValue('Hero Group'), 'Changed{Escape}');

    expect(onRenameGroup).not.toHaveBeenCalled();
    expect(screen.getByText('Hero Group')).toBeInTheDocument();
  });

  it('reverts to the previous name when the input is cleared and submitted', async () => {
    const user = userEvent.setup();
    const onRenameGroup = vi.fn();
    const child = createRectangleItem({ id: 'child-1' });
    const group = createGroupNode([child], 'Hero Group');
    group.id = 'group-1';

    render(
      <LayersInspectorTab
        {...CANVAS_STUB_PROPS}
        canReorder
        rows={flattenLayerRows([group])}
        onDeleteNode={vi.fn()}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onSelectNode={vi.fn()}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={vi.fn()}
        onToggleNodeHidden={vi.fn()}
        onRenameGroup={onRenameGroup}
        collapsedGroupIds={new Set()}
        onToggleGroupCollapse={vi.fn()}
        selectedNodeIds={[]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Rename group' }));
    const input = screen.getByDisplayValue('Hero Group');
    await user.clear(input);
    await user.type(input, '{Enter}');

    expect(onRenameGroup).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText('Hero Group')).toBeInTheDocument();
    });
  });

  it('does not select the row when the rename button is clicked', async () => {
    const user = userEvent.setup();
    const onSelectNode = vi.fn();
    const child = createRectangleItem({ id: 'child-1' });
    const group = createGroupNode([child], 'Hero Group');
    group.id = 'group-1';

    render(
      <LayersInspectorTab
        {...CANVAS_STUB_PROPS}
        canReorder
        rows={flattenLayerRows([group])}
        onDeleteNode={vi.fn()}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onSelectNode={onSelectNode}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={vi.fn()}
        onToggleNodeHidden={vi.fn()}
        onRenameGroup={vi.fn()}
        collapsedGroupIds={new Set()}
        onToggleGroupCollapse={vi.fn()}
        selectedNodeIds={[]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Rename group' }));
    expect(onSelectNode).not.toHaveBeenCalled();
  });

  it('renders a drag grip on each non-generator row', () => {
    const a = createRectangleItem({ id: 'a' });
    const b = createTextItem({ id: 'b' });

    render(
      <LayersInspectorTab
        {...CANVAS_STUB_PROPS}
        canReorder
        rows={flattenLayerRows([a, b])}
        onDeleteNode={vi.fn()}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onMoveNode={vi.fn()}
        onSelectNode={vi.fn()}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={vi.fn()}
        onToggleNodeHidden={vi.fn()}
        collapsedGroupIds={new Set()}
        onToggleGroupCollapse={vi.fn()}
        selectedNodeIds={[]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Reorder Text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reorder Rectangle' })).toBeInTheDocument();
  });

  it('renders a draggable grip on generator rows', () => {
    const rect = createRectangleItem({ id: 'rect' });
    // Create a minimal generator-like node for testing
    const gen = { ...createRectangleItem({ id: 'gen' }), kind: 'generator' as const, name: 'Scanlines' };

    render(
      <LayersInspectorTab
        {...CANVAS_STUB_PROPS}
        canReorder
        rows={flattenLayerRows([rect, gen as unknown as CanvasNode])}
        onDeleteNode={vi.fn()}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onMoveNode={vi.fn()}
        onSelectNode={vi.fn()}
        onToggleNode={vi.fn()}
        onToggleNodeLocked={vi.fn()}
        onToggleNodeHidden={vi.fn()}
        collapsedGroupIds={new Set()}
        onToggleGroupCollapse={vi.fn()}
        selectedNodeIds={[]}
      />,
    );

    const genGrip = screen.getByRole('button', { name: 'Reorder Scanlines' });
    expect(genGrip).not.toHaveAttribute('aria-disabled');
  });
});
