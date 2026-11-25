import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UploadedFont } from '../editor/document/documentTypes';
import { parseGoogleFontVariant } from '../editor/fonts/googleFonts/googleFontVariants';
import { useFontController } from './useFontController';

const { mockDownload, mockSave } = vi.hoisted(() => ({
  mockDownload: vi.fn(),
  mockSave: vi.fn(),
}));

vi.mock('../editor/fonts/googleFonts/googleFontImport', () => ({
  downloadGoogleFontVariants: mockDownload,
}));
vi.mock('../editor/persistence/uploadedFontPersistenceService', () => ({
  defaultUploadedFontPersistenceService: { save: mockSave },
}));

function variant(key: string) {
  const parsed = parseGoogleFontVariant(key);
  if (!parsed) {
    throw new Error(`Not a style key: ${key}`);
  }
  return parsed;
}

function download(family: string, sourceName: string, key: string) {
  const font: UploadedFont = { family, sourceName, weight: '400', style: 'normal', kind: 'uploaded' };
  return { variant: variant(key), font, bytes: new ArrayBuffer(4) };
}

function createController() {
  const registerAvailableFont = vi.fn();
  const setErrorMessage = vi.fn();
  const { result } = renderHook(() => useFontController({ registerAvailableFont, setErrorMessage }));
  return { ...result.current, registerAvailableFont, setErrorMessage };
}

const REQUEST = { apiKey: 'test-key', family: 'Roboto', variants: [variant('regular')] };

beforeEach(() => {
  mockDownload.mockReset();
  mockSave.mockReset();
  mockSave.mockResolvedValue(undefined);
});

describe('useFontController: Google fonts', () => {
  it('adds each downloaded style to the font list and stores its file', async () => {
    const regular = download('Roboto', 'Roboto-Regular.ttf', 'regular');
    const light = download('Roboto Light', 'Roboto-Light.ttf', '300');
    mockDownload.mockResolvedValue({ downloaded: [regular, light], failed: [] });
    const { handleGoogleFontImport, registerAvailableFont, setErrorMessage } = createController();

    const outcome = await handleGoogleFontImport(REQUEST);

    expect(mockDownload).toHaveBeenCalledWith(REQUEST);
    expect(registerAvailableFont.mock.calls).toEqual([[regular.font], [light.font]]);
    expect(mockSave.mock.calls).toEqual([
      [regular.font, regular.bytes],
      [light.font, light.bytes],
    ]);
    expect(outcome).toEqual({ added: 2, failed: [] });
    expect(setErrorMessage).toHaveBeenCalledWith(null);
  });

  it('leaves the error message alone after an import nobody asked for, but still says when a font cannot be stored', async () => {
    const regular = download('Roboto', 'Roboto-Regular.ttf', 'regular');
    mockDownload.mockResolvedValue({ downloaded: [regular], failed: [] });
    const { handleGoogleFontImport, registerAvailableFont, setErrorMessage } = createController();

    await handleGoogleFontImport(REQUEST, { clearError: false });

    expect(registerAvailableFont).toHaveBeenCalledWith(regular.font);
    expect(mockSave).toHaveBeenCalledWith(regular.font, regular.bytes);
    expect(setErrorMessage).not.toHaveBeenCalled();

    mockSave.mockRejectedValue(new Error('Quota exceeded'));
    await handleGoogleFontImport(REQUEST, { clearError: false });

    expect(setErrorMessage.mock.calls).toEqual([
      ['Imported fonts are ready for this session, but failed to persist: Quota exceeded'],
    ]);
  });

  it('names the styles that could not be downloaded', async () => {
    mockDownload.mockResolvedValue({
      downloaded: [download('Roboto', 'Roboto-Regular.ttf', 'regular')],
      failed: [variant('300italic'), variant('700')],
    });
    const { handleGoogleFontImport } = createController();

    await expect(handleGoogleFontImport(REQUEST)).resolves.toEqual({
      added: 1,
      failed: ['Light Italic', 'Bold'],
    });
  });

  it('keeps a font usable when it cannot be stored, and says so', async () => {
    const regular = download('Roboto', 'Roboto-Regular.ttf', 'regular');
    mockDownload.mockResolvedValue({ downloaded: [regular], failed: [] });
    mockSave.mockRejectedValue(new Error('Quota exceeded'));
    const { handleGoogleFontImport, registerAvailableFont, setErrorMessage } = createController();

    const outcome = await handleGoogleFontImport(REQUEST);

    expect(registerAvailableFont).toHaveBeenCalledWith(regular.font);
    expect(outcome).toEqual({ added: 1, failed: [] });
    expect(setErrorMessage).toHaveBeenCalledWith(
      'Imported fonts are ready for this session, but failed to persist: Quota exceeded',
    );
  });

  it('rejects, and changes nothing, when the family cannot be looked up', async () => {
    mockDownload.mockRejectedValue(new Error('Google Fonts answered with an error (403).'));
    const { handleGoogleFontImport, registerAvailableFont, setErrorMessage } = createController();

    await expect(handleGoogleFontImport(REQUEST)).rejects.toThrow('(403)');
    expect(registerAvailableFont).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(setErrorMessage).not.toHaveBeenCalled();
  });
});
