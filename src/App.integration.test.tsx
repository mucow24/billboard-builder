import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDownloadProject,
  mockDownloadStageAsPng,
  mockImportImageFile,
  mockLoadBundledFonts,
  mockPersistenceClear,
  mockPersistenceLoad,
  mockPersistenceSave,
  mockReadProjectFile,
  mockRegisterFontFile,
} = vi.hoisted(() => ({
  mockDownloadProject: vi.fn(),
  mockDownloadStageAsPng: vi.fn(),
  mockImportImageFile: vi.fn(),
  mockLoadBundledFonts: vi.fn(),
  mockPersistenceClear: vi.fn(),
  mockPersistenceLoad: vi.fn(),
  mockPersistenceSave: vi.fn(),
  mockReadProjectFile: vi.fn(),
  mockRegisterFontFile: vi.fn(),
}));

vi.mock('konva', () => ({
  default: {
    Filters: {
      Brighten: Symbol('Brighten'),
      Contrast: Symbol('Contrast'),
      RGBA: Symbol('RGBA'),
    },
  },
}));

vi.mock('react-konva', () => {
  type MockKonvaProps = PropsWithChildren<Record<string, unknown>>;

  const make = (name: string) =>
    React.forwardRef<HTMLDivElement, MockKonvaProps>(({ children, ...props }, ref) => {
      let nodeRef: HTMLDivElement | null = null;
      const domEntries = Object.entries(props).flatMap<[string, string]>(([key, value]) => {
        if (value === undefined || typeof value === 'function') {
          return [];
        }
        return [[`data-prop-${key.toLowerCase()}`, typeof value === 'object' ? JSON.stringify(value) : String(value)]];
      });
      const domProps = Object.fromEntries(domEntries);

      const setRef = (node: HTMLDivElement | null) => {
        nodeRef = node;
        if (node) {
          Object.assign(node, {
            getStage: () => ({
              getPointerPosition: () => ({ x: 640, y: 360 }),
            }),
            getClientRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
            hasName: (value: string) => String(props.name ?? '').split(' ').includes(value),
            name: () => String(props.name ?? ''),
            x: () => Number(props.x ?? 0),
            y: () => Number(props.y ?? 0),
            rotation: () => Number(props.rotation ?? 0),
            scaleX: () => Number(props.scaleX ?? 1),
            scaleY: () => Number(props.scaleY ?? 1),
          });
        }
        if (typeof ref === 'function') {
          ref(nodeRef);
        } else if (ref) {
          ref.current = nodeRef;
        }
      };

      return React.createElement(
        'div',
        { ref: setRef, 'data-konva-node': name, ...domProps },
        children as React.ReactNode
      );
    });

  return {
    Stage: make('Stage'),
    Layer: make('Layer'),
    Group: make('Group'),
    Rect: make('Rect'),
    Line: make('Line'),
    Text: make('Text'),
    Circle: make('Circle'),
    Ellipse: make('Ellipse'),
    Image: make('Image'),
  };
});

vi.mock('./editor/rendering/useImageElement', () => ({
  useImageElement: () => null,
}));

vi.mock('./editor/rendering/ImageItemNode', () => ({
  ImageItemNode: () => null,
}));

vi.mock('./editor/io/exportPng', () => ({
  downloadStageAsPng: (...args: unknown[]) => mockDownloadStageAsPng(...args),
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
    save: (...args: unknown[]) => mockPersistenceSave(...args),
  },
}));

vi.mock('./editor/fonts', async () => {
  const actual = await vi.importActual<typeof import('./editor/fonts')>('./editor/fonts');
  return {
    ...actual,
    findMissingFonts: vi.fn(() => []),
    loadBundledFonts: (...args: unknown[]) => mockLoadBundledFonts(...args),
    registerFontFile: (...args: unknown[]) => mockRegisterFontFile(...args),
  };
});

import App from './App';
import {
  createDefaultProjectDocument,
  createRectangleItem,
  createTextItem,
} from './editor/document/documentDefaults';
import { useEditorStore } from './editor/state/store';
import { resetEditorStore } from './test/editorStore';

describe('App integration', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    resetEditorStore();
    mockLoadBundledFonts.mockResolvedValue([]);
    mockPersistenceClear.mockResolvedValue(undefined);
    mockPersistenceLoad.mockResolvedValue(null);
    mockPersistenceSave.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the real app shell and applies properties changes through the store/controller path', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'Save' });

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
        items: [selectedRectangle],
      });
      useEditorStore.getState().selectSingleItem(selectedRectangle.id);
    });

    fireEvent.change(screen.getByLabelText('Corner radius'), {
      target: { value: '24' },
    });

    await waitFor(() => {
      const item = useEditorStore.getState().editor.document.items[0];
      expect(item.kind).toBe('rectangle');
      expect(item.kind === 'rectangle' ? item.cornerRadius : 0).toBe(24);
    });
  });

  it('mutates the real document through keyboard shortcuts and controller actions', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'Save' });

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
        items: [selectedRectangle],
      });
      useEditorStore.getState().selectSingleItem(selectedRectangle.id);
    });

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'ArrowDown', shiftKey: true });

    await waitFor(() => {
      const item = useEditorStore.getState().editor.document.items[0];
      expect(item.x).toBe(101);
      expect(item.y).toBe(125);
    });

    fireEvent.keyDown(document, { key: 'Delete' });
    await waitFor(() => {
      expect(useEditorStore.getState().editor.document.items).toHaveLength(0);
    });

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
    await waitFor(() => {
      expect(useEditorStore.getState().editor.document.items).toHaveLength(1);
    });
  });

  it('wires save, export, open, and import flows through their real controller boundaries', async () => {
    const openedDocument = {
      ...createDefaultProjectDocument(),
      items: [createTextItem({ id: 'opened-text', text: 'Opened from file' })],
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

    render(<App />);
    await screen.findByRole('button', { name: 'Save' });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    const exportButton = screen.getByRole('button', { name: 'Export PNG' });
    fireEvent.click(saveButton);
    fireEvent.click(exportButton);

    expect(mockDownloadProject).toHaveBeenCalledOnce();
    expect(mockDownloadStageAsPng).toHaveBeenCalledWith(expect.anything(), 1);

    fireEvent.change(screen.getByTestId('project-open-input'), {
      target: {
        files: [new File(['{}'], 'project.json', { type: 'application/json' })],
      },
    });

    await waitFor(() => {
      expect(useEditorStore.getState().editor.document.items).toHaveLength(1);
      expect(useEditorStore.getState().editor.document.items[0]?.id).toBe('opened-text');
    });

    fireEvent.change(screen.getByTestId('image-upload-input'), {
      target: {
        files: [new File(['<svg/>'], 'fixture.svg', { type: 'image/svg+xml' })],
      },
    });

    await waitFor(() => {
      expect(useEditorStore.getState().editor.document.items.some((item) => item.kind === 'image')).toBe(true);
    });

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
      items: [createRectangleItem({ id: 'opened-rectangle' })],
    });
    mockRegisterFontFile.mockRejectedValueOnce(new Error('Broken font'));
    mockRegisterFontFile.mockResolvedValueOnce({
      family: 'Cal Sans',
      sourceName: 'CalSans-Regular.ttf',
      kind: 'uploaded',
      style: 'normal',
      weight: '400',
    });

    render(<App />);
    await screen.findByRole('button', { name: 'Save' });

    fireEvent.change(screen.getByTestId('image-upload-input'), {
      target: {
        files: [new File(['bad'], 'broken.svg', { type: 'image/svg+xml' })],
      },
    });
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to import image: Broken image');

    fireEvent.change(screen.getByTestId('image-upload-input'), {
      target: {
        files: [new File(['ok'], 'fixed.svg', { type: 'image/svg+xml' })],
      },
    });
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });

    fireEvent.change(screen.getByTestId('project-open-input'), {
      target: {
        files: [new File(['bad'], 'broken.json', { type: 'application/json' })],
      },
    });
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to open project: Broken project');

    fireEvent.change(screen.getByTestId('project-open-input'), {
      target: {
        files: [new File(['ok'], 'fixed.json', { type: 'application/json' })],
      },
    });
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });

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

  it('persists document changes only after bootstrap is ready and the debounce elapses', async () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockPersistenceLoad).toHaveBeenCalledOnce();
    mockPersistenceSave.mockClear();

    act(() => {
      useEditorStore.getState().dispatch({
        type: 'add_item',
        item: createRectangleItem({ id: 'persisted-after-debounce' }),
      });
    });

    expect(mockPersistenceSave).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mockPersistenceSave).toHaveBeenCalledOnce();
    }, { timeout: 1000 });
  });
});
