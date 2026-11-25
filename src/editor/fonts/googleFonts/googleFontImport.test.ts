import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PersistedUploadedFont } from '../fontModel';
import { downloadGoogleFontVariants } from './googleFontImport';
import { parseGoogleFontVariant, type GoogleFontVariant } from './googleFontVariants';

const { mockFetchGoogleFontFiles, mockRegisterUploadedFontBytes } = vi.hoisted(() => ({
  mockFetchGoogleFontFiles: vi.fn(),
  mockRegisterUploadedFontBytes: vi.fn(),
}));

vi.mock('./googleFontsApi', () => ({ fetchGoogleFontFiles: mockFetchGoogleFontFiles }));
vi.mock('../browserFontLoader', () => ({
  registerUploadedFontBytes: mockRegisterUploadedFontBytes,
}));

const fetchMock = vi.fn<typeof fetch>();

function variants(...keys: string[]): GoogleFontVariant[] {
  return keys.flatMap((key) => parseGoogleFontVariant(key) ?? []);
}

function fileAddress(key: string) {
  return `https://fonts.gstatic.com/s/roboto/v51/${key}.ttf`;
}

function fontBytes(text: string) {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

beforeEach(() => {
  fetchMock.mockReset();
  mockFetchGoogleFontFiles.mockReset();
  mockRegisterUploadedFontBytes.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  mockFetchGoogleFontFiles.mockImplementation(
    async () => new Map(['regular', '300', '300italic', '700'].map((key) => [key, fileAddress(key)])),
  );
  fetchMock.mockImplementation(async (address) => new Response(fontBytes(`font at ${String(address)}`)));
  mockRegisterUploadedFontBytes.mockImplementation(async (record: PersistedUploadedFont) => ({
    family: record.family,
    sourceName: record.sourceName,
    weight: record.weight,
    style: record.style,
    kind: 'uploaded',
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('downloadGoogleFontVariants', () => {
  it('fetches the file of each style and registers it as an imported font', async () => {
    const onProgress = vi.fn();

    const result = await downloadGoogleFontVariants({
      apiKey: 'test-key',
      family: 'Roboto',
      variants: variants('regular', '300italic', '700'),
      onProgress,
    });

    expect(mockFetchGoogleFontFiles).toHaveBeenCalledWith('test-key', 'Roboto', undefined);
    expect(fetchMock.mock.calls.map(([address]) => address).sort()).toEqual(
      [fileAddress('300italic'), fileAddress('700'), fileAddress('regular')].sort(),
    );
    expect(result.failed).toEqual([]);
    expect(result.downloaded.map((download) => download.font)).toEqual([
      { family: 'Roboto', sourceName: 'Roboto-Regular.ttf', weight: '400', style: 'normal', kind: 'uploaded' },
      {
        family: 'Roboto Light',
        sourceName: 'Roboto-LightItalic.ttf',
        weight: '400',
        style: 'italic',
        kind: 'uploaded',
      },
      { family: 'Roboto', sourceName: 'Roboto-Bold.ttf', weight: '700', style: 'normal', kind: 'uploaded' },
    ]);
    // Each font is registered from, and returned with, the bytes of its own file.
    expect(new TextDecoder().decode(result.downloaded[1].bytes)).toBe(
      `font at ${fileAddress('300italic')}`,
    );
    const registered = mockRegisterUploadedFontBytes.mock.calls.map(
      ([record]) => record as PersistedUploadedFont,
    );
    expect(
      registered.every(
        (record) =>
          new TextDecoder().decode(record.bytes) ===
          `font at ${fileAddress(record.sourceName === 'Roboto-Regular.ttf' ? 'regular' : record.sourceName === 'Roboto-Bold.ttf' ? '700' : '300italic')}`,
      ),
    ).toBe(true);
    expect(onProgress.mock.calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('carries on past a style that fails, and says which ones did', async () => {
    fetchMock.mockImplementation(async (address) =>
      String(address) === fileAddress('300')
        ? new Response('gone', { status: 404 })
        : new Response(fontBytes('font')),
    );
    mockRegisterUploadedFontBytes.mockImplementation(async (record: PersistedUploadedFont) => {
      if (record.sourceName === 'Roboto-Bold.ttf') {
        throw new Error('Not a font');
      }
      return { ...record, bytes: undefined };
    });
    const onProgress = vi.fn();

    const result = await downloadGoogleFontVariants({
      apiKey: 'test-key',
      family: 'Roboto',
      // 900 is a style the family's file list does not have.
      variants: variants('regular', '300', '700', '900'),
      onProgress,
    });

    expect(result.downloaded.map((download) => download.variant.key)).toEqual(['regular']);
    expect(result.failed.map((variant) => variant.key)).toEqual(['300', '700', '900']);
    expect(onProgress).toHaveBeenLastCalledWith(4, 4);
  });

  it('rejects when the files of the family cannot be looked up', async () => {
    mockFetchGoogleFontFiles.mockRejectedValue(new Error('Google Fonts answered with an error (403).'));

    await expect(
      downloadGoogleFontVariants({ apiKey: 'test-key', family: 'Roboto', variants: variants('regular') }),
    ).rejects.toThrow('(403)');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops and rejects when it is aborted', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });

    await expect(
      downloadGoogleFontVariants({
        apiKey: 'test-key',
        family: 'Roboto',
        variants: variants('regular', '300', '700'),
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(mockRegisterUploadedFontBytes).not.toHaveBeenCalled();
  });

  it('fetches no more than four files at a time', async () => {
    mockFetchGoogleFontFiles.mockImplementation(
      async () =>
        new Map(
          ['100', '200', '300', 'regular', '500', '600', '700', '800', '900'].map((key) => [
            key,
            fileAddress(key),
          ]),
        ),
    );
    let inFlight = 0;
    let mostInFlight = 0;
    fetchMock.mockImplementation(async () => {
      inFlight += 1;
      mostInFlight = Math.max(mostInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return new Response(fontBytes('font'));
    });

    const result = await downloadGoogleFontVariants({
      apiKey: 'test-key',
      family: 'Roboto',
      variants: variants('100', '200', '300', 'regular', '500', '600', '700', '800', '900'),
    });

    expect(result.downloaded).toHaveLength(9);
    expect(mostInFlight).toBe(4);
  });
});
