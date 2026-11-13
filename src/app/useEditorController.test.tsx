import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEditorController } from './useEditorController';
import { useEditorStartup } from './useEditorStartup';
import type { StoredFavorite } from '../editor/persistence/favoriteLibraryService';
import {
  createDefaultProjectDocument,
  createRectangleItem,
  createTextItem,
} from '../editor/document/documentDefaults';
import { collectLeafItems } from '../editor/document/sceneGraph';
import { parseFontSourceName, type PersistedUploadedFont } from '../editor/fonts';
import { useEditorStore } from '../editor/state/store';
import { loadDocumentLibrarySession } from './documentLibrarySession';
import { defaultDocumentLibraryService } from '../editor/persistence/documentLibraryService';
import { clearDocumentLibrary } from '../test/documentLibrary';
import { resetEditorStore } from '../test/editorStore';

const {
  mockCanvasPersistenceService,
  mockDownloadProject,
  mockDownloadCanvasAsPng,
  mockCopyCanvasToClipboard,
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
    loadDocumentId: vi.fn().mockResolvedValue(null),
  },
  mockDownloadProject: vi.fn(),
  mockDownloadCanvasAsPng: vi.fn(),
  mockCopyCanvasToClipboard: vi.fn(),
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
  copyCanvasToClipboard: mockCopyCanvasToClipboard,
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
    loadBundledFonts: vi.fn(() => ({ first: Promise.resolve(), all: Promise.resolve([]) })),
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

/** The controller as the app mounts it: after startup has loaded the saved canvas. */
async function renderControllerAfterStartup() {
  const startup = renderHook(() => useEditorStartup());
  await waitFor(() => {
    expect(startup.result.current.fontsReady).toBe(true);
  });
  return renderHook(() => useEditorController({ fontsReady: true }));
}

describe('useEditorController', () => {
  beforeEach(async () => {
    await clearDocumentLibrary();
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

    const { result } = renderHook(() => useEditorController({ fontsReady: true }));


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

    const { result } = renderHook(() => useEditorController({ fontsReady: true }));

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

    const { result } = renderHook(() => useEditorController({ fontsReady: true }));


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

    const { result } = renderHook(() => useEditorController({ fontsReady: true }));


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
    mockCopyCanvasToClipboard.mockResolvedValue(undefined);
    let clipboardOk: boolean | undefined;
    let clipboardNoHandle: boolean | undefined;
    await act(async () => {
      result.current.actions.handleExport(null);
      result.current.actions.handleExport(stage);
      result.current.actions.handleExportJson();
      clipboardNoHandle = await result.current.actions.handleExportToClipboard(null);
      clipboardOk = await result.current.actions.handleExportToClipboard(stage);
    });
    expect(clipboardNoHandle).toBe(false);
    expect(clipboardOk).toBe(true);
    expect(mockCopyCanvasToClipboard).toHaveBeenCalledOnce();
    expect(mockCopyCanvasToClipboard).toHaveBeenCalledWith(stage, 2048, 2048, 1);

    mockCopyCanvasToClipboard.mockRejectedValueOnce(new Error('clipboard nope'));
    let clipboardFailed: boolean | undefined;
    await act(async () => {
      clipboardFailed = await result.current.actions.handleExportToClipboard(stage);
    });
    expect(clipboardFailed).toBe(false);
    await waitFor(() => {
      expect(result.current.state.errorMessage).toBe('Failed to copy to clipboard: clipboard nope');
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
    expect(mockDownloadCanvasAsPng).toHaveBeenCalledWith(stage, 2048, 2048, 1, 'Untitled canvas.png');
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

    const { result } = renderHook(() => useEditorController({ fontsReady: true }));


    expect(result.current.state.document.fonts).toEqual([]);
    expect(result.current.state.missingFontFamilies).toEqual([]);
  });

  it('reports a missing font only once the bundled fonts have all been loaded', async () => {
    resetEditorStore({
      document: {
        ...createDefaultProjectDocument(),
        fonts: [{ family: 'Slow Font', sourceName: 'SlowFont-Regular.ttf', kind: 'bundled' }],
        nodes: [createTextItem({ id: 'slow-text', fontFamily: 'Slow Font' })],
      },
    });

    const { result, rerender } = renderHook(
      ({ fontsReady }: { fontsReady: boolean }) => useEditorController({ fontsReady }),
      { initialProps: { fontsReady: false } },
    );
    // The font may simply not have arrived yet.
    expect(result.current.state.missingFontFamilies).toEqual([]);

    rerender({ fontsReady: true });
    await waitFor(() => {
      expect(result.current.state.missingFontFamilies).toEqual(['Slow Font']);
    });
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

    const { result } = await renderControllerAfterStartup();

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

    const { result } = renderHook(() => useEditorController({ fontsReady: true }));


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

    const { result } = renderHook(() => useEditorController({ fontsReady: true }));


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

    await act(async () => {
      result.current.actions.saveSelectionAsFavorite();
      await result.current.actions.handleNewProject();
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

    const { result } = renderHook(() => useEditorController({ fontsReady: true }));

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

  it('prunes persisted uploaded fonts using canvas, library and favorite references as the retention set', async () => {
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
    const libraryFont = {
      family: 'Library Font',
      sourceName: 'LibraryFont-Regular.ttf',
      kind: 'uploaded' as const,
    };
    await defaultDocumentLibraryService.save(
      {
        id: 'library-document',
        name: 'In the library',
        createdAt: 1,
        updatedAt: 1,
        preview: null,
        fonts: [libraryFont],
      },
      { ...createDefaultProjectDocument(), fonts: [libraryFont] },
    );
    // Startup reads the library before the editor mounts.
    await loadDocumentLibrarySession({ hasWorkingCopy: false });

    renderHook(() => useEditorController({ fontsReady: true }));

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
        libraryFont,
      ]),
    );
  });

  it('prunes no uploaded fonts while it is unknown what the library holds', async () => {
    // No startup has read the library: a font only a library document uses must not be deleted.
    renderHook(() => useEditorController({ fontsReady: true }));

    await waitFor(() => {
      expect(mockFavoriteLibraryService.load).toHaveBeenCalled();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mockUploadedFontPersistenceService.pruneUnreferenced).not.toHaveBeenCalled();
  });

  describe('an uploaded font family with several files', () => {
    const boldReference = {
      family: 'Persist Probe',
      sourceName: 'PersistProbe-Bold.otf',
      kind: 'uploaded' as const,
    };
    const regularReference = {
      family: 'Persist Probe',
      sourceName: 'PersistProbe-Regular.otf',
      kind: 'uploaded' as const,
    };
    const boldFont = { ...boldReference, weight: '700' as const, style: 'normal' as const };
    const regularFont = { ...regularReference, weight: '400' as const, style: 'normal' as const };
    const storedFonts: PersistedUploadedFont[] = [
      { ...boldFont, bytes: new Uint8Array([7]).buffer },
      { ...regularFont, bytes: new Uint8Array([4]).buffer },
    ];

    function fontUpload(fileName: string): FileList {
      const file = new File(['font'], fileName, { type: 'font/otf' });
      Object.defineProperty(file, 'arrayBuffer', {
        configurable: true,
        value: async () => new Uint8Array([1]).buffer,
      });
      return makeFileList(file);
    }

    function documentSetInPersistProbe(fonts = [boldReference, regularReference]) {
      return {
        ...createDefaultProjectDocument(),
        fonts,
        nodes: [createTextItem({ id: 'probe-text', fontFamily: 'Persist Probe' })],
      };
    }

    async function renderWithSelectedText() {
      const textItem = createTextItem({ id: 'font-target' });
      resetEditorStore({
        document: { ...createDefaultProjectDocument(), nodes: [textItem] },
        session: { selectedNodeIds: [textItem.id] },
      });
      const rendered = renderHook(() => useEditorController({ fontsReady: true }));
      return rendered;
    }

    beforeEach(() => {
      // As in the real loader, the family, weight and style come from the file name.
      mockRegisterFontFile.mockImplementation(async (file: File) => ({
        ...parseFontSourceName(file.name),
        kind: 'uploaded',
      }));
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

    it('references every uploaded file of the family chosen for the selected text', async () => {
      const { result } = await renderWithSelectedText();

      await act(async () => {
        await result.current.actions.handleFontUpload(fontUpload('PersistProbe-Bold.otf'));
      });
      await act(async () => {
        await result.current.actions.handleFontUpload(fontUpload('PersistProbe-Regular.otf'));
      });
      expect(result.current.state.availableFonts).toEqual([boldFont, regularFont]);
      // Uploading alone does not put a font in the document.
      expect(result.current.state.document.fonts).toEqual([]);

      act(() => {
        result.current.actions.updateSelectionItems({ fontFamily: 'Persist Probe' });
      });

      expect(result.current.state.document.fonts).toEqual([boldReference, regularReference]);
    });

    it('references a file uploaded after its family was chosen', async () => {
      const { result } = await renderWithSelectedText();

      await act(async () => {
        await result.current.actions.handleFontUpload(fontUpload('PersistProbe-Bold.otf'));
      });
      act(() => {
        result.current.actions.updateSelectionItems({ fontFamily: 'Persist Probe' });
      });
      expect(result.current.state.document.fonts).toEqual([boldReference]);

      await act(async () => {
        await result.current.actions.handleFontUpload(fontUpload('PersistProbe-Regular.otf'));
      });

      expect(result.current.state.document.fonts).toEqual([boldReference, regularReference]);
      expect(
        mockUploadedFontPersistenceService.save.mock.calls.map(([font]) => font.sourceName),
      ).toEqual(['PersistProbe-Bold.otf', 'PersistProbe-Regular.otf']);
    });

    it('restores every referenced file at startup and keeps them all when pruning', async () => {
      const persistedDocument = documentSetInPersistProbe();
      mockCanvasPersistenceService.load.mockResolvedValue(persistedDocument);
      mockUploadedFontPersistenceService.loadByReferences.mockResolvedValue(storedFonts);

      const { result } = await renderControllerAfterStartup();

      await waitFor(() => {
        expect(result.current.state.availableFonts).toEqual([boldFont, regularFont]);
      });
      expect(mockUploadedFontPersistenceService.loadByReferences).toHaveBeenCalledWith([
        boldReference,
        regularReference,
      ]);
      await waitFor(() => {
        expect(mockUploadedFontPersistenceService.pruneUnreferenced).toHaveBeenCalledWith([
          boldReference,
          regularReference,
        ]);
      });
      expect(result.current.state.document.fonts).toEqual([boldReference, regularReference]);
      expect(result.current.state.missingFontFamilies).toEqual([]);
    });

    it('saves a favorite with every file of its family and restores them all on insert', async () => {
      resetEditorStore({
        document: documentSetInPersistProbe(),
        session: { selectedNodeIds: ['probe-text'] },
      });
      const { result } = renderHook(() => useEditorController({ fontsReady: true }));

      await act(async () => {
        result.current.actions.saveSelectionAsFavorite();
        await result.current.actions.handleNewProject();
      });
      const favorite = result.current.state.favorites[0]!;
      expect(favorite.fonts).toEqual([boldReference, regularReference]);
      expect(result.current.state.document.fonts).toEqual([]);

      mockUploadedFontPersistenceService.loadByReferences.mockResolvedValue(storedFonts);
      await act(async () => {
        await result.current.actions.insertFavorite(favorite.id);
      });

      expect(mockUploadedFontPersistenceService.loadByReferences).toHaveBeenLastCalledWith([
        boldReference,
        regularReference,
      ]);
      expect(result.current.state.availableFonts).toEqual([boldFont, regularFont]);
      expect(result.current.state.document.fonts).toEqual([boldReference, regularReference]);
    });

    it('references the files uploaded this session when inserting a favorite saved with only one of them', async () => {
      const savedBeforeTheBoldUpload: StoredFavorite = {
        id: 'regular-only-favorite',
        name: 'Regular only',
        nodes: [createTextItem({ id: 'favorite-text', fontFamily: 'Persist Probe' })],
        fonts: [regularReference],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockFavoriteLibraryService.load.mockReturnValue([savedBeforeTheBoldUpload] as never);
      mockUploadedFontPersistenceService.loadByReferences.mockResolvedValue([storedFonts[1]]);

      const { result } = renderHook(() => useEditorController({ fontsReady: true }));
      await waitFor(() => {
        expect(result.current.state.favorites).toHaveLength(1);
      });
      await act(async () => {
        await result.current.actions.handleFontUpload(fontUpload('PersistProbe-Bold.otf'));
      });
      await act(async () => {
        await result.current.actions.insertFavorite('regular-only-favorite');
      });

      expect(result.current.state.document.fonts).toEqual([regularReference, boldReference]);
    });
  });

  it('returns false when no nodes are selected', async () => {
    const { result } = renderHook(() => useEditorController({ fontsReady: true }));


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

    const { result } = renderHook(() => useEditorController({ fontsReady: true }));

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

    const { result } = renderHook(() => useEditorController({ fontsReady: true }));

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

    const { result } = renderHook(() => useEditorController({ fontsReady: true }));


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
