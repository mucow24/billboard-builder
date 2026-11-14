import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentLibraryDialog } from './DocumentLibraryDialog';
import type { DocumentLibraryEntry } from '../persistence/documentLibraryService';

function createEntry(overrides: Partial<DocumentLibraryEntry> = {}): DocumentLibraryEntry {
  return {
    id: 'poster',
    name: 'Poster',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    fonts: [],
    ...overrides,
  };
}

function renderDialog(overrides: Partial<Parameters<typeof DocumentLibraryDialog>[0]> = {}) {
  const props = {
    entries: [createEntry(), createEntry({ id: 'banner', name: 'Banner' })],
    entriesKnown: true,
    // "Banner" has no preview.
    previews: { poster: 'data:image/png;base64,AAA' },
    currentDocumentId: 'banner',
    currentDocumentHasUnsavedChanges: false,
    onClose: vi.fn(),
    onOpen: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    onExportJson: vi.fn(),
    ...overrides,
  };
  return { ...render(<DocumentLibraryDialog {...props} />), props };
}

function card(name: string) {
  const item = screen.getByRole('button', { name: `Open ${name}` }).closest('li');
  if (!item) {
    throw new Error(`No library card for ${name}`);
  }
  return within(item);
}

describe('DocumentLibraryDialog', () => {
  it('shows every document with its name and preview, in the order given', () => {
    const { container } = renderDialog();

    expect(screen.getByRole('dialog', { name: 'Library' })).toBeVisible();
    expect(screen.getByText('2 canvases')).toBeVisible();
    expect(
      [...container.querySelectorAll('.library-card-name')].map((name) => name.textContent),
    ).toEqual(['Poster', 'Banner']);
    expect(container.querySelector('.library-card-image')).toHaveAttribute('src', 'data:image/png;base64,AAA');
    expect(card('Banner').getByText('No preview')).toBeVisible();
  });

  it('marks the open document, and says so when it has unsaved changes', () => {
    const { rerender, props } = renderDialog();

    expect(card('Banner').getByText('Open')).toBeVisible();
    expect(card('Poster').queryByText('Open')).not.toBeInTheDocument();

    rerender(<DocumentLibraryDialog {...props} currentDocumentHasUnsavedChanges />);

    expect(card('Banner').getByText('Open, unsaved changes')).toBeVisible();
  });

  it('explains how documents get here when the library is empty', () => {
    renderDialog({ entries: [] });

    expect(screen.getByText('0 canvases')).toBeVisible();
    expect(screen.getByText(/Nothing saved yet/)).toBeVisible();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // An unreadable library used to look like an empty one.
  it('says so when the library could not be read, rather than calling it empty', () => {
    renderDialog({ entries: [], entriesKnown: false });

    expect(screen.getByRole('alert')).toHaveTextContent('The library could not be read.');
    expect(screen.queryByText(/Nothing saved yet/)).not.toBeInTheDocument();
  });

  it('shows what it could read, and says that canvases may be missing', () => {
    renderDialog({ entriesKnown: false });

    expect(screen.getByRole('alert')).toHaveTextContent('Part of the library could not be read.');
    expect(screen.getAllByTestId('library-card')).toHaveLength(2);
  });

  it('shows a preview once it has been read', () => {
    const { rerender, props } = renderDialog({ previews: {} });
    expect(card('Poster').getByText('No preview')).toBeVisible();

    rerender(<DocumentLibraryDialog {...props} previews={{ poster: 'data:image/png;base64,LATE' }} />);

    expect(screen.getByRole('button', { name: 'Open Poster' }).querySelector('img')).toHaveAttribute(
      'src',
      'data:image/png;base64,LATE',
    );
  });

  it('opens a document from its preview', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Open Poster' }));

    expect(props.onOpen).toHaveBeenCalledExactlyOnceWith('poster');
  });

  it('shows when each document was saved as YYYY-MM-DD HH:MM, in full in its tooltip', () => {
    const savedAt = new Date(2026, 2, 7, 14, 5).getTime();
    renderDialog({ entries: [createEntry({ updatedAt: savedAt })] });

    const date = card('Poster').getByText('Saved 2026-03-07 14:05');
    expect(date).toBeVisible();
    expect(date.getAttribute('title')).toMatch(/^Saved .*2026/);
  });

  it('duplicates a document', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Duplicate Poster' }));

    expect(props.onDuplicate).toHaveBeenCalledExactlyOnceWith('poster');
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it('exports a document as JSON', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Export Poster as JSON' }));

    expect(props.onExportJson).toHaveBeenCalledExactlyOnceWith('poster');
  });

  describe('renaming', () => {
    it('renames on Enter', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog();

      await user.click(screen.getByRole('button', { name: 'Rename Poster' }));
      const input = screen.getByRole('textbox', { name: 'New name for Poster' });
      expect(input).toHaveFocus();
      expect(input).toHaveValue('Poster');
      await user.clear(input);
      await user.type(input, '  Big poster {Enter}');

      expect(props.onRename).toHaveBeenCalledExactlyOnceWith('poster', 'Big poster');
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('renames when the field loses focus', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog();

      await user.click(screen.getByRole('button', { name: 'Rename Poster' }));
      await user.type(screen.getByRole('textbox'), ' 2');
      await user.tab();

      expect(props.onRename).toHaveBeenCalledExactlyOnceWith('poster', 'Poster 2');
    });

    it('keeps the name on Escape, and leaves the dialog open', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog();

      await user.click(screen.getByRole('button', { name: 'Rename Poster' }));
      await user.type(screen.getByRole('textbox'), ' changed{Escape}');

      expect(props.onRename).not.toHaveBeenCalled();
      expect(props.onClose).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('ignores an empty or unchanged name', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog();

      await user.click(screen.getByRole('button', { name: 'Rename Poster' }));
      await user.clear(screen.getByRole('textbox'));
      await user.keyboard('{Enter}');
      await user.click(screen.getByRole('button', { name: 'Rename Poster' }));
      await user.keyboard('{Enter}');

      expect(props.onRename).not.toHaveBeenCalled();
    });
  });

  describe('deleting', () => {
    it('asks first, and deletes on confirmation', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog();

      await user.click(screen.getByRole('button', { name: 'Delete Poster' }));

      expect(props.onDelete).not.toHaveBeenCalled();
      // The question takes the place of the buttons, not of the name.
      expect(card('Poster').getByText('Poster')).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Duplicate Poster' })).not.toBeInTheDocument();
      const confirmation = within(screen.getByRole('group', { name: 'Delete Poster?' }));
      expect(confirmation.getByRole('button', { name: 'Cancel' })).toHaveFocus();
      await user.click(confirmation.getByRole('button', { name: 'Delete' }));

      expect(props.onDelete).toHaveBeenCalledExactlyOnceWith('poster');
    });

    it('keeps the document on Cancel or Escape', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog();

      await user.click(screen.getByRole('button', { name: 'Delete Poster' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('group', { name: 'Delete Poster?' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Delete Poster' }));
      await user.keyboard('{Escape}');

      expect(screen.queryByRole('group', { name: 'Delete Poster?' })).not.toBeInTheDocument();
      expect(props.onDelete).not.toHaveBeenCalled();
      expect(props.onClose).not.toHaveBeenCalled();
    });
  });

  describe('closing', () => {
    it('closes on Escape, on the close button and on a click beside the dialog', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog();

      expect(screen.getByRole('dialog')).toHaveFocus();
      await user.keyboard('{Escape}');
      expect(props.onClose).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: 'Close library' }));
      expect(props.onClose).toHaveBeenCalledTimes(2);

      fireEvent.pointerDown(screen.getByTestId('library-backdrop'));
      expect(props.onClose).toHaveBeenCalledTimes(3);
    });

    // The editor listens for its shortcuts on the document. Escape closing the
    // library used to reach it as well and clear the selection on the canvas.
    it('keeps the keys pressed in it from the editor shortcuts on the document', async () => {
      const user = userEvent.setup();
      const onDocumentKeyDown = vi.fn();
      document.addEventListener('keydown', onDocumentKeyDown);
      try {
        const { props } = renderDialog();

        await user.keyboard('{Delete}a{Escape}');
        expect(props.onClose).toHaveBeenCalledOnce();

        await user.click(screen.getByRole('button', { name: 'Rename Poster' }));
        await user.keyboard('x{Backspace}{Escape}');

        expect(onDocumentKeyDown).not.toHaveBeenCalled();
      } finally {
        document.removeEventListener('keydown', onDocumentKeyDown);
      }
    });

    // Leaving the name field or the delete question removes the focused
    // control. The focus used to drop out of the dialog, and Escape did nothing.
    it('keeps the focus in the dialog after a rename or a delete question, so Escape still closes it', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog();

      await user.click(screen.getByRole('button', { name: 'Rename Poster' }));
      await user.keyboard('{Escape}');
      expect(screen.getByRole('button', { name: 'Rename Poster' })).toHaveFocus();

      await user.click(screen.getByRole('button', { name: 'Rename Poster' }));
      await user.keyboard(' 2{Enter}');
      expect(screen.getByRole('button', { name: 'Rename Poster' })).toHaveFocus();

      await user.click(screen.getByRole('button', { name: 'Delete Poster' }));
      await user.keyboard('{Escape}');
      expect(screen.getByRole('button', { name: 'Delete Poster' })).toHaveFocus();
      expect(props.onClose).not.toHaveBeenCalled();

      await user.keyboard('{Escape}');
      expect(props.onClose).toHaveBeenCalledOnce();
    });

    it('closes on Escape even when the focus has left it for the page', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog();
      (document.activeElement as HTMLElement).blur();
      expect(document.body).toHaveFocus();

      await user.keyboard('a');
      expect(screen.getByRole('dialog')).toHaveFocus();
      expect(props.onClose).not.toHaveBeenCalled();

      (document.activeElement as HTMLElement).blur();
      await user.keyboard('{Escape}');
      expect(props.onClose).toHaveBeenCalledOnce();
    });

    it('does not let the browser save the page on Ctrl+S', () => {
      renderDialog();

      const unhandled = fireEvent.keyDown(screen.getByRole('dialog'), { key: 's', ctrlKey: true });

      expect(unhandled).toBe(false);
    });

    it('stays open on a click inside the dialog', () => {
      const { props } = renderDialog();

      fireEvent.pointerDown(screen.getByRole('dialog'));

      expect(props.onClose).not.toHaveBeenCalled();
    });

    it('keeps the focus inside the dialog when tabbing past either end', async () => {
      const user = userEvent.setup();
      renderDialog({ entries: [createEntry()] });
      const closeButton = screen.getByRole('button', { name: 'Close library' });
      const lastButton = screen.getByRole('button', { name: 'Delete Poster' });

      await user.tab({ shift: true });
      expect(lastButton).toHaveFocus();

      await user.tab();
      expect(closeButton).toHaveFocus();

      await user.tab({ shift: true });
      expect(lastButton).toHaveFocus();
    });

    it('gives the focus back to where it was when it closes', () => {
      const opener = document.createElement('button');
      document.body.appendChild(opener);
      opener.focus();

      const { unmount } = renderDialog();
      expect(opener).not.toHaveFocus();
      unmount();

      expect(opener).toHaveFocus();
      opener.remove();
    });
  });
});
