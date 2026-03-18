import { expect, test } from '@playwright/test';

import {
  clickCanvas,
  dragCanvas,
  openFreshEditor,
  openLayersTab,
  readStageDebug,
  selectTool,
} from './support/editor';

test.describe('editor smoke flows', () => {
  test('boots and creates rectangle, text, and line items from the canvas', async ({ page }) => {
    await openFreshEditor(page);

    await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export PNG' })).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();

    await selectTool(page, 'Rect');
    await dragCanvas(page, { x: 120, y: 120 }, { x: 340, y: 280 });

    await selectTool(page, 'Text');
    await clickCanvas(page, { x: 540, y: 180 });

    await selectTool(page, 'Line');
    await dragCanvas(page, { x: 180, y: 440 }, { x: 520, y: 520 });

    await openLayersTab(page);
    await expect(page.locator('.layer-row-select')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Text', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Line', exact: true })).toBeVisible();
  });

  test('updates zoom from the HUD and pans with the shift-drag gesture', async ({ page }) => {
    await openFreshEditor(page);

    const initialDebug = await readStageDebug(page);
    const initialZoom = initialDebug.viewport.zoom;
    const initialPan = {
      x: initialDebug.viewport.panX,
      y: initialDebug.viewport.panY,
    };

    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.getByTestId('viewport-zoom')).not.toContainText(`Zoom: ${Math.round(initialZoom * 100)}%`);

    await page.keyboard.down('Shift');
    await dragCanvas(page, { x: 220, y: 220 }, { x: 320, y: 300 });
    await page.keyboard.up('Shift');

    const nextDebug = await readStageDebug(page);
    expect(nextDebug.viewport.panX).not.toBe(initialPan.x);
    expect(nextDebug.viewport.panY).not.toBe(initialPan.y);
  });
});
