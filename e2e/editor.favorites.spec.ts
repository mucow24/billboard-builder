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
  openFavoritesTab,
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

test.describe('editor favorite library flows', () => {
  test('TL-01 TL-02 TL-03 TL-04 saves, inserts, persists, and deletes favorites from the real inspector flow', async ({
    page,
  }) => {
    const rectangle = createRectangleFixture({
      id: 'favorite-rectangle',
      x: 180,
      y: 180,
      width: 220,
      height: 120,
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createGroupedProjectDocument([rectangle]),
      'favorite-library.json',
    );

    await clickCanvas(page, { x: 240, y: 220 });
    await page.getByRole('button', { name: 'Save as favorite' }).click();
    await expect(page.getByRole('status')).toHaveText('Added to favorites');

    await openFavoritesTab(page);
    await expect(page.getByRole('button', { name: 'Insert Rectangle favorite' })).toBeVisible();

    await page.getByRole('button', { name: 'Insert Rectangle favorite' }).click();
    await expect(page.getByRole('tab', { name: /Favorites/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toHaveCount(2);

    await page.reload();
    await waitForEditor(page);
    await openFavoritesTab(page);
    await expect(page.getByRole('button', { name: 'Insert Rectangle favorite' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete favorite Rectangle favorite' }).click();
    await expect(page.getByText('No favorites yet')).toBeVisible();

    await page.reload();
    await waitForEditor(page);
    await openFavoritesTab(page);
    await expect(page.getByText('No favorites yet')).toBeVisible();
  });

  test('TL-06 reorders favorites via drag and persists the new order', async ({ page }) => {
    const rectA = createRectangleFixture({ id: 'rect-a', x: 100, y: 100, width: 80, height: 80 });
    const rectB = createRectangleFixture({ id: 'rect-b', x: 300, y: 300, width: 80, height: 80 });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createGroupedProjectDocument([rectA, rectB]),
      'reorder-test.json',
    );

    // Save first item as favorite
    await clickCanvas(page, { x: 140, y: 140 });
    await page.getByRole('button', { name: 'Save as favorite' }).click();
    await expect(page.getByRole('status')).toHaveText('Added to favorites');

    // Deselect, then save second item as favorite
    await clickCanvas(page, { x: 500, y: 500 });
    await clickCanvas(page, { x: 340, y: 340 });
    await page.getByRole('button', { name: 'Save as favorite' }).click();
    await expect(page.getByRole('status')).toHaveText('Added to favorites');

    await openFavoritesTab(page);
    const grips = page.getByRole('button', { name: /Reorder/ });
    await expect(grips).toHaveCount(2);

    // Read initial order
    const insertButtons = page.getByRole('button', { name: /^Insert / });
    const namesBefore = await insertButtons.allInnerTexts();
    expect(namesBefore).toHaveLength(2);

    // Drag second grip above the first
    const secondGrip = grips.nth(1);
    const firstGrip = grips.nth(0);

    const secondBox = await secondGrip.boundingBox();
    const firstBox = await firstGrip.boundingBox();
    expect(secondBox).toBeTruthy();
    expect(firstBox).toBeTruthy();

    await page.mouse.move(secondBox!.x + secondBox!.width / 2, secondBox!.y + secondBox!.height / 2);
    await page.mouse.down();
    // Move above the first grip with enough distance to pass threshold
    await page.mouse.move(firstBox!.x + firstBox!.width / 2, firstBox!.y - 2, { steps: 5 });
    await page.mouse.up();

    // Verify order reversed
    const namesAfterDrag = await insertButtons.allInnerTexts();
    expect(namesAfterDrag[0]).toBe(namesBefore[1]);
    expect(namesAfterDrag[1]).toBe(namesBefore[0]);

    // Verify persistence after reload
    await page.reload();
    await waitForEditor(page);
    await openFavoritesTab(page);
    const namesAfterReload = await insertButtons.allInnerTexts();
    expect(namesAfterReload[0]).toBe(namesBefore[1]);
    expect(namesAfterReload[1]).toBe(namesBefore[0]);
  });

  test('TL-07 reorders favorites via keyboard and persists the new order', async ({ page }) => {
    const rectA = createRectangleFixture({ id: 'rect-c', x: 100, y: 100, width: 80, height: 80 });
    const rectB = createRectangleFixture({ id: 'rect-d', x: 300, y: 300, width: 80, height: 80 });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createGroupedProjectDocument([rectA, rectB]),
      'kb-reorder-test.json',
    );

    // Save first item as favorite
    await clickCanvas(page, { x: 140, y: 140 });
    await page.getByRole('button', { name: 'Save as favorite' }).click();
    await expect(page.getByRole('status')).toHaveText('Added to favorites');

    // Deselect, then save second item as favorite
    await clickCanvas(page, { x: 500, y: 500 });
    await clickCanvas(page, { x: 340, y: 340 });
    await page.getByRole('button', { name: 'Save as favorite' }).click();
    await expect(page.getByRole('status')).toHaveText('Added to favorites');

    await openFavoritesTab(page);
    const insertButtons = page.getByRole('button', { name: /^Insert / });
    const namesBefore = await insertButtons.allInnerTexts();

    // Focus first grip and press Alt+ArrowDown
    const firstGrip = page.getByRole('button', { name: /Reorder/ }).nth(0);
    await firstGrip.focus();
    await page.keyboard.press('Alt+ArrowDown');

    // Verify order swapped
    const namesAfterKeyboard = await insertButtons.allInnerTexts();
    expect(namesAfterKeyboard[0]).toBe(namesBefore[1]);
    expect(namesAfterKeyboard[1]).toBe(namesBefore[0]);

    // Verify persistence
    await page.reload();
    await waitForEditor(page);
    await openFavoritesTab(page);
    const namesAfterReload = await insertButtons.allInnerTexts();
    expect(namesAfterReload[0]).toBe(namesBefore[1]);
    expect(namesAfterReload[1]).toBe(namesBefore[0]);
  });

  test('TL-05 lazily restores a favorite-only uploaded font after reload', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([createTextFixture({ id: 'favorite-font-text' })]),
      'favorite-font-library.json',
    );

    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);

    const fontPath = path.join(process.cwd(), 'src/assets/fonts/CalSans-Regular.ttf');
    await uploadNamedFontFromPath(page, fontPath, 'Uploaded-Favorite-Regular.ttf');
    await page.getByTestId('font-family-picker-trigger').click();
    await page.getByRole('option', { name: 'Uploaded Favorite' }).first().click();
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Uploaded Favorite');

    await page.getByRole('button', { name: 'Save as favorite' }).click();
    await openFavoritesTab(page);
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
    await expect(page.getByRole('option', { name: 'Uploaded Favorite' })).toHaveCount(0);

    await openFavoritesTab(page);
    await page.getByRole('button', { name: 'Insert Text:Integration text' }).click();
    await openPropertiesTab(page);
    await expect(page.getByText('Missing fonts')).toHaveCount(0);
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Uploaded Favorite');
  });
});
