import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Toolbar } from './Toolbar';

describe('Toolbar', () => {
  it('renders undo and redo as disabled when history is unavailable', () => {
    render(
      <Toolbar
        canvas={{ width: 1024, height: 512, presetId: 'landscape' }}
        exportScale={2}
        canUndo={false}
        canRedo={false}
        canReorderSelection={false}
        onCanvasSizeChange={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onExportScaleChange={vi.fn()}
        onFontUpload={vi.fn()}
        onImageUpload={vi.fn()}
        onLoad={vi.fn()}
        onNewProject={vi.fn()}
        onRedo={vi.fn()}
        onReorder={vi.fn()}
        onSave={vi.fn()}
        onUndo={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bring front' })).toBeDisabled();
  });

  it('updates preset, custom canvas dimensions, and export scale through callbacks', async () => {
    const user = userEvent.setup();
    const onCanvasSizeChange = vi.fn();
    const onExportScaleChange = vi.fn();

    render(
      <Toolbar
        canvas={{ width: 1024, height: 512, presetId: 'landscape' }}
        exportScale={2}
        canUndo
        canRedo
        canReorderSelection
        onCanvasSizeChange={onCanvasSizeChange}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onExportScaleChange={onExportScaleChange}
        onFontUpload={vi.fn()}
        onImageUpload={vi.fn()}
        onLoad={vi.fn()}
        onNewProject={vi.fn()}
        onRedo={vi.fn()}
        onReorder={vi.fn()}
        onSave={vi.fn()}
        onUndo={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText('Canvas preset'), 'square-sm');
    fireEvent.change(screen.getByLabelText('Canvas width'), {
      target: { value: '640' },
    });
    fireEvent.change(screen.getByLabelText('Canvas height'), {
      target: { value: '480' },
    });
    fireEvent.change(screen.getByLabelText('Export scale'), {
      target: { value: '4' },
    });

    expect(onCanvasSizeChange).toHaveBeenCalledWith({
      width: 512,
      height: 512,
      presetId: 'square-sm',
    });
    expect(onCanvasSizeChange).toHaveBeenCalledWith({
      width: 640,
      height: 512,
      presetId: undefined,
    });
    expect(onCanvasSizeChange).toHaveBeenCalledWith({
      width: 1024,
      height: 480,
      presetId: undefined,
    });
    expect(onExportScaleChange).toHaveBeenLastCalledWith(4);
  });
});


it('wires reorder actions in the history cluster', async () => {
  const user = userEvent.setup();
  const onReorder = vi.fn();

  render(
    <Toolbar
      canvas={{ width: 1024, height: 512, presetId: 'landscape' }}
      exportScale={2}
      canUndo
      canRedo
      canReorderSelection
      onCanvasSizeChange={vi.fn()}
      onDelete={vi.fn()}
      onExport={vi.fn()}
      onExportScaleChange={vi.fn()}
      onFontUpload={vi.fn()}
      onImageUpload={vi.fn()}
      onLoad={vi.fn()}
      onNewProject={vi.fn()}
      onRedo={vi.fn()}
      onReorder={onReorder}
      onSave={vi.fn()}
      onUndo={vi.fn()}
    />
  );

  await user.click(screen.getByRole('button', { name: 'Bring front' }));
  await user.click(screen.getByRole('button', { name: 'Forward' }));
  await user.click(screen.getByRole('button', { name: 'Backward' }));
  await user.click(screen.getByRole('button', { name: 'Send back' }));

  expect(onReorder).toHaveBeenNthCalledWith(1, 'front');
  expect(onReorder).toHaveBeenNthCalledWith(2, 'forward');
  expect(onReorder).toHaveBeenNthCalledWith(3, 'backward');
  expect(onReorder).toHaveBeenNthCalledWith(4, 'back');
});
