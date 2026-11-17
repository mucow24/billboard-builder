import { describe, expect, it } from 'vitest';

import { parseRichText } from '../document/richText';
import { layoutRichText } from './richTextLayout';

// Every character 10 wide, bold ones 12.
const measure = (text: string, run: { bold: boolean }) => text.length * (run.bold ? 12 : 10);

const layout = (text: string, width: number, letterSpacing = 0) =>
  layoutRichText(parseRichText(text).runs, width, letterSpacing, measure).map((line) => ({
    width: line.width,
    fragments: line.fragments.map(({ text: fragment, x, width: w }) => [fragment, x, w]),
  }));

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
});
