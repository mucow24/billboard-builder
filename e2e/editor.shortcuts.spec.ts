import { expect, test } from '@playwright/test';

import {
  captureDownload,
  clickCanvas,
  createProjectDocument,
  createRectangleFixture,
  dragCanvas,
  openFreshEditor,
  openLayersTab,
  readDownloadedJson,
  uploadProject,
} from './support/editor';

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('editor shortcuts', () => {
  test('nudges, duplicates, deletes, undoes, and redoes against the real document state', async ({ page }) => {
    const rectangle = createRectangleFixture({
      id: 'nudge-shape',
      x: 180,
      y: 180,
      width: 200,
      height: 120,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rectangle]));

    await clickCanvas(page, { x: 280, y: 240 });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');

    const nudgedProject = await readDownloadedJson(
      await captureDownload(page, async () => {
        await page.getByRole('button', { name: 'Save' }).click();
      })
    );

    const nudgedItem = (nudgedProject.items as Array<Record<string, number | string>>)[0];
    expect(Number(nudgedItem.x)).toBe(181);
    expect(Number(nudgedItem.y)).toBe(185);

    await page.keyboard.press(`${modifier}+D`);
    await openLayersTab(page);
    await expect(page.locator('.layer-row-select')).toHaveCount(2);

    await page.keyboard.press('Delete');
    await expect(page.locator('.layer-row-select')).toHaveCount(1);

    await page.keyboard.press(`${modifier}+Z`);
    await expect(page.locator('.layer-row-select')).toHaveCount(2);

    await page.keyboard.press(`${modifier}+Shift+Z`);
    await expect(page.locator('.layer-row-select')).toHaveCount(1);
  });

  test('selects all and clears selection through keyboard commands', async ({ page }) => {
    const first = createRectangleFixture({
      id: 'first',
      x: 100,
      y: 100,
      width: 80,
      height: 40,
      zIndex: 0,
    });
    const second = createRectangleFixture({
      id: 'second',
      x: 260,
      y: 220,
      width: 90,
      height: 60,
      fill: '#0ea5e9',
      stroke: '#0369a1ff',
      zIndex: 1,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([first, second]));
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur?.();
    });

    await page.keyboard.press(`${modifier}+A`);
    await expect(page.getByTestId('canvas-group-rotater')).toBeAttached();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('canvas-group-rotater')).toHaveCount(0);

    await dragCanvas(page, { x: 80, y: 80 }, { x: 380, y: 320 });
    await expect(page.getByTestId('canvas-group-rotater')).toBeAttached();
  });
});
