import { createDefaultProjectDocument } from '../src/editor/model/defaults';
import { EditorPage } from './helpers/editorPage';
import { createPngBuffer } from './helpers/fixtures';
import { expect, test } from './helpers/test';

test('@p0 creates, autosaves, saves, reloads, and exports a project', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();

  await editor.createItem('Rect');
  await expect(editor.layerRows).toHaveCount(1);

  await editor.dragSelectedItemBy(240, 120);

  await editor.createItem('Text');
  await expect(editor.layerRows).toHaveCount(2);
  await page.getByLabel('Text content').fill('Launch week headline');
  await page.getByLabel('Character spacing').fill('2');
  await page.getByLabel('Line height').fill('1.5');

  await editor.uploadImage({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: createPngBuffer(),
  });
  await expect(editor.layerRows).toHaveCount(3);

  await editor.createItem('Line');
  await expect(editor.layerRows).toHaveCount(4);
  await page.locator('.layer-row-select', { hasText: 'Line' }).click();
  await page.getByLabel('End X').fill('900');
  await expect(page.getByLabel('End X')).toHaveValue('900');

  await page.locator('.layer-row-select', { hasText: 'Text' }).click();
  await page.getByRole('button', { name: 'Send back' }).click();
  await expect(page.locator('.layer-row').last()).toContainText('Text');

  await page.reload();
  await expect(editor.layerRows).toHaveCount(4);
  await expect(page.getByLabel('Text content')).toHaveValue('Launch week headline');

  const projectDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save' }).click();
  const downloadedProject = await projectDownload;
  const projectPath = await downloadedProject.path();
  if (!projectPath) {
    throw new Error('Project download path was not available');
  }

  await page.getByRole('button', { name: 'New' }).click();
  await expect(editor.layerRows).toHaveCount(0);

  await editor.openProject(projectPath);
  await expect(editor.layerRows).toHaveCount(4);
  await expect(page.getByText('pixel.png')).toBeVisible();

  const exportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG' }).click();
  const downloadedPng = await exportDownload;
  expect(downloadedPng.suggestedFilename()).toBe('billboard-export.png');
});

test('@p1 keeps the editor interactive after an invalid project import', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();

  await editor.openProject({
    name: 'broken-project.json',
    mimeType: 'application/json',
    buffer: Buffer.from('not valid json'),
  });

  await expect(page.getByRole('alert')).toContainText('Failed to open project');

  await editor.createItem('Rect');
  await expect(editor.layerRows).toHaveCount(1);

  const stageDebug = await editor.getStageDebug();
  expect(stageDebug.stageSize.width).toBe(createDefaultProjectDocument().canvas.width);
  expect(stageDebug.stageSize.height).toBe(createDefaultProjectDocument().canvas.height);
});
