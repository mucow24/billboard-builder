import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDocumentLibrarySession } from './documentLibrarySession';
import { useDocumentLibraryController, type LeaveChoice } from './useDocumentLibraryController';
import {
  createDefaultProjectDocument,
  createRectangleItem,
  DEFAULT_CANVAS_NAME,
} from '../editor/document/documentDefaults';
import { collectLeafItems } from '../editor/document/sceneGraph';
import { defaultCanvasPersistenceService } from '../editor/persistence/canvasPersistenceService';
import { defaultDocumentLibraryService } from '../editor/persistence/documentLibraryService';
import { useEditorStore } from '../editor/state/store';
import { clearDocumentLibrary } from '../test/documentLibrary';
import { resetEditorStore } from '../test/editorStore';

const { mockDownloadProject, mockReadProjectFile } = vi.hoisted(() => ({
  mockDownloadProject: vi.fn(),
  mockReadProjectFile: vi.fn(),
}));

vi.mock('../editor/io/projectFile', () => ({
  downloadProject: (...args: unknown[]) => mockDownloadProject(...args),
  readProjectFile: (...args: unknown[]) => mockReadProjectFile(...args),
}));

const setErrorMessage = vi.fn();
const capturePreview = vi.fn(async (): Promise<string | null> => 'data:image/png;base64,PREVIEW');
/** The user's answer when asked what to do with unsaved changes. "Save" unless a test says otherwise. */
const confirmLeave = vi.fn(async (): Promise<LeaveChoice> => 'save');

function renderController() {
  return renderHook(() => {
    const document = useEditorStore((state) => state.editor.document);
    return useDocumentLibraryController({ document, capturePreview, confirmLeave, setErrorMessage });
  });
}

function editorDocument() {
  return useEditorStore.getState().editor.document;
}

function itemIds() {
  return editorDocument().nodes.flatMap(collectLeafItems).map((item) => item.id);
}

function addRectangle(id: string) {
  act(() => {
    useEditorStore.getState().dispatch({ type: 'add_node', item: createRectangleItem({ id }) });
  });
}

function renameCanvas(name: string) {
  act(() => {
    useEditorStore.getState().dispatch({ type: 'set_canvas_name', name });
  });
}

function makeFileList(file: File): FileList {
  return { 0: file, length: 1, item: () => file } as unknown as FileList;
}

type Controller = ReturnType<typeof renderController>['result'];

async function save(result: Controller) {
  let saved = false;
  await act(async () => {
    saved = await result.current.actions.saveDocument();
  });
  return saved;
}

describe('useDocumentLibraryController', () => {
  beforeEach(async () => {
    await clearDocumentLibrary();
    resetEditorStore();
    setErrorMessage.mockReset();
    capturePreview.mockClear();
    capturePreview.mockResolvedValue('data:image/png;base64,PREVIEW');
    confirmLeave.mockReset();
    confirmLeave.mockResolvedValue('save');
    mockDownloadProject.mockReset();
    mockReadProjectFile.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('unsaved changes', () => {
    it('reports none for a blank canvas that was never saved', () => {
      const { result } = renderController();

      expect(result.current.state.hasUnsavedChanges).toBe(false);
      expect(result.current.state.canRevert).toBe(false);
      expect(result.current.state.entries).toEqual([]);
    });

    it('reports them once a canvas that was never saved has something on it, with nothing to revert to', () => {
      const { result } = renderController();

      addRectangle('first');

      expect(result.current.state.hasUnsavedChanges).toBe(true);
      expect(result.current.state.canRevert).toBe(false);
    });

    it('clears them on save and reports them again on the next change', async () => {
      const { result } = renderController();
      addRectangle('first');

      expect(await save(result)).toBe(true);

      expect(result.current.state.hasUnsavedChanges).toBe(false);
      expect(result.current.state.canRevert).toBe(false);

      addRectangle('second');

      expect(result.current.state.hasUnsavedChanges).toBe(true);
      expect(result.current.state.canRevert).toBe(true);
    });

    it('clears them when the change is undone back to the saved version', async () => {
      const { result } = renderController();
      addRectangle('first');
      await save(result);
      addRectangle('second');

      act(() => {
        useEditorStore.getState().undo();
      });

      expect(result.current.state.hasUnsavedChanges).toBe(false);
    });
  });

  describe('saving', () => {
    it('puts the document in the library with its name, a preview and its fonts', async () => {
      const { result } = renderController();
      renameCanvas('Poster');
      addRectangle('first');

      await save(result);

      const [entry] = result.current.state.entries;
      expect(entry).toMatchObject({
        id: result.current.state.documentId,
        name: 'Poster',
        fonts: [],
      });
      expect(result.current.state.previews).toEqual({ [entry.id]: 'data:image/png;base64,PREVIEW' });
      await expect(defaultDocumentLibraryService.loadPreviews()).resolves.toEqual({
        [entry.id]: 'data:image/png;base64,PREVIEW',
      });
      expect(capturePreview).toHaveBeenCalledWith(editorDocument());
      const stored = await defaultDocumentLibraryService.loadDocument(entry);
      expect(stored?.nodes.flatMap(collectLeafItems).map((item) => item.id)).toEqual(['first']);
    });

    it('does nothing when there are no unsaved changes', async () => {
      const { result } = renderController();
      const saveToLibrary = vi.spyOn(defaultDocumentLibraryService, 'save');

      expect(await save(result)).toBe(true);

      expect(saveToLibrary).not.toHaveBeenCalled();
      expect(result.current.state.entries).toEqual([]);
    });

    it('keeps the creation date and updates the saved date on a later save', async () => {
      const now = vi.spyOn(Date, 'now');
      const { result } = renderController();
      addRectangle('first');
      now.mockReturnValue(1_000);
      await save(result);

      addRectangle('second');
      now.mockReturnValue(2_000);
      await save(result);

      expect(result.current.state.entries).toHaveLength(1);
      expect(result.current.state.entries[0]).toMatchObject({ createdAt: 1_000, updatedAt: 2_000 });
    });

    it('saves without a preview when none can be drawn, keeping an earlier one', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { result } = renderController();
      addRectangle('first');
      const id = result.current.state.documentId;
      capturePreview.mockResolvedValueOnce(null);
      await save(result);
      expect(result.current.state.entries).toHaveLength(1);
      expect(result.current.state.previews).toEqual({});

      addRectangle('second');
      await save(result);
      expect(result.current.state.previews[id]).toBe('data:image/png;base64,PREVIEW');

      addRectangle('third');
      capturePreview.mockRejectedValueOnce(new Error('context lost'));
      expect(await save(result)).toBe(true);
      expect(result.current.state.previews[id]).toBe('data:image/png;base64,PREVIEW');
      await expect(defaultDocumentLibraryService.loadPreviews()).resolves.toEqual({
        [id]: 'data:image/png;base64,PREVIEW',
      });
    });

    it('keeps the changes unsaved and says why when the library cannot be written', async () => {
      const { result } = renderController();
      renameCanvas('Poster');
      addRectangle('first');
      vi.spyOn(defaultDocumentLibraryService, 'save').mockRejectedValueOnce(new Error('disk full'));

      expect(await save(result)).toBe(false);

      expect(result.current.state.hasUnsavedChanges).toBe(true);
      expect(result.current.state.entries).toEqual([]);
      expect(setErrorMessage).toHaveBeenLastCalledWith(
        'Failed to save "Poster" to the library: disk full',
      );
    });

    it('is busy while the save is under way and ignores a second request meanwhile', async () => {
      const { result } = renderController();
      addRectangle('first');
      let finishPreview: (preview: string) => void = () => {};
      capturePreview.mockReturnValueOnce(
        new Promise<string | null>((resolve) => {
          finishPreview = resolve;
        }),
      );

      let first: Promise<boolean> = Promise.resolve(false);
      let second: Promise<boolean> = Promise.resolve(true);
      act(() => {
        first = result.current.actions.saveDocument();
        second = result.current.actions.newDocument();
      });

      expect(result.current.state.busy).toBe(true);
      await expect(second).resolves.toBe(false);

      await act(async () => {
        finishPreview('data:image/png;base64,LATE');
        await first;
      });

      expect(result.current.state.busy).toBe(false);
      expect(itemIds()).toEqual(['first']);
      expect(Object.values(result.current.state.previews)).toEqual(['data:image/png;base64,LATE']);
    });
  });

  describe('renaming', () => {
    it('does not count a new name as an unsaved change, and lists the document under it at once', async () => {
      const { result } = renderController();
      renameCanvas('Before');
      addRectangle('first');
      await save(result);

      renameCanvas('After');

      await waitFor(() => {
        expect(result.current.state.entries[0].name).toBe('After');
      });
      expect(result.current.state.hasUnsavedChanges).toBe(false);
      const [storedEntry] = (await defaultDocumentLibraryService.listEntries()).entries;
      expect(storedEntry.name).toBe('After');
    });

    it('renames the open document in the editor when it is renamed in the library', async () => {
      const { result } = renderController();
      addRectangle('first');
      await save(result);

      act(() => {
        result.current.actions.renameLibraryDocument(result.current.state.documentId, '  From the library  ');
      });

      expect(editorDocument().name).toBe('From the library');
      await waitFor(() => {
        expect(result.current.state.entries[0].name).toBe('From the library');
      });
    });

    it('renames another library document without touching the open one', async () => {
      const { result } = renderController();
      renameCanvas('First');
      addRectangle('first');
      await act(async () => {
        await result.current.actions.newDocument();
      });
      const firstId = result.current.state.entries[0].id;

      act(() => {
        result.current.actions.renameLibraryDocument(firstId, 'Renamed');
        result.current.actions.renameLibraryDocument(firstId, '   ');
      });

      expect(result.current.state.entries[0].name).toBe('Renamed');
      expect(editorDocument().name).toBe(DEFAULT_CANVAS_NAME);
      const [storedEntry] = (await defaultDocumentLibraryService.listEntries()).entries;
      expect(storedEntry.name).toBe('Renamed');
    });
  });

  describe('reverting', () => {
    it('goes back to the saved version, keeps the current name, and can be undone', async () => {
      const { result } = renderController();
      renameCanvas('Saved name');
      addRectangle('first');
      await save(result);
      addRectangle('second');
      renameCanvas('Later name');

      let reverted = false;
      await act(async () => {
        reverted = await result.current.actions.revertDocument();
      });

      expect(reverted).toBe(true);
      expect(itemIds()).toEqual(['first']);
      expect(editorDocument().name).toBe('Later name');
      expect(result.current.state.hasUnsavedChanges).toBe(false);
      expect(useEditorStore.getState().editor.session.selectedNodeIds).toEqual([]);

      act(() => {
        useEditorStore.getState().undo();
      });

      expect(itemIds()).toEqual(['first', 'second']);
      expect(result.current.state.hasUnsavedChanges).toBe(true);
    });

    it('does nothing for a document that was never saved', async () => {
      const { result } = renderController();
      addRectangle('first');

      let reverted = true;
      await act(async () => {
        reverted = await result.current.actions.revertDocument();
      });

      expect(reverted).toBe(false);
      expect(itemIds()).toEqual(['first']);
    });
  });

  describe('starting a new document', () => {
    it('saves the open document to the library first when the user chooses to', async () => {
      const { result } = renderController();
      renameCanvas('Poster');
      addRectangle('first');
      const posterId = result.current.state.documentId;

      await act(async () => {
        await result.current.actions.newDocument();
      });

      expect(itemIds()).toEqual([]);
      expect(editorDocument().name).toBe(DEFAULT_CANVAS_NAME);
      expect(result.current.state.documentId).not.toBe(posterId);
      expect(result.current.state.hasUnsavedChanges).toBe(false);
      expect(result.current.state.entries.map((entry) => entry.id)).toEqual([posterId]);
      expect(useEditorStore.getState().canUndo()).toBe(false);
    });

    // The autosave waits a moment after a change. A reload within that moment
    // used to bring the previous document back.
    it('stores the new document as the working copy before it is done', async () => {
      const saveWorkingCopy = vi.spyOn(defaultCanvasPersistenceService, 'save');
      const { result } = renderController();
      addRectangle('first');

      await act(async () => {
        await result.current.actions.newDocument();
      });

      expect(saveWorkingCopy).toHaveBeenCalledExactlyOnceWith(
        editorDocument(),
        result.current.state.documentId,
      );
      expect(itemIds()).toEqual([]);
    });

    it('adds nothing to the library for a blank canvas', async () => {
      const { result } = renderController();

      await act(async () => {
        await result.current.actions.newDocument();
        await result.current.actions.newDocument();
      });

      expect(result.current.state.entries).toEqual([]);
    });

    it('stays on the open document when it cannot be saved', async () => {
      const { result } = renderController();
      addRectangle('first');
      const openId = result.current.state.documentId;
      vi.spyOn(defaultDocumentLibraryService, 'save').mockRejectedValueOnce(new Error('disk full'));

      let started = true;
      await act(async () => {
        started = await result.current.actions.newDocument();
      });

      expect(started).toBe(false);
      expect(itemIds()).toEqual(['first']);
      expect(result.current.state.documentId).toBe(openId);
      expect(setErrorMessage).toHaveBeenLastCalledWith(expect.stringContaining('disk full'));
    });
  });

  describe('leaving a document with unsaved changes', () => {
    it('asks what to do with them, naming the document and saying whether it was ever saved', async () => {
      const { result } = renderController();
      renameCanvas('Poster');
      addRectangle('first');

      await act(async () => {
        await result.current.actions.newDocument();
      });
      expect(confirmLeave).toHaveBeenLastCalledWith({ documentName: 'Poster', neverSaved: true });

      await act(async () => {
        await result.current.actions.openLibraryDocument(result.current.state.entries[0].id);
      });
      addRectangle('second');
      await act(async () => {
        await result.current.actions.newDocument();
      });
      expect(confirmLeave).toHaveBeenLastCalledWith({ documentName: 'Poster', neverSaved: false });
      expect(confirmLeave).toHaveBeenCalledTimes(2);
    });

    it('does not ask when nothing is unsaved', async () => {
      const { result } = renderController();
      await act(async () => {
        await result.current.actions.newDocument();
      });
      addRectangle('first');
      await save(result);
      await act(async () => {
        await result.current.actions.newDocument();
      });

      expect(confirmLeave).not.toHaveBeenCalled();
      expect(itemIds()).toEqual([]);
    });

    it('drops the changes on Discard and leaves the saved version as it was', async () => {
      const { result } = renderController();
      addRectangle('first');
      await save(result);
      const [savedEntry] = result.current.state.entries;
      addRectangle('unsaved');
      confirmLeave.mockResolvedValue('discard');
      const saveToLibrary = vi.spyOn(defaultDocumentLibraryService, 'save');

      let started = false;
      await act(async () => {
        started = await result.current.actions.newDocument();
      });

      expect(started).toBe(true);
      expect(itemIds()).toEqual([]);
      expect(saveToLibrary).not.toHaveBeenCalled();
      expect(result.current.state.entries).toEqual([savedEntry]);
      const stored = await defaultDocumentLibraryService.loadDocument(savedEntry);
      expect(stored?.nodes.flatMap(collectLeafItems).map((item) => item.id)).toEqual(['first']);
    });

    it('adds nothing to the library when a document that was never saved is discarded', async () => {
      const { result } = renderController();
      addRectangle('scratch');
      confirmLeave.mockResolvedValue('discard');

      await act(async () => {
        await result.current.actions.newDocument();
      });

      expect(itemIds()).toEqual([]);
      expect(result.current.state.entries).toEqual([]);
    });

    it('stays on the document on Cancel, with its changes still unsaved', async () => {
      const { result } = renderController();
      addRectangle('first');
      const openId = result.current.state.documentId;
      confirmLeave.mockResolvedValue('cancel');
      mockReadProjectFile.mockResolvedValue(createDefaultProjectDocument());

      let started = true;
      let imported = true;
      await act(async () => {
        started = await result.current.actions.newDocument();
        imported = await result.current.actions.importProjectFile(makeFileList(new File(['{}'], 'file.json')));
      });

      expect(started).toBe(false);
      expect(imported).toBe(false);
      expect(itemIds()).toEqual(['first']);
      expect(result.current.state.documentId).toBe(openId);
      expect(result.current.state.hasUnsavedChanges).toBe(true);
      expect(result.current.state.entries).toEqual([]);
      expect(setErrorMessage).not.toHaveBeenCalled();
    });

    // A library that cannot be written used to block New and Load for good.
    it('can still be left by discarding after a save has failed', async () => {
      const { result } = renderController();
      addRectangle('first');
      vi.spyOn(defaultDocumentLibraryService, 'save').mockRejectedValue(new Error('disk full'));

      let started = true;
      await act(async () => {
        started = await result.current.actions.newDocument();
      });
      expect(started).toBe(false);
      expect(itemIds()).toEqual(['first']);

      confirmLeave.mockResolvedValue('discard');
      await act(async () => {
        started = await result.current.actions.newDocument();
      });

      expect(started).toBe(true);
      expect(itemIds()).toEqual([]);
      expect(result.current.state.busy).toBe(false);
    });

    it('is busy while it waits for the answer', async () => {
      const { result } = renderController();
      addRectangle('first');
      let answer: (choice: LeaveChoice) => void = () => {};
      confirmLeave.mockReturnValueOnce(
        new Promise<LeaveChoice>((resolve) => {
          answer = resolve;
        }),
      );

      let started: Promise<boolean> = Promise.resolve(false);
      act(() => {
        started = result.current.actions.newDocument();
      });
      expect(result.current.state.busy).toBe(true);
      expect(itemIds()).toEqual(['first']);

      await act(async () => {
        answer('discard');
        await started;
      });
      expect(result.current.state.busy).toBe(false);
      expect(itemIds()).toEqual([]);
    });
  });

  describe('previews', () => {
    it('are read from storage on request, as after a reload', async () => {
      const { result } = renderController();
      addRectangle('first');
      await save(result);
      const id = result.current.state.documentId;
      act(() => {
        useDocumentLibrarySession.setState({ previews: {} });
      });
      expect(result.current.state.previews).toEqual({});

      await act(async () => {
        await result.current.actions.loadLibraryPreviews();
      });

      expect(result.current.state.previews).toEqual({ [id]: 'data:image/png;base64,PREVIEW' });
    });

    it('stay as they are when storage cannot be read', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { result } = renderController();
      addRectangle('first');
      await save(result);
      vi.spyOn(defaultDocumentLibraryService, 'loadPreviews').mockRejectedValueOnce(new Error('gone'));

      await act(async () => {
        await result.current.actions.loadLibraryPreviews();
      });

      expect(Object.values(result.current.state.previews)).toEqual(['data:image/png;base64,PREVIEW']);
    });
  });

  describe('opening from the library', () => {
    async function createTwoDocuments(result: Controller) {
      renameCanvas('First');
      addRectangle('first');
      const firstId = result.current.state.documentId;
      await act(async () => {
        await result.current.actions.newDocument();
      });
      renameCanvas('Second');
      addRectangle('second');
      return { firstId, secondId: result.current.state.documentId };
    }

    it('saves the open document, then opens the other one with no unsaved changes', async () => {
      const { result } = renderController();
      const { firstId, secondId } = await createTwoDocuments(result);

      let opened = false;
      await act(async () => {
        opened = await result.current.actions.openLibraryDocument(firstId);
      });

      expect(opened).toBe(true);
      expect(itemIds()).toEqual(['first']);
      expect(editorDocument().name).toBe('First');
      expect(result.current.state.documentId).toBe(firstId);
      expect(result.current.state.hasUnsavedChanges).toBe(false);
      expect(useEditorStore.getState().canUndo()).toBe(false);
      expect(result.current.state.entries.map((entry) => entry.id).sort()).toEqual(
        [firstId, secondId].sort(),
      );

      await act(async () => {
        await result.current.actions.openLibraryDocument(secondId);
      });
      expect(itemIds()).toEqual(['second']);
      expect(editorDocument().name).toBe('Second');
    });

    it('leaves the names of both documents alone while switching', async () => {
      const { result } = renderController();
      const { firstId, secondId } = await createTwoDocuments(result);

      await act(async () => {
        await result.current.actions.openLibraryDocument(firstId);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const names = Object.fromEntries(
        (await defaultDocumentLibraryService.listEntries()).entries.map((entry) => [entry.id, entry.name]),
      );
      expect(names).toEqual({ [firstId]: 'First', [secondId]: 'Second' });
    });

    it('has nothing to do for the document that is already open', async () => {
      const { result } = renderController();
      addRectangle('first');
      await save(result);
      addRectangle('unsaved');

      let opened = false;
      await act(async () => {
        opened = await result.current.actions.openLibraryDocument(result.current.state.documentId);
      });

      expect(opened).toBe(true);
      expect(itemIds()).toEqual(['first', 'unsaved']);
      expect(result.current.state.hasUnsavedChanges).toBe(true);
    });

    it('stays on the open document and drops the entry when the document is gone from the library', async () => {
      const { result } = renderController();
      const { firstId } = await createTwoDocuments(result);
      // Its entry is still stored, but the document behind it is not.
      vi.spyOn(defaultDocumentLibraryService, 'loadDocument').mockResolvedValueOnce(null);

      let opened = true;
      await act(async () => {
        opened = await result.current.actions.openLibraryDocument(firstId);
      });

      expect(opened).toBe(false);
      expect(itemIds()).toEqual(['second']);
      expect(result.current.state.entries).toEqual([]);
      expect(setErrorMessage).toHaveBeenLastCalledWith('"First" is no longer in the library.');
      // The entry is taken out of storage too, or it would be back after a reload.
      expect((await defaultDocumentLibraryService.listEntries()).entries).toEqual([]);
    });

    it('stays on the open document when the other one cannot be read', async () => {
      const { result } = renderController();
      const { firstId } = await createTwoDocuments(result);
      vi.spyOn(defaultDocumentLibraryService, 'loadDocument').mockRejectedValueOnce(new Error('corrupt'));

      let opened = true;
      await act(async () => {
        opened = await result.current.actions.openLibraryDocument(firstId);
      });

      expect(opened).toBe(false);
      expect(itemIds()).toEqual(['second']);
      expect(setErrorMessage).toHaveBeenLastCalledWith(
        'Failed to open "First" from the library: corrupt',
      );
    });
  });

  describe('opening a JSON file', () => {
    it('saves the open document, then opens the file as a new document with unsaved changes', async () => {
      const { result } = renderController();
      renameCanvas('Poster');
      addRectangle('first');
      const posterId = result.current.state.documentId;
      mockReadProjectFile.mockResolvedValue({
        ...createDefaultProjectDocument(),
        name: 'From a file',
        nodes: [createRectangleItem({ id: 'from-file' })],
      });

      let opened = false;
      await act(async () => {
        opened = await result.current.actions.importProjectFile(makeFileList(new File(['{}'], 'file.json')));
      });

      expect(opened).toBe(true);
      expect(itemIds()).toEqual(['from-file']);
      expect(result.current.state.documentId).not.toBe(posterId);
      expect(result.current.state.entries.map((entry) => entry.id)).toEqual([posterId]);
      // It is not in the library until it is saved or left.
      expect(result.current.state.hasUnsavedChanges).toBe(true);
      expect(result.current.state.canRevert).toBe(false);
    });

    it('changes nothing when the file cannot be read', async () => {
      const { result } = renderController();
      addRectangle('first');
      mockReadProjectFile.mockRejectedValue(new Error('Broken project'));

      let opened = true;
      await act(async () => {
        opened = await result.current.actions.importProjectFile(makeFileList(new File(['x'], 'bad.json')));
      });

      expect(opened).toBe(false);
      expect(itemIds()).toEqual(['first']);
      expect(result.current.state.entries).toEqual([]);
      expect(setErrorMessage).toHaveBeenLastCalledWith('Failed to open project: Broken project');
    });

    it('ignores an empty file selection', async () => {
      const { result } = renderController();

      await expect(result.current.actions.importProjectFile(null)).resolves.toBe(false);
      expect(mockReadProjectFile).not.toHaveBeenCalled();
    });
  });

  describe('deleting and exporting', () => {
    it('deletes another document from the library', async () => {
      const { result } = renderController();
      addRectangle('first');
      const firstId = result.current.state.documentId;
      await act(async () => {
        await result.current.actions.newDocument();
      });
      addRectangle('second');

      await act(async () => {
        await result.current.actions.deleteLibraryDocument(firstId);
      });

      expect(result.current.state.entries).toEqual([]);
      expect(itemIds()).toEqual(['second']);
      expect((await defaultDocumentLibraryService.listEntries()).entries).toEqual([]);
      expect(result.current.state.previews).toEqual({});
    });

    it('starts a blank document when the open one is deleted, without saving it back', async () => {
      const { result } = renderController();
      addRectangle('first');
      await save(result);
      addRectangle('unsaved');
      const deletedId = result.current.state.documentId;

      await act(async () => {
        await result.current.actions.deleteLibraryDocument(deletedId);
      });

      expect(itemIds()).toEqual([]);
      expect(result.current.state.documentId).not.toBe(deletedId);
      expect(result.current.state.entries).toEqual([]);
      expect(result.current.state.hasUnsavedChanges).toBe(false);
    });

    it('keeps the document when it cannot be deleted', async () => {
      const { result } = renderController();
      renameCanvas('Poster');
      addRectangle('first');
      await save(result);
      vi.spyOn(defaultDocumentLibraryService, 'remove').mockRejectedValueOnce(new Error('locked'));

      await act(async () => {
        await result.current.actions.deleteLibraryDocument(result.current.state.documentId);
      });

      expect(result.current.state.entries).toHaveLength(1);
      expect(itemIds()).toEqual(['first']);
      expect(setErrorMessage).toHaveBeenLastCalledWith(
        'Failed to delete "Poster" from the library: locked',
      );
    });

    it('exports the saved version of a library document as JSON, named after it', async () => {
      const { result } = renderController();
      renameCanvas('My: Poster');
      addRectangle('first');
      await save(result);
      addRectangle('unsaved');

      await act(async () => {
        await result.current.actions.exportLibraryDocument(result.current.state.documentId);
      });

      expect(mockDownloadProject).toHaveBeenCalledOnce();
      const [exported, fileName] = mockDownloadProject.mock.calls[0];
      expect(exported.name).toBe('My: Poster');
      expect(exported.nodes.flatMap(collectLeafItems).map((item: { id: string }) => item.id)).toEqual([
        'first',
      ]);
      expect(fileName).toMatch(/\.json$/);
    });
  });

  it('keeps the session in step with the editor: the saved version is the document in the editor', async () => {
    const { result } = renderController();
    addRectangle('first');
    await save(result);

    expect(useDocumentLibrarySession.getState().savedDocument).toBe(editorDocument());
    expect(useDocumentLibrarySession.getState().currentId).toBe(result.current.state.documentId);
  });
});
