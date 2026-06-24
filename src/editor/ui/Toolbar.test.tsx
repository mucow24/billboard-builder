import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Toolbar } from './Toolbar';
import type { InspectorTab } from './inspector/types';

function renderToolbar(overrides: Partial<ComponentProps<typeof Toolbar>> = {}) {
  const props: ComponentProps<typeof Toolbar> = {
    activeInspectorTab: 'properties' satisfies InspectorTab,
    canDelete: false,
    canGroup: false,
    canRedo: false,
    canSaveFavorite: false,
    canUndo: false,
    canUngroup: false,
    canvasFocusActive: false,
    canvasName: 'Untitled canvas',
    onCanvasNameChange: vi.fn(),
    favoriteCount: 0,
    itemCount: 0,
    onCanvasFocusToggle: vi.fn(),
    onDelete: vi.fn(),
    onExport: vi.fn(),
    onExportSvg: vi.fn(),
    onExportToClipboard: vi.fn(),
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

    expect(screen.getByRole('button', { name: /^Export/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'File' })).toBeInTheDocument();

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

    await user.click(screen.getByRole('button', { name: 'File' }));
    await user.click(screen.getByRole('button', { name: 'Load...' }));
    expect(onLoad).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'File' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'File' }));
    await user.click(screen.getByRole('button', { name: 'New' }));
    expect(onNewProject).toHaveBeenCalledOnce();
  });

  it('publishes export-intent activity on hover and focus for the export trigger', async () => {
    const user = userEvent.setup();
    const onExportIntentChange = vi.fn();

    renderToolbar({ onExportIntentChange });

    const exportButton = screen.getByRole('button', { name: /^Export/ });

    await user.hover(exportButton);
    expect(onExportIntentChange).toHaveBeenLastCalledWith(true);

    await user.unhover(exportButton);
    expect(onExportIntentChange).toHaveBeenLastCalledWith(false);

    fireEvent.focus(exportButton);
    expect(onExportIntentChange).toHaveBeenLastCalledWith(true);

    fireEvent.blur(exportButton);
    expect(onExportIntentChange).toHaveBeenLastCalledWith(false);
  });

  it('does not leave the export-intent cue lit after a click toggles the menu shut', async () => {
    const user = userEvent.setup();
    const onExportIntentChange = vi.fn();

    renderToolbar({ onExportIntentChange });

    const exportButton = screen.getByRole('button', { name: /^Export/ });

    await user.hover(exportButton);
    await user.click(exportButton);
    // Menu open — cue stays.
    expect(onExportIntentChange).toHaveBeenLastCalledWith(true);

    await user.click(exportButton);
    // Menu closed by click. Mouse-leave should clear the cue even though the
    // browser keeps focus on the trigger after the click.
    await user.unhover(exportButton);
    expect(onExportIntentChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps export-intent active while the export menu is open', async () => {
    const user = userEvent.setup();
    const onExportIntentChange = vi.fn();

    renderToolbar({ onExportIntentChange });

    const exportTrigger = screen.getByRole('button', { name: /^Export/ });
    await user.click(exportTrigger);

    expect(onExportIntentChange).toHaveBeenLastCalledWith(true);
  });

  it('routes export menu items through the matching callbacks', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    const onExportToClipboard = vi.fn();

    renderToolbar({ onExport, onExportToClipboard });

    const exportTrigger = screen.getByRole('button', { name: /^Export/ });

    // Trigger itself does not fire onExport — it opens the menu.
    await user.click(exportTrigger);
    expect(onExport).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'PNG' }));
    expect(onExport).toHaveBeenCalledOnce();
    expect(onExportToClipboard).not.toHaveBeenCalled();

    await user.click(exportTrigger);
    await user.click(screen.getByRole('button', { name: 'To clipboard' }));
    expect(onExportToClipboard).toHaveBeenCalledOnce();
  });

  it('renders the clipboard status bubble next to the export trigger', () => {
    renderToolbar({ clipboardStatusMessage: 'Copied to clipboard' });

    const bubble = screen.getByText('Copied to clipboard');
    expect(bubble).toHaveClass('top-toolbar-status-bubble');
  });

  it('applies the fading state to the clipboard status bubble', () => {
    renderToolbar({
      clipboardStatusFading: true,
      clipboardStatusMessage: 'Copied to clipboard',
    });

    expect(screen.getByText('Copied to clipboard')).toHaveClass('fading');
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

  describe('canvas name', () => {
    it('renders the supplied canvas name', () => {
      renderToolbar({ canvasName: 'My Banner' });

      expect(screen.getByTestId('canvas-name-display')).toHaveTextContent('My Banner');
    });

    it('reveals an input prefilled with the current name when clicked', async () => {
      const user = userEvent.setup();
      renderToolbar({ canvasName: 'My Banner' });

      await user.click(screen.getByTestId('canvas-name-display'));

      const input = screen.getByTestId('canvas-name-input');
      expect(input).toHaveValue('My Banner');
      expect(input).toHaveFocus();
    });

    it('commits a non-empty value on Enter', async () => {
      const user = userEvent.setup();
      const onCanvasNameChange = vi.fn();
      renderToolbar({ canvasName: 'Untitled canvas', onCanvasNameChange });

      await user.click(screen.getByTestId('canvas-name-display'));
      const input = screen.getByTestId('canvas-name-input');
      await user.clear(input);
      await user.type(input, 'My Banner{Enter}');

      expect(onCanvasNameChange).toHaveBeenCalledWith('My Banner');
    });

    it('falls back to "Untitled canvas" when the user commits an empty value', async () => {
      const user = userEvent.setup();
      const onCanvasNameChange = vi.fn();
      renderToolbar({ canvasName: 'My Banner', onCanvasNameChange });

      await user.click(screen.getByTestId('canvas-name-display'));
      const input = screen.getByTestId('canvas-name-input');
      await user.clear(input);
      await user.type(input, '{Enter}');

      expect(onCanvasNameChange).toHaveBeenCalledWith('Untitled canvas');
    });

    it('does not fire onChange when the committed value matches the current name', async () => {
      const user = userEvent.setup();
      const onCanvasNameChange = vi.fn();
      renderToolbar({ canvasName: 'My Banner', onCanvasNameChange });

      await user.click(screen.getByTestId('canvas-name-display'));
      const input = screen.getByTestId('canvas-name-input');
      await user.type(input, '{Enter}');

      expect(onCanvasNameChange).not.toHaveBeenCalled();
    });

    it('cancels the edit on Escape without firing onChange', async () => {
      const user = userEvent.setup();
      const onCanvasNameChange = vi.fn();
      renderToolbar({ canvasName: 'My Banner', onCanvasNameChange });

      await user.click(screen.getByTestId('canvas-name-display'));
      const input = screen.getByTestId('canvas-name-input');
      await user.clear(input);
      await user.type(input, 'Discarded{Escape}');

      expect(onCanvasNameChange).not.toHaveBeenCalled();
      expect(screen.getByTestId('canvas-name-display')).toHaveTextContent('My Banner');
    });
  });

  it('closes popovers on outside click, escape, and tab', async () => {
    const user = userEvent.setup();
    renderToolbar();

    const canvasTrigger = screen.getByRole('button', { name: 'File' });

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

});
