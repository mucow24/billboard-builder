import { render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { settleRender } from './settleRender';

// Outside `act`, React runs the effects of a render in a task of its own, which
// its scheduler queues with `setImmediate`. `findBy...` resumes the test from a
// 0 ms timer. Either can come first; on a busy machine it is sometimes the
// timer. This file makes it the timer every time, by turning the scheduler's
// immediates into timers that are due much later. The scheduler picks up
// `setImmediate` when it is first loaded, which is after this hoisted block.
//
// Those timers can outlive the tests. A render outside `act` (the startup's
// `setReady`) queues a scheduler task that runs its passive effects. When
// `settleRender`'s `rerender`, inside `act`, runs those effects first, the
// queued task is not withdrawn: it still runs when its timer is due, finds
// nothing to do, but reads `window.event` before that. After the last test
// that timer can be due after Vitest has torn jsdom down, and the read throws
// "window is not defined" as an unhandled error. So the file waits, before it
// ends, until the scheduler has no timer left.
const { restoreSetImmediate, schedulerTimersDone } = vi.hoisted(() => {
  const original = globalThis.setImmediate;
  const pending = new Set<ReturnType<typeof setTimeout>>();
  const afterPendingTimers = (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
    const timer = setTimeout(() => {
      pending.delete(timer);
      callback(...args);
    }, 50);
    pending.add(timer);
    return timer;
  };
  globalThis.setImmediate = afterPendingTimers as unknown as typeof setImmediate;
  return {
    restoreSetImmediate: () => {
      globalThis.setImmediate = original;
    },
    // A scheduler task can queue another, so this waits until none is left
    // rather than for the ones pending when it is called.
    schedulerTimersDone: async () => {
      while (pending.size > 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
  };
});

afterAll(async () => {
  await schedulerTimersDone();
  restoreSetImmediate();
});

let editorListening = false;

/** Stands in for the editor: it only reacts to anything once its effect has run. */
function Editor() {
  useEffect(() => {
    editorListening = true;
    return () => {
      editorListening = false;
    };
  }, []);
  return <div data-testid="editor" />;
}

/** Stands in for the app: the editor is rendered once an asynchronous startup is over. */
function AppWithStartup({ startup }: { startup: () => Promise<void> }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void startup().then(() => {
      if (!cancelled) {
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [startup]);
  return ready ? <Editor /> : null;
}

/** Several awaits in a row, like the real startup. */
async function startupInSteps() {
  await Promise.resolve();
  await Promise.all([Promise.resolve(), undefined]);
  await Promise.resolve();
}

describe('settleRender', () => {
  beforeEach(() => {
    editorListening = false;
  });

  it('control: findBy alone returns before the effects when the timer wins', async () => {
    // Not a behaviour to rely on. It shows that the ordering forced above is
    // in effect, without which the tests below would prove nothing.
    render(<AppWithStartup startup={startupInSteps} />);
    await screen.findByTestId('editor');

    expect(editorListening).toBe(false);
  });

  it('runs the effects of content that an asynchronous startup put on screen', async () => {
    const ui = <AppWithStartup startup={startupInSteps} />;
    const view = render(ui);
    await screen.findByTestId('editor');

    settleRender(view, ui);

    expect(editorListening).toBe(true);
  });

  it('does the same for a startup step the test held back and then released', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const startup = async () => {
      await startupInSteps();
      await held;
    };
    const ui = <AppWithStartup startup={startup} />;
    const view = render(ui);
    expect(screen.queryByTestId('editor')).toBeNull();

    release();
    await screen.findByTestId('editor');
    settleRender(view, ui);

    expect(editorListening).toBe(true);
  });
});
