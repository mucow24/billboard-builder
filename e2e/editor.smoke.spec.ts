import { expect, test, type Page } from '@playwright/test';

import {
  beginCanvasDrag,
  clickEmptyCanvas,
  createGroupNodeFixture,
  createGroupedProjectDocument,
  dragEmptyCanvas,
  movePointerToCanvasPoint,
  openFreshEditor,
  openLayersTab,
  readStageDebug,
  releasePointer,
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

  test('fits the canvas clear of the toolbar, the tool palette and the open properties panel', async ({ page }) => {
    await openFreshEditor(page);

    const [canvasWidth, canvasHeight] = ((await page.getByTestId('canvas-size').textContent()) ?? '')
      .split('x')
      .map((value) => Number(value.trim()));
    const panel = page.locator('.top-toolbar-inspector-panel');
    await expect(panel).toBeVisible();
    const [stageBox, toolbarBox, paletteBox, panelBox] = await Promise.all([
      page.getByTestId('canvas-stage-root').boundingBox(),
      page.locator('.overlay-topbar').boundingBox(),
      page.locator('.overlay-tools').boundingBox(),
      panel.boundingBox(),
    ]);
    if (!stageBox || !toolbarBox || !paletteBox || !panelBox) {
      throw new Error('The stage, toolbar, tool palette or properties panel has no layout box.');
    }
    // The room left clear, in stage coordinates.
    const areaTop = toolbarBox.y + toolbarBox.height - stageBox.y;
    const areaLeft = paletteBox.x + paletteBox.width - stageBox.x;
    const panelLeft = panelBox.x - stageBox.x;
    expect(areaTop).toBeGreaterThan(0);
    expect(areaLeft).toBeGreaterThan(0);

    // How far the fitted canvas's sides are from the edges of the room it was
    // fitted into (up to `areaRight`).
    async function readFitMargins(areaRight: number) {
      const { viewport } = await readStageDebug(page);
      return {
        left: viewport.panX - areaLeft,
        right: areaRight - (viewport.panX + canvasWidth * viewport.zoom),
        top: viewport.panY - areaTop,
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

    // The startup fit keeps the canvas clear of all three.
    expectCenteredWithMargin(await readFitMargins(panelLeft));

    // So does Fit.
    await page.getByRole('button', { name: 'Set zoom to 100%' }).click();
    await expect(page.getByTestId('viewport-zoom')).toContainText('Zoom: 100%');
    await page.getByRole('button', { name: 'Fit canvas to viewport' }).click();
    await expect(page.getByTestId('viewport-zoom')).not.toContainText('Zoom: 100%');
    expectCenteredWithMargin(await readFitMargins(panelLeft));

    // With the panel collapsed, Fit uses the stage's full width right of the
    // tool palette.
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

  test('zooms two steps per zoom tool click, and to a dragged box clear of the toolbar, tool palette and panel', async ({
    page,
  }) => {
    await openFreshEditor(page);

    const [canvasWidth, canvasHeight] = ((await page.getByTestId('canvas-size').textContent()) ?? '')
      .split('x')
      .map((value) => Number(value.trim()));
    const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
    const zoomGrid = ZOOM_ALIGNMENT_GRID * devicePixelRatio;
    const selectButton = page.getByRole('button', { name: 'Select (V)' });

    // A click zooms in by two wheel steps (1.2 squared), then the tool goes
    // back to Select.
    const initialZoom = (await readStageDebug(page)).viewport.zoom;
    await selectTool(page, 'Zoom');
    await clickEmptyCanvas(page, { x: canvasWidth / 2, y: canvasHeight / 2 });
    await expect(selectButton).toHaveAttribute('aria-pressed', 'true');
    const clicked = await expectVisibleAlignedZoom(page);
    expect(clicked.viewport.zoom).toBeCloseTo(Math.round(initialZoom * 1.44 * zoomGrid) / zoomGrid, 9);

    await page.getByRole('button', { name: 'Fit canvas to viewport' }).click();
    await expect.poll(async () => (await readStageDebug(page)).viewport.zoom).toBe(initialZoom);

    const [stageBox, toolbarBox, paletteBox, panelBox] = await Promise.all([
      page.getByTestId('canvas-stage-root').boundingBox(),
      page.locator('.overlay-topbar').boundingBox(),
      page.locator('.overlay-tools').boundingBox(),
      page.locator('.top-toolbar-inspector-panel').boundingBox(),
    ]);
    if (!stageBox || !toolbarBox || !paletteBox || !panelBox) {
      throw new Error('The stage, toolbar, tool palette or properties panel has no layout box.');
    }
    // The room clear of all three, in stage coordinates.
    const area = {
      left: paletteBox.x + paletteBox.width - stageBox.x,
      top: toolbarBox.y + toolbarBox.height - stageBox.y,
      right: panelBox.x - stageBox.x,
      bottom: stageBox.height,
    };

    // Drag a box over a wide strip of the canvas; it shows while dragging.
    const from = { x: canvasWidth * 0.2, y: canvasHeight * 0.3 };
    const to = { x: canvasWidth * 0.45, y: canvasHeight * 0.4 };
    await selectTool(page, 'Zoom');
    await beginCanvasDrag(page, from);
    await movePointerToCanvasPoint(page, to);
    const zoomBox = page.getByTestId('canvas-zoom-box');
    await expect(zoomBox).toBeVisible();
    const fitted = await readStageDebug(page);
    const shownBox = await zoomBox.boundingBox();
    if (!shownBox) {
      throw new Error('The zoom box has no layout box.');
    }
    const expectedBox = {
      x: stageBox.x + fitted.viewport.panX + from.x * fitted.viewport.zoom,
      y: stageBox.y + fitted.viewport.panY + from.y * fitted.viewport.zoom,
      width: (to.x - from.x) * fitted.viewport.zoom,
      height: (to.y - from.y) * fitted.viewport.zoom,
    };
    for (const side of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(shownBox[side] - expectedBox[side])).toBeLessThan(1.5);
    }

    // Releasing zooms so that strip fills the room across, centered in it.
    await releasePointer(page);
    await expect(zoomBox).toHaveCount(0);
    await expect(selectButton).toHaveAttribute('aria-pressed', 'true');
    const { viewport } = await expectVisibleAlignedZoom(page);
    expect(viewport.zoom).toBeGreaterThan(fitted.viewport.zoom);
    const shown = {
      left: viewport.panX + from.x * viewport.zoom,
      top: viewport.panY + from.y * viewport.zoom,
      right: viewport.panX + to.x * viewport.zoom,
      bottom: viewport.panY + to.y * viewport.zoom,
    };
    expect(shown.left).toBeGreaterThanOrEqual(area.left - 1);
    expect(shown.right).toBeLessThanOrEqual(area.right + 1);
    expect(shown.top).toBeGreaterThanOrEqual(area.top - 1);
    expect(shown.bottom).toBeLessThanOrEqual(area.bottom + 1);
    expect((shown.right - shown.left) / (area.right - area.left)).toBeGreaterThan(0.95);
    expect(Math.abs((shown.left + shown.right) / 2 - (area.left + area.right) / 2)).toBeLessThan(1);
    expect(Math.abs((shown.top + shown.bottom) / 2 - (area.top + area.bottom) / 2)).toBeLessThan(1);
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
