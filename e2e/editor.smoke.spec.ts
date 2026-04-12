import { expect, test, type Page } from '@playwright/test';

import {
  clickCanvas,
  createGroupNodeFixture,
  createGroupedProjectDocument,
  dragCanvas,
  openFreshEditor,
  openLayersTab,
  readStageDebug,
  selectTool,
  createRectangleFixture,
  createTextFixture,
  uploadProject,
} from './support/editor';

const ZOOM_ALIGNMENT_GRID = 64;

function expectAlignedZoom(zoom: number, devicePixelRatio: number) {
  const scaledZoom = zoom * ZOOM_ALIGNMENT_GRID * devicePixelRatio;
  expect(Math.abs(scaledZoom - Math.round(scaledZoom))).toBeLessThan(1e-6);
}

async function expectVisibleAlignedZoom(page: Page) {
  const [devicePixelRatio, stageDebug] = await Promise.all([
    page.evaluate(() => window.devicePixelRatio),
    readStageDebug(page),
  ]);

  await expect(page.getByTestId('viewport-zoom')).toContainText(
    `Zoom: ${Math.round(stageDebug.viewport.zoom * 100)}%`,
  );
  expectAlignedZoom(stageDebug.viewport.zoom, devicePixelRatio);

  return stageDebug;
}

test.describe('editor smoke flows', () => {
  test('boots and creates rectangle, text, and line items from the canvas', async ({ page }) => {
    await openFreshEditor(page);

    await expect(page.getByRole('button', { name: 'File', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export PNG' })).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();

    await selectTool(page, 'Rect');
    await dragCanvas(page, { x: 120, y: 120 }, { x: 340, y: 280 });

    await selectTool(page, 'Text');
    await clickCanvas(page, { x: 540, y: 180 });

    await selectTool(page, 'Line');
    await dragCanvas(page, { x: 180, y: 440 }, { x: 520, y: 520 });

    await openLayersTab(page);
    await expect(page.locator('.layer-row')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Text', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Line', exact: true })).toBeVisible();
  });

  test('updates zoom from the HUD and pans with the spacebar-drag gesture', async ({ page }) => {
    await openFreshEditor(page);

    const initialDebug = await expectVisibleAlignedZoom(page);
    const initialZoom = initialDebug.viewport.zoom;
    const initialPan = {
      x: initialDebug.viewport.panX,
      y: initialDebug.viewport.panY,
    };

    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(async () => (await readStageDebug(page)).viewport.zoom).toBeGreaterThan(initialZoom);
    const zoomedInDebug = await expectVisibleAlignedZoom(page);

    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect
      .poll(async () => (await readStageDebug(page)).viewport.zoom)
      .toBeLessThan(zoomedInDebug.viewport.zoom);
    await expectVisibleAlignedZoom(page);

    await page.getByRole('button', { name: 'Set zoom to 100%' }).click();
    await expect(page.getByTestId('viewport-zoom')).toContainText('Zoom: 100%');
    const oneHundredPercentDebug = await expectVisibleAlignedZoom(page);
    expect(oneHundredPercentDebug.viewport.zoom).toBe(1);

    await page.getByRole('button', { name: 'Fit canvas to viewport' }).click();
    await expect(page.getByTestId('viewport-zoom')).not.toContainText('Zoom: 100%');
    await expectVisibleAlignedZoom(page);

    await page.keyboard.down(' ');
    await dragCanvas(page, { x: 220, y: 220 }, { x: 320, y: 300 });
    await page.keyboard.up(' ');

    const nextDebug = await readStageDebug(page);
    expect(nextDebug.viewport.panX).not.toBe(initialPan.x);
    expect(nextDebug.viewport.panY).not.toBe(initialPan.y);
  });

  test('loads a grouped project and shows the group hierarchy in the layers panel', async ({ page }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({ id: 'infra-rect', name: 'Infra Rect', x: 160, y: 180, width: 180, height: 120, zIndex: 0 }),
          createTextFixture({ id: 'infra-text', name: 'Infra Text', x: 220, y: 210, width: 220, height: 80, text: 'Infrastructure text', zIndex: 1 }),
        ],
        { id: 'infra-group', name: 'Infrastructure Group' },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'grouped-infrastructure.json');

    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Infrastructure Group', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Text', exact: true })).toBeVisible();
  });
});
