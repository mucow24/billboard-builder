import { describe, expect, it } from 'vitest';

import { documentContentsEqual, hasUnsavedChanges } from './documentComparison';
import {
  createDefaultProjectDocument,
  createGeneratorItem,
  createImageItem,
  createRectangleItem,
  createTextItem,
} from './documentDefaults';
import { normalizeProjectDocument } from './documentNormalizer';
import { parseProjectDocument, serializeProjectDocument } from './documentSchema';
import type { ProjectDocument } from './documentTypes';

function createBusyDocument(): ProjectDocument {
  return normalizeProjectDocument({
    ...createDefaultProjectDocument(),
    name: 'Busy',
    background: '#102030',
    nodes: [
      createRectangleItem({ id: 'rect', x: 10, y: 20 }),
      {
        id: 'group',
        kind: 'group',
        name: 'Group',
        locked: false,
        hidden: false,
        opacity: 0.5,
        children: [
          createTextItem({ id: 'text', text: 'Hello', fontFamily: 'Poster Sans' }),
          createImageItem({
            src: 'data:image/png;base64,AAA',
            mimeType: 'image/png',
            originalWidth: 40,
            originalHeight: 20,
          }),
        ],
      },
      { ...createGeneratorItem('bands', 800, 600), id: 'bands' },
    ],
    fonts: [{ family: 'Poster Sans', sourceName: 'PosterSans.ttf', kind: 'uploaded' }],
  });
}

describe('documentContentsEqual', () => {
  it('treats a document and a copy of it as equal', () => {
    const document = createBusyDocument();

    expect(documentContentsEqual(document, structuredClone(document))).toBe(true);
  });

  it('ignores the name', () => {
    const document = createBusyDocument();

    expect(documentContentsEqual(document, { ...document, name: 'Renamed' })).toBe(true);
  });

  it.each<[string, (document: ProjectDocument) => ProjectDocument]>([
    ['the background', (document) => ({ ...document, background: '#ffffff' })],
    ['the canvas size', (document) => ({ ...document, canvas: { width: 1, height: 2 } })],
    ['the fonts', (document) => ({ ...document, fonts: [] })],
    ['the number of items', (document) => ({ ...document, nodes: document.nodes.slice(1) })],
    ['the order of the items', (document) => ({ ...document, nodes: [...document.nodes].reverse() })],
    [
      'a property of a nested item',
      (document) => ({
        ...document,
        nodes: document.nodes.map((node) =>
          node.kind === 'group'
            ? { ...node, children: node.children.map((child) => ({ ...child, opacity: 0.25 })) }
            : node,
        ),
      }),
    ],
  ])('sees a change to %s', (_what, change) => {
    const document = createBusyDocument();

    expect(documentContentsEqual(document, change(document))).toBe(false);
  });

  // The saved version is compared with a working copy that went through
  // storage, after a reload. Storage must not make an unchanged document differ.
  it('treats a document as equal to itself after a round trip through storage', () => {
    const document = createBusyDocument();

    const stored = parseProjectDocument(JSON.parse(serializeProjectDocument(document)));
    const storedTwice = parseProjectDocument(JSON.parse(serializeProjectDocument(stored)));

    expect(documentContentsEqual(document, stored)).toBe(true);
    expect(documentContentsEqual(stored, normalizeProjectDocument(storedTwice))).toBe(true);
  });
});

describe('hasUnsavedChanges', () => {
  it('compares a saved document with its saved version', () => {
    const saved = createBusyDocument();

    expect(hasUnsavedChanges(saved, saved)).toBe(false);
    expect(hasUnsavedChanges({ ...saved, name: 'Renamed' }, saved)).toBe(false);
    expect(hasUnsavedChanges({ ...saved, background: '#000000' }, saved)).toBe(true);
  });

  it('counts a document that was never saved as changed once it is no longer blank', () => {
    const blank = createDefaultProjectDocument();

    expect(hasUnsavedChanges(blank, null)).toBe(false);
    expect(hasUnsavedChanges({ ...blank, name: 'Named but empty' }, null)).toBe(false);
    expect(hasUnsavedChanges({ ...blank, nodes: [createRectangleItem()] }, null)).toBe(true);
    expect(hasUnsavedChanges({ ...blank, background: '#123456' }, null)).toBe(true);
  });
});
