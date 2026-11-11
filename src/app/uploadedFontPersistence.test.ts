import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  collectRetainedUploadedFontReferences,
  restoreUploadedFontsForReferences,
} from './uploadedFontPersistence';
import type { DocumentFontReference, UploadedFont } from '../editor/document/documentTypes';
import type { PersistedUploadedFont } from '../editor/fonts';
import type { StoredFavorite } from '../editor/persistence/favoriteLibraryService';

const { mockLoadByReferences, mockRegisterUploadedFontBytes } = vi.hoisted(() => ({
  mockLoadByReferences: vi.fn(),
  mockRegisterUploadedFontBytes: vi.fn(),
}));

vi.mock('../editor/persistence/uploadedFontPersistenceService', async () => {
  const actual =
    await vi.importActual<typeof import('../editor/persistence/uploadedFontPersistenceService')>(
      '../editor/persistence/uploadedFontPersistenceService',
    );
  return {
    ...actual,
    defaultUploadedFontPersistenceService: { loadByReferences: mockLoadByReferences },
  };
});

vi.mock('../editor/fonts', async () => {
  const actual = await vi.importActual<typeof import('../editor/fonts')>('../editor/fonts');
  return {
    ...actual,
    registerUploadedFontBytes: mockRegisterUploadedFontBytes,
  };
});

const boldFont: UploadedFont = {
  family: 'Persist Probe',
  sourceName: 'PersistProbe-Bold.otf',
  weight: '700',
  style: 'normal',
  kind: 'uploaded',
};
const regularFont: UploadedFont = {
  family: 'Persist Probe',
  sourceName: 'PersistProbe-Regular.otf',
  weight: '400',
  style: 'normal',
  kind: 'uploaded',
};

function reference({ family, sourceName, kind }: UploadedFont): DocumentFontReference {
  return { family, sourceName, kind };
}

function stored(font: UploadedFont, byte: number): PersistedUploadedFont {
  return { ...font, kind: 'uploaded', bytes: new Uint8Array([byte]).buffer };
}

function favoriteWithFonts(fonts: DocumentFontReference[]): StoredFavorite {
  return {
    id: 'favorite',
    name: 'Favorite',
    nodes: [],
    fonts,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('collectRetainedUploadedFontReferences', () => {
  it('retains each uploaded file of a family once, whether the canvas or a favorite references it', () => {
    const bundled: DocumentFontReference = {
      family: 'Bundled Sans',
      sourceName: 'BundledSans-Regular.ttf',
      kind: 'bundled',
    };

    expect(
      collectRetainedUploadedFontReferences(
        [bundled, reference(boldFont)],
        [favoriteWithFonts([reference(boldFont), reference(regularFont)])],
      ),
    ).toEqual([reference(boldFont), reference(regularFont)]);
  });
});

describe('restoreUploadedFontsForReferences', () => {
  beforeEach(() => {
    mockLoadByReferences.mockReset();
    mockRegisterUploadedFontBytes.mockReset();
    mockRegisterUploadedFontBytes.mockImplementation(
      async ({ family, sourceName, weight, style, kind }: PersistedUploadedFont) => ({
        family,
        sourceName,
        weight,
        style,
        kind,
      }),
    );
  });

  it('restores every referenced file of a family that was uploaded as several files', async () => {
    mockLoadByReferences.mockResolvedValue([stored(boldFont, 7), stored(regularFont, 4)]);
    const registerAvailableFont = vi.fn();

    const restoredFamilies = await restoreUploadedFontsForReferences({
      references: [reference(boldFont), reference(regularFont)],
      availableFonts: [],
      registerAvailableFont,
    });

    expect(mockLoadByReferences).toHaveBeenCalledWith([
      reference(boldFont),
      reference(regularFont),
    ]);
    expect(registerAvailableFont.mock.calls).toEqual([[boldFont], [regularFont]]);
    expect(restoredFamilies).toEqual(new Set(['Persist Probe']));
  });

  it('asks only for the files of a family that are not available yet', async () => {
    mockLoadByReferences.mockResolvedValue([stored(regularFont, 4)]);
    const registerAvailableFont = vi.fn();

    await restoreUploadedFontsForReferences({
      references: [reference(boldFont), reference(regularFont)],
      availableFonts: [boldFont],
      registerAvailableFont,
    });

    expect(mockLoadByReferences).toHaveBeenCalledWith([reference(regularFont)]);
    expect(registerAvailableFont.mock.calls).toEqual([[regularFont]]);
  });

  it('still restores the rest of a family when one of its files fails to register', async () => {
    mockLoadByReferences.mockResolvedValue([stored(boldFont, 7), stored(regularFont, 4)]);
    mockRegisterUploadedFontBytes.mockRejectedValueOnce(new Error('corrupt font'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registerAvailableFont = vi.fn();

    await restoreUploadedFontsForReferences({
      references: [reference(boldFont), reference(regularFont)],
      availableFonts: [],
      registerAvailableFont,
    });

    expect(registerAvailableFont.mock.calls).toEqual([[regularFont]]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
