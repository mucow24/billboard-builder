import fs from 'node:fs/promises';

import { expect, type Page } from '@playwright/test';

import { startToolbarFileChooser } from './editor';

export async function readPersistedCanvasDocument(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('billboard-builder', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      const serializedDocument = await new Promise<unknown>((resolve, reject) => {
        const transaction = database.transaction('canvas', 'readonly');
        const store = transaction.objectStore('canvas');
        const request = store.get('current');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      if (typeof serializedDocument !== 'string') {
        return null;
      }

      return JSON.parse(serializedDocument) as Record<string, unknown>;
    } finally {
      database.close();
    }
  });
}

export function collectPersistedTextFontFamilies(node: unknown): string[] {
  if (!node || typeof node !== 'object') {
    return [];
  }

  const candidate = node as {
    kind?: unknown;
    fontFamily?: unknown;
    children?: unknown;
  };

  const families =
    candidate.kind === 'text' && typeof candidate.fontFamily === 'string'
      ? [candidate.fontFamily]
      : [];
  const childFamilies = Array.isArray(candidate.children)
    ? candidate.children.flatMap((child) => collectPersistedTextFontFamilies(child))
    : [];

  return [...families, ...childFamilies];
}

export async function expectPersistedCanvasToReferenceFontFamily(
  page: Page,
  expectedFamily: string,
  expectedRegisteredFamilies: string[],
) {
  await expect
    .poll(async () => {
      const persistedDocument = await readPersistedCanvasDocument(page);
      if (!persistedDocument) {
        return null;
      }

      const nodes = Array.isArray(persistedDocument.nodes) ? persistedDocument.nodes : [];
      const textFamilies = nodes.flatMap((node) => collectPersistedTextFontFamilies(node)).sort();
      const registeredFamilies = Array.isArray(persistedDocument.fonts)
        ? persistedDocument.fonts
            .flatMap((font) =>
              font &&
              typeof font === 'object' &&
              'family' in font &&
              typeof font.family === 'string'
                ? [font.family]
                : [],
            )
            .sort()
        : [];

      return {
        registeredFamilies,
        textFamilies,
      };
    }, {
      message: `Expected persisted canvas document to reference ${expectedFamily}.`,
    })
    .toEqual({
      registeredFamilies: expectedRegisteredFamilies,
      textFamilies: [expectedFamily],
    });
}

export async function uploadNamedFontFromPath(
  page: Page,
  filePath: string,
  uploadedName: string,
) {
  const chooser = await startToolbarFileChooser(page, 'Upload', 'Font...');
  await chooser.setFiles({
    name: uploadedName,
    mimeType: 'font/ttf',
    buffer: await fs.readFile(filePath),
  });
}
