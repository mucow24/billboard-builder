import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchGoogleFontCatalog,
  fetchGoogleFontFiles,
  getGoogleFontsApiKey,
  loadGoogleFontCatalog,
  resetGoogleFontCatalog,
} from './googleFontsApi';

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function requestedUrl(call = 0) {
  return new URL(String(fetchMock.mock.calls[call][0]));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  resetGoogleFontCatalog();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getGoogleFontsApiKey', () => {
  it('is the key the build was given', () => {
    vi.stubEnv('VITE_GOOGLE_FONTS_API_KEY', '  test-key ');

    expect(getGoogleFontsApiKey()).toBe('test-key');
  });

  it('is null for a build without one', () => {
    vi.stubEnv('VITE_GOOGLE_FONTS_API_KEY', '');

    expect(getGoogleFontsApiKey()).toBeNull();
  });
});

describe('fetchGoogleFontCatalog', () => {
  it('asks for every family by popularity, and reads their styles', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [
          { family: 'Roboto', category: 'sans-serif', variants: ['700', 'italic', 'regular', '100'] },
          { family: 'Lobster', category: 'display', variants: ['regular'] },
        ],
      }),
    );

    const catalog = await fetchGoogleFontCatalog('test-key');

    const url = requestedUrl();
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/webfonts/v1/webfonts');
    expect(url.searchParams.get('key')).toBe('test-key');
    expect(url.searchParams.get('sort')).toBe('popularity');
    expect(url.searchParams.get('fields')).toBe('items(family,category,variants)');
    expect(catalog.map((family) => family.family)).toEqual(['Roboto', 'Lobster']);
    expect(catalog[0].category).toBe('sans-serif');
    expect(catalog[0].variants.map((variant) => variant.key)).toEqual([
      '100',
      'regular',
      'italic',
      '700',
    ]);
  });

  it('leaves out styles it cannot read, and families left with none', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [
          { family: 'Mixed', variants: ['regular', 'condensed'] },
          { family: 'Unreadable', variants: ['condensed'] },
        ],
      }),
    );

    const catalog = await fetchGoogleFontCatalog('test-key');

    expect(catalog).toEqual([
      { family: 'Mixed', category: '', variants: [{ key: 'regular', weight: 400, italic: false }] },
    ]);
  });

  it('rejects when Google answers with an error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 403 } }, 403));

    await expect(fetchGoogleFontCatalog('test-key')).rejects.toThrow('(403)');
  });

  it('rejects an answer that is not a list of fonts', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: 'none' }));

    await expect(fetchGoogleFontCatalog('test-key')).rejects.toThrow('could not be read');
  });
});

describe('loadGoogleFontCatalog', () => {
  it('asks once, however often it is called', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [{ family: 'Roboto', variants: ['regular'] }] }));

    const first = await loadGoogleFontCatalog('test-key');
    const second = await loadGoogleFontCatalog('test-key');

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks again after a request that failed', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    fetchMock.mockResolvedValue(jsonResponse({ items: [{ family: 'Roboto', variants: ['regular'] }] }));

    await expect(loadGoogleFontCatalog('test-key')).rejects.toThrow('offline');
    const catalog = await loadGoogleFontCatalog('test-key');

    expect(catalog.map((family) => family.family)).toEqual(['Roboto']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchGoogleFontFiles', () => {
  it('asks for the one family, and gives the file of each style', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [
          {
            family: 'Playfair Display',
            files: {
              regular: 'https://fonts.gstatic.com/s/playfairdisplay/v40/regular.ttf',
              '700italic': 'http://fonts.gstatic.com/s/playfairdisplay/v40/bolditalic.ttf',
            },
          },
        ],
      }),
    );

    const files = await fetchGoogleFontFiles('test-key', 'Playfair Display');

    const url = requestedUrl();
    expect(url.searchParams.get('family')).toBe('Playfair Display');
    expect(url.searchParams.get('fields')).toBe('items(family,files)');
    expect([...files]).toEqual([
      ['regular', 'https://fonts.gstatic.com/s/playfairdisplay/v40/regular.ttf'],
      // An http address is fetched over https.
      ['700italic', 'https://fonts.gstatic.com/s/playfairdisplay/v40/bolditalic.ttf'],
    ]);
  });

  it('leaves out a file that is not on Google’s font server', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [
          {
            family: 'Roboto',
            files: {
              regular: 'https://fonts.gstatic.com/s/roboto/v51/regular.ttf',
              italic: 'https://example.com/italic.ttf',
            },
          },
        ],
      }),
    );

    const files = await fetchGoogleFontFiles('test-key', 'Roboto');

    expect([...files.keys()]).toEqual(['regular']);
  });

  it('rejects when the family is not in the answer', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [{ family: 'Roboto Mono', files: {} }] }));

    await expect(fetchGoogleFontFiles('test-key', 'Roboto')).rejects.toThrow('no files for Roboto');
  });

  it('rejects when Google answers with an error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 404 } }, 404));

    await expect(fetchGoogleFontFiles('test-key', 'Nonesuch')).rejects.toThrow('(404)');
  });
});
