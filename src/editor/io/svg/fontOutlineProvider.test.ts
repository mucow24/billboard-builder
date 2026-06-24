import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createTextItem } from '../../document/documentDefaults';
import { fontVariantKey, resolveOutline } from './fontOutlineProvider';

function loadFont(file: string): ArrayBuffer {
  const buf = readFileSync(resolve('src/assets/fonts', file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('resolveOutline', () => {
  it('reports a system font as unvectorizable', () => {
    expect(resolveOutline('system', null)).toEqual({ ok: false, reason: 'system-font' });
  });

  it('reports an embeddable font with no bytes', () => {
    expect(resolveOutline('bundled', null)).toEqual({ ok: false, reason: 'no-bytes' });
  });

  it('reports unparseable bytes as parse-failed', () => {
    expect(resolveOutline('uploaded', new Uint8Array([1, 2, 3, 4]).buffer)).toEqual({
      ok: false,
      reason: 'parse-failed',
    });
  });

  it('resolves an outline font from valid bytes', () => {
    const result = resolveOutline('bundled', loadFont('Audiowide-Regular.ttf'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.font.glyphPath('A', 100, 0, 100)).toBeTruthy();
    }
  });
});

describe('fontVariantKey', () => {
  it('distinguishes family, weight and style', () => {
    expect(
      fontVariantKey(createTextItem({ fontFamily: 'Poster Sans', fontWeight: 'bold', fontStyle: 'italic' })),
    ).toBe('Poster Sans|bold|italic');
  });
});
