import fs from 'node:fs/promises';

import { expect, type Page } from '@playwright/test';



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

/** Waits until the autosaved canvas references exactly these font files, in this order. */
export async function expectPersistedCanvasFontFiles(page: Page, expectedSourceNames: string[]) {
  await expect
    .poll(async () => {
      const persistedDocument = await readPersistedCanvasDocument(page);
      const fonts = Array.isArray(persistedDocument?.fonts) ? persistedDocument.fonts : [];
      return fonts.map((font) =>
        font && typeof font === 'object' && 'sourceName' in font ? font.sourceName : null,
      );
    }, {
      message: `Expected the persisted canvas to reference the font files ${expectedSourceNames.join(', ')}.`,
    })
    .toEqual(expectedSourceNames);
}

/** The file names of the imported fonts kept in browser storage, sorted. */
export async function readStoredUploadedFontFiles(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('billboard-builder', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      return await new Promise<string[]>((resolve, reject) => {
        const request = database
          .transaction('uploaded-fonts', 'readonly')
          .objectStore('uploaded-fonts')
          .getAllKeys();
        request.onerror = () => reject(request.error);
        // Each font is stored under `uploaded:<file name>`.
        request.onsuccess = () =>
          resolve(request.result.map((key) => String(key).replace(/^uploaded:/, '')).sort());
      });
    } finally {
      database.close();
    }
  });
}

/** Waits until browser storage holds exactly these imported font files. */
export async function expectStoredUploadedFontFiles(page: Page, expectedSourceNames: string[]) {
  await expect
    .poll(async () => readStoredUploadedFontFiles(page), {
      message: `Expected the stored imported fonts to be ${expectedSourceNames.join(', ') || 'none'}.`,
    })
    .toEqual([...expectedSourceNames].sort());
}

export async function uploadNamedFontFromPath(
  page: Page,
  filePath: string,
  uploadedName: string,
) {
  await page.getByTestId('font-family-picker-trigger').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import font…' }).click(),
  ]);
  await chooser.setFiles({
    name: uploadedName,
    mimeType: 'font/ttf',
    buffer: await fs.readFile(filePath),
  });
}
