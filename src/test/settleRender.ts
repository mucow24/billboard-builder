import type { ReactNode } from 'react';

interface Rerenderable {
  rerender: (ui: ReactNode) => void;
}

/**
 * Makes React run the effects of what is already on screen.
 *
 * The app shows the editor from a promise (startup), so that render happens
 * outside `act`. React commits it and runs its effects afterwards, as a task
 * of their own. A `findBy...` query returns as soon as the editor is in the
 * DOM, which under load can be before that task: the editor's store
 * subscription and its document listeners (keyboard, copy, paste) are then
 * not attached yet, and a store update or an event fired straight away is
 * lost.
 *
 * React always runs the effects of a finished render before it starts another
 * one, so rendering the same element again closes the gap. Call this after
 * waiting for the editor and before acting on it.
 */
export function settleRender(view: Rerenderable, ui: ReactNode) {
  view.rerender(ui);
}
