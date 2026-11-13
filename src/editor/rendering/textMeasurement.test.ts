import { describe, expect, it, vi } from 'vitest';

import { layoutWrappedText, measureWordWrappedTextHeight } from './textMeasurement';
import { createTextItem } from '../document/documentDefaults';

describe('layoutWrappedText', () => {
  // 10px a character, so widths can be read off the text.
  const lines = (text: string, contentWidth: number) =>
    layoutWrappedText(createTextItem({ text }), contentWidth, (token) => token.length * 10).map(
      (tokens) => tokens.join(''),
    );

  it('wraps at spaces', () => {
    expect(lines('alpha beta gamma', 110)).toEqual(['alpha beta ', 'gamma']);
  });

  // Pixi ends a line after a hyphen or dash inside a word. Without this the
  // canvas showed "Double-" / "click to" / "edit" where two lines were counted.
  it('wraps after a hyphen inside a word, as the canvas does', () => {
    expect(lines('Double-click to edit', 90)).toEqual(['Double-', 'click to ', 'edit']);
  });

  it('keeps a hyphenated word together while it fits', () => {
    expect(lines('Double-click to edit', 130)).toEqual(['Double-click ', 'to edit']);
  });

  it('wraps after en and em dashes and soft hyphens too', () => {
    const dashes = [0x2010, 0x2013, 0x2014, 0x00ad].map((code) => String.fromCharCode(code));
    for (const dash of dashes) {
      expect(lines(`alpha${dash}beta`, 70)).toEqual([`alpha${dash}`, 'beta']);
    }
  });

  it('does not split at a hyphen that ends a word or stands alone', () => {
    expect(layoutWrappedText(createTextItem({ text: 'a- b - c' }), 1000, (token) => token.length)).toEqual([
      ['a-', ' ', 'b', ' ', '-', ' ', 'c'],
    ]);
  });
});

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
