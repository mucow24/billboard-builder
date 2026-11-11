import { act, render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

/**
 * Renders a tree whose first real content arrives asynchronously (the app shows
 * the editor only once startup has put the saved canvas in place) and returns
 * once React has rendered that content and run its effects.
 *
 * `render(...)` followed by `await screen.findBy...` is not enough for such a
 * tree. The content is then rendered outside `act`, where React commits the DOM
 * in one task and runs the effects of that render (store subscriptions, key and
 * paste listeners) in a later one. `findBy...` returns as soon as the DOM is
 * there, after a 0 ms timer, and that timer can fire before the task with the
 * effects. What the test does next (a store update, a key press) then reaches
 * components that are not listening yet and is lost. Which of the two runs
 * first is decided by the event loop, so such a test fails only now and then.
 *
 * Inside `act` nothing is left to the event loop: every update the startup
 * promises make is rendered, with its effects, before `act` returns. That
 * covers startup steps that settle on their own. A step a test holds back has
 * to be released the same way: `await act(async () => { release(); })`.
 */
export async function renderSettled(ui: ReactElement): Promise<RenderResult> {
  let result: RenderResult | undefined;
  await act(async () => {
    result = render(ui);
  });
  return result as RenderResult;
}
