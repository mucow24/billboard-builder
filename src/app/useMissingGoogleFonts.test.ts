import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentFontReference } from '../editor/document/documentTypes';
import { parseGoogleFontVariant } from '../editor/fonts/googleFonts/googleFontVariants';
import { useMissingGoogleFonts } from './useMissingGoogleFonts';

const { mockApiKey, mockLoadCatalog } = vi.hoisted(() => ({
  mockApiKey: vi.fn<() => string | null>(),
  mockLoadCatalog: vi.fn(),
}));

vi.mock('../editor/fonts/googleFonts/googleFontsApi', () => ({
  getGoogleFontsApiKey: mockApiKey,
  loadGoogleFontCatalog: mockLoadCatalog,
}));

function variants(...keys: string[]) {
  return keys.flatMap((key) => parseGoogleFontVariant(key) ?? []);
}

const CATALOG = [
  { family: 'Roboto', category: 'sans-serif', variants: variants('300', 'regular', '700') },
  { family: 'Lobster', category: 'display', variants: variants('regular') },
];

const NO_REFERENCES: DocumentFontReference[] = [];

function renderLookup(missingFontFamilies: string[], documentFonts = NO_REFERENCES) {
  const importGoogleFont = vi.fn().mockResolvedValue({ added: 1, failed: [] });
  const view = renderHook(
    (props: { missing: string[] }) =>
      useMissingGoogleFonts({ missingFontFamilies: props.missing, documentFonts, importGoogleFont }),
    { initialProps: { missing: missingFontFamilies } },
  );
  return { importGoogleFont, rerender: (missing: string[]) => view.rerender({ missing }) };
}

beforeEach(() => {
  mockApiKey.mockReset();
  mockApiKey.mockReturnValue('test-key');
  mockLoadCatalog.mockReset();
  mockLoadCatalog.mockResolvedValue(CATALOG);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('useMissingGoogleFonts', () => {
  it('asks nothing of Google while no font is missing', () => {
    const { importGoogleFont } = renderLookup([]);

    expect(mockLoadCatalog).not.toHaveBeenCalled();
    expect(importGoogleFont).not.toHaveBeenCalled();
  });

  it('does nothing in a build without a key', () => {
    mockApiKey.mockReturnValue(null);
    const { importGoogleFont } = renderLookup(['Roboto']);

    expect(mockLoadCatalog).not.toHaveBeenCalled();
    expect(importGoogleFont).not.toHaveBeenCalled();
  });

  it('imports the missing fonts that are Google fonts, and only those', async () => {
    const { importGoogleFont } = renderLookup(
      ['Roboto Light', 'Ghost Font', 'Lobster'],
      [{ family: 'Roboto Light', sourceName: 'Roboto-Light.ttf', kind: 'uploaded' }],
    );

    await waitFor(() => expect(importGoogleFont).toHaveBeenCalledTimes(2));
    expect(mockLoadCatalog).toHaveBeenCalledWith('test-key');
    expect(importGoogleFont.mock.calls).toEqual([
      [{ apiKey: 'test-key', family: 'Roboto', variants: variants('300') }],
      [{ apiKey: 'test-key', family: 'Lobster', variants: variants('regular') }],
    ]);
  });

  it('looks a missing font up once, however often the missing fonts are worked out', async () => {
    const { importGoogleFont, rerender } = renderLookup(['Ghost Font', 'Lobster']);
    await waitFor(() => expect(importGoogleFont).toHaveBeenCalledTimes(1));

    rerender(['Ghost Font', 'Lobster']);
    rerender(['Ghost Font', 'Lobster', 'Roboto']);

    await waitFor(() => expect(importGoogleFont).toHaveBeenCalledTimes(2));
    expect(mockLoadCatalog).toHaveBeenCalledTimes(2);
    expect(importGoogleFont.mock.calls[1][0]).toMatchObject({ family: 'Roboto' });
  });

  it('looks a font up again after Google could not be reached', async () => {
    mockLoadCatalog.mockRejectedValueOnce(new Error('Failed to fetch'));
    const { importGoogleFont, rerender } = renderLookup(['Lobster']);
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(importGoogleFont).not.toHaveBeenCalled();

    rerender(['Lobster']);

    await waitFor(() => expect(importGoogleFont).toHaveBeenCalledTimes(1));
  });

  it('fetches the other fonts when one cannot be fetched, and tries that one again later', async () => {
    const { importGoogleFont, rerender } = renderLookup(['Roboto', 'Lobster']);
    importGoogleFont.mockRejectedValueOnce(new Error('Google Fonts answered with an error (500).'));
    await waitFor(() => expect(importGoogleFont).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(console.warn).toHaveBeenCalled());

    rerender(['Roboto', 'Lobster']);

    await waitFor(() => expect(importGoogleFont).toHaveBeenCalledTimes(3));
    expect(importGoogleFont.mock.calls[2][0]).toMatchObject({ family: 'Roboto' });
  });
});
