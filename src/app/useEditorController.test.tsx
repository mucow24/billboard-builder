import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEditorController } from './useEditorController';
import type { StoredFavorite } from '../editor/persistence/favoriteLibraryService';
import {
  createDefaultProjectDocument,
  createRectangleItem,
  createTextItem,
} from '../editor/document/documentDefaults';
import { collectLeafItems } from '../editor/document/sceneGraph';
import { useEditorStore } from '../editor/state/store';
import { resetEditorStore } from '../test/editorStore';

const {
  mockCanvasPersistenceService,
  mockDownloadProject,
  mockDownloadCanvasAsPng,
  mockImportImageFile,
  mockReadProjectFile,
  mockRegisterFontFile,
  mockRegisterUploadedFontBytes,
  mockFavoriteLibraryService,
  mockUploadedFontPersistenceService,
} = vi.hoisted(() => ({
  mockCanvasPersistenceService: {
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
  mockDownloadProject: vi.fn(),
  mockDownloadCanvasAsPng: vi.fn(),
  mockImportImageFile: vi.fn(),
  mockReadProjectFile: vi.fn(),
  mockRegisterFontFile: vi.fn(),
  mockRegisterUploadedFontBytes: vi.fn(),
  mockFavoriteLibraryService: {
    load: vi.fn(() => []),
    save: vi.fn(),
    clear: vi.fn(),
  },
  mockUploadedFontPersistenceService: {
    clear: vi.fn().mockResolvedValue(undefined),
    loadByReferences: vi.fn().mockResolvedValue([]),
    pruneUnreferenced: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../editor/persistence/canvasPersistenceService', () => ({
  defaultCanvasPersistenceService: mockCanvasPersistenceService,
}));

vi.mock('../editor/persistence/favoriteLibraryService', () => ({
  defaultFavoriteLibraryService: mockFavoriteLibraryService,
}));

vi.mock('../editor/persistence/uploadedFontPersistenceService', async () => {
  const actual =
    await vi.importActual<typeof import('../editor/persistence/uploadedFontPersistenceService')>(
      '../editor/persistence/uploadedFontPersistenceService',
    );
  return {
    ...actual,
    defaultUploadedFontPersistenceService: mockUploadedFontPersistenceService,
  };
});

vi.mock('../editor/io/exportPng', () => ({
  downloadCanvasAsPng: mockDownloadCanvasAsPng,
}));

vi.mock('../editor/io/images', async () => {
  const actual =
    await vi.importActual<typeof import('../editor/io/images')>('../editor/io/images');
  return {
    ...actual,
    importImageFile: mockImportImageFile,
  };
});

vi.mock('../editor/io/projectFile', async () => {
  const actual =
    await vi.importActual<typeof import('../editor/io/projectFile')>('../editor/io/projectFile');
  return {
    ...actual,
    downloadProject: mockDownloadProject,
    readProjectFile: mockReadProjectFile,
  };
});

vi.mock('../editor/fonts', async () => {
  const actual =
    await vi.importActual<typeof import('../editor/fonts')>('../editor/fonts');
  return {
    ...actual,
    loadBundledFonts: vi.fn().mockResolvedValue([]),
    registerFontFile: mockRegisterFontFile,
    registerUploadedFontBytes: mockRegisterUploadedFontBytes,
  };
});

function makeFileList(...files: File[]): FileList {
  const fileList: Record<number, File> & {
    item: (index: number) => File | null;
    length: number;
  } = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
  };
  files.forEach((file, index) => {
    fileList[index] = file;
  });
  return fileList as unknown as FileList;
}

describe('useEditorController', () => {
  beforeEach(() => {
    mockCanvasPersistenceService.load.mockResolvedValue(null);
    mockCanvasPersistenceService.save.mockResolvedValue(undefined);
    mockDownloadProject.mockReset();
    mockDownloadCanvasAsPng.mockReset();
    mockImportImageFile.mockReset();
    mockReadProjectFile.mockReset();
    mockRegisterFontFile.mockReset();
    mockRegisterUploadedFontBytes.mockReset();
    mockFavoriteLibraryService.clear.mockReset();
    mockFavoriteLibraryService.load.mockReturnValue([]);
    mockFavoriteLibraryService.save.mockReset();
    mockUploadedFontPersistenceService.clear.mockReset();
    mockUploadedFontPersistenceService.loadByReferences.mockReset();
    mockUploadedFontPersistenceService.loadByReferences.mockResolvedValue([]);
    mockUploadedFontPersistenceService.pruneUnreferenced.mockReset();
    mockUploadedFontPersistenceService.pruneUnreferenced.mockResolvedValue(undefined);
    mockUploadedFontPersistenceService.save.mockReset();
    mockUploadedFontPersistenceService.save.mockResolvedValue(undefined);
    resetEditorStore();
  });

  it('exposes selected item state and undo availability', async () => {
    const rectangleItem = createRectangleItem();
    resetEditorStore({
      document: {
        ...createDefaultProjectDocument(),
        nodes: [rectangleItem],
      },
      session: {
        selectedNodeIds: [rectangleItem.id],
      },
      history: {
        past: [createDefaultProjectDocument()],
      },
    });

    const { result } = renderHook(() => useEditorController());

    await waitFor(() => {
      expect(mockCanvasPersistenceService.load).toHaveBeenCalled();
    });

    expect(result.current.state.selectedItem?.id).toBe(rectangleItem.id);
    expect(result.current.state.canUndo).toBe(true);
    expect(typeof result.current.actions.handleNewProject).toBe('function');
  });

  it('imports uploaded images and clears any prior error state', async () => {
    const file = new File(['image'], 'poster.png', { type: 'image/png' });
    mockImportImageFile.mockResolvedValue({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      width: 640,
      height: 320,
      sourceName: 'poster.png',
    });

    const { result } = renderHook(() => useEditorController());

    await waitFor(() => {
      expect(mockCanvasPersistenceService.load).toHaveBeenCalled();
    });
    await act(async () => {
      await result.current.actions.handleImageUpload(makeFileList(file));
    });

    await waitFor(() => {
      expect(result.current.state.document.nodes.flatMap(collectLeafItems)).toHaveLength(1);
    });

    expect(mockImportImageFile).toHaveBeenCalledWith(file);
    expect(result.current.state.document.nodes.flatMap(collectLeafItems)[0]).toMatchObject({
      kind: 'image',
      name: 'poster.png',
      originalWidth: 640,
      originalHeight: 320,
    });
    expect(result.current.state.errorMessage).toBeNull();
  });

  it('surfaces image, font, and project open errors', async () => {
    const imageFile = new File(['image'], 'broken.png', { type: 'image/png' });
    const fontFile = new File(['font'], 'broken.ttf', { type: 'font/ttf' });
    const projectFile = new File(['{}'], 'broken.json', { type: 'application/json' });

    mockImportImageFile.mockRejectedValue(new Error('image nope'));
    mockRegisterFontFile.mockRejectedValue(new Error('font nope'));
    mockReadProjectFile.mockRejectedValue(new Error('project nope'));

    const { result } = renderHook(() => useEditorController());

    await waitFor(() => {
      expect(mockCanvasPersistenceService.load).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.actions.handleImageUpload(makeFileList(imageFile));
    });
    await waitFor(() => {
      expect(result.current.state.errorMessage).toBe('Failed to import image: image nope');
    });

    await act(async () => {
      await result.current.actions.handleFontUpload(makeFileList(fontFile));
    });
    await waitFor(() => {
      expect(result.current.state.errorMessage).toBe('Failed to register font: font nope');
    });

    await act(async () => {
      await result.current.actions.handleOpenProject(makeFileList(projectFile));
    });
    await waitFor(() => {
      expect(result.current.state.errorMessage).toBe('Failed to open project: project nope');
    });
  });

  it('registers uploaded fonts, opens projects, and delegates save/export actions', async () => {
    const fontFile = new File(['font'], 'PosterSans.ttf', { type: 'font/ttf' });
    const fontBytes = new Uint8Array([5, 4, 3]).buffer;
    Object.defineProperty(fontFile, 'arrayBuffer', {
      configurable: true,
      value: async () => fontBytes,
    });
    const textItem = createTextItem({ id: 'font-target' });
    const projectDocument = {
      ...createDefaultProjectDocument(),
      background: '#112233',
    };
    const stage = { tag: 'stage' } as never;
    mockRegisterFontFile.mockResolvedValue({
      family: 'Poster Sans',
      sourceName: 'PosterSans.ttf',
      weight: '400',
      style: 'normal',
      kind: 'uploaded',
    });
    mockReadProjectFile.mockResolvedValue(projectDocument);

    resetEditorStore({
      document: {
        ...createDefaultProjectDocument(),
        nodes: [textItem],
      },
      session: {
        selectedNodeIds: [textItem.id],
      },
    });

    const { result } = renderHook(() => useEditorController());

    await waitFor(() => {
      expect(mockCanvasPersistenceService.load).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.actions.handleFontUpload(makeFileList(fontFile));
    });
    await waitFor(() => {
      expect(result.current.state.availableFonts).toContainEqual({
        family: 'Poster Sans',
        sourceName: 'PosterSans.ttf',
        weight: '400',
        style: 'normal',
        kind: 'uploaded',
      });
    });
    expect(mockUploadedFontPersistenceService.save).toHaveBeenCalledWith(
      {
        family: 'Poster Sans',
        sourceName: 'PosterSans.ttf',
        weight: '400',
        style: 'normal',
        kind: 'uploaded',
      },
      fontBytes,
    );
    expect(result.current.state.document.fonts).toEqual([]);

    act(() => {
      result.current.actions.updateSelectionItems({ fontFamily: 'Poster Sans' });
    });

    await waitFor(() => {
      expect(result.current.state.document.fonts).toContainEqual({
        family: 'Poster Sans',
        sourceName: 'PosterSans.ttf',
        kind: 'uploaded',
      });
    });
    await act(async () => {
      await result.current.actions.handleOpenProject(makeFileList(new File(['{}'], 'project.json')));
    });
    await act(async () => {
      result.current.actions.handleExport(null);
      result.current.actions.handleExport(stage);
      result.current.actions.handleSave();
    });

    await waitFor(() => {
      expect(result.current.state.document.background).toBe('#112233');
    });

    expect(result.current.state.availableFonts).toContainEqual({
      family: 'Poster Sans',
      sourceName: 'PosterSans.ttf',
      weight: '400',
      style: 'normal',
      kind: 'uploaded',
    });
    expect(mockDownloadCanvasAsPng).toHaveBeenCalledOnce();
    expect(mockDownloadCanvasAsPng).toHaveBeenCalledWith(stage, 2048, 2048, 1);
    expect(mockDownloadProject).toHaveBeenCalledOnce();
  });

  it('ignores stale missing-font references that are no longer used by any text node', async () => {
    resetEditorStore({
      document: {
        ...createDefaultProjectDocument(),
        fonts: [
          {
            family: 'Ghost Font',
            sourceName: 'GhostFont-Regular.ttf',
            kind: 'bundled',
          },
        ],
        nodes: [
          createTextItem({
            id: 'body-text',
            fontFamily: 'Arial',
          }),
        ],
      },
    });

    const { result } = renderHook(() => useEditorController());

    await waitFor(() => {
      expect(mockCanvasPersistenceService.load).toHaveBeenCalled();
    });

    expect(result.current.state.document.fonts).toEqual([]);
    expect(result.current.state.missingFontFamilies).toEqual([]);
  });

  it('restores uploaded fonts referenced by the persisted canvas document during bootstrap', async () => {
    const persistedDocument = {
      ...createDefaultProjectDocument(),
      fonts: [
        {
          family: 'Poster Sans',
          sourceName: 'PosterSans-Regular.ttf',
          kind: 'uploaded' as const,
        },
      ],
      nodes: [
        createTextItem({
          id: 'persisted-text',
          fontFamily: 'Poster Sans',
        }),
      ],
    };
    mockCanvasPersistenceService.load.mockResolvedValue(persistedDocument);
    mockUploadedFontPersistenceService.loadByReferences.mockResolvedValue([
      {
        family: 'Poster Sans',
        sourceName: 'PosterSans-Regular.ttf',
        weight: '400',
        style: 'normal',
        kind: 'uploaded',
        bytes: new Uint8Array([1, 2, 3]).buffer,
      },
    ]);
    mockRegisterUploadedFontBytes.mockResolvedValue({
      family: 'Poster Sans',
      sourceName: 'PosterSans-Regular.ttf',
      weight: '400',
      style: 'normal',
      kind: 'uploaded',
    });

    const { result } = renderHook(() => useEditorController());

    await waitFor(() => {
      expect(result.current.state.availableFonts).toContainEqual({
        family: 'Poster Sans',
        sourceName: 'PosterSans-Regular.ttf',
        weight: '400',
        style: 'normal',
        kind: 'uploaded',
      });
    });

    expect(mockUploadedFontPersistenceService.loadByReferences).toHaveBeenCalledWith(
      persistedDocument.fonts,
    );
    expect(mockRegisterUploadedFontBytes).toHaveBeenCalledWith({
      family: 'Poster Sans',
      sourceName: 'PosterSans-Regular.ttf',
      weight: '400',
      style: 'normal',
      kind: 'uploaded',
      bytes: expect.any(ArrayBuffer),
    });
    expect(result.current.state.missingFontFamilies).toEqual([]);
  });

  it('saves a selected node as a favorite and inserts it with cumulative offsets', async () => {
    const rectangle = createRectangleItem({
      id: 'favorite-rectangle',
      x: 180,
      y: 240,
    });
    resetEditorStore({
      document: {
        ...createDefaultProjectDocument(),
        nodes: [rectangle],
      },
      session: {
        selectedNodeIds: [rectangle.id],
      },
    });

    const { result } = renderHook(() => useEditorController());

    await waitFor(() => {
      expect(mockCanvasPersistenceService.load).toHaveBeenCalled();
    });

    let wasSaved = false;
    act(() => {
      wasSaved = result.current.actions.saveSelectionAsFavorite();
    });

    expect(wasSaved).toBe(true);
    expect(mockFavoriteLibraryService.save).toHaveBeenCalledOnce();
    expect(result.current.state.favorites).toHaveLength(1);
    expect(result.current.state.favorites[0]).toMatchObject({
      name: 'Rectangle favorite',
      nodes: [expect.objectContaining({ id: rectangle.id })],
    });

    const savedFavoriteId = result.current.state.favorites[0]!.id;

    await act(async () => {
      await result.current.actions.insertFavorite(savedFavoriteId);
      await result.current.actions.insertFavorite(savedFavoriteId);
    });

    const insertedRectangles = result.current.state.document.nodes.flatMap(collectLeafItems).filter(
      (item) => item.kind === 'rectangle',
    );
    expect(insertedRectangles).toHaveLength(3);
    expect(insertedRectangles.map((item) => item.x)).toEqual([180, 204, 228]);
  });

  it('merges stored font references when inserting a text favorite into a reset document', async () => {
    resetEditorStore({
      document: {
        ...createDefaultProjectDocument(),
        fonts: [
          {
            family: 'Poster Sans',
            sourceName: 'PosterSans-Regular.ttf',
            kind: 'uploaded',
          },
        ],
        nodes: [
          createRectangleItem({ id: 'placeholder' }),
          createRectangleItem({ id: 'placeholder-2', x: 300 }),
        ],
      },
    });

    const { result } = renderHook(() => useEditorController());

    await waitFor(() => {
      expect(mockCanvasPersistenceService.load).toHaveBeenCalled();
    });

    act(() => {
      useEditorStore.getState().loadDocument({
        ...createDefaultProjectDocument(),
        fonts: [
          {
            family: 'Poster Sans',
            sourceName: 'PosterSans-Regular.ttf',
            kind: 'uploaded',
          },
        ],
        nodes: [
          createTextItem({
            id: 'favorite-text',
            fontFamily: 'Poster Sans',
          }),
        ],
      });
      useEditorStore.getState().selectSingleNode('favorite-text');
    });

    act(() => {
      result.current.actions.saveSelectionAsFavorite();
      result.current.actions.handleNewProject();
    });

    const savedFavoriteId = result.current.state.favorites[0]!.id;

    mockUploadedFontPersistenceService.loadByReferences.mockResolvedValue([
      {
        family: 'Poster Sans',
        sourceName: 'PosterSans-Regular.ttf',
        weight: '400',
        style: 'normal',
        kind: 'uploaded',
        bytes: new Uint8Array([1, 2, 3]).buffer,
      },
    ]);
    mockRegisterUploadedFontBytes.mockResolvedValue({
      family: 'Poster Sans',
      sourceName: 'PosterSans-Regular.ttf',
      weight: '400',
      style: 'normal',
      kind: 'uploaded',
    });

    await act(async () => {
      await result.current.actions.insertFavorite(savedFavoriteId);
    });

    expect(result.current.state.document.fonts).toContainEqual({
      family: 'Poster Sans',
      sourceName: 'PosterSans-Regular.ttf',
      kind: 'uploaded',
    });
    expect(
      result.current.state.document.nodes.flatMap(collectLeafItems).some(
        (item) => item.kind === 'text' && item.fontFamily === 'Poster Sans',
      ),
    ).toBe(true);
  });

  it('restores missing uploaded fonts before inserting a favorite', async () => {
    const persistedFavorites: StoredFavorite[] = [
      {
        id: 'persisted-favorite',
        name: 'Persisted favorite',
        nodes: [
          createTextItem({
            id: 'favorite-text',
            fontFamily: 'Poster Sans',
          }),
        ],
        fonts: [
          {
            family: 'Poster Sans',
            sourceName: 'PosterSans-Regular.ttf',
            kind: 'uploaded' as const,
          },
        ],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    mockFavoriteLibraryService.load.mockReturnValue(persistedFavorites as never);
    mockUploadedFontPersistenceService.loadByReferences.mockResolvedValue([
      {
        family: 'Poster Sans',
        sourceName: 'PosterSans-Regular.ttf',
        weight: '400',
        style: 'normal',
        kind: 'uploaded',
        bytes: new Uint8Array([9, 9, 9]).buffer,
      },
    ]);
    mockRegisterUploadedFontBytes.mockResolvedValue({
      family: 'Poster Sans',
      sourceName: 'PosterSans-Regular.ttf',
      weight: '400',
      style: 'normal',
      kind: 'uploaded',
    });

    const { result } = renderHook(() => useEditorController());

    await waitFor(() => {
      expect(result.current.state.favorites).toHaveLength(1);
    });

    await act(async () => {
      await result.current.actions.insertFavorite('persisted-favorite');
    });

    expect(mockUploadedFontPersistenceService.loadByReferences).toHaveBeenCalledWith([
      {
        family: 'Poster Sans',
        sourceName: 'PosterSans-Regular.ttf',
        kind: 'uploaded',
      },
    ]);
    expect(mockRegisterUploadedFontBytes).toHaveBeenCalled();
    expect(result.current.state.availableFonts).toContainEqual({
      family: 'Poster Sans',
      sourceName: 'PosterSans-Regular.ttf',
      weight: '400',
      style: 'normal',
      kind: 'uploaded',
    });
    expect(
      result.current.state.document.nodes.flatMap(collectLeafItems).some(
        (item) => item.kind === 'text' && item.fontFamily === 'Poster Sans',
      ),
    ).toBe(true);
  });

  it('prunes persisted uploaded fonts using canvas and favorite references as the retention set', async () => {
    resetEditorStore({
      document: {
        ...createDefaultProjectDocument(),
        fonts: [
          {
            family: 'Canvas Font',
            sourceName: 'CanvasFont-Regular.ttf',
            kind: 'uploaded',
          },
        ],
        nodes: [
          createTextItem({
            id: 'canvas-font-text',
            fontFamily: 'Canvas Font',
          }),
        ],
      },
    });
    const retainedFavorites: StoredFavorite[] = [
      {
        id: 'retained-favorite',
        name: 'Retained favorite',
        nodes: [],
        fonts: [
          {
            family: 'Favorite Font',
            sourceName: 'FavoriteFont-Regular.ttf',
            kind: 'uploaded' as const,
          },
        ],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    mockFavoriteLibraryService.load.mockReturnValue(retainedFavorites as never);

    renderHook(() => useEditorController());

    await waitFor(() => {
      expect(mockUploadedFontPersistenceService.pruneUnreferenced).toHaveBeenCalled();
    });

    expect(mockUploadedFontPersistenceService.pruneUnreferenced).toHaveBeenCalledWith(
      expect.arrayContaining([
        {
          family: 'Canvas Font',
          sourceName: 'CanvasFont-Regular.ttf',
          kind: 'uploaded',
        },
        {
          family: 'Favorite Font',
          sourceName: 'FavoriteFont-Regular.ttf',
          kind: 'uploaded',
        },
      ]),
    );
  });

  it('returns false when no nodes are selected', async () => {
    const { result } = renderHook(() => useEditorController());

    await waitFor(() => {
      expect(mockCanvasPersistenceService.load).toHaveBeenCalled();
    });

    expect(result.current.actions.saveSelectionAsFavorite()).toBe(false);
    expect(mockFavoriteLibraryService.save).not.toHaveBeenCalled();
  });

  it('reorders favorites and persists the new order', async () => {
    const favA: StoredFavorite = {
      id: 'fav-a',
      name: 'Alpha',
      nodes: [],
      fonts: [],
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    };
    const favB: StoredFavorite = {
      id: 'fav-b',
      name: 'Bravo',
      nodes: [],
      fonts: [],
      createdAt: '2026-03-02T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
    };
    mockFavoriteLibraryService.load.mockReturnValue([favA, favB] as never);

    const { result } = renderHook(() => useEditorController());

    await waitFor(() => {
      expect(result.current.state.favorites).toHaveLength(2);
    });

    act(() => {
      result.current.actions.reorderFavorite(1, 0);
    });

    expect(result.current.state.favorites.map((f) => f.id)).toEqual(['fav-b', 'fav-a']);
    expect(mockFavoriteLibraryService.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'fav-b' }),
        expect.objectContaining({ id: 'fav-a' }),
      ]),
    );
  });

  it('does not persist when reordering to the same position', async () => {
    const favA: StoredFavorite = {
      id: 'fav-a',
      name: 'Alpha',
      nodes: [],
      fonts: [],
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    };
    mockFavoriteLibraryService.load.mockReturnValue([favA] as never);

    const { result } = renderHook(() => useEditorController());

    await waitFor(() => {
      expect(result.current.state.favorites).toHaveLength(1);
    });

    mockFavoriteLibraryService.save.mockClear();

    act(() => {
      result.current.actions.reorderFavorite(0, 0);
    });

    expect(mockFavoriteLibraryService.save).not.toHaveBeenCalled();
  });

  it('surfaces favorite library persistence errors', async () => {
    const rectangle = createRectangleItem({ id: 'favorite-error-rectangle' });
    resetEditorStore({
      document: {
        ...createDefaultProjectDocument(),
        nodes: [rectangle],
      },
      session: {
        selectedNodeIds: [rectangle.id],
      },
    });
    mockFavoriteLibraryService.save.mockImplementation(() => {
      throw new Error('quota nope');
    });

    const { result } = renderHook(() => useEditorController());

    await waitFor(() => {
      expect(mockCanvasPersistenceService.load).toHaveBeenCalled();
    });

    let wasSaved = true;
    act(() => {
      wasSaved = result.current.actions.saveSelectionAsFavorite();
    });

    expect(wasSaved).toBe(false);
    expect(result.current.state.errorMessage).toBe(
      'Failed to save favorite: quota nope',
    );
  });
});
