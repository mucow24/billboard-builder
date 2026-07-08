import { expect, test } from '@playwright/test';

import {
  clickItem,
  createPolygonFixture,
  createProjectDocument,
  dragEmptyCanvas,
  dragHandle,
  clickEmptyCanvas,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  saveAndReadProject,
  selectTool,
  uploadProject,
} from './support/editor';

// The fixture square: vertices (200,200) (440,200) (440,440) (200,440).
function uploadPolygonFixture(page: Parameters<typeof uploadProject>[0], overrides: Record<string, unknown> = {}) {
  return uploadProject(
    page,
    createProjectDocument([createPolygonFixture(overrides)]),
    'polygon-fixture.json',
  );
}

test.describe('polygon tool flows', () => {
  test('drags out a polygon with the Polygon tool and saves a 4-vertex ring', async ({ page }) => {
    await openFreshEditor(page);

    await selectTool(page, 'Polygon');
    await dragEmptyCanvas(page, { x: 200, y: 200 }, { x: 420, y: 380 });

    await openLayersTab(page);
    await expect(page.getByRole('button', { name: /^Polygon \(/ })).toBeVisible();

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({
        kind: 'polygon',
        closed: true,
        curveRadius: 0,
        vertices: [
          { x: 200, y: 200 },
          { x: 420, y: 200 },
          { x: 420, y: 380 },
          { x: 200, y: 380 },
        ],
      }),
    ]);
  });

  test('P hotkey + click drops the default square centered on the click', async ({ page }) => {
    await openFreshEditor(page);

    await page.keyboard.press('p');
    await clickEmptyCanvas(page, { x: 500, y: 400 });

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({
        kind: 'polygon',
        vertices: [
          { x: 380, y: 280 },
          { x: 620, y: 280 },
          { x: 620, y: 520 },
          { x: 380, y: 520 },
        ],
      }),
    ]);
  });

  test('edge "+" splits the edge and drags the new vertex', async ({ page }) => {
    await openFreshEditor(page);
    await uploadPolygonFixture(page);

    await clickItem(page, 'polygon-item');
    // Top edge (index 0): press its "+" and pull the inserted midpoint up.
    // Ctrl disables snapping so the assertion is exact.
    await dragHandle(page, 'polygon-item', 'polygon-edge-0', 0, -80, { ctrlKey: true });

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({
        vertices: [
          { x: 200, y: 200 },
          { x: 320, y: 120 },
          { x: 440, y: 200 },
          { x: 440, y: 440 },
          { x: 200, y: 440 },
        ],
      }),
    ]);
  });

  test('a no-move tap on the edge "+" still inserts the midpoint vertex', async ({ page }) => {
    await openFreshEditor(page);
    await uploadPolygonFixture(page);

    await clickItem(page, 'polygon-item');
    await dragHandle(page, 'polygon-item', 'polygon-edge-1', 0, 0);

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({
        vertices: [
          { x: 200, y: 200 },
          { x: 440, y: 200 },
          { x: 440, y: 320 },
          { x: 440, y: 440 },
          { x: 200, y: 440 },
        ],
      }),
    ]);
  });

  test('dragging a vertex handle moves that vertex', async ({ page }) => {
    await openFreshEditor(page);
    await uploadPolygonFixture(page);

    await clickItem(page, 'polygon-item');
    await dragHandle(page, 'polygon-item', 'polygon-vertex-2', 60, 40, { ctrlKey: true });

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({
        vertices: [
          { x: 200, y: 200 },
          { x: 440, y: 200 },
          { x: 500, y: 480 },
          { x: 200, y: 440 },
        ],
      }),
    ]);
  });

  test('click-selecting a vertex and pressing Delete removes it, with a 3-vertex floor', async ({ page }) => {
    await openFreshEditor(page);
    await uploadPolygonFixture(page);

    await clickItem(page, 'polygon-item');

    // Tap (no move) on vertex 1 selects it; Delete removes it.
    await dragHandle(page, 'polygon-item', 'polygon-vertex-1', 0, 0);
    await page.keyboard.press('Delete');

    let saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({
        vertices: [
          { x: 200, y: 200 },
          { x: 440, y: 440 },
          { x: 200, y: 440 },
        ],
      }),
    ]);

    // At the triangle floor, deleting a selected vertex is a no-op and the
    // polygon survives (Delete must NOT fall through to deleting the item).
    await clickItem(page, 'polygon-item');
    await dragHandle(page, 'polygon-item', 'polygon-vertex-0', 0, 0);
    await page.keyboard.press('Delete');

    saved = await saveAndReadProject(page);
    expect(saved.nodes).toHaveLength(1);
    expect(saved.nodes).toEqual([
      expect.objectContaining({ kind: 'polygon' }),
    ]);
    const polygonNode = saved.nodes[0] as { vertices: unknown[] };
    expect(polygonNode.vertices).toHaveLength(3);
  });

  test('inspector Closed checkbox and Curve radius persist through save', async ({ page }) => {
    await openFreshEditor(page);
    await uploadPolygonFixture(page);

    await clickItem(page, 'polygon-item');
    await openPropertiesTab(page);
    await page.getByRole('button', { name: 'Geometry' }).click();

    await test.step('sets the curve radius', async () => {
      await page.getByRole('spinbutton', { name: 'Curve radius' }).fill('24');

      const saved = await saveAndReadProject(page);
      expect(saved.nodes).toEqual([
        expect.objectContaining({ curveRadius: 24 }),
      ]);
    });

    await test.step('unchecks Closed to open the chain and hides the fill section', async () => {
      await expect(page.getByRole('button', { name: 'Toggle gradient' })).toBeVisible();
      await page.getByRole('checkbox', { name: 'Closed' }).uncheck();

      await expect(page.getByRole('button', { name: 'Toggle gradient' })).toBeHidden();

      const saved = await saveAndReadProject(page);
      expect(saved.nodes).toEqual([
        expect.objectContaining({ closed: false, curveRadius: 24 }),
      ]);
    });
  });
});
