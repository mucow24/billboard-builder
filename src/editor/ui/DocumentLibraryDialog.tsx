import { Cross2Icon, DownloadIcon, Pencil1Icon, TrashIcon } from '@radix-ui/react-icons';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

import type { DocumentLibraryEntry } from '../persistence/documentLibraryService';

interface DocumentLibraryDialogProps {
  /** The documents in the library, in the order to show them. */
  entries: DocumentLibraryEntry[];
  /** The id of the document open in the editor. */
  currentDocumentId: string;
  /** The open document has changes that its library entry does not show yet. */
  currentDocumentHasUnsavedChanges: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onExportJson: (id: string) => void;
}

const FOCUSABLE_SELECTOR = 'button:not(:disabled), input:not(:disabled), [tabindex="0"]';

function formatSavedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

interface LibraryCardProps {
  entry: DocumentLibraryEntry;
  isCurrent: boolean;
  hasUnsavedChanges: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onExportJson: () => void;
}

function LibraryCard({
  entry,
  isCurrent,
  hasUnsavedChanges,
  onOpen,
  onRename,
  onDelete,
  onExportJson,
}: LibraryCardProps) {
  const [mode, setMode] = useState<'idle' | 'renaming' | 'confirming-delete'>('idle');
  const [draftName, setDraftName] = useState(entry.name);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renameButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousModeRef = useRef(mode);

  useEffect(() => {
    const previousMode = previousModeRef.current;
    previousModeRef.current = mode;
    if (mode === 'renaming') {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    } else if (mode === 'confirming-delete') {
      cancelDeleteRef.current?.focus();
    } else if (
      document.activeElement === document.body ||
      document.activeElement === null
    ) {
      // The field or button that had the focus is gone: put the focus back on
      // the button that brought it up, so the keyboard stays in the dialog.
      if (previousMode === 'renaming') {
        renameButtonRef.current?.focus();
      } else if (previousMode === 'confirming-delete') {
        deleteButtonRef.current?.focus();
      }
    }
  }, [mode]);

  function beginRename() {
    setDraftName(entry.name);
    setMode('renaming');
  }

  function commitRename() {
    setMode('idle');
    const nextName = draftName.trim();
    if (nextName.length > 0 && nextName !== entry.name) {
      onRename(nextName);
    }
  }

  function handleRenameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitRename();
    } else if (event.key === 'Escape') {
      // Only leaves the name field: the dialog stays open.
      event.preventDefault();
      event.stopPropagation();
      setMode('idle');
    }
  }

  function handleConfirmKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setMode('idle');
    }
  }

  return (
    <li className="library-card" data-testid="library-card" data-current={isCurrent || undefined}>
      <button
        type="button"
        className="library-card-preview"
        aria-label={`Open ${entry.name}`}
        title={isCurrent ? 'This canvas is open' : `Open ${entry.name}`}
        onClick={onOpen}
      >
        {entry.preview ? (
          <img className="library-card-image" src={entry.preview} alt="" draggable={false} />
        ) : (
          <span className="library-card-no-preview">No preview</span>
        )}
        {isCurrent ? (
          <span className="library-card-badge">{hasUnsavedChanges ? 'Open, unsaved changes' : 'Open'}</span>
        ) : null}
      </button>

      {mode === 'confirming-delete' ? (
        <div
          className="library-card-confirm"
          role="group"
          aria-label={`Delete ${entry.name}?`}
          onKeyDown={handleConfirmKeyDown}
        >
          <span className="library-card-confirm-text">Delete for good?</span>
          <button type="button" className="library-button library-button-danger" onClick={onDelete}>
            Delete
          </button>
          <button
            ref={cancelDeleteRef}
            type="button"
            className="library-button"
            onClick={() => setMode('idle')}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="library-card-footer">
          {mode === 'renaming' ? (
            <input
              ref={renameInputRef}
              className="library-card-name-input"
              aria-label={`New name for ${entry.name}`}
              type="text"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitRename}
              onKeyDown={handleRenameKeyDown}
            />
          ) : (
            <span className="library-card-name" title={entry.name}>
              {entry.name}
            </span>
          )}
          <div className="library-card-actions">
            <button
              ref={renameButtonRef}
              type="button"
              className="library-icon-button"
              aria-label={`Rename ${entry.name}`}
              title="Rename"
              onClick={beginRename}
            >
              <Pencil1Icon width={15} height={15} />
            </button>
            <button
              type="button"
              className="library-icon-button"
              aria-label={`Export ${entry.name} as JSON`}
              title="Export as JSON"
              onClick={onExportJson}
            >
              <DownloadIcon width={15} height={15} />
            </button>
            <button
              ref={deleteButtonRef}
              type="button"
              className="library-icon-button library-icon-button-danger"
              aria-label={`Delete ${entry.name}`}
              title="Delete"
              onClick={() => setMode('confirming-delete')}
            >
              <TrashIcon width={15} height={15} />
            </button>
          </div>
        </div>
      )}
      <span className="library-card-date">Saved {formatSavedAt(entry.updatedAt)}</span>
    </li>
  );
}

/**
 * The library: every saved document as a card with a preview, to open, rename,
 * export or delete. A modal dialog: it closes on Escape, on its close button
 * and on a click beside it.
 */
export function DocumentLibraryDialog({
  entries,
  currentDocumentId,
  currentDocumentHasUnsavedChanges,
  onClose,
  onOpen,
  onRename,
  onDelete,
  onExportJson,
}: DocumentLibraryDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    };
  }, []);

  // The focus can still end up outside the dialog, on the page itself: when
  // the focused card is deleted, say. Escape must close the dialog from there
  // too, and any other key brings the focus back in.
  useEffect(() => {
    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      const dialog = dialogRef.current;
      if (!dialog || (event.target instanceof Node && dialog.contains(event.target))) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      dialog.focus();
    }
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => document.removeEventListener('keydown', handleDocumentKeyDown);
  }, [onClose]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // The dialog is modal: no key pressed in it may reach the editor's
    // shortcuts. Closing on Escape would otherwise also clear the selection.
    event.stopPropagation();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      // The editor's shortcut is out of reach here; do not save the page instead.
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    // Keep the focus inside the dialog.
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])];
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="library-backdrop"
      data-testid="library-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="library-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="library-header">
          <h2 id={titleId} className="library-title">
            Library
          </h2>
          <span className="library-count">
            {entries.length === 1 ? '1 canvas' : `${entries.length} canvases`}
          </span>
          <button
            type="button"
            className="library-icon-button library-close"
            aria-label="Close library"
            title="Close"
            onClick={onClose}
          >
            <Cross2Icon width={16} height={16} />
          </button>
        </header>

        {entries.length === 0 ? (
          <p className="library-empty">
            Nothing saved yet. Canvas &gt; Save puts the open canvas here, and so does starting or
            loading another one.
          </p>
        ) : (
          <ul className="library-grid" aria-label="Saved canvases">
            {entries.map((entry) => (
              <LibraryCard
                key={entry.id}
                entry={entry}
                isCurrent={entry.id === currentDocumentId}
                hasUnsavedChanges={currentDocumentHasUnsavedChanges}
                onOpen={() => onOpen(entry.id)}
                onRename={(name) => onRename(entry.id, name)}
                onDelete={() => onDelete(entry.id)}
                onExportJson={() => onExportJson(entry.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
