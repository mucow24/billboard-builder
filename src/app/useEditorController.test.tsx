import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEditorController } from './useEditorController';
import {
  createDefaultProjectDocument,
  createRectangleItem,
} from '../editor/document/documentDefaults';
import { resetEditorStore } from '../test/editorStore';

const {
  mockCanvasPersistenceService,
  mockDownloadProject,
  mockDownloadStageAsPng,
  mockImportImageFile,
  mockReadProjectFile,
  mockRegisterFontFile,
} = vi.hoisted(() => ({
  mockCanvasPersistenceService: {
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
  mockDownloadProject: vi.fn(),
  mockDownloadStageAsPng: vi.fn(),
  mockImportImageFile: vi.fn(),
  mockReadProjectFile: vi.fn(),
  mockRegisterFontFile: vi.fn(),
}));

vi.mock('../editor/persistence/canvasPersistenceService', () => ({
  defaultCanvasPersistenceService: mockCanvasPersistenceService,
}));

vi.mock('../editor/io/exportPng', () => ({
  downloadStageAsPng: mockDownloadStageAsPng,
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
    mockDownloadStageAsPng.mockReset();
    mockImportImageFile.mockReset();
    mockReadProjectFile.mockReset();
    mockRegisterFontFile.mockReset();
    resetEditorStore();
  });

  it('exposes selected item state and undo availability', async () => {
    const rectangleItem = createRectangleItem();
    resetEditorStore({
      document: {
        ...createDefaultProjectDocument(),
        items: [rectangleItem],
      },
      session: {
        selectedItemIds: [rectangleItem.id],
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
      expect(result.current.state.document.items).toHaveLength(1);
    });

    expect(mockImportImageFile).toHaveBeenCalledWith(file);
    expect(result.current.state.document.items[0]).toMatchObject({
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

    const { result } = renderHook(() => useEditorController());

    await waitFor(() => {
      expect(mockCanvasPersistenceService.load).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.actions.handleFontUpload(makeFileList(fontFile));
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
    expect(mockDownloadStageAsPng).toHaveBeenCalledOnce();
    expect(mockDownloadStageAsPng).toHaveBeenCalledWith(stage, 1);
    expect(mockDownloadProject).toHaveBeenCalledOnce();
  });
});
