import { NEWLINE_MATCH_REGEX, wordWrap, type ICanvas, type TextStyle } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import { graphemes } from './graphemes';
import { BREAKING_SPACES } from './textLineBreaking';
import {
  inkWidthOf,
  layoutWrappedText,
  measureWordWrappedTextHeight,
  wrapLikePixi,
} from './textMeasurement';
import { createTextItem } from '../document/documentDefaults';

// `wrapLikePixi` is a port of Pixi's `wordWrap`, for the style PixiItemLayer
// draws text with (`whiteSpace: 'pre'`, no `breakWords`). Run both on the same
// few thousand random texts, measured with the same fake font, and expect the
// same lines. This catches a difference in the port, a change of that style
// that the port does not follow, and a change in `wordWrap` on a Pixi upgrade.
// (`layoutWrappedText` adds one line on purpose; see its own tests.)
describe("wrapLikePixi against Pixi's own wordWrap", () => {
  const code = (value: number) => String.fromCharCode(value);
  // Advance widths of a fake font by character; 10px for any other.
  const advances = new Map([
    ['a', 10],
    ['f', 9],
    ['W', 18],
    ['-', 6],
    [' ', 5],
    [code(0x00a0), 5], // no-break space
    [code(0x0009), 20], // tab
    [code(0x2009), 2], // thin space
  ]);
  const advance = (text: string) => [...text].reduce((sum, char) => sum + (advances.get(char) ?? 10), 0);
  // Its ink: none for spaces; an "f" at the end leans 6px past its advance;
  // other glyphs start 1px after the pen, except a "W", which starts at it.
  const ink = (text: string) =>
    text.trim().length === 0 ? 0 : advance(text) + (text.endsWith('f') ? 6 : 0) - (text.startsWith('W') ? 0 : 1);

  // How Pixi measures a token for `wordWrap`: `CanvasTextMetrics._measureText`,
  // without the browser's own letter spacing.
  const pixiMeasure = (text: string, letterSpacing: number) => {
    let advanceWidth = advance(text);
    let inkWidth = ink(text);
    if (advanceWidth > 0) {
      const between = (graphemes(text).length - 1) * letterSpacing;
      advanceWidth += between;
      inkWidth += between;
    }
    return Math.max(advanceWidth, inkWidth);
  };
  const pixiLines = (text: string, wrapWidth: number, letterSpacing: number) =>
    wordWrap(
      text,
      { letterSpacing, whiteSpace: 'pre', wordWrapWidth: wrapWidth, breakWords: false, _fontString: '' } as unknown as TextStyle,
      { getContext: () => ({ font: '' }) } as unknown as ICanvas,
      pixiMeasure,
      (_token, breakWords) => breakWords,
      () => true,
      graphemes,
    ).split(NEWLINE_MATCH_REGEX);

  // Pixi takes the spaces off the end of each line; the port leaves that to its callers.
  const trimRight = (line: string) => {
    let end = line.length;
    while (end > 0 && BREAKING_SPACES.has(line.charCodeAt(end - 1))) end -= 1;
    return line.slice(0, end);
  };
  const portLines = (text: string, wrapWidth: number, letterSpacing: number) =>
    wrapLikePixi(createTextItem({ text, letterSpacing }), wrapWidth, (token) => ({
      advance: advance(token),
      ink: ink(token),
    })).lines.map((tokens) => trimRight(tokens.join('')));

  it('breaks random texts into the lines Pixi breaks them into', () => {
    // Words, hyphens, the spaces Pixi breaks at and one it does not, line feeds
    // and carriage returns; "a" and the space more often than the rest.
    const alphabet = ['a', 'a', 'a', 'f', 'W', '-', ' ', ' ', code(0x0009), code(0x2009), code(0x00a0), code(0x000a), code(0x000d)];
    let seed = 20261117;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pick = <T,>(values: readonly T[]) => values[Math.floor(random() * values.length)];

    const mismatches: { text: string; wrapWidth: number; letterSpacing: number; pixi: string[]; port: string[] }[] = [];
    for (let run = 0; run < 4000; run += 1) {
      const length = 1 + Math.floor(random() * 25);
      const text = Array.from({ length }, () => pick(alphabet)).join('');
      const wrapWidth = 20 + Math.floor(random() * 121);
      const letterSpacing = pick([0, 3, -2, 8]);
      const pixi = pixiLines(text, wrapWidth, letterSpacing);
      const port = portLines(text, wrapWidth, letterSpacing);
      if (pixi.length !== port.length || pixi.some((line, index) => line !== port[index])) {
        mismatches.push({ text, wrapWidth, letterSpacing, pixi, port });
      }
    }

    expect(mismatches.slice(0, 3)).toEqual([]);
    expect(mismatches).toHaveLength(0);
  });
});

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
  // 10px a character, so widths can be read off the text, and ink no wider.
  const tenPerCharacter = (token: string) => ({ advance: token.length * 10, ink: 0 });
  const lines = (text: string, contentWidth: number) =>
    layoutWrappedText(createTextItem({ text }), contentWidth, tenPerCharacter).map((tokens) => tokens.join(''));

  it('wraps at spaces', () => {
    expect(lines('alpha beta gamma', 110)).toEqual(['alpha beta ', 'gamma']);
  });

  const spacedLines = (text: string, letterSpacing: number, contentWidth: number) =>
    layoutWrappedText(createTextItem({ text, letterSpacing }), contentWidth, tenPerCharacter).map((tokens) =>
      tokens.join(''),
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
  // (The space after the joined words would start the next line, so it goes.)
  it('keeps words joined by a no-break space on one line, as the canvas does', () => {
    const noBreakSpaces = [0x00a0, 0x2007, 0x202f].map((code) => String.fromCharCode(code));
    for (const space of noBreakSpaces) {
      expect(lines(`alpha${space}beta gamma`, 80)).toEqual([`alpha${space}beta`, 'gamma']);
    }
  });

  // A word wider than the box gets a line of its own, and Pixi then starts the
  // next line as one that wrapping started: a line break right after the word
  // ends that still empty line, so the canvas shows an empty line between.
  it('starts an empty line after a word wider than the box when a line break follows', () => {
    const LF = String.fromCharCode(10);
    expect(lines(`aaaaaaa${LF}bb`, 40)).toEqual(['aaaaaaa', '', 'bb']);
    expect(lines(`aa aaaaaaa bb`, 40)).toEqual(['aa ', 'aaaaaaa', 'bb']);
  });

  // The same where spaces run past the box: the space that does not fit ends
  // the line, the spaces after it are dropped, and a line break then ends an
  // empty line.
  it('starts an empty line after spaces that run past the box when a line break follows', () => {
    const LF = String.fromCharCode(10);
    expect(lines(`aaa   ${LF}bb`, 40)).toEqual(['aaa ', '', 'bb']);
    expect(lines(`aaa   bb`, 40)).toEqual(['aaa ', 'bb']);
  });

  it('breaks at every space Pixi breaks at', () => {
    const spaces = [0x0009, 0x2002, 0x2009, 0x200a, 0x3000].map((code) => String.fromCharCode(code));
    for (const space of spaces) {
      expect(lines(`alpha${space}beta`, 70)).toEqual([`alpha${space}`, 'beta']);
    }
  });

  // Pixi starts a new line at a carriage return as at a line feed, and takes a
  // carriage return followed by a line feed as one break. The layout used to
  // break at line feeds only, so a lone carriage return stayed inside the line.
  it('starts a new line at a carriage return, as the canvas does', () => {
    const CR = String.fromCharCode(13);
    const LF = String.fromCharCode(10);
    expect(lines(`alpha${CR}beta`, 1000)).toEqual(['alpha', 'beta']);
    expect(lines(`alpha${CR}${LF}beta`, 1000)).toEqual(['alpha', 'beta']);
    expect(lines(`alpha${CR}${CR}beta`, 1000)).toEqual(['alpha', '', 'beta']);
    expect(lines(`alpha${LF}${CR}beta`, 1000)).toEqual(['alpha', '', 'beta']);
  });

  // Pixi leaves out a last line with nothing on it but spaces, so it draws no
  // line after a line break at the end of a text. The layout keeps one there on
  // purpose: a blank line that the text's height counts, so text that ends in a
  // line break is placed as it always was.
  it('keeps a blank line after a line break at the end of the text, which the canvas does not draw', () => {
    const CR = String.fromCharCode(13);
    const LF = String.fromCharCode(10);
    expect(lines(`alpha${LF}`, 1000)).toEqual(['alpha', '']);
    expect(lines(`alpha${CR}`, 1000)).toEqual(['alpha', '']);
    expect(lines(`alpha${CR}${LF}`, 1000)).toEqual(['alpha', '']);
    expect(lines(`alpha${LF}   `, 1000)).toEqual(['alpha', '   ']);
    expect(lines(`alpha${LF}${LF}`, 1000)).toEqual(['alpha', '', '']);
    expect(lines(`alpha${LF}${LF}beta`, 1000)).toEqual(['alpha', '', 'beta']);
    // Spaces that run past the box already end a line of their own; no more.
    expect(lines(`alpha${LF}${' '.repeat(12)}`, 100)).toEqual(['alpha', ' '.repeat(10)]);

    // What Pixi draws, for comparison.
    const pixi = (text: string) =>
      wrapLikePixi(createTextItem({ text }), 1000, tenPerCharacter).lines.map((tokens) => tokens.join(''));
    expect(pixi(`alpha${LF}`)).toEqual(['alpha']);
    expect(pixi(`alpha${LF}${LF}`)).toEqual(['alpha', '']);
  });

  it('keeps one line for a text with nothing to draw', () => {
    expect(lines('', 1000)).toEqual(['']);
    expect(lines('   ', 1000)).toEqual(['']);
    // A line break alone is a line and the blank line after it.
    expect(lines(String.fromCharCode(10), 1000)).toEqual(['', '']);
  });

  it('does not split at a hyphen that ends a word or stands alone', () => {
    expect(layoutWrappedText(createTextItem({ text: 'a- b - c' }), 1000, tenPerCharacter)).toEqual([
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
      return tenPerCharacter(token);
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

  it('counts a line for every line break in the fallback estimate, carriage returns included', () => {
    const CR = String.fromCharCode(13);
    const LF = String.fromCharCode(10);
    const heightOf = (text: string) =>
      measureWordWrappedTextHeight(
        createTextItem({ text, height: 1, fontSize: 10, lineHeight: 1, padding: { top: 0, right: 0, bottom: 0, left: 0 } }),
        320,
      );

    expect(heightOf(`a${CR}b`)).toBe(20);
    expect(heightOf(`a${CR}${LF}b`)).toBe(20);
    expect(heightOf(`a${CR}${CR}b`)).toBe(30);
    // Like the layout, a line after a line break that ends the text.
    expect(heightOf(`a${LF}`)).toBe(20);
    expect(heightOf(`a${CR}${LF}  `)).toBe(20);
    expect(heightOf(`a${LF}${LF}`)).toBe(30);
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

  // The canvas draws no line after a line break that ends the text, but the
  // height that places middle- and bottom-aligned text counts a blank one (see
  // `layoutWrappedText`), a carriage return's as a line feed's.
  it('counts a blank line after a line break at the end of the text', () => {
    const measureText = (text: string) => ({ width: text.length * 10 });
    const heightOf = (text: string) =>
      withCanvasMeasurement(measureText, () =>
        measureWordWrappedTextHeight(
          createTextItem({ text, fontSize: 10, lineHeight: 1, padding: { top: 0, right: 0, bottom: 0, left: 0 } }),
          320,
        ),
      );

    expect(heightOf('alpha')).toBe(10);
    expect(heightOf(`alpha${String.fromCharCode(10)}`)).toBe(20);
    expect(heightOf(`alpha${String.fromCharCode(13)}`)).toBe(20);
    expect(heightOf(`alpha${String.fromCharCode(10)}beta`)).toBe(20);
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
