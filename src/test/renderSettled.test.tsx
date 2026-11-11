import { act, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderSettled } from './renderSettled';

// Outside `act`, React runs the effects of a render in a task of its own, which
// its scheduler queues with `setImmediate`. `findBy...` resumes the test from a
// 0 ms timer. Either can come first; on a busy machine it is sometimes the
// timer. This file makes it the timer every time, by turning the scheduler's
// immediates into timers that are due much later. The scheduler picks up
// `setImmediate` when it is first loaded, which is after this hoisted block.
const { restoreSetImmediate } = vi.hoisted(() => {
  const original = globalThis.setImmediate;
  const afterPendingTimers = (callback: (...args: unknown[]) => void, ...args: unknown[]) =>
    setTimeout(callback, 50, ...args);
  globalThis.setImmediate = afterPendingTimers as unknown as typeof setImmediate;
  return {
    restoreSetImmediate: () => {
      globalThis.setImmediate = original;
    },
  };
});

afterAll(restoreSetImmediate);

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

describe('renderSettled', () => {
  beforeEach(() => {
    editorListening = false;
  });

  it('control: render + findBy returns before the effects when the timer wins', async () => {
    // Not a behaviour to rely on. It shows that the ordering forced above is
    // in effect, without which the tests below would prove nothing.
    render(<AppWithStartup startup={startupInSteps} />);
    await screen.findByTestId('editor');

    expect(editorListening).toBe(false);
  });

  it('returns once the content of an asynchronous startup is rendered and its effects have run', async () => {
    await renderSettled(<AppWithStartup startup={startupInSteps} />);

    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(editorListening).toBe(true);
  });

  it('leaves a held startup step to the test, which releases it inside act', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const startup = async () => {
      await startupInSteps();
      await held;
    };

    await renderSettled(<AppWithStartup startup={startup} />);
    expect(screen.queryByTestId('editor')).toBeNull();

    await act(async () => {
      release();
    });
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(editorListening).toBe(true);
  });
});
