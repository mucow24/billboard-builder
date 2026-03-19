import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Toolbar } from './Toolbar';

describe('Toolbar', () => {
  it('renders undo and redo as disabled when history is unavailable', () => {
    render(
      <Toolbar
        canvas={{ width: 1024, height: 512, presetId: 'landscape' }}
        canGroup={false}
        canUngroup={false}
        canUndo={false}
        canRedo={false}
        onCanvasSizeChange={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onFontUpload={vi.fn()}
        onGroup={vi.fn()}
        onImageUpload={vi.fn()}
        onLoad={vi.fn()}
        onNewProject={vi.fn()}
        onRedo={vi.fn()}
        onSave={vi.fn()}
        onUndo={vi.fn()}
        onUngroup={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it('updates preset and custom canvas dimensions through callbacks', async () => {
    const user = userEvent.setup();
    const onCanvasSizeChange = vi.fn();

    render(
      <Toolbar
        canvas={{ width: 1024, height: 512, presetId: 'landscape' }}
        canGroup={false}
        canUngroup={false}
        canUndo
        canRedo
        onCanvasSizeChange={onCanvasSizeChange}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onFontUpload={vi.fn()}
        onGroup={vi.fn()}
        onImageUpload={vi.fn()}
        onLoad={vi.fn()}
        onNewProject={vi.fn()}
        onRedo={vi.fn()}
        onSave={vi.fn()}
        onUndo={vi.fn()}
        onUngroup={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText('Canvas preset'), 'square-sm');
    fireEvent.change(screen.getByLabelText('Canvas width'), {
      target: { value: '640' },
    });
    fireEvent.change(screen.getByLabelText('Canvas height'), {
      target: { value: '480' },
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
  });
});
