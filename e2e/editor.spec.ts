import { expect, test } from '@playwright/test';

function createPngBuffer() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn8s1QAAAAASUVORK5CYII=',
    'base64'
  );
}

test('creates, edits, saves, reloads, and exports a project', async ({ page }) => {
  await page.goto('/');

  const stage = page.locator('.konvajs-content');
  await expect(stage).toBeVisible();

  await page.getByRole('button', { name: 'Rect' }).click();
  await expect(page.locator('.layer-row')).toHaveCount(1);
  await expect(page.locator('.tool-button.active')).toContainText('Arrow');

  await page.getByRole('button', { name: 'Arrow' }).click();
  const stageBox = await stage.boundingBox();
  if (!stageBox) {
    throw new Error('Stage bounding box was not available');
  }

  await page.mouse.move(stageBox.x + 220, stageBox.y + 180);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 600, stageBox.y + 314, { steps: 12 });
  await page.mouse.up();

  await page.getByRole('button', { name: 'Text' }).click();
  await expect(page.locator('.layer-row')).toHaveCount(2);
  await page.getByLabel('Character spacing').fill('2');
  await page.getByLabel('Line height').fill('1.5');
  await page.getByLabel('Fill alpha').evaluate((input) => {
    const element = input as HTMLInputElement;
    element.value = '60';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const fontPath = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  await page.locator('input[type="file"]').nth(1).setInputFiles(fontPath);
  await page.getByLabel('Font family').selectOption('DejaVuSans');
  await expect(page.getByLabel('Font family')).toHaveValue('DejaVuSans');

  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: createPngBuffer(),
  });
  await expect(page.locator('.layer-row')).toHaveCount(3);

  await page.getByRole('button', { name: 'Line' }).click();
  await expect(page.locator('.layer-row')).toHaveCount(4);
  await page.locator('.layer-row', { hasText: 'Line' }).click();
  await page.getByLabel('End X').fill('900');
  await expect(page.getByLabel('End X')).toHaveValue('900');

  await page.locator('.layer-row', { hasText: 'Text' }).click();
  await page.getByRole('button', { name: 'Send back' }).click();
  await expect(page.locator('.layer-row').last()).toContainText('Text');
  await page.getByLabel('Canvas background alpha').evaluate((input) => {
    const element = input as HTMLInputElement;
    element.value = '0';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const projectDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save' }).click();
  const downloadedProject = await projectDownload;
  const projectPath = await downloadedProject.path();
  if (!projectPath) {
    throw new Error('Project download path was not available');
  }

  await page.getByRole('button', { name: 'New' }).click();
  await expect(page.locator('.layer-row')).toHaveCount(0);

  await page.locator('input[type="file"]').nth(2).setInputFiles(projectPath);
  await expect(page.locator('.layer-row')).toHaveCount(4);
  await expect(page.getByText('pixel.png')).toBeVisible();

  const exportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG' }).click();
  const downloadedPng = await exportDownload;
  expect(downloadedPng.suggestedFilename()).toBe('billboard-export.png');
});
