import { useEffect, useId, useRef } from 'react';

import { useModalDialog } from './useModalDialog';

/** What to do with unsaved changes: save them, drop them, or stay on the canvas. */
export type UnsavedChangesAnswer = 'save' | 'discard' | 'cancel';

interface UnsavedChangesDialogProps {
  /** The name of the canvas that is about to be replaced. */
  canvasName: string;
  /** The canvas is not in the library at all: discarding loses the whole canvas, not just changes. */
  neverSaved: boolean;
  /**
   * A copy of the canvas is what replaces it (Canvas > Make a copy). The copy
   * holds the unsaved changes whatever the answer, so nothing is discarded:
   * "save" also saves them to the original, "discard" leaves the original as it is.
   */
  forCopy?: boolean;
  onAnswer: (answer: UnsavedChangesAnswer) => void;
}

function question(canvasName: string, neverSaved: boolean, forCopy: boolean) {
  if (forCopy) {
    return neverSaved
      ? `"${canvasName}" has not been saved to the library. The copy will hold all of it. Save "${canvasName}" itself to the library as well?`
      : `"${canvasName}" has changes that are not in the library. The copy will include them. Save them to "${canvasName}" as well, or leave it at its last saved version?`;
  }
  return neverSaved
    ? `"${canvasName}" has not been saved to the library. Save it, or discard it for good?`
    : `"${canvasName}" has changes that are not in the library. Save them, or discard them and keep its last saved version?`;
}

/**
 * Asked before another canvas replaces one with unsaved changes. Escape, and a
 * click beside the dialog, answer "cancel": nothing is saved and nothing is lost.
 *
 * Before a copy of the canvas replaces it (`forCopy`), the question and its
 * buttons say that the changes are kept in the copy: the second button is then
 * "Copy only", and is not styled as a destructive one.
 */
export function UnsavedChangesDialog({
  canvasName,
  neverSaved,
  forCopy = false,
  onAnswer,
}: UnsavedChangesDialogProps) {
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
          {question(canvasName, neverSaved, forCopy)}
        </p>
        <div className="unsaved-changes-actions">
          <button
            ref={saveButtonRef}
            type="button"
            className="library-button library-button-primary"
            onClick={() => onAnswer('save')}
          >
            {forCopy ? 'Save original too' : 'Save'}
          </button>
          <button
            type="button"
            className={forCopy ? 'library-button' : 'library-button library-button-danger'}
            onClick={() => onAnswer('discard')}
          >
            {forCopy ? 'Copy only' : 'Discard'}
          </button>
          <button type="button" className="library-button" onClick={() => onAnswer('cancel')}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
