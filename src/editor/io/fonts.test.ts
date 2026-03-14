import { describe, expect, it } from 'vitest';

import { fontFamilyFromSourceName, loadBundledFonts } from './fonts';

describe('font helpers', () => {
  it('derives a readable font family from a source file name', () => {
    expect(fontFamilyFromSourceName('Acme-Sans_Bold.otf')).toBe('Acme Sans Bold');
  });

  it('returns an empty bundled-font list when no startup fonts are present', async () => {
    await expect(loadBundledFonts()).resolves.toEqual([]);
  });
});
