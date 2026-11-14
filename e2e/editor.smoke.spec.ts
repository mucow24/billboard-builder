import { expect, test, type Page } from '@playwright/test';

import {
  clickEmptyCanvas,
  createGroupNodeFixture,
  createGroupedProjectDocument,
  dragEmptyCanvas,
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

    await expect(page.getByRole('button', { name: 'Canvas', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();

    await selectTool(page, 'Rect');
    await dragEmptyCanvas(page, { x: 120, y: 120 }, { x: 340, y: 280 });

    await selectTool(page, 'Text');
    await clickEmptyCanvas(page, { x: 540, y: 180 });

    await selectTool(page, 'Line');
    await dragEmptyCanvas(page, { x: 180, y: 440 }, { x: 520, y: 520 });

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
    await dragEmptyCanvas(page, { x: 220, y: 220 }, { x: 320, y: 300 });
    await page.keyboard.up(' ');

    const nextDebug = await readStageDebug(page);
    expect(nextDebug.viewport.panX).not.toBe(initialPan.x);
    expect(nextDebug.viewport.panY).not.toBe(initialPan.y);
  });

  test('fits the canvas beside the open properties panel', async ({ page }) => {
    await openFreshEditor(page);

    const [canvasWidth, canvasHeight] = ((await page.getByTestId('canvas-size').textContent()) ?? '')
      .split('x')
      .map((value) => Number(value.trim()));
    const stageBox = await page.getByTestId('canvas-stage-root').boundingBox();
    const panel = page.locator('.top-toolbar-inspector-panel');
    await expect(panel).toBeVisible();
    const panelBox = await panel.boundingBox();
    if (!stageBox || !panelBox) {
      throw new Error('The stage or the properties panel has no layout box.');
    }
    const panelLeft = panelBox.x - stageBox.x;

    // How far the fitted canvas's sides are from the edges of the room it was
    // fitted into (the stage, up to `areaRight`).
    async function readFitMargins(areaRight: number) {
      const { viewport } = await readStageDebug(page);
      return {
        left: viewport.panX,
        right: areaRight - (viewport.panX + canvasWidth * viewport.zoom),
        top: viewport.panY,
        bottom: stageBox!.height - (viewport.panY + canvasHeight * viewport.zoom),
      };
    }

    function expectCenteredWithMargin(margins: Awaited<ReturnType<typeof readFitMargins>>) {
      for (const margin of Object.values(margins)) {
        expect(margin).toBeGreaterThan(0);
      }
      expect(Math.abs(margins.left - margins.right)).toBeLessThan(2);
      expect(Math.abs(margins.top - margins.bottom)).toBeLessThan(2);
    }

    // The startup fit keeps the canvas clear of the panel.
    expectCenteredWithMargin(await readFitMargins(panelLeft));

    // So does Fit.
    await page.getByRole('button', { name: 'Set zoom to 100%' }).click();
    await expect(page.getByTestId('viewport-zoom')).toContainText('Zoom: 100%');
    await page.getByRole('button', { name: 'Fit canvas to viewport' }).click();
    await expect(page.getByTestId('viewport-zoom')).not.toContainText('Zoom: 100%');
    expectCenteredWithMargin(await readFitMargins(panelLeft));

    // With the panel collapsed, Fit uses the whole stage.
    await page.getByRole('tab', { name: 'Properties' }).click();
    await expect(panel).toBeHidden();
    await page.getByRole('button', { name: 'Fit canvas to viewport' }).click();
    await expect
      .poll(async () => {
        const margins = await readFitMargins(stageBox.width);
        return Math.abs(margins.left - margins.right);
      })
      .toBeLessThan(2);
    expectCenteredWithMargin(await readFitMargins(stageBox.width));
  });

  test('zooms to a percentage typed into the zoom readout', async ({ page }) => {
    await openFreshEditor(page);

    await page.getByTestId('viewport-zoom').click();
    const input = page.getByTestId('viewport-zoom-input');
    await expect(input).toBeFocused();
    await input.fill('250');
    await input.press('Enter');

    await expect(page.getByTestId('viewport-zoom')).toContainText('Zoom: 250%');
    await expect.poll(async () => (await readStageDebug(page)).viewport.zoom).toBe(2.5);
    await expectVisibleAlignedZoom(page);

    await page.getByTestId('viewport-zoom').click();
    await input.fill('40');
    await input.press('Escape');
    await expect(page.getByTestId('viewport-zoom')).toContainText('Zoom: 250%');
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
