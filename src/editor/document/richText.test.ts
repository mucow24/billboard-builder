import { describe, expect, it } from 'vitest';

import { parseRichText, parseRichTextColor } from './richText';

const run = (text: string, overrides: object = {}) => ({
  text,
  bold: false,
  italic: false,
  paint: null,
  ...overrides,
});

describe('parseRichTextColor', () => {
  it.each([
    ['#F00', '#ff0000'],
    ['#f008', '#ff000088'],
    ['#FF8800', '#ff8800'],
    ['#FF880080', '#ff880080'],
    ['Red', '#ff0000'],
    ['rebeccapurple', '#663399'],
    ['transparent', '#00000000'],
  ])('reads %s as %s', (value, expected) => {
    expect(parseRichTextColor(value)).toBe(expected);
  });

  it.each(['#ff', '#fffff', '#ggg', 'nosuchcolour', '', 'constructor'])('rejects %j', (value) => {
    expect(parseRichTextColor(value)).toBeNull();
  });
});

describe('parseRichText', () => {
  it('leaves text without tags alone', () => {
    expect(parseRichText('a < b, <3, <blink>x</blink>')).toEqual({
      runs: [run('a < b, <3, <blink>x</blink>')],
      plain: 'a < b, <3, <blink>x</blink>',
      hasMarkup: false,
    });
  });

  it('reads bold, italic and colour', () => {
    const parsed = parseRichText('<color=red>RED</color> <b>bold</b> <I>it</I>');
    expect(parsed.hasMarkup).toBe(true);
    expect(parsed.plain).toBe('RED bold it');
    expect(parsed.runs).toEqual([
      run('RED', { paint: { kind: 'color', color: '#ff0000' } }),
      run(' '),
      run('bold', { bold: true }),
      run(' '),
      run('it', { italic: true }),
    ]);
  });

  it('nests tags, the innermost paint winning', () => {
    const parsed = parseRichText('<b><color=#00f>a<color=#0f0>b</color>c</color></b>');
    expect(parsed.runs).toEqual([
      run('a', { bold: true, paint: { kind: 'color', color: '#0000ff' } }),
      run('b', { bold: true, paint: { kind: 'color', color: '#00ff00' } }),
      run('c', { bold: true, paint: { kind: 'color', color: '#0000ff' } }),
    ]);
  });

  it('reads a gradient, with angle 0 unless one is given', () => {
    expect(parseRichText('<gradient start=#F00 end=#FFF>x</gradient>').runs).toEqual([
      run('x', { paint: { kind: 'gradient', start: '#ff0000', end: '#ffffff', angle: 0 } }),
    ]);
    expect(parseRichText('<gradient end = white angle=90 start=red>x</gradient>').runs).toEqual([
      run('x', { paint: { kind: 'gradient', start: '#ff0000', end: '#ffffff', angle: 90 } }),
    ]);
  });

  it.each([
    '<gradient start=#F00>x</gradient>',
    '<gradient start=#F00 end=#FFF angle=up>x</gradient>',
    '<gradient start=#F00 end=#FFF middle=#000>x</gradient>',
    '<color=nosuchcolour>x</color>',
    '<color>x</color>',
    '<b bold>x</b>',
  ])('shows the malformed tags of %j as typed', (text) => {
    expect(parseRichText(text)).toEqual({ runs: [run(text)], plain: text, hasMarkup: false });
  });

  it('runs an unclosed tag to the end of the text', () => {
    expect(parseRichText('a <b>bc').runs).toEqual([run('a '), run('bc', { bold: true })]);
  });

  it('shows a closing tag with nothing to close as typed', () => {
    expect(parseRichText('a</b> <i>c</i>').runs).toEqual([run('a</b> '), run('c', { italic: true })]);
  });

  it('closes only the tag a closing tag names, leaving tags opened inside it open', () => {
    expect(parseRichText('<b>a<i>b</b>c</i>d').runs).toEqual([
      run('a', { bold: true }),
      run('b', { bold: true, italic: true }),
      run('c', { italic: true }),
      run('d'),
    ]);
  });

  it('falls back to the paint still open when an overlapping one closes', () => {
    expect(parseRichText('<color=#f00>a<color=#00f>b</color>c</color>d').runs).toEqual([
      run('a', { paint: { kind: 'color', color: '#ff0000' } }),
      run('b', { paint: { kind: 'color', color: '#0000ff' } }),
      run('c', { paint: { kind: 'color', color: '#ff0000' } }),
      run('d'),
    ]);
    expect(parseRichText('<color=#f00>a<gradient start=#0f0 end=#00f>b</color>c</gradient>d').runs).toEqual([
      run('a', { paint: { kind: 'color', color: '#ff0000' } }),
      // The gradient stays open across the colour's closing tag: one run.
      run('bc', { paint: { kind: 'gradient', start: '#00ff00', end: '#0000ff', angle: 0 } }),
      run('d'),
    ]);
  });

  it('closes the inner of two open tags of one name first', () => {
    expect(parseRichText('<b>a<b>b</b>c</b>d').runs).toEqual([run('abc', { bold: true }), run('d')]);
  });

  it('keeps a "<" that starts no tag while reading the tags after it', () => {
    expect(parseRichText('1 < 2 <b>yes</b>').runs).toEqual([run('1 < 2 '), run('yes', { bold: true })]);
  });

  it('shows the contents of noparse as typed', () => {
    const parsed = parseRichText('<b>x</b> <noparse><b>y</b></noparse> <NoParse>open <i>z');
    expect(parsed.plain).toBe('x <b>y</b> open <i>z');
    expect(parsed.runs).toEqual([run('x', { bold: true }), run(' <b>y</b> open <i>z')]);
  });

  it('counts a lone noparse as markup', () => {
    expect(parseRichText('<noparse><b></noparse>')).toEqual({
      runs: [run('<b>')],
      plain: '<b>',
      hasMarkup: true,
    });
  });
});
