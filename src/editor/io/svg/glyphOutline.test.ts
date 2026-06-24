// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseOutlineFont } from './glyphOutline';

function loadFont(file: string): ArrayBuffer {
  const buf = readFileSync(resolve('src/assets/fonts', file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('parseOutlineFont', () => {
  it('extracts a non-empty glyph contour from a TrueType font', () => {
    const font = parseOutlineFont(loadFont('Audiowide-Regular.ttf'));
    expect(font).not.toBeNull();
    const d = font!.glyphPath('A', 100, 0, 100);
    expect(d).toBeTruthy();
    expect(d!.startsWith('M')).toBe(true);
  });

  it('parses an OTF/CFF font and outlines a glyph', () => {
    const font = parseOutlineFont(loadFont('Azonix.otf'));
    expect(font).not.toBeNull();
    expect(font!.glyphPath('A', 100, 0, 100)).toBeTruthy();
  });

  it('returns a stable golden contour for a known glyph (catches shape regressions)', () => {
    const font = parseOutlineFont(loadFont('Audiowide-Regular.ttf'));
    expect(font!.glyphPath('A', 100, 0, 100)).toMatchSnapshot();
  });

  it('returns null for unparseable bytes instead of throwing', () => {
    expect(parseOutlineFont(new Uint8Array([1, 2, 3, 4]).buffer)).toBeNull();
  });

  it('reports a positive unitsPerEm', () => {
    const font = parseOutlineFont(loadFont('Audiowide-Regular.ttf'));
    expect(font!.unitsPerEm).toBeGreaterThan(0);
  });
});
