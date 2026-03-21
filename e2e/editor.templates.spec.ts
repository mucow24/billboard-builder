import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  clickCanvas,
  createProjectDocument,
  createGroupedProjectDocument,
  createRectangleFixture,
  createTextFixture,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  openTemplatesTab,
  startToolbarFileChooser,
  waitForEditor,
  uploadProject,
} from './support/editor';

async function uploadNamedFontFromPath(
  page: Parameters<typeof test>[0]['page'],
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

async function readPersistedCanvasDocument(page: Parameters<typeof test>[0]['page']) {
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

function collectPersistedTextFontFamilies(node: unknown): string[] {
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

async function expectPersistedCanvasToReferenceFontFamily(
  page: Parameters<typeof test>[0]['page'],
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

test.describe('editor template library flows', () => {
  test('TL-01 TL-02 TL-03 TL-04 saves, inserts, persists, and deletes templates from the real inspector flow', async ({
    page,
  }) => {
    const rectangle = createRectangleFixture({
      id: 'template-rectangle',
      x: 180,
      y: 180,
      width: 220,
      height: 120,
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createGroupedProjectDocument([rectangle]),
      'template-library.json',
    );

    await clickCanvas(page, { x: 240, y: 220 });
    await page.getByRole('button', { name: 'Save as template' }).click();

    await openTemplatesTab(page);
    await expect(page.getByRole('button', { name: 'Insert Rectangle template' })).toBeVisible();

    await page.getByRole('button', { name: 'Insert Rectangle template' }).click();
    await expect(page.getByRole('tab', { name: /Templates/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toHaveCount(2);

    await page.reload();
    await waitForEditor(page);
    await openTemplatesTab(page);
    await expect(page.getByRole('button', { name: 'Insert Rectangle template' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete template Rectangle template' }).click();
    await expect(page.getByText('No templates yet')).toBeVisible();

    await page.reload();
    await waitForEditor(page);
    await openTemplatesTab(page);
    await expect(page.getByText('No templates yet')).toBeVisible();
  });

  test('TL-05 lazily restores a template-only uploaded font after reload', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([createTextFixture({ id: 'template-font-text' })]),
      'template-font-library.json',
    );

    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);

    const fontPath = path.join(process.cwd(), 'src/assets/fonts/CalSans-Regular.ttf');
    await uploadNamedFontFromPath(page, fontPath, 'Uploaded-Template-Regular.ttf');
    await page.getByTestId('font-family-picker-trigger').click();
    await page.getByRole('option', { name: 'Uploaded Template' }).first().click();
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Uploaded Template');

    await page.getByRole('button', { name: 'Save as template' }).click();
    await openTemplatesTab(page);
    await expect(
      page.getByRole('button', { name: 'Insert Text:Integration text' }),
    ).toBeVisible();

    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);
    await page.getByTestId('font-family-picker-trigger').click();
    await page.getByRole('option', { name: 'Arial' }).first().click();
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Arial');
    await expectPersistedCanvasToReferenceFontFamily(page, 'Arial', []);

    await page.reload();
    await waitForEditor(page);
    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Arial');
    await page.getByTestId('font-family-picker-trigger').click();
    await expect(page.getByRole('option', { name: 'Uploaded Template' })).toHaveCount(0);

    await openTemplatesTab(page);
    await page.getByRole('button', { name: 'Insert Text:Integration text' }).click();
    await openPropertiesTab(page);
    await expect(page.getByText('Missing fonts')).toHaveCount(0);
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Uploaded Template');
  });
});
