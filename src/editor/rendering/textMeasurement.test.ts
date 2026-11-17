import { describe, expect, it, vi } from 'vitest';

import { inkWidthOf, layoutWrappedText, measureWordWrappedTextHeight } from './textMeasurement';
import { createTextItem } from '../document/documentDefaults';

// Mirrors Pixi's CanvasTextMetrics._measureText: `boundsWidth =
// actualBoundingBoxRight + actualBoundingBoxLeft`, each counted as 0 when the
// browser does not report it. Pixi wraps and aligns by the larger of this and
// the advance width, so the layout and the SVG exporter need the same number.
describe('inkWidthOf', () => {
  it('adds how far the ink reaches left of the pen to how far it reaches right', () => {
    // A first glyph that starts 3px before the pen, ink ending 50px after it.
    expect(inkWidthOf({ actualBoundingBoxLeft: 3, actualBoundingBoxRight: 50 })).toBe(53);
  });

  it('leaves out the gap when the ink starts right of the pen', () => {
    // An ordinary left side bearing: the ink starts 2px after the pen.
    expect(inkWidthOf({ actualBoundingBoxLeft: -2, actualBoundingBoxRight: 48 })).toBe(46);
  });

  it('counts a bound the browser does not report as zero', () => {
    const metrics = {} as Pick<TextMetrics, 'actualBoundingBoxLeft' | 'actualBoundingBoxRight'>;
    expect(inkWidthOf(metrics)).toBe(0);
    expect(inkWidthOf({ ...metrics, actualBoundingBoxRight: 48 })).toBe(48);
  });
});

describe('layoutWrappedText', () => {
  // 10px a character, so widths can be read off the text.
  const lines = (text: string, contentWidth: number) =>
    layoutWrappedText(createTextItem({ text }), contentWidth, (token) => token.length * 10).map(
      (tokens) => tokens.join(''),
    );

  it('wraps at spaces', () => {
    expect(lines('alpha beta gamma', 110)).toEqual(['alpha beta ', 'gamma']);
  });

  const spacedLines = (text: string, letterSpacing: number, contentWidth: number) =>
    layoutWrappedText(createTextItem({ text, letterSpacing }), contentWidth, (token) => token.length * 10).map(
      (tokens) => tokens.join(''),
    );

  // Pixi adds letter spacing once per grapheme of a word. A family of joined
  // emoji is eight UTF-16 units but one grapheme: 80px here, with no spacing.
  it('counts the letter spacing of a word in graphemes', () => {
    const family = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);

    // "familyA" is 90px, the space 10px, the family 80px, and the line's four
    // graphemes have three spacings between them: 210px.
    expect(spacedLines(`${family}A ${family}`, 10, 210)).toEqual([`${family}A ${family}`]);
    expect(spacedLines(`${family}A ${family}`, 10, 209)).toEqual([`${family}A `, family]);
  });

  // Pixi lets a line run as wide as it is drawn: its characters plus the letter
  // spacing between every two of them, the ones on either side of a space too.
  // Counting the spacing inside each word only, the layout fitted lines up to one
  // spacing per word or space too wide: here "alpha beta gamma" stayed on one
  // line down to 270px, where the canvas wrapped it below 310px.
  it('fits a letter-spaced line as wide as the canvas draws it', () => {
    // 160px of characters and 15 spacings between 16 characters.
    expect(spacedLines('alpha beta gamma', 10, 310)).toEqual(['alpha beta gamma']);
    expect(spacedLines('alpha beta gamma', 10, 309)).toEqual(['alpha beta ', 'gamma']);
  });

  it('counts the letter spacing after every space of a run', () => {
    // 70px of characters and 6 spacings between 7 characters.
    expect(spacedLines('ab   cd', 10, 130)).toEqual(['ab   cd']);
    expect(spacedLines('ab   cd', 10, 129)).toEqual(['ab   ', 'cd']);
  });

  // Negative spacing pulls the characters together, and a line fits sooner.
  it('fits a line with negative letter spacing as wide as the canvas draws it', () => {
    // 160px of characters less 15 spacings of 2px.
    expect(spacedLines('alpha beta gamma', -2, 130)).toEqual(['alpha beta gamma']);
    expect(spacedLines('alpha beta gamma', -2, 129)).toEqual(['alpha beta ', 'gamma']);
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

  // A no-break space is no place to break a line to Pixi: it holds the words on
  // either side together, even where they are wider than the box together.
  // The layout used to break at every character JavaScript calls white space.
  it('keeps words joined by a no-break space on one line, as the canvas does', () => {
    const noBreakSpaces = [0x00a0, 0x2007, 0x202f].map((code) => String.fromCharCode(code));
    for (const space of noBreakSpaces) {
      expect(lines(`alpha${space}beta gamma`, 80)).toEqual([`alpha${space}beta `, 'gamma']);
    }
  });

  it('breaks at every space Pixi breaks at', () => {
    const spaces = [0x0009, 0x2002, 0x2009, 0x200a, 0x3000].map((code) => String.fromCharCode(code));
    for (const space of spaces) {
      expect(lines(`alpha${space}beta`, 70)).toEqual([`alpha${space}`, 'beta']);
    }
  });

  it('does not split at a hyphen that ends a word or stands alone', () => {
    expect(layoutWrappedText(createTextItem({ text: 'a- b - c' }), 1000, (token) => token.length)).toEqual([
      ['a-', ' ', 'b', ' ', '-', ' ', 'c'],
    ]);
  });

  // The canvas is given the text without them (see `drawnText`), so the lines
  // are measured and drawn without them too.
  it('lays out the text without emoji presentation selectors', () => {
    const heart = String.fromCodePoint(0x2764);
    const selector = String.fromCodePoint(0xfe0f);
    const measured: string[] = [];
    const laidOut = layoutWrappedText(createTextItem({ text: `I ${heart}${selector} NY` }), 1000, (token) => {
      measured.push(token);
      return token.length;
    });

    expect(laidOut).toEqual([['I', ' ', heart, ' ', 'NY']]);
    expect(measured.join('')).not.toContain(selector);
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

  // Pixi takes a word to be as wide as its ink where that reaches past its
  // advance, as an italic's last letter does. Here "leaf" advances 40px and its
  // ink is 46px wide: "leaf leaf" is 102px wide to Pixi, 90px by advance.
  it('wraps a word by its ink where that is wider than its advance', () => {
    const measureText = (text: string) => ({
      width: text.length * 10,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: text.length * 10 + (text.endsWith('f') ? 6 : 0),
    });
    const item = createTextItem({
      text: 'leaf leaf',
      fontSize: 10,
      lineHeight: 1,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    expect(withCanvasMeasurement(measureText, () => measureWordWrappedTextHeight(item, 102))).toBe(10);
    expect(withCanvasMeasurement(measureText, () => measureWordWrappedTextHeight(item, 101))).toBe(20);
  });
});

/** Runs `run` as in a browser whose canvas measures text with `measureText`. */
function withCanvasMeasurement<T>(measureText: (text: string) => Partial<TextMetrics>, run: () => T): T {
  const originalNavigator = globalThis.navigator;
  const originalCreateElement = document.createElement.bind(document);
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Mozilla/5.0' } });
  const createElement = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) =>
    tagName === 'canvas'
      ? ({ getContext: () => ({ font: '', measureText }) } as unknown as HTMLCanvasElement)
      : originalCreateElement(tagName)) as typeof document.createElement);
  try {
    return run();
  } finally {
    createElement.mockRestore();
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
  }
}
