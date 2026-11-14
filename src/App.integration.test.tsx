import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React, { type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDownloadProject,
  mockDownloadCanvasAsPng,
  mockImportImageFile,
  mockLoadBundledFonts,
  mockPersistenceClear,
  mockPersistenceLoad,
  mockPersistenceSave,
  mockReadProjectFile,
  mockRegisterFontFile,
  mockRegisterUploadedFontBytes,
  mockFavoriteLibraryClear,
  mockFavoriteLibraryLoad,
  mockFavoriteLibrarySave,
  mockUploadedFontPersistenceClear,
  mockUploadedFontPersistenceLoadByReferences,
  mockUploadedFontPersistencePruneUnreferenced,
  mockUploadedFontPersistenceSave,
} = vi.hoisted(() => ({
  mockDownloadProject: vi.fn(),
  mockDownloadCanvasAsPng: vi.fn(),
  mockImportImageFile: vi.fn(),
  mockLoadBundledFonts: vi.fn(),
  mockPersistenceClear: vi.fn(),
  mockPersistenceLoad: vi.fn(),
  mockPersistenceSave: vi.fn(),
  mockReadProjectFile: vi.fn(),
  mockRegisterFontFile: vi.fn(),
  mockRegisterUploadedFontBytes: vi.fn(),
  mockFavoriteLibraryClear: vi.fn(),
  mockFavoriteLibraryLoad: vi.fn(),
  mockFavoriteLibrarySave: vi.fn(),
  mockUploadedFontPersistenceClear: vi.fn(),
  mockUploadedFontPersistenceLoadByReferences: vi.fn(),
  mockUploadedFontPersistencePruneUnreferenced: vi.fn(),
  mockUploadedFontPersistenceSave: vi.fn(),
}));

vi.mock('pixi-filters', () => ({
  DropShadowFilter: class { constructor() {} },
}));

vi.mock('pixi.js', () => ({
  AlphaFilter: class { constructor() {} },
  BlurFilter: class { constructor() {} },
  ColorMatrixFilter: class { matrix = new Float32Array(20); constructor() { this.matrix[0] = 1; this.matrix[6] = 1; this.matrix[12] = 1; this.matrix[18] = 1; } },
  Container: class {},
  FillGradient: class { constructor() {} },
  Filter: class { constructor() {} },
  GlProgram: { from: () => ({}) },
  GpuProgram: { from: () => ({}) },
  Graphics: class {},
  Polygon: class { constructor() {} },
  Rectangle: class {
    constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
  },
  Sprite: class {},
  Text: class {},
  Texture: { from: () => ({}), EMPTY: {} },
  TextureSource: { defaultOptions: {} },
  TexturePool: { getSameSizeTexture: () => ({}), returnTexture: () => {} },
}));

vi.mock('@pixi/react', () => {
  type MockProps = PropsWithChildren<Record<string, unknown>>;
  const Application = React.forwardRef<unknown, MockProps>(({ children }, ref) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    React.useImperativeHandle(ref, () => ({
      getCanvas: () => canvasRef.current,
      getApplication: () => ({ canvas: canvasRef.current }),
    }));
    return React.createElement('div', { 'data-pixi': 'application' },
      React.createElement('canvas', { ref: canvasRef }),
      children as React.ReactNode,
    );
  });
  return {
    Application,
    extend: () => {},
  };
});

vi.mock('./editor/rendering/useImageElement', () => ({
  useImageElement: () => null,
}));

vi.mock('./editor/io/exportPng', () => ({
  downloadCanvasAsPng: (...args: unknown[]) => mockDownloadCanvasAsPng(...args),
}));

vi.mock('./editor/io/images', () => ({
  importImageFile: (...args: unknown[]) => mockImportImageFile(...args),
}));

vi.mock('./editor/io/projectFile', () => ({
  downloadProject: (...args: unknown[]) => mockDownloadProject(...args),
  readProjectFile: (...args: unknown[]) => mockReadProjectFile(...args),
}));

vi.mock('./editor/persistence/canvasPersistenceService', () => ({
  defaultCanvasPersistenceService: {
    clear: (...args: unknown[]) => mockPersistenceClear(...args),
    load: (...args: unknown[]) => mockPersistenceLoad(...args),
    loadDocumentId: async () => null,
    save: (...args: unknown[]) => mockPersistenceSave(...args),
  },
}));

vi.mock('./editor/persistence/favoriteLibraryService', () => ({
  defaultFavoriteLibraryService: {
    clear: (...args: unknown[]) => mockFavoriteLibraryClear(...args),
    load: (...args: unknown[]) => mockFavoriteLibraryLoad(...args),
    save: (...args: unknown[]) => mockFavoriteLibrarySave(...args),
  },
}));

vi.mock('./editor/persistence/uploadedFontPersistenceService', async () => {
  const actual =
    await vi.importActual<typeof import('./editor/persistence/uploadedFontPersistenceService')>(
      './editor/persistence/uploadedFontPersistenceService',
    );
  return {
    ...actual,
    defaultUploadedFontPersistenceService: {
      clear: (...args: unknown[]) => mockUploadedFontPersistenceClear(...args),
      loadByReferences: (...args: unknown[]) => mockUploadedFontPersistenceLoadByReferences(...args),
      pruneUnreferenced: (...args: unknown[]) => mockUploadedFontPersistencePruneUnreferenced(...args),
      save: (...args: unknown[]) => mockUploadedFontPersistenceSave(...args),
    },
  };
});

vi.mock('./editor/fonts', async () => {
  const actual = await vi.importActual<typeof import('./editor/fonts')>('./editor/fonts');
  return {
    ...actual,
    findMissingFonts: vi.fn(() => []),
    loadBundledFonts: (...args: unknown[]) => mockLoadBundledFonts(...args),
    registerFontFile: (...args: unknown[]) => mockRegisterFontFile(...args),
    registerUploadedFontBytes: (...args: unknown[]) => mockRegisterUploadedFontBytes(...args),
  };
});

import App from './App';
import {
  createDefaultProjectDocument,
  createRectangleItem,
  createTextItem,
} from './editor/document/documentDefaults';
import { collectLeafItems } from './editor/document/sceneGraph';
import { useEditorStore } from './editor/state/store';
import { clearDocumentLibrary } from './test/documentLibrary';
import { resetEditorStore } from './test/editorStore';
import { settleRender } from './test/settleRender';

async function renderApp() {
  const ui = <App />;
  const view = render(ui);

  // The editor is rendered once startup has put the saved canvas in place.
  await screen.findByRole('button', { name: 'Canvas' });
  settleRender(view, ui);
}

function clickToolbarPopoverItem(triggerName: string, itemName: string) {
  fireEvent.click(screen.getByRole('button', { name: triggerName }));
  fireEvent.click(screen.getByRole('button', { name: itemName }));
}

function clickLoadFromJson() {
  fireEvent.click(screen.getByRole('button', { name: 'Canvas' }));
  fireEvent.click(screen.getByRole('button', { name: 'Load' }));
  fireEvent.click(screen.getByRole('button', { name: 'From JSON...' }));
}

describe('App integration', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    await clearDocumentLibrary();
    resetEditorStore();
    mockLoadBundledFonts.mockReturnValue(({ first: Promise.resolve(), all: Promise.resolve([]) }));
    mockPersistenceClear.mockResolvedValue(undefined);
    mockPersistenceLoad.mockResolvedValue(null);
    mockPersistenceSave.mockResolvedValue(undefined);
    mockRegisterUploadedFontBytes.mockReset();
    mockFavoriteLibraryClear.mockReset();
    mockFavoriteLibraryLoad.mockReturnValue([]);
    mockFavoriteLibrarySave.mockReset();
    mockUploadedFontPersistenceClear.mockReset();
    mockUploadedFontPersistenceLoadByReferences.mockResolvedValue([]);
    mockUploadedFontPersistencePruneUnreferenced.mockResolvedValue(undefined);
    mockUploadedFontPersistenceSave.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the real app shell and applies properties changes through the store/controller path', async () => {
    await renderApp();

    const selectedRectangle = createRectangleItem({
      id: 'selected-rectangle',
      x: 180,
      y: 220,
      width: 220,
      height: 140,
      cornerRadius: 0,
    });

    act(() => {
      useEditorStore.getState().loadDocument({
        ...createDefaultProjectDocument(),
        nodes: [selectedRectangle],
      });
      useEditorStore.getState().selectSingleNode(selectedRectangle.id);
    });

    fireEvent.change(screen.getByLabelText('Corner radius'), {
      target: { value: '24' },
    });
    fireEvent.blur(screen.getByLabelText('Corner radius'));

    await waitFor(() => {
      const item = useEditorStore.getState().editor.document.nodes.flatMap(collectLeafItems)[0];
      expect(item.kind).toBe('rectangle');
      expect(item.kind === 'rectangle' ? item.cornerRadius : 0).toBe(24);
    });
  });

  it('mutates the real document through keyboard shortcuts and controller actions', async () => {
    await renderApp();

    const selectedRectangle = createRectangleItem({
      id: 'shortcut-rectangle',
      x: 100,
      y: 120,
      width: 220,
      height: 140,
    });

    act(() => {
      useEditorStore.getState().loadDocument({
        ...createDefaultProjectDocument(),
        nodes: [selectedRectangle],
      });
      useEditorStore.getState().selectSingleNode(selectedRectangle.id);
    });

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'ArrowDown', shiftKey: true });

    await waitFor(() => {
      const item = useEditorStore.getState().editor.document.nodes.flatMap(collectLeafItems)[0];
      expect(item.x).toBe(101);
      expect(item.y).toBe(125);
    });

    fireEvent.keyDown(document, { key: 'Delete' });
    await waitFor(() => {
      expect(useEditorStore.getState().editor.document.nodes.flatMap(collectLeafItems)).toHaveLength(0);
    });

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
    await waitFor(() => {
      expect(useEditorStore.getState().editor.document.nodes.flatMap(collectLeafItems)).toHaveLength(1);
    });
  });

  it('wires save, export, open, and import flows through their real controller boundaries', async () => {
    const openedDocument = {
      ...createDefaultProjectDocument(),
      nodes: [createTextItem({ id: 'opened-text', text: 'Opened from file' })],
    };
    mockReadProjectFile.mockResolvedValue(openedDocument);
    mockImportImageFile.mockResolvedValue({
      src: 'data:image/svg+xml;base64,PHN2Zy8+',
      mimeType: 'image/svg+xml',
      width: 160,
      height: 90,
      sourceName: 'fixture.svg',
    });
    mockRegisterFontFile.mockResolvedValue({
      family: 'Cal Sans',
      sourceName: 'CalSans-Regular.ttf',
      kind: 'uploaded',
      style: 'normal',
      weight: '400',
    });

    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'To JSON' }));
    clickToolbarPopoverItem('Export', 'PNG');

    expect(mockDownloadProject).toHaveBeenCalledOnce();
    expect(mockDownloadCanvasAsPng).toHaveBeenCalledWith(expect.anything(), 2048, 2048, 1, 'Untitled canvas.png');

    clickLoadFromJson();
    fireEvent.change(screen.getByTestId('project-open-input'), {
      target: {
        files: [new File(['{}'], 'project.json', { type: 'application/json' })],
      },
    });

    await waitFor(() => {
      expect(useEditorStore.getState().editor.document.nodes.flatMap(collectLeafItems)).toHaveLength(1);
      expect(useEditorStore.getState().editor.document.nodes.flatMap(collectLeafItems)[0]?.id).toBe('opened-text');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add image' }));
    fireEvent.change(screen.getByTestId('image-upload-input'), {
      target: {
        files: [new File(['<svg/>'], 'fixture.svg', { type: 'image/svg+xml' })],
      },
    });

    await waitFor(() => {
      expect(useEditorStore.getState().editor.document.nodes.flatMap(collectLeafItems).some((item) => item.kind === 'image')).toBe(true);
    });

    // Font upload UI path (font picker → Import font…) is covered by e2e tests;
    // here we verify the processing pipeline via the hidden input directly.
    fireEvent.change(screen.getByTestId('font-upload-input'), {
      target: {
        files: [new File(['font'], 'CalSans-Regular.ttf', { type: 'font/ttf' })],
      },
    });

    await waitFor(() => {
      expect(useEditorStore.getState().editor.session.availableFonts.some((font) => font.family === 'Cal Sans')).toBe(true);
    });
  });

  it('shows import errors and clears them after later successful actions', async () => {
    mockImportImageFile.mockRejectedValueOnce(new Error('Broken image'));
    mockImportImageFile.mockResolvedValueOnce({
      src: 'data:image/svg+xml;base64,PHN2Zy8+',
      mimeType: 'image/svg+xml',
      width: 160,
      height: 90,
      sourceName: 'fixture.svg',
    });
    mockReadProjectFile.mockRejectedValueOnce(new Error('Broken project'));
    mockReadProjectFile.mockResolvedValueOnce({
      ...createDefaultProjectDocument(),
      nodes: [createRectangleItem({ id: 'opened-rectangle' })],
    });
    mockRegisterFontFile.mockRejectedValueOnce(new Error('Broken font'));
    mockRegisterFontFile.mockResolvedValueOnce({
      family: 'Cal Sans',
      sourceName: 'CalSans-Regular.ttf',
      kind: 'uploaded',
      style: 'normal',
      weight: '400',
    });

    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Add image' }));
    fireEvent.change(screen.getByTestId('image-upload-input'), {
      target: {
        files: [new File(['bad'], 'broken.svg', { type: 'image/svg+xml' })],
      },
    });
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to import image: Broken image');

    fireEvent.click(screen.getByRole('button', { name: 'Add image' }));
    fireEvent.change(screen.getByTestId('image-upload-input'), {
      target: {
        files: [new File(['ok'], 'fixed.svg', { type: 'image/svg+xml' })],
      },
    });
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });

    clickLoadFromJson();
    fireEvent.change(screen.getByTestId('project-open-input'), {
      target: {
        files: [new File(['bad'], 'broken.json', { type: 'application/json' })],
      },
    });
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to open project: Broken project');

    clickLoadFromJson();
    fireEvent.change(screen.getByTestId('project-open-input'), {
      target: {
        files: [new File(['ok'], 'fixed.json', { type: 'application/json' })],
      },
    });
    // The canvas holds an image that is not in the library: the app asks before replacing it.
    fireEvent.click(
      within(await screen.findByRole('alertdialog', { name: 'Unsaved changes' })).getByRole('button', {
        name: 'Discard',
      }),
    );
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // Font upload UI path covered by e2e tests; verify processing pipeline directly.
    fireEvent.change(screen.getByTestId('font-upload-input'), {
      target: {
        files: [new File(['bad'], 'broken.ttf', { type: 'font/ttf' })],
      },
    });
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to register font: Broken font');

    fireEvent.change(screen.getByTestId('font-upload-input'), {
      target: {
        files: [new File(['ok'], 'fixed.ttf', { type: 'font/ttf' })],
      },
    });
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('shows and saves nothing until the saved canvas has been read, then autosaves changes after the debounce', async () => {
    let finishLoad: (document: null) => void = () => {};
    mockPersistenceLoad.mockReturnValue(
      new Promise((resolve) => {
        finishLoad = resolve;
      }),
    );
    const ui = <App />;
    const view = render(ui);
    expect(mockPersistenceLoad).toHaveBeenCalledOnce();

    // Longer than the autosave debounce.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    expect(screen.queryByRole('button', { name: 'Canvas' })).toBeNull();
    expect(mockPersistenceSave).not.toHaveBeenCalled();

    finishLoad(null);
    await screen.findByRole('button', { name: 'Canvas' });
    settleRender(view, ui);
    mockPersistenceSave.mockClear();

    act(() => {
      useEditorStore.getState().dispatch({
        type: 'add_node',
        item: createRectangleItem({ id: 'persisted-after-debounce' }),
      });
    });

    expect(mockPersistenceSave).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mockPersistenceSave).toHaveBeenCalledOnce();
    }, { timeout: 1000 });
  });
});
