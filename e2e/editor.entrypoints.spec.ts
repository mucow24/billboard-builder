import { expect, test, type Page } from '@playwright/test';

import {
  beginCanvasDrag,
  clickEmptyCanvas,
  clickItem,
  createEllipseFixture,
  createImageFixture,
  createLineFixture,
  createProjectDocument,
  createRectangleFixture,
  createTextFixture,
  dragEmptyCanvas,
  dragItemTo,
  middleDragCanvas,
  movePointerToCanvasPoint,
  openFreshEditor,
  openPropertiesTab,
  readRenderSnapshot,
  readStageDebug,
  releasePointer,
  saveAndReadProject,
  selectTool,
  setCanvasTestHooksEnabled,
  uploadProject,
  wheelAt,
} from './support/editor';

const ZOOM_ALIGNMENT_GRID = 64;

function expectAlignedZoom(zoom: number, devicePixelRatio: number) {
  const scaledZoom = zoom * ZOOM_ALIGNMENT_GRID * devicePixelRatio;
  expect(Math.abs(scaledZoom - Math.round(scaledZoom))).toBeLessThan(1e-6);
}

async function expectVisibleAlignedViewportZoom(page: Page) {
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

async function expectNoActiveSelection(page: Page) {
  await expect(page.locator('.layer-row.active')).toHaveCount(0);
}

interface LeafPickupCase {
  id: string;
  kind: 'rectangle' | 'ellipse' | 'text' | 'image' | 'line';
  name: string;
  item: Record<string, unknown>;
  from: { x: number; y: number };
  to: { x: number; y: number };
  expectCommittedMovement: (savedItem: Record<string, unknown>) => void;
}

// Only rectangle (shape handles) and line (line handles) are needed —
// ellipse, text, and image share the same pickup code path and handle type.
const leafPickupCases: LeafPickupCase[] = [
  {
    id: 'pickup-rect',
    kind: 'rectangle',
    name: 'Rectangle',
    item: createRectangleFixture({
      id: 'pickup-rect',
      name: 'Pickup Rectangle',
      x: 140,
      y: 160,
      width: 180,
      height: 110,
    }),
    from: { x: 200, y: 220 },
    to: { x: 320, y: 300 },
    expectCommittedMovement(savedItem) {
      expect(Number(savedItem.x)).toBeGreaterThan(220);
      expect(Number(savedItem.y)).toBeGreaterThan(220);
    },
  },
  {
    id: 'pickup-line',
    kind: 'line',
    name: 'Line',
    item: createLineFixture({
      id: 'pickup-line',
      name: 'Pickup Line',
      x: 140,
      y: 520,
      startX: 140,
      startY: 520,
      endX: 420,
      endY: 560,
      width: 280,
      height: 40,
      zIndex: 0,
    }),
    from: { x: 220, y: 540 },
    to: { x: 340, y: 620 },
    expectCommittedMovement(savedItem) {
      expect(Number(savedItem.startX)).toBeGreaterThan(220);
      expect(Number(savedItem.startY)).toBeGreaterThan(580);
      expect(Number(savedItem.endX)).toBeGreaterThan(500);
      expect(Number(savedItem.endY)).toBeGreaterThan(620);
    },
  },
];

test.describe('editor canvas entrypoints', () => {
  test('keeps single-selection handle hooks a constant viewport size while zoom changes', async ({
    page,
  }) => {
    const rectangle = createRectangleFixture({
      id: 'zoom-stable-rect',
      x: 180,
      y: 180,
      width: 220,
      height: 140,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rectangle]), 'zoom-stable-selection.json');

    await clickItem(page, 'zoom-stable-rect');
    await expect.poll(async () => (await readStageDebug(page)).hasShapeHandles).toBe(true);

    const handleBefore = await page.getByTestId('canvas-shape-handle-middle-right').boundingBox();
    const rotaterBefore = await page.getByTestId('canvas-shape-handle-rotater').boundingBox();
    const overlayBefore = await page.getByTestId('canvas-selected-item-overlay').boundingBox();
    if (!handleBefore || !rotaterBefore || !overlayBefore) {
      throw new Error('Expected selection hooks before zoom change.');
    }

    await page.getByRole('button', { name: 'Set zoom to 100%' }).click();
    await expect(page.getByTestId('viewport-zoom')).toContainText('Zoom: 100%');

    const handleAfter = await page.getByTestId('canvas-shape-handle-middle-right').boundingBox();
    const rotaterAfter = await page.getByTestId('canvas-shape-handle-rotater').boundingBox();
    const overlayAfter = await page.getByTestId('canvas-selected-item-overlay').boundingBox();
    if (!handleAfter || !rotaterAfter || !overlayAfter) {
      throw new Error('Expected selection hooks after zoom change.');
    }

    expect(handleAfter.width).toBeCloseTo(handleBefore.width, 1);
    expect(handleAfter.height).toBeCloseTo(handleBefore.height, 1);
    expect(
      overlayAfter.y - (rotaterAfter.y + rotaterAfter.height / 2),
    ).toBeCloseTo(
      overlayBefore.y - (rotaterBefore.y + rotaterBefore.height / 2),
      1,
    );
  });

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

    await clickItem(page, 'entry-rect');
    await openPropertiesTab(page);
    await expect(page.getByRole('heading', { name: 'Rectangle' })).toBeVisible();

    await clickItem(page, 'entry-ellipse');
    await openPropertiesTab(page);
    await expect(page.getByRole('heading', { name: 'Ellipse' })).toBeVisible();

    await clickItem(page, 'entry-text');
    await openPropertiesTab(page);
    await expect(page.getByLabel('Text content')).toBeVisible();

    await clickItem(page, 'entry-image');
    await openPropertiesTab(page);
    await expect(page.getByLabel('Preserve aspect ratio')).toBeVisible();

    await clickItem(page, 'entry-line');
    await openPropertiesTab(page);
    await expect(page.getByRole('button', { name: /Geometry/ })).toBeVisible();

    // CS-08: Shift-click second item to multi-select
    await clickItem(page, 'entry-rect');
    await clickItem(page, 'entry-ellipse', { shiftKey: true });
    await openPropertiesTab(page);
    await expect(page.getByRole('heading', { name: '2 items selected' })).toBeVisible();

    // Clear selection
    await clickEmptyCanvas(page, { x: 920, y: 920 });
    await expectNoActiveSelection(page);

    // CS-09: Marquee across items to multi-select
    await dragEmptyCanvas(page, { x: 80, y: 80 }, { x: 560, y: 280 });
    await openPropertiesTab(page);
    await expect(page.getByRole('heading', { name: '2 items selected' })).toBeVisible();

    await clickEmptyCanvas(page, { x: 920, y: 920 });
    await dragEmptyCanvas(page, { x: 920, y: 920 }, { x: 920, y: 920 }, { steps: 1 });
    await expectNoActiveSelection(page);

    // CS-12: clicking on a locked item (rendered but eventMode='none')
    // passes through to the empty canvas — no selection.
    await clickEmptyCanvas(page, { x: 820, y: 190 });
    await expectNoActiveSelection(page);

    // CS-13: clicking on the location of a hidden item (not rendered at all)
    // hits empty canvas — no selection.
    await clickEmptyCanvas(page, { x: 820, y: 380 });
    await expectNoActiveSelection(page);
  });

  test('CS-15 selects fully off-canvas and edge-overflow items directly in the unclipped scene', async ({
    page,
  }) => {
    const fullyOutside = createRectangleFixture({
      id: 'outside-click-rect',
      name: 'Outside Click Rectangle',
      x: -220,
      y: 140,
      width: 120,
      height: 120,
      zIndex: 0,
    });
    const edgeOverflow = createRectangleFixture({
      id: 'edge-click-rect',
      name: 'Edge Click Rectangle',
      x: -80,
      y: 360,
      width: 180,
      height: 120,
      fill: '#0ea5e9',
      stroke: '#0369a1ff',
      zIndex: 1,
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([fullyOutside, edgeOverflow]),
      'off-canvas-click-entrypoints.json',
    );
    await setCanvasTestHooksEnabled(page, false);

    await clickItem(page, 'outside-click-rect');
    await openPropertiesTab(page);
    await expect(page.getByRole('heading', { name: 'Rectangle' })).toBeVisible();
    let stageDebug = await readStageDebug(page);
    expect(stageDebug.selectedItems?.map((item) => item.id)).toEqual(['outside-click-rect']);
    expect(stageDebug.hasShapeHandles).toBe(true);

    await clickItem(page, 'edge-click-rect');
    await openPropertiesTab(page);
    await expect(page.getByRole('heading', { name: 'Rectangle' })).toBeVisible();
    stageDebug = await readStageDebug(page);
    expect(stageDebug.selectedItems?.map((item) => item.id)).toEqual(['edge-click-rect']);
    expect(stageDebug.hasShapeHandles).toBe(true);
  });

  test('CS-07 drags an already-selected item and commits on mouseup', async ({ page }) => {
    const rectangle = createRectangleFixture({
      id: 'selected-drag-rect',
      name: 'Selected Drag Rectangle',
      x: 140,
      y: 160,
      width: 180,
      height: 110,
      zIndex: 0,
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([rectangle]),
      'selected-drag-rect.json',
    );
    await setCanvasTestHooksEnabled(page, false);

    await clickItem(page, rectangle.id);
    await openPropertiesTab(page);
    await expect(page.getByRole('heading', { name: 'Rectangle' })).toBeVisible();

    let stageDebug = await readStageDebug(page);
    expect(stageDebug.selectedItems?.map((item) => item.id)).toEqual([rectangle.id]);
    expect(stageDebug.hasShapeHandles).toBe(true);
    expect(stageDebug.hasGroupOverlay).toBe(false);

    await dragItemTo(page, rectangle.id, 340, 300);

    stageDebug = await readStageDebug(page);
    expect(stageDebug.sessionKind).toBeNull();
    expect(stageDebug.selectedItems?.map((item) => item.id)).toEqual([rectangle.id]);
    expect(stageDebug.hasShapeHandles).toBe(true);

    const savedProject = await saveAndReadProject(page);
    const savedItem = (savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === rectangle.id,
    );
    expect(savedItem).toEqual(expect.objectContaining({ id: rectangle.id }));
    expect(Number(savedItem?.x)).toBeGreaterThan(220);
    expect(Number(savedItem?.y)).toBeGreaterThan(220);
  });

  test('CS-16 CS-17 marquee-selects fully off-canvas and edge-crossing content directly in the unclipped scene', async ({
    page,
  }) => {
    const fullyOutside = createRectangleFixture({
      id: 'outside-marquee-rect',
      name: 'Outside Marquee Rectangle',
      x: -220,
      y: 140,
      width: 120,
      height: 120,
      zIndex: 0,
    });
    const partlyVisible = createRectangleFixture({
      id: 'edge-marquee-partial',
      name: 'Edge Partial Rectangle',
      x: -80,
      y: 360,
      width: 180,
      height: 120,
      zIndex: 1,
    });
    const edgeOutside = createRectangleFixture({
      id: 'edge-marquee-outside',
      name: 'Edge Outside Rectangle',
      x: -260,
      y: 360,
      width: 120,
      height: 120,
      fill: '#0ea5e9',
      stroke: '#0369a1ff',
      zIndex: 2,
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([fullyOutside, partlyVisible, edgeOutside]),
      'off-canvas-marquee-entrypoints.json',
    );
    await setCanvasTestHooksEnabled(page, false);

    await beginCanvasDrag(page, { x: -300, y: 100 });
    await movePointerToCanvasPoint(page, { x: -80, y: 300 });
    await expect.poll(async () => (await readStageDebug(page)).sessionKind).toBe('marquee');
    await releasePointer(page);

    let stageDebug = await readStageDebug(page);
    expect(stageDebug.selectedItems?.map((item) => item.id)).toEqual(['outside-marquee-rect']);
    expect(stageDebug.hasShapeHandles).toBe(true);

    await clickEmptyCanvas(page, { x: 920, y: 920 });
    await expectNoActiveSelection(page);

    await beginCanvasDrag(page, { x: 120, y: 320 });
    await movePointerToCanvasPoint(page, { x: -180, y: 520 });
    await expect.poll(async () => (await readStageDebug(page)).sessionKind).toBe('marquee');
    await releasePointer(page);

    stageDebug = await readStageDebug(page);
    expect(stageDebug.selectedItems?.map((item) => item.id)).toEqual([
      'edge-marquee-partial',
      'edge-marquee-outside',
    ]);
  });

  test('CS-18 starts a one-gesture pickup drag from fully off-canvas content in the unclipped scene', async ({
    page,
  }) => {
    const offCanvas = createRectangleFixture({
      id: 'off-canvas-pickup',
      name: 'Off Canvas Pickup',
      x: -220,
      y: 180,
      width: 120,
      height: 120,
      zIndex: 0,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([offCanvas]), 'off-canvas-pickup.json');
    await setCanvasTestHooksEnabled(page, false);

    // CS-18: pickup drag from off-canvas item; targets the off-canvas rect by id.
    await dragItemTo(page, 'off-canvas-pickup', -120, 280);

    const stageDebug = await readStageDebug(page);
    expect(stageDebug.selectedItems?.map((item) => item.id)).toEqual(['off-canvas-pickup']);
    expect(stageDebug.hasShapeHandles).toBe(true);

    const savedProject = await saveAndReadProject(page);
    const savedItem = (savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'off-canvas-pickup',
    );
    expect(savedItem).toEqual(expect.objectContaining({ id: 'off-canvas-pickup' }));
    expect(Number(savedItem?.x)).toBeGreaterThan(-220);
    expect(Number(savedItem?.y)).toBeGreaterThan(180);
  });

  test('VP-01 VP-02 VP-03 VP-04 VP-06 VP-08 VP-09 VP-10 updates zoom, pan, HUD controls, and cursor through real browser entrypoints', async ({
    page,
  }) => {
    await openFreshEditor(page);
    await setCanvasTestHooksEnabled(page, false);

    const initialDebug = await expectVisibleAlignedViewportZoom(page);
    const stageSurface = page.locator('.editor-stage');

    await selectTool(page, 'Zoom');
    await expect(page.getByRole('button', { name: 'Zoom (Z)' })).toHaveAttribute('aria-pressed', 'true');
    await expect(stageSurface).toHaveCSS('cursor', 'zoom-in');
    await clickEmptyCanvas(page, { x: 300, y: 300 });
    let stageDebug = await expectVisibleAlignedViewportZoom(page);
    expect(stageDebug.viewport.zoom).toBeGreaterThan(initialDebug.viewport.zoom);
    // Zoom tool auto-reverts to select after click
    await expect(stageSurface).toHaveCSS('cursor', 'default');

    // Re-activate zoom for alt-click (zoom out) test
    await selectTool(page, 'Zoom');
    await page.keyboard.down('Alt');
    await expect(stageSurface).toHaveCSS('cursor', 'zoom-out');
    await clickEmptyCanvas(page, { x: 300, y: 300 });
    await page.keyboard.up('Alt');
    stageDebug = await expectVisibleAlignedViewportZoom(page);
    expect(stageDebug.viewport.zoom).toBeLessThanOrEqual(initialDebug.viewport.zoom * 1.01);
    // Auto-reverts again
    await expect(stageSurface).toHaveCSS('cursor', 'default');

    await page.getByRole('button', { name: 'Set zoom to 100%' }).click();
    await expect(page.getByTestId('viewport-zoom')).toContainText('Zoom: 100%');
    stageDebug = await expectVisibleAlignedViewportZoom(page);
    expect(stageDebug.viewport.zoom).toBe(1);

    await page.getByRole('button', { name: 'Fit canvas to viewport' }).click();
    await expect(page.getByTestId('viewport-zoom')).not.toContainText('Zoom: 100%');
    stageDebug = await expectVisibleAlignedViewportZoom(page);

    await selectTool(page, 'Hand');
    const handCursor = await stageSurface.evaluate((node) => getComputedStyle(node).cursor);
    expect(handCursor).toBe('grab');

    const handPanStart = await readStageDebug(page);
    await dragEmptyCanvas(page, { x: 220, y: 220 }, { x: 320, y: 300 });
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

    const preWheelZoom = stageDebug.viewport.zoom;
    await wheelAt(page, { x: 300, y: 300 }, -240);
    await expect.poll(async () => (await readStageDebug(page)).viewport.zoom).toBeGreaterThan(preWheelZoom);
    stageDebug = await expectVisibleAlignedViewportZoom(page);
  });

  for (const pickupCase of leafPickupCases) {
    test(`CS-14 starts a one-gesture pickup drag from an unselected ${pickupCase.kind} item on the canvas`, async ({
      page,
    }) => {
      const alreadySelected = createRectangleFixture({
        id: `selected-before-${pickupCase.id}`,
        name: 'Already Selected Rectangle',
        x: 40,
        y: 40,
        width: 120,
        height: 80,
        zIndex: 0,
      });

      await openFreshEditor(page);
      await uploadProject(
        page,
        createProjectDocument([
          alreadySelected,
          {
            ...pickupCase.item,
            zIndex: 1,
          },
        ]),
        `${pickupCase.id}.json`,
      );
      await setCanvasTestHooksEnabled(page, false);

      await clickItem(page, alreadySelected.id);
      let stageDebug = await readStageDebug(page);
      expect(stageDebug.hasShapeHandles).toBe(true);
      expect(stageDebug.selectedItems?.map((item) => item.id)).toEqual([alreadySelected.id]);

      await beginCanvasDrag(page, pickupCase.from);
      await movePointerToCanvasPoint(page, pickupCase.to);
      // Don't just poll on sessionKind === 'drag' — the editor's pickup-drag
      // path sets `kind: 'drag'` on the pointerdown (before the first
      // pointermove updates the preview), so the poll can pass while the
      // preview item is still at its original coords.  Wait for the preview
      // to actually show the move before reading further snapshot fields.
      const originalX = Number((pickupCase.item.x ?? pickupCase.item.startX) as number);
      const originalY = Number((pickupCase.item.y ?? pickupCase.item.startY) as number);
      await expect
        .poll(async () => {
          const snap = await readRenderSnapshot(page);
          if (snap.sessionKind !== 'drag') return false;
          const sel = snap.selectedItems[0];
          if (!sel || sel.id !== pickupCase.id) return false;
          return sel.geometry.x > originalX && sel.geometry.y > originalY;
        })
        .toBe(true);

      const previewSnapshot = await readRenderSnapshot(page);
      expect(previewSnapshot.selectedNodeIds).toEqual([pickupCase.id]);
      expect(previewSnapshot.selectedItems).toHaveLength(1);

      const previewItem = previewSnapshot.selectedItems[0];
      expect(previewItem.id).toBe(pickupCase.id);
      expect(previewItem.geometry.x).toBeGreaterThan(originalX);
      expect(previewItem.geometry.y).toBeGreaterThan(originalY);

      await releasePointer(page);

      stageDebug = await readStageDebug(page);
      expect(stageDebug.hasGroupOverlay).toBe(false);
      expect(stageDebug.selectedItems?.map((item) => item.id)).toEqual([pickupCase.id]);
      if (pickupCase.kind === 'line') {
        expect(stageDebug.hasLineHandles).toBe(true);
        expect(stageDebug.hasShapeHandles).toBe(false);
      } else {
        expect(stageDebug.hasShapeHandles).toBe(true);
        expect(stageDebug.hasLineHandles).toBe(false);
      }

      const savedProject = await saveAndReadProject(page);
      const savedItem = (savedProject.nodes as Array<Record<string, unknown>>).find(
        (item) => item.id === pickupCase.id,
      );
      expect(savedItem).toEqual(expect.objectContaining({ id: pickupCase.id }));
      if (!savedItem) {
        throw new Error(`Expected saved item ${pickupCase.id}.`);
      }
      pickupCase.expectCommittedMovement(savedItem);
    });
  }
});
