import { Cross2Icon, DownloadIcon, Pencil1Icon, TrashIcon } from '@radix-ui/react-icons';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

import type { DocumentLibraryEntry } from '../persistence/documentLibraryService';
import { useModalDialog } from './useModalDialog';

interface DocumentLibraryDialogProps {
  /** The documents in the library, in the order to show them. */
  entries: DocumentLibraryEntry[];
  /** False when the library could not be read, or not all of it: `entries` may be missing documents. */
  entriesKnown: boolean;
  /** The preview images read so far, as data URLs, by document id. */
  previews: Readonly<Record<string, string>>;
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

function formatSavedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

interface LibraryCardProps {
  entry: DocumentLibraryEntry;
  /** The preview image as a data URL; undefined when there is none, or it has not been read yet. */
  preview: string | undefined;
  isCurrent: boolean;
  hasUnsavedChanges: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onExportJson: () => void;
}

function LibraryCard({
  entry,
  preview,
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
        {preview ? (
          <img className="library-card-image" src={preview} alt="" draggable={false} />
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
  entriesKnown,
  previews,
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

  const handleKeyDown = useModalDialog(dialogRef, onClose);

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

        {!entriesKnown ? (
          <p className="library-notice" role="alert">
            {entries.length === 0
              ? 'The library could not be read.'
              : 'Part of the library could not be read. Some canvases may be missing from this list.'}
          </p>
        ) : null}
        {entries.length === 0 ? (
          entriesKnown ? (
            <p className="library-empty">
              Nothing saved yet. Canvas &gt; Save puts the open canvas here.
            </p>
          ) : null
        ) : (
          <ul className="library-grid" aria-label="Saved canvases">
            {entries.map((entry) => (
              <LibraryCard
                key={entry.id}
                entry={entry}
                preview={previews[entry.id]}
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
