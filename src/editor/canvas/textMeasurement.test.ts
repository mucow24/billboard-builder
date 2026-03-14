import { describe, expect, it, vi } from 'vitest';

import { measureWordWrappedTextHeight } from './textMeasurement';
import { createTextItem } from '../model/defaults';

describe('text measurement', () => {
  it('uses the jsdom fallback estimator when canvas measurement is unavailable', () => {
    const item = createTextItem({
      width: 320,
      height: 96,
      text: 'One two three four five six seven eight nine ten eleven twelve.',
    });

    const height = measureWordWrappedTextHeight(item, 120);

    expect(height).toBeGreaterThan(item.height);
  });

  it('uses canvas measurement when a browser-like canvas context is available', () => {
    const item = createTextItem({
      width: 320,
      height: 96,
      text: 'alpha beta gamma delta epsilon zeta',
    });
    const originalNavigator = globalThis.navigator;
    const originalCreateElement = document.createElement.bind(document);
    const measureText = vi.fn((text: string) => ({ width: text.length * 14 }));

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        userAgent: 'Mozilla/5.0',
      },
    });
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          getContext: () => ({
            font: '',
            measureText,
          }),
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    }) as typeof document.createElement);

    const height = measureWordWrappedTextHeight(item, 120);

    expect(measureText).toHaveBeenCalled();
    expect(height).toBeGreaterThan(item.height);

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  });
});
