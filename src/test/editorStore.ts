import {
  createDefaultEditorState,
  type EditorState,
} from '../editor/core/editorState';
import { normalizeExistingProjectDocument } from '../editor/document/documentNormalizer';
import { useEditorStore } from '../editor/state/store';

type EditorStateOverrides = Partial<Omit<EditorState, 'session' | 'history'>> & {
  session?: Partial<EditorState['session']>;
  history?: Partial<EditorState['history']>;
};

export function createEditorState(overrides: EditorStateOverrides = {}): EditorState {
  const initialState = createDefaultEditorState();
  const document = overrides.document
    ? normalizeExistingProjectDocument(overrides.document)
    : initialState.document;
  const selectedNodeIds = overrides.session?.selectedNodeIds
    ?? initialState.session.selectedNodeIds;

  return {
    ...initialState,
    ...overrides,
    document,
    session: {
      ...initialState.session,
      ...overrides.session,
      selectedNodeIds,
    },
    history: {
      ...initialState.history,
      ...overrides.history,
    },
  };
}

export function resetEditorStore(overrides: EditorStateOverrides = {}) {
  useEditorStore.setState((state) => ({
    ...state,
    editor: createEditorState(overrides),
  }));
}
