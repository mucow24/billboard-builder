import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UploadedFont } from '../editor/document/documentTypes';
import {
  FAVORITE_FONTS_STORAGE_KEY,
  loadFavoriteFonts,
  saveFavoriteFonts,
} from '../editor/persistence/favoriteFontsService';
import { useEditorStore } from '../editor/state/store';
import * as uploadedFontPersistence from './uploadedFontPersistence';
import {
  addImportedFontFiles,
  collectImportedFontFiles,
  toggleFavoriteFontIn,
  useFavoriteFontsController,
} from './useFavoriteFontsController';

const AVAILABLE_FONTS: UploadedFont[] = [
  { family: 'Barlow', sourceName: 'Barlow-Regular.ttf', weight: '400', style: 'normal', kind: 'bundled' },
  { family: 'Cal Sans', sourceName: 'CalSans-Regular.ttf', weight: '400', style: 'normal', kind: 'uploaded' },
  { family: 'Cal Sans', sourceName: 'CalSans-Italic.ttf', weight: '400', style: 'italic', kind: 'uploaded' },
  // A Bold file is listed under its family and as its "<Family> Bold" entry.
  { family: 'Cal Sans', sourceName: 'CalSans-Bold.ttf', weight: '700', style: 'normal', kind: 'uploaded' },
  { family: 'Cal Sans Bold', sourceName: 'CalSans-Bold.ttf', weight: '400', style: 'normal', kind: 'uploaded' },
  { family: 'Other', sourceName: 'Other.ttf', weight: '400', style: 'normal', kind: 'uploaded' },
];

describe('favorite fonts', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('finds the imported files behind a row of the menu, and none for bundled fonts', () => {
    expect(
      collectImportedFontFiles('Cal Sans', AVAILABLE_FONTS).map(
        (file) => `${file.family}|${file.sourceName}|${file.kind}`,
      ),
    ).toEqual([
      'Cal Sans|CalSans-Regular.ttf|uploaded',
      'Cal Sans|CalSans-Italic.ttf|uploaded',
      'Cal Sans|CalSans-Bold.ttf|uploaded',
      'Cal Sans Bold|CalSans-Bold.ttf|uploaded',
    ]);
    expect(collectImportedFontFiles('Barlow', AVAILABLE_FONTS)).toEqual([]);
  });

  it('adds a row that is not a favorite and removes one that is', () => {
    const added = toggleFavoriteFontIn([{ name: 'Arial', files: [] }], 'Barlow', []);
    expect(added.map((favorite) => favorite.name)).toEqual(['Arial', 'Barlow']);
    expect(toggleFavoriteFontIn(added, 'Arial', []).map((favorite) => favorite.name)).toEqual([
      'Barlow',
    ]);
  });

  it('adds a weight imported later to the files of its starred family', () => {
    const favorites = [
      { name: 'Cal Sans', files: [{ family: 'Cal Sans', sourceName: 'CalSans-Regular.ttf', kind: 'uploaded' as const }] },
      { name: 'Arial', files: [] },
    ];

    const next = addImportedFontFiles(favorites, AVAILABLE_FONTS);

    expect(next[0].files.map((file) => file.sourceName)).toEqual([
      'CalSans-Regular.ttf',
      'CalSans-Italic.ttf',
      'CalSans-Bold.ttf',
      'CalSans-Bold.ttf',
    ]);
    expect(next[1]).toBe(favorites[1]);
    // Nothing to add: the same list, so nothing is stored again.
    expect(addImportedFontFiles(next, AVAILABLE_FONTS)).toBe(next);
  });

  it('reads stored favorites, and treats storage it cannot read as none', () => {
    saveFavoriteFonts([{ name: 'Arial', files: [] }]);
    expect(loadFavoriteFonts()).toEqual([{ name: 'Arial', files: [] }]);

    window.localStorage.setItem(FAVORITE_FONTS_STORAGE_KEY, '{"version":7}');
    expect(loadFavoriteFonts()).toEqual([]);
    expect(window.localStorage.getItem(FAVORITE_FONTS_STORAGE_KEY)).toBeNull();
  });

  it('keeps the favorites in the browser, with the imported files of each', () => {
    for (const font of AVAILABLE_FONTS) {
      useEditorStore.getState().registerAvailableFont(font);
    }
    const { result, unmount } = renderHook(() =>
      useFavoriteFontsController({
        availableFonts: useEditorStore.getState().editor.session.availableFonts,
        registerAvailableFont: vi.fn(),
        setErrorMessage: vi.fn(),
      }),
    );
    expect(result.current.favoriteFontNames).toEqual([]);

    act(() => result.current.toggleFavoriteFont('Other'));
    act(() => result.current.toggleFavoriteFont('Arial'));

    expect(result.current.favoriteFontNames).toEqual(['Other', 'Arial']);
    expect(result.current.favoriteFontFiles).toEqual([
      { family: 'Other', sourceName: 'Other.ttf', kind: 'uploaded' },
    ]);
    unmount();

    // Another visit starts from what was stored.
    const next = renderHook(() =>
      useFavoriteFontsController({
        availableFonts: useEditorStore.getState().editor.session.availableFonts,
        registerAvailableFont: vi.fn(),
        setErrorMessage: vi.fn(),
      }),
    );
    expect(next.result.current.favoriteFontNames).toEqual(['Other', 'Arial']);

    act(() => next.result.current.toggleFavoriteFont('Other'));
    expect(loadFavoriteFonts()).toEqual([{ name: 'Arial', files: [] }]);
  });

  it('brings back the imported fonts of the stored favorites when the editor appears', async () => {
    const files = [{ family: 'Gone', sourceName: 'Gone.ttf', kind: 'uploaded' as const }];
    saveFavoriteFonts([{ name: 'Gone', files }]);
    const restore = vi
      .spyOn(uploadedFontPersistence, 'restoreUploadedFontsForReferences')
      .mockResolvedValue(new Set());
    const registerAvailableFont = vi.fn();

    renderHook(() =>
      useFavoriteFontsController({
        availableFonts: [],
        registerAvailableFont,
        setErrorMessage: vi.fn(),
      }),
    );

    await waitFor(() => expect(restore).toHaveBeenCalledTimes(1));
    expect(restore.mock.calls[0][0]).toMatchObject({ references: files, registerAvailableFont });
  });
});
