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

// jsdom doesn't implement HTMLCanvasElement.getContext.  rasterCaps.ts probes
// for a WebGL context to discover MAX_TEXTURE_SIZE and already handles a null
// return, but jsdom's "not implemented" stub logs to stderr before throwing.
// Stub the method to return null so the probe falls through cleanly.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: () => null,
});

// Filter known-harmless React warnings caused by mocking @pixi/react.
// Production uses @pixi/react v8's lowercase JSX (<pixiContainer>, etc.) which
// is registered via extend().  Test mocks stub extend as a no-op, so React-DOM
// treats the tags as unknown HTML and complains about casing, unknown elements,
// and Pixi-specific props.  These never appear in production.
//
// Match the format string (args[0]) which contains %s placeholders before
// Node's util.format substitutes the prop/tag names — so the regexes need to
// be on the static text, not the resolved values.
const PIXI_MOCK_NOISE = [
  /is using incorrect casing\. Use PascalCase for React components/,
  /is unrecognized in this browser/,
  /React does not recognize the .+ prop on a DOM element/,
  /Invalid value for prop .+ on <.+> tag/,
];

// Only the eventMode / hitArea / draw props that flow from @pixi/react JSX.
// Restrict on the substituted arg so unrelated DOM prop typos still surface.
const PIXI_PROP_NAMES = new Set(['eventMode', 'hitArea', 'draw']);

const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const first = args[0];
  const message = typeof first === 'string' ? first : '';
  if (!PIXI_MOCK_NOISE.some((re) => re.test(message))) {
    originalConsoleError(...args);
    return;
  }
  // For prop-style messages, verify the substituted value is a known Pixi
  // prop name (or tag like 'pixi*') before suppressing.  Otherwise pass through.
  if (
    /React does not recognize the .+ prop on a DOM element/.test(message) ||
    /Invalid value for prop .+ on <.+> tag/.test(message)
  ) {
    const propName = typeof args[1] === 'string' ? args[1] : '';
    const tagName = typeof args[2] === 'string' ? args[2] : '';
    const isPixiProp = PIXI_PROP_NAMES.has(propName);
    const isPixiTag = tagName.startsWith('pixi') || propName.startsWith('pixi');
    if (!isPixiProp && !isPixiTag) {
      originalConsoleError(...args);
      return;
    }
  }
  // For casing / unrecognized-tag messages, verify the substituted tag starts
  // with "pixi".  Otherwise pass through.
  if (
    /is using incorrect casing\. Use PascalCase for React components/.test(message) ||
    /is unrecognized in this browser/.test(message)
  ) {
    const tagName = typeof args[1] === 'string' ? args[1] : '';
    if (!tagName.startsWith('pixi')) {
      originalConsoleError(...args);
      return;
    }
  }
};
