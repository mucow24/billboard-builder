import { describe, expect, it, vi } from 'vitest';

import { measureWordWrappedTextHeight } from './textMeasurement';
import { createTextItem } from '../document/documentDefaults';

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
    const canvasElement = document.createElement('canvas');
    void canvasElement;
    expect(height).toBeGreaterThan(item.height);

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  });


  it('measures wrapping against the inner content width after horizontal padding', () => {
    const text = 'One two three four five six seven eight nine ten eleven twelve.';
    const heightWithPadding = measureWordWrappedTextHeight(
      createTextItem({
        width: 320,
        height: 96,
        text,
        padding: { top: 0, right: 24, bottom: 0, left: 24 },
      }),
      120,
    );
    const heightWithoutPadding = measureWordWrappedTextHeight(
      createTextItem({
        width: 320,
        height: 96,
        text,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
      120,
    );

    expect(heightWithPadding).toBeGreaterThan(heightWithoutPadding);
  });

  it('adds vertical padding to the measured text height', () => {
    const text = 'alpha beta gamma delta epsilon zeta';
    const baseHeight = measureWordWrappedTextHeight(
      createTextItem({
        width: 320,
        height: 24,
        text,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
      120,
    );
    const paddedHeight = measureWordWrappedTextHeight(
      createTextItem({
        width: 320,
        height: 24,
        text,
        padding: { top: 12, right: 0, bottom: 18, left: 0 },
      }),
      120,
    );

    expect(paddedHeight).toBe(baseHeight + 30);
  });


  it('supports negative horizontal padding by widening the inner content width', () => {
    const text = 'One two three four five six seven eight nine ten eleven twelve.';
    const heightWithNegativePadding = measureWordWrappedTextHeight(
      createTextItem({
        width: 320,
        height: 96,
        text,
        padding: { top: 0, right: -24, bottom: 0, left: -24 },
      }),
      120,
    );
    const heightWithoutPadding = measureWordWrappedTextHeight(
      createTextItem({
        width: 320,
        height: 96,
        text,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
      120,
    );

    expect(heightWithNegativePadding).toBeLessThan(heightWithoutPadding);
  });

  it('supports negative vertical padding by reducing the measured total height', () => {
    const text = 'alpha beta gamma delta epsilon zeta';
    const baseHeight = measureWordWrappedTextHeight(
      createTextItem({
        width: 320,
        height: 24,
        text,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
      120,
    );
    const paddedHeight = measureWordWrappedTextHeight(
      createTextItem({
        width: 320,
        height: 24,
        text,
        padding: { top: -12, right: 0, bottom: -18, left: 0 },
      }),
      120,
    );

    expect(paddedHeight).toBe(baseHeight - 30);
  });

});
