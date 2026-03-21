// These tests intentionally mock the canvas surface and only cover App shell wiring.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { APP_CLIPBOARD_MIME_TYPE } from './app/clipboard';
import {
  DUPLICATE_ITEM_OFFSET,
  createDefaultProjectDocument,
  createImageItem,
  createRectangleItem,
  createTextItem,
} from './editor/document/documentDefaults';
import type { PersistedUploadedFont } from './editor/fonts';
import { useEditorStore } from './editor/state/store';
import { resetEditorStore } from './test/editorStore';

const {
  mockCanvasPersistenceService,
  mockImportImageFile,
  mockRegisterUploadedFontBytes,
  mockTemplateLibraryService,
  mockUploadedFontPersistenceService,
} = vi.hoisted(() => ({
  mockCanvasPersistenceService: {
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
  mockImportImageFile: vi.fn(),
  mockRegisterUploadedFontBytes: vi.fn(),
  mockTemplateLibraryService: {
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

vi.mock('./editor/fonts', async () => {
  const actual =
    await vi.importActual<typeof import('./editor/fonts')>(
      './editor/fonts',
    );
  return {
    ...actual,
    loadBundledFonts: vi.fn().mockResolvedValue([]),
    registerUploadedFontBytes: (...args: unknown[]) => mockRegisterUploadedFontBytes(...args),
  };
});


vi.mock('./editor/persistence/canvasPersistenceService', () => ({
  defaultCanvasPersistenceService: mockCanvasPersistenceService,
}));

vi.mock('./editor/persistence/templateLibraryService', () => ({
  defaultTemplateLibraryService: mockTemplateLibraryService,
}));

vi.mock('./editor/persistence/uploadedFontPersistenceService', async () => {
  const actual =
    await vi.importActual<typeof import('./editor/persistence/uploadedFontPersistenceService')>(
      './editor/persistence/uploadedFontPersistenceService',
    );
  return {
    ...actual,
    defaultUploadedFontPersistenceService: mockUploadedFontPersistenceService,
  };
});

vi.mock('./editor/io/images', async () => {
  const actual =
    await vi.importActual<typeof import('./editor/io/images')>(
      './editor/io/images',
    );
  return {
    ...actual,
    importImageFile: mockImportImageFile,
  };
});

vi.mock('./editor/rendering/CanvasStage', () => ({
  CanvasStage: ({
    activeTool,
    document,
  }: {
    activeTool: string;
    document: { items: Array<{ id: string }> };
  }) => (
    <div>
      <div data-testid="mock-stage">
        Tool: {activeTool} / Items: {document.items.length}
      </div>
    </div>
  ),
}));

function makeClipboardItem(file: File | null, type = file?.type ?? 'image/png'): DataTransferItem {
  return {
    kind: file ? 'file' : 'string',
    type,
    getAsFile: () => file,
  } as DataTransferItem;
}

function makeClipboardData({
  initialData = {},
  items = [],
  files = [],
}: {
  initialData?: Record<string, string>;
  items?: DataTransferItem[];
  files?: File[];
} = {}): DataTransfer {
  const data = new Map(Object.entries(initialData));

  return {
    items,
    files,
    getData: (type: string) => data.get(type) ?? '',
    setData: (type: string, value: string) => {
      data.set(type, value);
    },
  } as unknown as DataTransfer;
}

async function renderApp() {
  render(<App />);

  await waitFor(() => {
    expect(mockCanvasPersistenceService.load).toHaveBeenCalled();
  });
}

describe('App shell', () => {
  beforeEach(() => {
    mockCanvasPersistenceService.load.mockResolvedValue(null);
    mockCanvasPersistenceService.save.mockResolvedValue(undefined);
    mockCanvasPersistenceService.clear.mockResolvedValue(undefined);
    mockImportImageFile.mockReset();
    mockRegisterUploadedFontBytes.mockReset();
    mockTemplateLibraryService.clear.mockReset();
    mockTemplateLibraryService.load.mockReturnValue([]);
    mockTemplateLibraryService.save.mockReset();
    mockUploadedFontPersistenceService.clear.mockReset();
    mockUploadedFontPersistenceService.loadByReferences.mockResolvedValue([]);
    mockUploadedFontPersistenceService.pruneUnreferenced.mockResolvedValue(undefined);
    mockUploadedFontPersistenceService.save.mockResolvedValue(undefined);
    resetEditorStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the top toolbar controls', async () => {
    await renderApp();

    expect(screen.getByRole('button', { name: 'Export PNG' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Canvas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Size' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });

  it('switches into rectangle creation mode from the tool palette', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Rect/ }));

    expect(screen.getByRole('button', { name: /Rect/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('mock-stage')).toHaveTextContent(
      'Tool: rectangle / Items: 0',
    );
  });

  it('restores the persisted document on boot', async () => {
    const persistedDocument = createDefaultProjectDocument();
    persistedDocument.items = [createRectangleItem()];
    mockCanvasPersistenceService.load.mockResolvedValue(persistedDocument);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-stage')).toHaveTextContent('Items: 1');
    });
  });

  it('does not show a missing-font warning while uploaded font restoration is still pending', async () => {
    let resolveRestore: ((value: PersistedUploadedFont[]) => void) | undefined;
    const persistedDocument = createDefaultProjectDocument();
    persistedDocument.fonts = [
      {
        family: 'Poster Sans',
        sourceName: 'PosterSans-Regular.ttf',
        kind: 'uploaded',
      },
    ];
    persistedDocument.items = [
      createTextItem({
        id: 'persisted-text',
        fontFamily: 'Poster Sans',
      }),
    ];
    mockCanvasPersistenceService.load.mockResolvedValue(persistedDocument);
    mockUploadedFontPersistenceService.loadByReferences.mockReturnValue(
      new Promise((resolve) => {
        resolveRestore = resolve;
      }),
    );
    mockRegisterUploadedFontBytes.mockResolvedValue({
      family: 'Poster Sans',
      sourceName: 'PosterSans-Regular.ttf',
      weight: '400',
      style: 'normal',
      kind: 'uploaded',
    });

    render(<App />);

    await waitFor(() => {
      expect(mockCanvasPersistenceService.load).toHaveBeenCalled();
    });

    expect(screen.queryByText('Missing fonts')).not.toBeInTheDocument();

    if (resolveRestore) {
      resolveRestore([
        {
          family: 'Poster Sans',
          sourceName: 'PosterSans-Regular.ttf',
          weight: '400',
          style: 'normal',
          kind: 'uploaded',
          bytes: new Uint8Array([1, 2, 3]).buffer,
        },
      ]);
    }

    await waitFor(() => {
      expect(mockRegisterUploadedFontBytes).toHaveBeenCalled();
    });
    expect(screen.queryByText('Missing fonts')).not.toBeInTheDocument();
  });

  it('persists the latest canvas snapshot after edits', async () => {
    render(<App />);

    await waitFor(() => {
      expect(mockCanvasPersistenceService.load).toHaveBeenCalled();
    });

    act(() => {
      useEditorStore.getState().dispatch({ type: 'add_item', item: createRectangleItem() });
    });

    await waitFor(() => {
      expect(mockCanvasPersistenceService.save).toHaveBeenCalled();
    });

    const latestSavedDocument = mockCanvasPersistenceService.save.mock.calls.at(-1)?.[0];
    expect(latestSavedDocument.items).toHaveLength(1);
  });


  it('persists image adjustments in the latest autosaved canvas snapshot', async () => {
    render(<App />);

    await waitFor(() => {
      expect(mockCanvasPersistenceService.load).toHaveBeenCalled();
    });

    const imageItem = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 40,
      originalHeight: 20,
    });
    imageItem.adjustments = {
      brightness: 140,
      contrast: 20,
      tintColor: '#123456',
      tintStrength: 60,
    };

    act(() => {
      useEditorStore.getState().dispatch({ type: 'add_item', item: imageItem });
    });

    await waitFor(() => {
      const latestSavedDocument = mockCanvasPersistenceService.save.mock.calls.at(-1)?.[0];
      expect(latestSavedDocument.items[0]).toMatchObject({
        kind: 'image',
        adjustments: {
          brightness: 140,
          contrast: 20,
          tintColor: '#123456',
          tintStrength: 60,
        },
      });
    });
  });


  it('applies multi-selection opacity changes to every selected item', async () => {
    const first = createRectangleItem({ id: 'first', opacity: 0.2 });
    const second = createRectangleItem({ id: 'second', opacity: 0.8, x: 200 });

    resetEditorStore({
      document: { ...createDefaultProjectDocument(), items: [first, second] },
      session: {
        selectedItemIds: [first.id, second.id],
      },
    });

    render(<App />);

    expect(await screen.findByText('Mixed')).toBeInTheDocument();
    const opacityInput = await screen.findByLabelText('Opacity');
    fireEvent.change(opacityInput, { target: { value: '0.5' } });

    const updatedItems = useEditorStore.getState().editor.document.items;
    expect(updatedItems.find((item) => item.id === first.id)?.opacity).toBe(0.5);
    expect(updatedItems.find((item) => item.id === second.id)?.opacity).toBe(0.5);
  });

  it('supports global tool hotkeys', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.keyboard('t');
    expect(screen.getByRole('button', { name: /Text/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /Select/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('copies, pastes, cuts, and duplicates the selected item with editor shortcuts', async () => {
    const user = userEvent.setup();
    const rectangleItem = createRectangleItem({ x: 40, y: 60 });
    const clipboardData = makeClipboardData();
    resetEditorStore({
      document: {
        ...createDefaultProjectDocument(),
        items: [rectangleItem],
      },
      session: {
        selectedItemIds: [rectangleItem.id],
      },
    });
    render(<App />);

    fireEvent.copy(document.body, {
      clipboardData,
    });
    expect(clipboardData.getData(APP_CLIPBOARD_MIME_TYPE)).not.toBe('');

    fireEvent.paste(document.body, {
      clipboardData,
    });

    let items = useEditorStore.getState().editor.document.items;
    expect(items).toHaveLength(2);
    expect(items[1].x).toBe(rectangleItem.x + DUPLICATE_ITEM_OFFSET);
    expect(items[1].y).toBe(rectangleItem.y + DUPLICATE_ITEM_OFFSET);

    await user.keyboard('{Control>}d{/Control}');
    items = useEditorStore.getState().editor.document.items;
    expect(items).toHaveLength(3);

    const cutItem = items[2];
    fireEvent.cut(document.body, {
      clipboardData,
    });
    expect(useEditorStore.getState().editor.document.items).toHaveLength(2);

    fireEvent.paste(document.body, {
      clipboardData,
    });
    items = useEditorStore.getState().editor.document.items;
    expect(items).toHaveLength(3);
    expect(items[2].x).toBe(cutItem.x + DUPLICATE_ITEM_OFFSET);
    expect(items[2].y).toBe(cutItem.y + DUPLICATE_ITEM_OFFSET);
  });

  it('pastes clipboard images into the canvas through the shared import flow', async () => {
    const imageFile = new File(['image'], 'clipboard.png', { type: 'image/png' });
    mockImportImageFile.mockResolvedValue({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      width: 640,
      height: 320,
      sourceName: 'clipboard.png',
    });

    render(<App />);

    fireEvent.paste(document.body, {
      clipboardData: makeClipboardData({
        items: [makeClipboardItem(imageFile)],
      }),
    });

    await waitFor(() => {
      expect(mockImportImageFile).toHaveBeenCalledWith(imageFile);
    });

    const items = useEditorStore.getState().editor.document.items;
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({
        kind: 'image',
        mimeType: 'image/png',
        name: 'clipboard.png',
        originalWidth: 640,
        originalHeight: 320,
      }),
    );
  });

  it('prefers the app clipboard payload over a stale system image when pasting app-copied content', async () => {
    const firstImageFile = new File(['image-a'], 'first-image.png', { type: 'image/png' });
    const secondImageFile = new File(['image-b'], 'second-image.png', { type: 'image/png' });
    const copiedItem = createRectangleItem({ x: 40, y: 60 });
    const clipboardData = makeClipboardData();

    mockImportImageFile
      .mockResolvedValueOnce({
        src: 'data:image/png;base64,AAA',
        mimeType: 'image/png',
        width: 640,
        height: 320,
        sourceName: 'first-image.png',
      })
      .mockResolvedValueOnce({
        src: 'data:image/png;base64,BBB',
        mimeType: 'image/png',
        width: 800,
        height: 400,
        sourceName: 'second-image.png',
      });

    resetEditorStore({
      document: {
        ...createDefaultProjectDocument(),
        items: [copiedItem],
      },
      session: {
        selectedItemIds: [copiedItem.id],
      },
    });

    render(<App />);

    fireEvent.paste(document.body, {
      clipboardData: makeClipboardData({
        items: [makeClipboardItem(firstImageFile)],
      }),
    });

    await waitFor(() => {
      expect(useEditorStore.getState().editor.document.items).toHaveLength(2);
    });

    fireEvent.copy(document.body, {
      clipboardData,
    });

    fireEvent.paste(document.body, {
      clipboardData: makeClipboardData({
        initialData: {
          [APP_CLIPBOARD_MIME_TYPE]: clipboardData.getData(APP_CLIPBOARD_MIME_TYPE),
        },
        items: [makeClipboardItem(secondImageFile)],
      }),
    });

    const items = useEditorStore.getState().editor.document.items;
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual(
      expect.objectContaining({
        kind: 'rectangle',
        id: copiedItem.id,
      }),
    );
    expect(items[1]).toEqual(
      expect.objectContaining({
        kind: 'image',
        name: 'first-image.png',
      }),
    );
    expect(items[2]).toEqual(
      expect.objectContaining({
        kind: 'image',
        name: 'first-image.png',
        originalWidth: 640,
        originalHeight: 320,
      }),
    );
    expect(mockImportImageFile).toHaveBeenCalledTimes(1);
  });



  it('nudges the selected item with arrow keys', async () => {
    const user = userEvent.setup();
    const rectangleItem = createRectangleItem({ x: 40, y: 60 });
    resetEditorStore({
      document: {
        ...createDefaultProjectDocument(),
        items: [rectangleItem],
      },
      session: {
        selectedItemIds: [rectangleItem.id],
      },
    });
    render(<App />);

    await user.keyboard('{ArrowRight}');
    expect(useEditorStore.getState().editor.document.items[0].x).toBe(41);

    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(useEditorStore.getState().editor.document.items[0].y).toBe(65);
  });

  it('updates canvas size controls from the size menu', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: 'Size' }));

    fireEvent.change(screen.getByLabelText('Canvas width'), {
      target: { value: '900' },
    });
    fireEvent.change(screen.getByLabelText('Canvas height'), {
      target: { value: '500' },
    });

    expect(useEditorStore.getState().editor.document.canvas.width).toBe(900);
    expect(useEditorStore.getState().editor.document.canvas.height).toBe(500);
  });

  it('shows a visible error when opening an invalid project file', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Canvas' }));
    await user.click(screen.getByRole('button', { name: 'Load...' }));

    const openInput = screen.getByTestId('project-open-input');
    const invalidFile = new File(['not valid json'], 'broken-project.json', {
      type: 'application/json',
    });

    fireEvent.change(openInput, {
      target: {
        files: [invalidFile],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to open project',
      );
    });
  });

  it('ignores empty image and font upload events', async () => {
    await renderApp();

    fireEvent.change(screen.getByTestId('image-upload-input'), {
      target: { files: [] },
    });
    fireEvent.change(screen.getByTestId('font-upload-input'), {
      target: { files: [] },
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(useEditorStore.getState().editor.document.items).toHaveLength(0);
    expect(useEditorStore.getState().editor.session.availableFonts).toEqual([]);
  });
});
