import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  captureDownload,
  clearPersistence,
  createProjectDocument,
  createRectangleFixture,
  createTextFixture,
  openFreshEditor,
  primePersistenceBeforeLoad,
  openLayersTab,
  openPropertiesTab,
  readDownloadedJson,
  readDownloadedPngSize,
  seedPersistence,
  uploadFont,
  uploadProject,
  uploadSvgImage,
  waitForEditor,
} from './support/editor';

test.describe('editor file and persistence flows', () => {
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

  test('round-trips project save/open and exports a PNG with the canvas dimensions', async ({ page }) => {
    const document = createProjectDocument([
      createRectangleFixture({ id: 'roundtrip-rect', x: 120, y: 140, width: 240, height: 140 }),
      createTextFixture({ id: 'roundtrip-text', x: 460, y: 160, text: 'Round trip' }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, document, 'roundtrip.json');

    const projectDownload = await captureDownload(page, async () => {
      await page.getByRole('button', { name: 'Save' }).click();
    });
    const savedDocument = await readDownloadedJson(projectDownload);

    expect((savedDocument.items as Array<unknown>).length).toBe(2);
    expect(savedDocument.canvas).toEqual(document.canvas);

    await page.getByRole('button', { name: 'New' }).click();
    await openLayersTab(page);
    await expect(page.locator('.layer-row-select')).toHaveCount(0);

    const savedPath = await projectDownload.path();
    if (!savedPath) {
      throw new Error('Saved project download did not produce a local file.');
    }
    await page.getByTestId('project-open-input').setInputFiles(savedPath);
    await openLayersTab(page);
    await expect(page.locator('.layer-row-select')).toHaveCount(2);

    const pngSize = await readDownloadedPngSize(
      await captureDownload(page, async () => {
        await page.getByRole('button', { name: 'Export PNG' }).click();
      })
    );
    expect(pngSize).toEqual({ width: 1024, height: 1024 });
  });

  test('restores valid persisted state and safely clears corrupt persisted state on reload', async ({ page }) => {
    const persistedDocument = createProjectDocument([
      createRectangleFixture({ id: 'persisted-rect', x: 200, y: 220, width: 180, height: 120 }),
    ]);

    await primePersistenceBeforeLoad(page, persistedDocument);
    await page.goto('/');
    await waitForEditor(page);
    await openLayersTab(page);
    await expect(page.locator('.layer-row-select')).toHaveCount(1);

    await clearPersistence(page);
    await seedPersistence(page, '{not-valid-json');
    await page.reload();
    await waitForEditor(page);
    await openLayersTab(page);
    await expect(page.locator('.layer-row-select')).toHaveCount(0);
  });
});
