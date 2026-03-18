import { createDefaultEditorState } from '../editor/core/editorState';
import { useEditorStore, type EditorStoreState } from '../editor/state/store';

type EditorStoreSlices = Pick<
  EditorStoreState,
  | 'document'
  | 'activeTool'
  | 'availableFonts'
  | 'missingFontFamilies'
  | 'exportScale'
  | 'selectedItemIds'
  | 'historyPast'
  | 'historyFuture'
>;

export function createEditorStoreSlices(
  overrides: Partial<EditorStoreSlices> = {}
): EditorStoreSlices {
  const initialState = createDefaultEditorState();
  return {
    document: initialState.document,
    activeTool: initialState.session.activeTool,
    availableFonts: initialState.session.availableFonts,
    missingFontFamilies: initialState.session.missingFontFamilies,
    exportScale: initialState.session.exportScale,
    selectedItemIds: initialState.session.selectedItemIds,
    historyPast: initialState.history.past,
    historyFuture: initialState.history.future,
    ...overrides,
  };
}

export function resetEditorStore(overrides: Partial<EditorStoreSlices> = {}) {
  useEditorStore.setState(createEditorStoreSlices(overrides));
}
