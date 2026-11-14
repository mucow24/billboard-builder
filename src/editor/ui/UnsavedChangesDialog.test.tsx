import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentLibraryDialog } from './DocumentLibraryDialog';
import { UnsavedChangesDialog, type UnsavedChangesAnswer } from './UnsavedChangesDialog';

function renderDialog({ neverSaved = false }: { neverSaved?: boolean } = {}) {
  const props = {
    canvasName: 'Poster',
    neverSaved,
    onAnswer: vi.fn<(answer: UnsavedChangesAnswer) => void>(),
  };
  return { ...render(<UnsavedChangesDialog {...props} />), props };
}

describe('UnsavedChangesDialog', () => {
  it('names the canvas and says its last saved version is kept', () => {
    renderDialog();

    const dialog = screen.getByRole('alertdialog', { name: 'Unsaved changes' });
    expect(dialog).toHaveAccessibleDescription(
      '"Poster" has changes that are not in the library. Save them, or discard them and keep its last saved version?',
    );
  });

  it('says that discarding loses the whole canvas when it was never saved', () => {
    renderDialog({ neverSaved: true });

    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(
      '"Poster" has not been saved to the library. Save it, or discard it for good?',
    );
  });

  it('answers with the button that is pressed', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onAnswer.mock.calls).toEqual([['save'], ['discard'], ['cancel']]);
  });

  it('starts on Save, so Enter saves', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(props.onAnswer).toHaveBeenCalledExactlyOnceWith('save');
  });

  it('cancels on Escape and on a click beside it: nothing is saved and nothing is lost', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.keyboard('{Escape}');
    fireEvent.pointerDown(screen.getByTestId('unsaved-changes-backdrop'));
    fireEvent.pointerDown(screen.getByRole('alertdialog'));

    expect(props.onAnswer.mock.calls).toEqual([['cancel'], ['cancel']]);
  });

  it('keeps the focus on its three buttons', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Discard' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('keeps its keys from the editor shortcuts on the document', async () => {
    const user = userEvent.setup();
    const onDocumentKeyDown = vi.fn();
    document.addEventListener('keydown', onDocumentKeyDown);
    try {
      renderDialog();

      await user.keyboard('{Delete}a{Escape}');

      expect(onDocumentKeyDown).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', onDocumentKeyDown);
    }
  });

  // It is asked on top of the library when a canvas is opened from there.
  it('answers Escape itself when it is open on top of the library, also with the focus on the page', async () => {
    const user = userEvent.setup();
    const onCloseLibrary = vi.fn();
    const onAnswer = vi.fn();
    render(
      <>
        <DocumentLibraryDialog
          entries={[]}
          entriesKnown
          previews={{}}
          currentDocumentId="open"
          currentDocumentHasUnsavedChanges
          onClose={onCloseLibrary}
          onOpen={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onDuplicate={vi.fn()}
          onExportJson={vi.fn()}
        />
        <UnsavedChangesDialog canvasName="Poster" neverSaved={false} onAnswer={onAnswer} />
      </>,
    );

    await user.keyboard('{Escape}');
    (document.activeElement as HTMLElement).blur();
    await user.keyboard('{Escape}');

    expect(onAnswer.mock.calls).toEqual([['cancel'], ['cancel']]);
    expect(onCloseLibrary).not.toHaveBeenCalled();
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
