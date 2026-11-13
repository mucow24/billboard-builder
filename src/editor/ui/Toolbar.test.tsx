import type { ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
    canReorder: false,
    canSaveFavorite: false,
    canUndo: false,
    canUngroup: false,
    canvasFocusActive: false,
    canvasName: 'Untitled canvas',
    onCanvasNameChange: vi.fn(),
    favoriteCount: 0,
    itemCount: 0,
    onCanvasFocusToggle: vi.fn(),
    onBackgroundChange: vi.fn(),
    onCanvasSizeChange: vi.fn(),
    onDelete: vi.fn(),
    onExport: vi.fn(),
    onExportSvg: vi.fn(),
    onExportToClipboard: vi.fn(),
    onGroup: vi.fn(),
    onInspectorTabChange: vi.fn(),
    onLoadFromJson: vi.fn(),
    onLoadFromLibrary: vi.fn(),
    onRevert: vi.fn(),
    onExportJson: vi.fn(),
    canRevert: false,
    hasUnsavedChanges: false,
    onNewProject: vi.fn(),
    onRedo: vi.fn(),
    onReorder: vi.fn(),
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
    expect(screen.getByRole('button', { name: 'Canvas' })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /^Undo/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Redo/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Delete/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Group/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Ungroup/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save as favorite' })).toBeDisabled();
  });

  it('places the layer order buttons after Save as favorite and routes each to its reorder mode', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();

    renderToolbar({ canReorder: true, onReorder });

    const orderControls = screen.getByRole('group', { name: 'Layer order controls' });
    const labels = within(orderControls)
      .getAllByRole('button')
      .map((button) => button.getAttribute('title'));
    expect(labels).toEqual([
      'Move to top (Ctrl+Shift+Up)',
      'Move up (Ctrl+Up)',
      'Move down (Ctrl+Down)',
      'Move to bottom (Ctrl+Shift+Down)',
    ]);

    const saveFavorite = screen.getByRole('button', { name: 'Save as favorite' });
    expect(
      saveFavorite.compareDocumentPosition(orderControls) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(orderControls.previousElementSibling).toHaveClass('top-toolbar-section-divider');

    await user.click(screen.getByRole('button', { name: /^Move to top/ }));
    await user.click(screen.getByRole('button', { name: /^Move up/ }));
    await user.click(screen.getByRole('button', { name: /^Move down/ }));
    await user.click(screen.getByRole('button', { name: /^Move to bottom/ }));
    expect(onReorder.mock.calls).toEqual([['front'], ['forward'], ['backward'], ['back']]);
  });

  it('disables the layer order buttons when the selection cannot be reordered', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();

    renderToolbar({ canReorder: false, onReorder });

    const orderControls = screen.getByRole('group', { name: 'Layer order controls' });
    for (const button of within(orderControls).getAllByRole('button')) {
      expect(button).toBeDisabled();
      await user.click(button);
    }
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('routes canvas popover actions through the existing callbacks', async () => {
    const user = userEvent.setup();
    const onLoadFromJson = vi.fn();
    const onLoadFromLibrary = vi.fn();
    const onRevert = vi.fn();
    const onSave = vi.fn();
    const onNewProject = vi.fn();

    renderToolbar({
      canRevert: true,
      hasUnsavedChanges: true,
      onLoadFromJson,
      onLoadFromLibrary,
      onNewProject,
      onRevert,
      onSave,
    });

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    await user.click(screen.getByRole('button', { name: 'Load' }));
    await user.click(screen.getByRole('button', { name: 'From library...' }));
    expect(onLoadFromLibrary).toHaveBeenCalledOnce();
    expect(screen.queryByRole('group', { name: 'Canvas actions' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    await user.click(screen.getByRole('button', { name: 'Load' }));
    await user.click(screen.getByRole('button', { name: 'From JSON...' }));
    expect(onLoadFromJson).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    await user.click(screen.getByRole('button', { name: 'Revert' }));
    expect(onRevert).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    await user.click(screen.getByRole('button', { name: 'New' }));
    expect(onNewProject).toHaveBeenCalledOnce();
  });

  it('greys out Save and Revert and hides the unsaved-changes dot when nothing is unsaved', async () => {
    const user = userEvent.setup();
    const onRevert = vi.fn();
    const onSave = vi.fn();

    renderToolbar({ canRevert: false, hasUnsavedChanges: false, onRevert, onSave });

    expect(screen.queryByRole('img', { name: 'Unsaved changes' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    const save = screen.getByRole('button', { name: 'Save' });
    const revert = screen.getByRole('button', { name: 'Revert' });
    expect(save).toBeDisabled();
    expect(revert).toBeDisabled();
    await user.click(save);
    await user.click(revert);
    expect(onSave).not.toHaveBeenCalled();
    expect(onRevert).not.toHaveBeenCalled();
  });

  it('shows the unsaved-changes dot beside the name, and keeps Revert greyed out for a canvas that was never saved', async () => {
    const user = userEvent.setup();

    renderToolbar({ canRevert: false, hasUnsavedChanges: true });

    expect(screen.getByRole('img', { name: 'Unsaved changes' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Revert' })).toBeDisabled();
  });

  it('exports the canvas as JSON from the Export menu', async () => {
    const user = userEvent.setup();
    const onExportJson = vi.fn();

    renderToolbar({ onExportJson });

    await user.click(screen.getByRole('button', { name: /^Export/ }));
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(onExportJson).toHaveBeenCalledOnce();
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

  it('updates preset and custom canvas dimensions through the canvas menu size submenu', async () => {
    const user = userEvent.setup();
    const onCanvasSizeChange = vi.fn();

    renderToolbar({ onCanvasSizeChange });

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    await user.hover(await screen.findByRole('button', { name: 'Size' }));

    expect(screen.getByRole('button', { name: '2048 x 1024' })).toHaveAttribute('aria-pressed', 'true');
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

    const canvasTrigger = screen.getByRole('button', { name: 'Canvas' });

    await user.click(canvasTrigger);
    expect(screen.getByRole('button', { name: 'Load' })).toBeVisible();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('button', { name: 'Load' })).not.toBeInTheDocument();

    await user.click(canvasTrigger);
    expect(screen.getByRole('button', { name: 'Load' })).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Load' })).not.toBeInTheDocument();
    expect(canvasTrigger).toHaveFocus();

    await user.click(canvasTrigger);
    expect(screen.getByRole('button', { name: 'Load' })).toBeVisible();

    await user.tab();
    expect(screen.queryByRole('button', { name: 'Load' })).not.toBeInTheDocument();
  });

  it('keeps the canvas menu open while tabbing between size fields and closes it once focus leaves', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    await user.hover(screen.getByRole('button', { name: 'Size' }));

    await user.click(screen.getByLabelText('Canvas width'));
    await user.tab();
    expect(screen.getByLabelText('Canvas height')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Load' })).toBeVisible();

    await user.tab();
    expect(screen.queryByRole('button', { name: 'Load' })).not.toBeInTheDocument();
  });

  it('shows a background color picker in the canvas menu and fires onBackgroundChange', async () => {
    const user = userEvent.setup();
    const onBackgroundChange = vi.fn();

    renderToolbar({ onBackgroundChange });

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    expect(screen.getByText('Color')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Canvas background' }));
    expect(screen.getByLabelText('Canvas background hex')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Load' })).toBeVisible();

    await user.clear(screen.getByLabelText('Canvas background hex'));
    await user.type(screen.getByLabelText('Canvas background hex'), '#11223344{Enter}');
    expect(onBackgroundChange).toHaveBeenCalledWith('#11223344');
  });
});
