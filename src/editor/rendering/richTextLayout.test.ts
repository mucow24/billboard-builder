import { describe, expect, it } from 'vitest';

import { createTextItem } from '../document/documentDefaults';
import { parseRichText } from '../document/richText';
import { layoutRichText } from './richTextLayout';
import { BREAKING_SPACES } from './textLineBreaking';
import { layoutWrappedText } from './textMeasurement';

// Every character 10 wide, bold ones 12, with ink no wider.
const measure = (text: string, run: { bold: boolean }) => ({ advance: text.length * (run.bold ? 12 : 10), ink: 0 });

const layout = (text: string, width: number, letterSpacing = 0) =>
  layoutRichText(parseRichText(text).runs, width, letterSpacing, measure).map((line) => ({
    width: line.width,
    fragments: line.fragments.map(({ text: fragment, x, width: w }) => [fragment, x, w]),
  }));

/** The text of each line, its fragments joined. */
const lineTexts = (
  text: string,
  width: number,
  measureWith: Parameters<typeof layoutRichText>[3] = measure,
  letterSpacing = 0,
) =>
  layoutRichText(parseRichText(text).runs, width, letterSpacing, measureWith).map((line) =>
    line.fragments.map((fragment) => fragment.text).join(''),
  );

const code = (value: number) => String.fromCharCode(value);
const NO_BREAK_SPACE = code(0x00a0);

describe('layoutRichText', () => {
  it('places the fragments of a line one after another', () => {
    expect(layout('ab <b>cd</b> ef', 1000)).toEqual([
      { width: 84, fragments: [['ab ', 0, 30], ['cd', 30, 24], [' ef', 54, 30]] },
    ]);
  });

  it('wraps at spaces and drops the spaces a line ends in', () => {
    expect(layout('aaaa <b>bbbb</b> cccc', 100)).toEqual([
      { width: 98, fragments: [['aaaa ', 0, 50], ['bbbb', 50, 48]] },
      { width: 40, fragments: [['cccc', 0, 40]] },
    ]);
  });

  it('splits a run that wraps into one fragment per line', () => {
    expect(layout('<b>aaaa bbbb</b>', 60)).toEqual([
      { width: 48, fragments: [['aaaa', 0, 48]] },
      { width: 48, fragments: [['bbbb', 0, 48]] },
    ]);
  });

  it('keeps a word that changes style in one piece', () => {
    expect(layout('aaaa un<b>real</b>', 100)).toEqual([
      { width: 40, fragments: [['aaaa', 0, 40]] },
      { width: 68, fragments: [['un', 0, 20], ['real', 20, 48]] },
    ]);
  });

  it('may break after a hyphen, also where the style changes there', () => {
    expect(layout('aaaa-<b>bbbb</b>', 60)).toEqual([
      { width: 50, fragments: [['aaaa-', 0, 50]] },
      { width: 48, fragments: [['bbbb', 0, 48]] },
    ]);
  });

  it('starts a line at each line break, empty ones included', () => {
    expect(layout('a\n\n<b>b\nc</b>', 1000)).toEqual([
      { width: 10, fragments: [['a', 0, 10]] },
      { width: 0, fragments: [] },
      { width: 12, fragments: [['b', 0, 12]] },
      { width: 12, fragments: [['c', 0, 12]] },
    ]);
  });

  it('puts letter spacing between characters and between fragments', () => {
    expect(layout('ab<b>cd</b>', 1000, 5)).toEqual([
      { width: 59, fragments: [['ab', 0, 25], ['cd', 30, 29]] },
    ]);
  });

  // Tags that change no widths must not move a line break: the wrap rule is
  // Pixi's whether a line is one run or several.
  it.each([0, 3, -1])('breaks lines the same with and without colour tags at letter spacing %d', (letterSpacing) => {
    const words = 'aaaa bb cccccc d eee-ffff gg  hhh iiiiiiiii jj';
    const tagged =
      '<color=#f00>aaaa</color> bb <color=#0f0>cccccc d</color> eee-<color=#00f>ffff gg</color>  hhh <color=#f00>iiiiiiiii</color> jj';
    const linesOf = (text: string, width: number) =>
      layoutRichText(parseRichText(text).runs, width, letterSpacing, measure).map((line) => ({
        text: line.fragments.map((fragment) => fragment.text).join(''),
        width: line.width,
      }));

    for (let width = 30; width <= 480; width += 7) {
      expect(linesOf(tagged, width), `at width ${width}`).toEqual(linesOf(words, width));
    }
  });

  it('lets a word wider than the box overflow on a line of its own', () => {
    expect(layout('a bbbbbbbb c', 50)).toEqual([
      { width: 10, fragments: [['a', 0, 10]] },
      { width: 80, fragments: [['bbbbbbbb', 0, 80]] },
      { width: 10, fragments: [['c', 0, 10]] },
    ]);
  });

  // Each case below is one where the layout used to differ from Pixi's, and so
  // tagging a text re-wrapped it.

  it('does not break at a no-break space', () => {
    expect(lineTexts(`<color=#f00>alpha</color>${NO_BREAK_SPACE}beta gamma`, 80)).toEqual([
      `alpha${NO_BREAK_SPACE}beta`,
      'gamma',
    ]);
  });

  it('starts a new line at a carriage return, and at a CR LF split by a tag only once', () => {
    expect(lineTexts('<color=#f00>alpha</color>\rbeta', 1000)).toEqual(['alpha', 'beta']);
    expect(lineTexts('alpha<color=#f00>\r</color>\nbeta', 1000)).toEqual(['alpha', 'beta']);
  });

  it('starts an empty line at a line break after a word wider than the box, as Pixi does', () => {
    expect(lineTexts('<color=#f00>aaaaaaa</color>\nbb', 40)).toEqual(['aaaaaaa', '', 'bb']);
  });

  it('keeps a blank line after a line break that ends the text, as plain text does', () => {
    expect(lineTexts('<b>alpha</b>\n', 1000)).toEqual(['alpha', '']);
    expect(lineTexts('<b>alpha</b>\n   ', 1000)).toEqual(['alpha', '']);
  });

  // 10px a character, bold ones 12; a word ending in "f" leans 6px past its advance.
  const leaningMeasure = (text: string, run: { bold: boolean }) => {
    const advance = text.length * (run.bold ? 12 : 10);
    return { advance, ink: text.trim().length === 0 ? 0 : advance + (text.endsWith('f') ? 6 : 0) };
  };

  it('wraps a word by its ink where its last letter leans past its advance', () => {
    // "aaf" takes up 36: its ink. The line is 36 + 10 + 36 = 82.
    expect(lineTexts('<color=#f00>aaf</color> aaf', 82, leaningMeasure)).toEqual(['aaf aaf']);
    expect(lineTexts('<color=#f00>aaf</color> aaf', 81, leaningMeasure)).toEqual(['aaf', 'aaf']);
  });

  it('measures a word that changes font part-way by the advance of its pieces and the ink of its last', () => {
    // "x " is 20; "aa" advances 20 and a bold "f" takes up its ink, 12 + 6.
    expect(lineTexts('x aa<b>f</b>', 58, leaningMeasure)).toEqual(['x aaf']);
    expect(lineTexts('x aa<b>f</b>', 57, leaningMeasure)).toEqual(['x', 'aaf']);
  });
});

// Tagging a text must not re-wrap it. Lay out random texts with colour tags at
// random places, which change no widths, and expect the lines of the same text
// without tags: the lines `layoutWrappedText` gives, which a test in
// `textMeasurement.test.ts` checks against Pixi's own `wordWrap`.
describe('layoutRichText against the same text without tags', () => {
  // The fake font of that test: advances by character, 10px for any other.
  const advances = new Map([
    ['a', 10],
    ['f', 9],
    ['W', 18],
    ['-', 6],
    [' ', 5],
    [NO_BREAK_SPACE, 5],
    [code(0x0009), 20], // tab
    [code(0x2009), 2], // thin space
  ]);
  const advance = (text: string) => [...text].reduce((sum, char) => sum + (advances.get(char) ?? 10), 0);
  // No ink for spaces; an "f" at the end leans 6px past its advance; other
  // glyphs start 1px after the pen, except a "W", which starts at it.
  const ink = (text: string) =>
    text.trim().length === 0 ? 0 : advance(text) + (text.endsWith('f') ? 6 : 0) - (text.startsWith('W') ? 0 : 1);
  const widths = (text: string) => ({ advance: advance(text), ink: ink(text) });

  const trimRight = (line: string) => {
    let end = line.length;
    while (end > 0 && BREAKING_SPACES.has(line.charCodeAt(end - 1))) end -= 1;
    return line.slice(0, end);
  };

  it('breaks random texts with colour tags into the lines it breaks them into without', () => {
    const alphabet = ['a', 'a', 'a', 'f', 'W', '-', ' ', ' ', code(0x0009), code(0x2009), NO_BREAK_SPACE, '\n', '\r'];
    let seed = 20261117;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pick = <T,>(values: readonly T[]) => values[Math.floor(random() * values.length)];

    const mismatches: { tagged: string; width: number; letterSpacing: number; plain: string[]; rich: string[] }[] = [];
    for (let run = 0; run < 3000; run += 1) {
      const length = 1 + Math.floor(random() * 25);
      const characters = Array.from({ length }, () => pick(alphabet));
      // Colour some stretches, anywhere: inside words, around spaces and line breaks.
      let tagged = '';
      let open = false;
      for (const character of characters) {
        if (random() < 0.3) {
          tagged += open ? '</color>' : `<color=${pick(['#f00', '#0f0', '#00f'])}>`;
          open = !open;
        }
        tagged += character;
      }
      if (open) tagged += '</color>';
      const text = characters.join('');
      const width = 20 + Math.floor(random() * 121);
      const letterSpacing = pick([0, 3, -2, 8]);

      const plain = layoutWrappedText(createTextItem({ text, letterSpacing }), width, widths).map((tokens) =>
        trimRight(tokens.join('')),
      );
      const rich = lineTexts(tagged, width, (piece) => widths(piece), letterSpacing);
      if (plain.length !== rich.length || plain.some((line, index) => line !== rich[index])) {
        mismatches.push({ tagged, width, letterSpacing, plain, rich });
      }
    }

    expect(mismatches.slice(0, 3)).toEqual([]);
    expect(mismatches).toHaveLength(0);
  });
});
