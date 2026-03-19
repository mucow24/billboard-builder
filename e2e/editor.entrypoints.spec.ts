import { expect, test, type Page } from '@playwright/test';

import {
  clickCanvas,
  createEllipseFixture,
  createImageFixture,
  createLineFixture,
  createProjectDocument,
  createRectangleFixture,
  createTextFixture,
  dragCanvas,
  middleDragCanvas,
  openFreshEditor,
  openPropertiesTab,
  readStageDebug,
  selectTool,
  setCanvasTestHooksEnabled,
  uploadProject,
} from './support/editor';

async function expectNoActiveSelection(page: Page) {
  await expect(page.locator('.layer-row.active')).toHaveCount(0);
}

test.describe('editor canvas entrypoints', () => {
  test('CS-02 CS-03 CS-04 CS-05 CS-06 CS-08 CS-09 CS-11 CS-12 CS-13 selects visible item kinds and honors toggle, marquee, locked, and hidden behavior', async ({
    page,
  }) => {
    const rectangle = createRectangleFixture({
      id: 'entry-rect',
      name: 'Entry Rectangle',
      x: 120,
      y: 120,
      width: 160,
      height: 96,
      zIndex: 0,
    });
    const ellipse = createEllipseFixture({
      id: 'entry-ellipse',
      name: 'Entry Ellipse',
      x: 360,
      y: 120,
      width: 150,
      height: 110,
      zIndex: 1,
    });
    const text = createTextFixture({
      id: 'entry-text',
      name: 'Entry Text',
      x: 160,
      y: 320,
      width: 260,
      height: 84,
      text: 'Entry text',
      zIndex: 2,
    });
    const image = createImageFixture({
      id: 'entry-image',
      name: 'Entry Image',
      x: 520,
      y: 320,
      width: 160,
      height: 90,
      zIndex: 3,
    });
    const line = createLineFixture({
      id: 'entry-line',
      name: 'Entry Line',
      x: 140,
      y: 520,
      startX: 140,
      startY: 520,
      endX: 420,
      endY: 560,
      width: 280,
      height: 40,
      zIndex: 4,
    });
    const locked = createRectangleFixture({
      id: 'locked-rect',
      name: 'Locked Rectangle',
      x: 760,
      y: 140,
      width: 140,
      height: 96,
      locked: true,
      zIndex: 5,
    });
    const hidden = createRectangleFixture({
      id: 'hidden-rect',
      name: 'Hidden Rectangle',
      x: 760,
      y: 340,
      width: 140,
      height: 96,
      hidden: true,
      zIndex: 6,
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([rectangle, ellipse, text, image, line, locked, hidden]),
      'entrypoints.json',
    );
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 180, y: 165 });
    await openPropertiesTab(page);
    await expect(page.getByRole('heading', { name: 'Rectangle' })).toBeVisible();

    await clickCanvas(page, { x: 420, y: 175 });
    await openPropertiesTab(page);
    await expect(page.getByRole('heading', { name: 'Ellipse' })).toBeVisible();

    await clickCanvas(page, { x: 280, y: 360 });
    await openPropertiesTab(page);
    await expect(page.getByLabel('Text content')).toBeVisible();

    await clickCanvas(page, { x: 580, y: 360 });
    await openPropertiesTab(page);
    await expect(page.getByLabel('Preserve aspect ratio')).toBeVisible();

    await clickCanvas(page, { x: 220, y: 540 });
    await openPropertiesTab(page);
    await expect(page.getByRole('button', { name: /Geometry/ })).toBeVisible();
    let stageDebug = await readStageDebug(page);
    expect(stageDebug.hasLineHandles).toBe(true);
    expect(stageDebug.hasShapeHandles).toBe(false);

    await clickCanvas(page, { x: 180, y: 165 });
    await page.keyboard.down('Shift');
    await clickCanvas(page, { x: 420, y: 175 });
    await page.keyboard.up('Shift');
    stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(true);

    await clickCanvas(page, { x: 920, y: 920 });
    stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);

    await dragCanvas(page, { x: 80, y: 80 }, { x: 560, y: 280 });
    stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(true);

    await clickCanvas(page, { x: 920, y: 920 });
    await dragCanvas(page, { x: 920, y: 920 }, { x: 920, y: 920 }, 1);
    stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(false);

    await clickCanvas(page, { x: 820, y: 190 });
    await expectNoActiveSelection(page);

    await clickCanvas(page, { x: 820, y: 380 });
    await expectNoActiveSelection(page);
  });

  test('VP-01 VP-02 VP-03 VP-04 VP-06 VP-08 VP-09 VP-10 updates zoom, pan, HUD controls, and cursor through real browser entrypoints', async ({
    page,
  }) => {
    await openFreshEditor(page);
    await setCanvasTestHooksEnabled(page, false);

    const initialDebug = await readStageDebug(page);
    const stageSurface = page.locator('.konvajs-content');

    await selectTool(page, 'Zoom');
    await expect(page.getByRole('button', { name: 'Zoom (Z)' })).toHaveAttribute('aria-pressed', 'true');
    await expect(stageSurface).toHaveCSS('cursor', 'zoom-in');
    await clickCanvas(page, { x: 300, y: 300 });
    let stageDebug = await readStageDebug(page);
    expect(stageDebug.viewport.zoom).toBeGreaterThan(initialDebug.viewport.zoom);

    await page.keyboard.down('Alt');
    await expect(stageSurface).toHaveCSS('cursor', 'zoom-out');
    await clickCanvas(page, { x: 300, y: 300 });
    await page.keyboard.up('Alt');
    stageDebug = await readStageDebug(page);
    expect(stageDebug.viewport.zoom).toBeLessThanOrEqual(initialDebug.viewport.zoom * 1.01);

    await page.getByRole('button', { name: 'Set zoom to 100%' }).click();
    await expect(page.getByTestId('viewport-zoom')).toContainText('Zoom: 100%');

    await page.getByRole('button', { name: 'Fit canvas to viewport' }).click();
    await expect(page.getByTestId('viewport-zoom')).not.toContainText('Zoom: 100%');

    await selectTool(page, 'Hand');
    const handCursor = await stageSurface.evaluate((node) => getComputedStyle(node).cursor);
    expect(handCursor).toBe('grab');

    const handPanStart = await readStageDebug(page);
    await dragCanvas(page, { x: 220, y: 220 }, { x: 320, y: 300 });
    stageDebug = await readStageDebug(page);
    expect(stageDebug.viewport.panX).not.toBe(handPanStart.viewport.panX);
    expect(stageDebug.viewport.panY).not.toBe(handPanStart.viewport.panY);

    await selectTool(page, 'Select');
    await expect(stageSurface).toHaveCSS('cursor', 'default');
    const middlePanStart = await readStageDebug(page);
    await middleDragCanvas(page, { x: 260, y: 260 }, { x: 360, y: 340 });
    stageDebug = await readStageDebug(page);
    expect(stageDebug.viewport.panX).not.toBe(middlePanStart.viewport.panX);
    expect(stageDebug.viewport.panY).not.toBe(middlePanStart.viewport.panY);

    await page.mouse.wheel(0, -240);
    stageDebug = await readStageDebug(page);
    expect(stageDebug.viewport.zoom).toBeGreaterThan(0.5);
  });
});
