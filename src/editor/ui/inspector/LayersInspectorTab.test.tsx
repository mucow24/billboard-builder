import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';

import { LayersInspectorTab } from './LayersInspectorTab';

describe('LayersInspectorTab', () => {
  it('renders layers in z-index order and selects or deletes rows correctly', async () => {
    const user = userEvent.setup();
    const onSelectItem = vi.fn();
    const onDeleteItem = vi.fn();
    const backItem = createRectangleItem({ zIndex: 0 });
    const frontItem = createTextItem({ zIndex: 1 });

    render(
      <LayersInspectorTab
        background="#ffffff00"
        canReorder
        items={[backItem, frontItem]}
        onBackgroundChange={vi.fn()}
        onDeleteItem={onDeleteItem}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onSelectItem={onSelectItem}
        selectedItems={[frontItem]}
      />,
    );

    const layerRows = screen.getAllByRole('button', { name: /^(Rectangle|Text)$/i });
    expect(layerRows[0]).toHaveTextContent('Text');
    expect(layerRows[1]).toHaveTextContent('Rectangle');

    await user.click(layerRows[0]);
    expect(onSelectItem).toHaveBeenCalledWith(frontItem.id);

    await user.click(screen.getByRole('button', { name: 'Delete Rectangle' }));
    expect(onDeleteItem).toHaveBeenCalledWith(backItem.id);
  });

  it('opens properties on double-click and wires layer reorder controls', async () => {
    const user = userEvent.setup();
    const onOpenProperties = vi.fn();
    const onReorder = vi.fn();
    const onSelectItem = vi.fn();
    const item = createRectangleItem();

    render(
      <LayersInspectorTab
        background="#ffffff00"
        canReorder
        items={[item]}
        onBackgroundChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onOpenProperties={onOpenProperties}
        onReorder={onReorder}
        onSelectItem={onSelectItem}
        selectedItems={[item]}
      />,
    );

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Rectangle' }));
    expect(onSelectItem).toHaveBeenCalledWith(item.id);
    expect(onOpenProperties).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Bring front' }));
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
        items={[item]}
        onBackgroundChange={onBackgroundChange}
        onDeleteItem={vi.fn()}
        onOpenProperties={vi.fn()}
        onReorder={vi.fn()}
        onSelectItem={vi.fn()}
        selectedItems={[]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Bring front' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Canvas background' }));
    await user.clear(screen.getByLabelText('Canvas background hex'));
    await user.type(
      screen.getByLabelText('Canvas background hex'),
      '#11223344{Enter}',
    );

    expect(onBackgroundChange).toHaveBeenCalledWith('#11223344');
  });
});
