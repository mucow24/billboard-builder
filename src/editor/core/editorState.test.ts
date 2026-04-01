import { describe, expect, it } from 'vitest';

import { createDefaultProjectDocument } from '../document/documentDefaults';
import {
  createDefaultEditorState,
  createDefaultHistoryState,
  createDefaultSessionState,
} from './editorState';

describe('editor state', () => {
  it('creates the default session and history slices', () => {
    expect(createDefaultSessionState()).toEqual({
      activeTool: 'select',
      availableFonts: [],
      missingFontFamilies: [],
      exportScale: 1,
      selectedNodeIds: [],
    });
    expect(createDefaultHistoryState()).toEqual({
      past: [],
      future: [],
    });
  });

  it('creates a default editor state with a document, session, and history', () => {
    const document = createDefaultProjectDocument();
    const state = createDefaultEditorState(document);

    expect(state).toEqual({
      document,
      session: {
        activeTool: 'select',
        availableFonts: [],
        missingFontFamilies: [],
        exportScale: 1,
        selectedNodeIds: [],
      },
      history: {
        past: [],
        future: [],
      },
    });
  });

  it('creates fresh session and history containers for each state instance', () => {
    const first = createDefaultEditorState();
    const second = createDefaultEditorState();

    expect(first.session).not.toBe(second.session);
    expect(first.session.availableFonts).not.toBe(second.session.availableFonts);
    expect(first.session.missingFontFamilies).not.toBe(second.session.missingFontFamilies);
    expect(first.history).not.toBe(second.history);
    expect(first.history.past).not.toBe(second.history.past);
    expect(first.history.future).not.toBe(second.history.future);
  });
});
