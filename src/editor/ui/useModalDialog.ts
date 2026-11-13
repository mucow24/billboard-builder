import { type KeyboardEvent, type RefObject, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = 'button:not(:disabled), input:not(:disabled), [tabindex="0"]';

/** The modal dialogs that are open, the one on top last. */
const openDialogs: object[] = [];

/**
 * The keyboard and focus behaviour of a modal dialog:
 *
 * - it takes the focus when it opens and gives it back when it closes;
 * - Tab stays inside it;
 * - Escape closes it, also when the focus has ended up on the page behind it;
 * - no key pressed in it reaches the editor's shortcuts.
 *
 * Put the returned handler on the dialog element as `onKeyDown`, and give that
 * element `tabIndex={-1}`. When dialogs are stacked, only the one opened last
 * answers keys pressed outside any of them.
 */
export function useModalDialog(dialogRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    };
  }, [dialogRef]);

  // The focus can still end up outside the dialog, on the page itself: when
  // the focused control is removed, say. Escape must close the dialog from
  // there too, and any other key brings the focus back in.
  useEffect(() => {
    const token = {};
    openDialogs.push(token);

    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      const dialog = dialogRef.current;
      if (
        openDialogs[openDialogs.length - 1] !== token ||
        !dialog ||
        (event.target instanceof Node && dialog.contains(event.target))
      ) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      dialog.focus();
    }

    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      openDialogs.splice(openDialogs.indexOf(token), 1);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [dialogRef]);

  return function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
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
      onCloseRef.current();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    // Keep the focus inside the dialog.
    const dialog = dialogRef.current;
    const focusable = [...(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])];
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };
}
