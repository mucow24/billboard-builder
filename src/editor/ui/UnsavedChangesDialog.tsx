import { useEffect, useId, useRef } from 'react';

import { useModalDialog } from './useModalDialog';

/** What to do with unsaved changes: save them, drop them, or stay on the canvas. */
export type UnsavedChangesAnswer = 'save' | 'discard' | 'cancel';

interface UnsavedChangesDialogProps {
  /** The name of the canvas that is about to be replaced. */
  canvasName: string;
  /** The canvas is not in the library at all: discarding loses the whole canvas, not just changes. */
  neverSaved: boolean;
  onAnswer: (answer: UnsavedChangesAnswer) => void;
}

/**
 * Asked before another canvas replaces one with unsaved changes. Escape, and a
 * click beside the dialog, answer "cancel": nothing is saved and nothing is lost.
 */
export function UnsavedChangesDialog({ canvasName, neverSaved, onAnswer }: UnsavedChangesDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const handleKeyDown = useModalDialog(dialogRef, () => onAnswer('cancel'));

  useEffect(() => {
    saveButtonRef.current?.focus();
  }, []);

  return (
    <div
      className="library-backdrop unsaved-changes-backdrop"
      data-testid="unsaved-changes-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onAnswer('cancel');
        }
      }}
    >
      <div
        ref={dialogRef}
        className="library-dialog unsaved-changes-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className="library-title">
          Unsaved changes
        </h2>
        <p id={messageId} className="unsaved-changes-message">
          {neverSaved
            ? `"${canvasName}" has not been saved to the library. Save it, or discard it for good?`
            : `"${canvasName}" has changes that are not in the library. Save them, or discard them and keep its last saved version?`}
        </p>
        <div className="unsaved-changes-actions">
          <button
            ref={saveButtonRef}
            type="button"
            className="library-button library-button-primary"
            onClick={() => onAnswer('save')}
          >
            Save
          </button>
          <button
            type="button"
            className="library-button library-button-danger"
            onClick={() => onAnswer('discard')}
          >
            Discard
          </button>
          <button type="button" className="library-button" onClick={() => onAnswer('cancel')}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
