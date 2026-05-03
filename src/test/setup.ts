import '@testing-library/jest-dom';
import { vi } from 'vitest';

class TestFontFace {
  family: string;
  source: string | ArrayBuffer;

  constructor(family: string, source: string | ArrayBuffer) {
    this.family = family;
    this.source = source;
  }

  async load() {
    return this;
  }
}

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: {
    add: vi.fn(),
  },
});

vi.stubGlobal('FontFace', TestFontFace);

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
});


class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): ResizeObserverEntry[] { return []; }
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = TestResizeObserver;
}

// Make requestAnimationFrame synchronous in tests so rAF-batched state
// updates (session, guides, crop-session) flush immediately within act().
// Returns null so that `rafRef.current = requestAnimationFrame(cb)` leaves
// the ref as null after the callback (which also sets it to null) runs.
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  cb(performance.now());
  return null;
});
vi.stubGlobal('cancelAnimationFrame', () => {});

// jsdom doesn't implement PointerEvent.  Production code listens for
// pointermove/pointerup on the window (the only events Chromium fires for
// CDP-driven middle-button gestures).  Fall back to a MouseEvent-derived
// shim so tests can dispatch pointer events without crashing.
if (typeof globalThis.PointerEvent === 'undefined') {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  globalThis.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
}
