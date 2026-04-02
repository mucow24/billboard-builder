import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  captureDownload,
  clearPersistence,
  clickCanvas,
  clickToolbarPopoverItem,
  createGroupNodeFixture,
  createGroupedProjectDocument,
  createProjectDocument,
  createRectangleFixture,
  createTextFixture,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  readDownloadedJson,
  readDownloadedPngSize,
  readStageDebug,
  setCanvasTestHooksEnabled,
  seedPersistence,
  startToolbarFileChooser,
  uploadFont,
  uploadProject,
  uploadSvgImage,
  waitForEditor,
} from './support/editor';
import {
  expectPersistedCanvasToReferenceFontFamily,
  uploadNamedFontFromPath,
} from './support/persistence';

async function countUploadedFontRecords(page: Parameters<typeof test>[0]['page']) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('billboard-builder', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      return await new Promise<number>((resolve, reject) => {
        const transaction = database.transaction('uploaded-fonts', 'readonly');
        const store = transaction.objectStore('uploaded-fonts');
        const request = store.count();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    } finally {
      database.close();
    }
  });
}

async function expectUploadedFontRecordCount(
  page: Parameters<typeof test>[0]['page'],
  expectedCount: number,
) {
  await expect
    .poll(async () => countUploadedFontRecords(page), {
      message: `Expected uploaded font store count to become ${expectedCount}.`,
    })
    .toBe(expectedCount);
}

test.describe('editor file and persistence flows', () => {
  test.describe.configure({ mode: 'serial' });

  test('uploads images and fonts through the real hidden file inputs', async ({ page }) => {
    await openFreshEditor(page);

    await uploadSvgImage(page);
    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Image', exact: true })).toBeVisible();

    await uploadProject(page, createProjectDocument([createTextFixture({ id: 'text-upload' })]), 'text-project.json');
    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);

    const fontPath = path.join(process.cwd(), 'src/assets/fonts/CalSans-Regular.ttf');
    await uploadFont(page, fontPath);
    await page.getByTestId('font-family-picker-trigger').click();
    const uploadedFontOption = page.getByRole('option', { name: 'Cal Sans' }).first();
    await expect(uploadedFontOption).toBeVisible();
    await uploadedFontOption.click();
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Cal Sans');
  });

  test('reload restores uploaded fonts used by the persisted canvas without showing a missing-font warning', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([createTextFixture({ id: 'persisted-font-text' })]),
      'persisted-font-project.json',
    );
    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);

    const fontPath = path.join(process.cwd(), 'src/assets/fonts/CalSans-Regular.ttf');
    await uploadNamedFontFromPath(page, fontPath, 'Uploaded-Only-Regular.ttf');
    await page.getByTestId('font-family-picker-trigger').click();
    const uploadedFontOption = page.getByRole('option', { name: 'Uploaded Only' }).first();
    await expect(uploadedFontOption).toBeVisible();
    await uploadedFontOption.click();
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Uploaded Only');

    await expectUploadedFontRecordCount(page, 1);
    await expectPersistedCanvasToReferenceFontFamily(page, 'Uploaded Only', ['Uploaded Only']);

    await page.reload();
    await waitForEditor(page);
    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);
    await expect(page.getByText('Missing fonts')).toHaveCount(0);
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Uploaded Only');
    await expectUploadedFontRecordCount(page, 1);
  });

  test('reload purges persisted uploaded fonts once neither canvas nor favorites reference them', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([createTextFixture({ id: 'purged-font-text' })]),
      'purged-font-project.json',
    );
    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);

    const fontPath = path.join(process.cwd(), 'src/assets/fonts/CalSans-Regular.ttf');
    await uploadNamedFontFromPath(page, fontPath, 'Uploaded-Only-Regular.ttf');
    await page.getByTestId('font-family-picker-trigger').click();
    await page.getByRole('option', { name: 'Uploaded Only' }).first().click();
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Uploaded Only');
    await expectUploadedFontRecordCount(page, 1);
    await expectPersistedCanvasToReferenceFontFamily(page, 'Uploaded Only', ['Uploaded Only']);

    await page.getByTestId('font-family-picker-trigger').click();
    await page.getByRole('option', { name: 'Arial' }).first().click();
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Arial');
    await expectPersistedCanvasToReferenceFontFamily(page, 'Arial', []);

    await page.reload();
    await waitForEditor(page);
    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);
    await expect(page.getByText('Missing fonts')).toHaveCount(0);
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Arial');
    await expectUploadedFontRecordCount(page, 0);

    await page.getByTestId('font-family-picker-trigger').click();
    await expect(page.getByRole('option', { name: 'Uploaded Only' })).toHaveCount(0);
  });

  test('round-trips project save/open and exports a PNG with the canvas dimensions', async ({ page }) => {
    const document = createProjectDocument([
      createRectangleFixture({ id: 'roundtrip-rect', x: 120, y: 140, width: 240, height: 140 }),
      createTextFixture({ id: 'roundtrip-text', x: 460, y: 160, text: 'Round trip' }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, document, 'roundtrip.json');

    const projectDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Canvas', 'Save');
    });
    const savedDocument = await readDownloadedJson(projectDownload);

    expect(savedDocument.version).toBe(2);
    expect((savedDocument.nodes as Array<unknown>).length).toBe(2);
    expect(savedDocument.canvas).toEqual(document.canvas);

    await clickToolbarPopoverItem(page, 'Canvas', 'Reset');
    await openLayersTab(page);
    await expect(page.locator('.layer-row')).toHaveCount(0);

    const savedPath = await projectDownload.path();
    if (!savedPath) {
      throw new Error('Saved project download did not produce a local file.');
    }
    const chooser = await startToolbarFileChooser(page, 'Canvas', 'Load...');
    await chooser.setFiles(savedPath);
    await openLayersTab(page);
    await expect(page.locator('.layer-row')).toHaveCount(2);

    const pngSize = await readDownloadedPngSize(
      await captureDownload(page, async () => {
        await page.getByRole('button', { name: 'Export PNG' }).click();
      })
    );
    expect(pngSize).toEqual({ width: 1024, height: 1024 });
  });

  test('resets to a new empty project through the real toolbar flow', async ({ page }) => {
    const document = createProjectDocument([
      createRectangleFixture({ id: 'new-project-rect', x: 140, y: 140, width: 180, height: 120 }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, document, 'new-project-fixture.json');

    await clickToolbarPopoverItem(page, 'Canvas', 'Reset');
    await openLayersTab(page);
    await expect(page.locator('.layer-row')).toHaveCount(0);
    await openPropertiesTab(page);
    await expect(page.getByText('Nothing selected')).toBeVisible();

    const savedProject = await readDownloadedJson(
      await captureDownload(page, async () => {
        await clickToolbarPopoverItem(page, 'Canvas', 'Save');
      }),
    );
    expect(savedProject.nodes).toEqual([]);
  });

  test('restores valid persisted state and safely clears corrupt persisted state on reload', async ({ page }) => {
    const persistedDocument = createProjectDocument([
      createRectangleFixture({ id: 'persisted-rect', x: 200, y: 220, width: 180, height: 120 }),
    ]);

    await openFreshEditor(page);
    await seedPersistence(page, persistedDocument);
    await page.reload();
    await waitForEditor(page);
    await expect
      .poll(async () => (await readStageDebug(page)).renderedItemCount, {
        message: 'waiting for persisted item to render after reload',
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(1);
    await openLayersTab(page);
    await expect(page.locator('.layer-row')).toHaveCount(1);

    await clearPersistence(page);
    await seedPersistence(page, '{not-valid-json');
    await page.reload();
    await waitForEditor(page);
    await openLayersTab(page);
    await expect(page.locator('.layer-row')).toHaveCount(0);
  });

  test('round-trips grouped documents through save/open and restores grouped persistence on reload', async ({ page }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'persisted-group-rect',
            name: 'Persisted Group Rect',
            x: 180,
            y: 220,
            width: 180,
            height: 120,
            zIndex: 0,
          }),
          createTextFixture({
            id: 'persisted-group-text',
            name: 'Persisted Group Text',
            x: 230,
            y: 250,
            width: 220,
            height: 80,
            text: 'Persisted group',
            zIndex: 1,
          }),
        ],
        {
          id: 'persisted-group',
          name: 'Persisted Group',
          opacity: 0.72,
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'persisted-group.json');

    const savedGroupedDocument = await readDownloadedJson(
      await captureDownload(page, async () => {
        await clickToolbarPopoverItem(page, 'Canvas', 'Save');
      }),
    );

    expect(savedGroupedDocument.version).toBe(2);
    expect(savedGroupedDocument.nodes).toEqual([
      expect.objectContaining({
        id: 'persisted-group',
        kind: 'group',
        opacity: 0.72,
        children: [
          expect.objectContaining({ id: 'persisted-group-rect' }),
          expect.objectContaining({ id: 'persisted-group-text' }),
        ],
      }),
    ]);

    await clickToolbarPopoverItem(page, 'Canvas', 'Reset');
    await uploadProject(page, savedGroupedDocument, 'persisted-group-roundtrip.json');

    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Persisted Group', exact: true })).toBeVisible();
    const persistedChevron = page.getByRole('button', { name: /^(Expand|Collapse) Persisted Group$/ });
    const persistedChevronLabel = await persistedChevron.getAttribute('aria-label');
    if (persistedChevronLabel?.startsWith('Expand')) {
      await persistedChevron.click();
    }
    await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Text', exact: true })).toBeVisible();

    await setCanvasTestHooksEnabled(page, false);
    await clickCanvas(page, { x: 220, y: 260 });
    await openPropertiesTab(page);
    await expect(page.getByRole('spinbutton', { name: 'Group Opacity value' })).toHaveValue('0.72');

    await seedPersistence(page, savedGroupedDocument);
    await page.reload();
    await waitForEditor(page);
    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Persisted Group', exact: true })).toBeVisible();
    await setCanvasTestHooksEnabled(page, false);
    await clickCanvas(page, { x: 220, y: 260 });
    await openPropertiesTab(page);
    await expect(page.getByRole('spinbutton', { name: 'Group Opacity value' })).toHaveValue('0.72');
  });
});
