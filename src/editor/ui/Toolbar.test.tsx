import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Toolbar } from './Toolbar';
import type { InspectorTab } from './inspector/types';

vi.mock('@uiw/react-color', async () => {
  const actual =
    await vi.importActual<typeof import('@uiw/react-color')>(
      '@uiw/react-color',
    );
  return {
    ...actual,
    Wheel: ({
      onChange,
      ...props
    }: {
      onChange?: (color: { hexa: string }) => void;
    }) => (
      <button
        type="button"
        {...props}
        onClick={() => onChange?.({ hexa: '#12345678' })}
      >
        Mock wheel
      </button>
    ),
  };
});

function renderToolbar(overrides: Partial<ComponentProps<typeof Toolbar>> = {}) {
  const props: ComponentProps<typeof Toolbar> = {
    activeInspectorTab: 'properties' satisfies InspectorTab,
    background: '#ffffff00',
    canvas: { width: 2048, height: 1024, presetId: 'landscape' },
    canDelete: false,
    canGroup: false,
    canRedo: false,
    canSaveFavorite: false,
    canUndo: false,
    canUngroup: false,
    canvasFocusActive: false,
    favoriteCount: 0,
    itemCount: 0,
    onCanvasFocusToggle: vi.fn(),
    onBackgroundChange: vi.fn(),
    onCanvasSizeChange: vi.fn(),
    onDelete: vi.fn(),
    onExport: vi.fn(),
    onGroup: vi.fn(),
    onInspectorTabChange: vi.fn(),
    onLoad: vi.fn(),
    onNewProject: vi.fn(),
    onRedo: vi.fn(),
    onSave: vi.fn(),
    onSaveFavorite: vi.fn(),
    onUndo: vi.fn(),
    onUngroup: vi.fn(),
    panelCollapsed: false,
    ...overrides,
  };

  return {
    ...render(<Toolbar {...props} />),
    props,
  };
}

describe('Toolbar', () => {
  it('renders the redesigned toolbar controls and always-visible action icons', () => {
    renderToolbar();

    expect(screen.getByRole('button', { name: 'Export PNG' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Canvas' })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /^Undo/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Redo/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Delete/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Group/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Ungroup/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save as favorite' })).toBeDisabled();
  });

  it('routes canvas popover actions through the existing callbacks', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    const onSave = vi.fn();
    const onNewProject = vi.fn();

    renderToolbar({ onLoad, onNewProject, onSave });

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    await user.click(screen.getByRole('button', { name: 'Load...' }));
    expect(onLoad).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onNewProject).toHaveBeenCalledOnce();
  });

  it('publishes export-intent activity on hover and focus for the export button', async () => {
    const user = userEvent.setup();
    const onExportIntentChange = vi.fn();

    renderToolbar({ onExportIntentChange });

    const exportButton = screen.getByRole('button', { name: 'Export PNG' });

    await user.hover(exportButton);
    expect(onExportIntentChange).toHaveBeenLastCalledWith(true);

    await user.unhover(exportButton);
    expect(onExportIntentChange).toHaveBeenLastCalledWith(false);

    fireEvent.focus(exportButton);
    expect(onExportIntentChange).toHaveBeenLastCalledWith(true);

    fireEvent.blur(exportButton);
    expect(onExportIntentChange).toHaveBeenLastCalledWith(false);
  });

  it('updates preset and custom canvas dimensions through the canvas menu size submenu', async () => {
    const user = userEvent.setup();
    const onCanvasSizeChange = vi.fn();

    renderToolbar({
      canDelete: true,
      canRedo: true,
      canSaveFavorite: true,
      canUndo: true,
      onCanvasSizeChange,
    });

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    await user.hover(await screen.findByRole('button', { name: 'Size' }));
    await user.click(await screen.findByRole('button', { name: '1024 x 1024' }));

    // Canvas menu and size flyout are still open after preset click
    fireEvent.change(screen.getByLabelText('Canvas width'), {
      target: { value: '640' },
    });
    fireEvent.change(screen.getByLabelText('Canvas height'), {
      target: { value: '480' },
    });

    expect(onCanvasSizeChange).toHaveBeenCalledWith({
      width: 1024,
      height: 1024,
      presetId: 'square-sm',
    });
    expect(onCanvasSizeChange).toHaveBeenCalledWith({
      width: 640,
      height: 1024,
      presetId: undefined,
    });
    expect(onCanvasSizeChange).toHaveBeenCalledWith({
      width: 2048,
      height: 480,
      presetId: undefined,
    });
  });

  it('shows keyboard shortcuts in action button tooltips', () => {
    renderToolbar();

    expect(screen.getByRole('button', { name: /^Undo/ })).toHaveAttribute('title', 'Undo (Ctrl+Z)');
    expect(screen.getByRole('button', { name: /^Redo/ })).toHaveAttribute('title', 'Redo (Ctrl+Shift+Z)');
    expect(screen.getByRole('button', { name: /^Delete/ })).toHaveAttribute('title', 'Delete (Del)');
    expect(screen.getByRole('button', { name: /^Group/ })).toHaveAttribute('title', 'Group (Ctrl+G)');
    expect(screen.getByRole('button', { name: /^Ungroup/ })).toHaveAttribute('title', 'Ungroup (Ctrl+Shift+G)');
    expect(screen.getByRole('button', { name: 'Save as favorite' })).toHaveAttribute('title', 'Save as favorite');
  });

  it('renders the favorite status bubble beside the save action when present', () => {
    renderToolbar({ favoriteStatusMessage: 'Added to favorites' });

    expect(screen.getByRole('status')).toHaveTextContent('Added to favorites');
    expect(screen.getByRole('status')).toHaveClass('top-toolbar-status-bubble');
  });

  it('applies the fading state to the favorite status bubble', () => {
    renderToolbar({
      favoriteStatusFading: true,
      favoriteStatusMessage: 'Added to favorites',
    });

    expect(screen.getByRole('status')).toHaveClass('fading');
  });

  it('closes popovers on outside click, escape, and tab', async () => {
    const user = userEvent.setup();
    renderToolbar();

    const canvasTrigger = screen.getByRole('button', { name: 'Canvas' });

    await user.click(canvasTrigger);
    expect(screen.getByRole('button', { name: 'Load...' })).toBeVisible();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('button', { name: 'Load...' })).not.toBeInTheDocument();

    await user.click(canvasTrigger);
    expect(screen.getByRole('button', { name: 'Load...' })).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Load...' })).not.toBeInTheDocument();
    expect(canvasTrigger).toHaveFocus();

    await user.click(canvasTrigger);
    expect(screen.getByRole('button', { name: 'Load...' })).toBeVisible();

    await user.tab();
    expect(screen.queryByRole('button', { name: 'Load...' })).not.toBeInTheDocument();
  });

  it('shows a background color picker in the canvas menu and fires onBackgroundChange', async () => {
    const user = userEvent.setup();
    const onBackgroundChange = vi.fn();

    renderToolbar({ onBackgroundChange });

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    expect(screen.getByText('Color')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Canvas background' }));
    expect(screen.getByLabelText('Canvas background hex')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Load...' })).toBeVisible();

    await user.clear(screen.getByLabelText('Canvas background hex'));
    await user.type(screen.getByLabelText('Canvas background hex'), '#11223344{Enter}');
    expect(onBackgroundChange).toHaveBeenCalledWith('#11223344');
  });
});
