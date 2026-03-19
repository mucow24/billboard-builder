import { expect, test } from '@playwright/test';

import {
  assertNoDocumentTextSelection,
  clickCanvas,
  clickLayerRow,
  createGroupNodeFixture,
  createGroupedProjectDocument,
  dragCanvas,
  doubleClickCanvas,
  doubleClickLayerRow,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  readStageDebug,
  readRenderSnapshot,
  selectTool,
  createRectangleFixture,
  createTextFixture,
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

  test('loads grouped-node fixtures and exposes group observability for later browser suites', async ({ page }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'infra-rect',
            name: 'Infra Rect',
            x: 160,
            y: 180,
            width: 180,
            height: 120,
            zIndex: 0,
          }),
          createTextFixture({
            id: 'infra-text',
            name: 'Infra Text',
            x: 220,
            y: 210,
            width: 220,
            height: 80,
            text: 'Infrastructure text',
            zIndex: 1,
          }),
        ],
        {
          id: 'infra-group',
          name: 'Infrastructure Group',
        },
      ),
    ]);

    await openFreshEditor(page);
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur?.();
    });
    await page.getByTestId('project-open-input').setInputFiles({
      name: 'grouped-infrastructure.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(groupedDocument), 'utf8'),
    });

    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Infrastructure Group', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Text', exact: true })).toBeVisible();

    await clickLayerRow(page, 'Infrastructure Group');
    let stageDebug = await readStageDebug(page);
    let renderSnapshot = await readRenderSnapshot(page);
    expect(stageDebug.hasGroupOverlay).toBe(true);
    expect(stageDebug.hasShapeHandles).toBe(false);
    expect(stageDebug.hasLineHandles).toBe(false);
    expect(renderSnapshot.hasGroupOverlay).toBe(true);
    expect(renderSnapshot.subgroupOutlines ?? []).toHaveLength(0);

    await doubleClickLayerRow(page, 'Infrastructure Group');
    await expect(page.getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true');

    await openLayersTab(page);
    await clickLayerRow(page, 'Rectangle');
    stageDebug = await readStageDebug(page);
    renderSnapshot = await readRenderSnapshot(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);
    expect(stageDebug.hasLineHandles).toBe(false);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(1);
    expect(renderSnapshot.hasGroupOverlay).toBe(false);
    expect(renderSnapshot.hasShapeHandles).toBe(true);
    expect(renderSnapshot.hasLineHandles).toBe(false);
    expect(renderSnapshot.subgroupOutlines ?? []).toHaveLength(1);

    await doubleClickCanvas(page, { x: 220, y: 220 });
    await assertNoDocumentTextSelection(page);

    await openPropertiesTab(page);
    await expect(page.getByTestId('properties-tab-body')).toBeVisible();
  });
});
