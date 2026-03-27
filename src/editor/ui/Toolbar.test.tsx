import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Toolbar } from './Toolbar';
import type { InspectorTab } from './inspector/types';

function renderToolbar(overrides: Partial<ComponentProps<typeof Toolbar>> = {}) {
  const props: ComponentProps<typeof Toolbar> = {
    activeInspectorTab: 'properties' satisfies InspectorTab,
    canvas: { width: 2048, height: 1024, presetId: 'landscape' },
    canDelete: false,
    canGroup: false,
    canRedo: false,
    canSaveFavorite: false,
    canUndo: false,
    canUngroup: false,
    favoriteCount: 0,
    itemCount: 0,
    onCanvasSizeChange: vi.fn(),
    onDelete: vi.fn(),
    onExport: vi.fn(),
    onFontUpload: vi.fn(),
    onGroup: vi.fn(),
    onImageUpload: vi.fn(),
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
    expect(screen.getByRole('button', { name: 'Size' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Group' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ungroup' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save as favorite' })).toBeDisabled();
  });

  it('routes canvas and upload popover actions through the existing callbacks', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    const onSave = vi.fn();
    const onNewProject = vi.fn();
    const onImageUpload = vi.fn();
    const onFontUpload = vi.fn();

    renderToolbar({
      onFontUpload,
      onImageUpload,
      onLoad,
      onNewProject,
      onSave,
    });

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    await user.click(screen.getByRole('button', { name: 'Load...' }));
    expect(onLoad).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onNewProject).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Upload' }));
    await user.click(screen.getByRole('button', { name: 'Image...' }));
    expect(onImageUpload).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Upload' }));
    await user.click(screen.getByRole('button', { name: 'Font...' }));
    expect(onFontUpload).toHaveBeenCalledOnce();
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

  it('updates preset and custom canvas dimensions through the size menu callbacks', async () => {
    const user = userEvent.setup();
    const onCanvasSizeChange = vi.fn();

    renderToolbar({
      canDelete: true,
      canRedo: true,
      canSaveFavorite: true,
      canUndo: true,
      onCanvasSizeChange,
    });

    await user.click(screen.getByRole('button', { name: 'Size' }));
    await user.click(screen.getByRole('button', { name: '1024 x 1024' }));

    await user.click(screen.getByRole('button', { name: 'Size' }));
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

  it('keeps the size menu open while editing custom fields and closes popovers on outside click, escape, and tab', async () => {
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

    const sizeTrigger = screen.getByRole('button', { name: 'Size' });
    await user.click(sizeTrigger);
    const widthField = screen.getByLabelText('Canvas width');
    await user.click(widthField);
    expect(widthField).toHaveFocus();
    expect(screen.getByRole('button', { name: '1024 x 1024' })).toBeVisible();
  });
});
