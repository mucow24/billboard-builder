import { expect, test, type Page } from '@playwright/test';

import {
  clickItem,
  createPolygonFixture,
  createProjectDocument,
  dragEmptyCanvas,
  dragHandle,
  clickEmptyCanvas,
  exportPngPixels,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  readStageDebug,
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

  test('resizing from a bounding-box handle scales the whole polygon', async ({ page }) => {
    await openFreshEditor(page);
    await uploadPolygonFixture(page);

    await clickItem(page, 'polygon-item');
    // The fixture AABB is (200,200) 240x240. Grow from the bottom-right box
    // handle by (+160,+160): the box becomes 400x400 and every vertex scales
    // about the (200,200) anchor. Target edges (600) sit clear of the canvas
    // snap candidates (0 / 512 / 1024), so the result is exact.
    await dragHandle(page, 'polygon-item', 'bottom-right', 160, 160);

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({
        kind: 'polygon',
        vertices: [
          { x: 200, y: 200 },
          { x: 600, y: 200 },
          { x: 600, y: 600 },
          { x: 200, y: 600 },
        ],
      }),
    ]);
  });

  test('rotating from the bounding-box rotate handle spins the whole polygon', async ({ page }) => {
    await openFreshEditor(page);
    await uploadPolygonFixture(page);

    await clickItem(page, 'polygon-item');
    // Drag the rotate handle straight down (dx=0) far past the box center. Any
    // point directly below center is +90° from the handle's rest position
    // (straight up), so this is exactly a 180° turn regardless of zoom.
    await dragHandle(page, 'polygon-item', 'rotater', 0, 700);

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({
        kind: 'polygon',
        // 180° about the AABB center (320,320) maps each corner to its opposite.
        vertices: [
          { x: 440, y: 440 },
          { x: 200, y: 440 },
          { x: 200, y: 200 },
          { x: 440, y: 200 },
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

    await test.step('sets the curve radius from the Polygon section, open from the start', async () => {
      await expect(
        page.getByTestId('properties-tab-body').getByRole('button', { name: 'Polygon', exact: true }),
      ).toHaveAttribute('aria-expanded', 'true');
      await page.getByRole('spinbutton', { name: 'Curve radius' }).fill('24');

      const saved = await saveAndReadProject(page);
      expect(saved.nodes).toEqual([
        expect.objectContaining({ curveRadius: 24 }),
      ]);
    });

    await test.step('keeps a typed radius past the end of the slider', async () => {
      const radius = page.getByRole('spinbutton', { name: 'Curve radius' });
      const slider = page.getByRole('slider', { name: 'Curve radius' });
      await expect(slider).toHaveAttribute('max', '500');

      await radius.fill('100000');
      await radius.press('Enter');
      await expect(radius).toHaveValue('100000');

      const saved = await saveAndReadProject(page);
      expect(saved.nodes).toEqual([
        expect.objectContaining({ curveRadius: 100000 }),
      ]);
    });

    await test.step('turns a typed negative radius into 0', async () => {
      const radius = page.getByRole('spinbutton', { name: 'Curve radius' });
      await radius.fill('-5');
      await radius.press('Enter');
      await expect(radius).toHaveValue('0');

      const saved = await saveAndReadProject(page);
      expect(saved.nodes).toEqual([
        expect.objectContaining({ curveRadius: 0 }),
      ]);

      await radius.fill('24');
      await radius.press('Enter');
    });

    await page.getByRole('button', { name: 'Geometry' }).click();

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

  test('Mirror flips the polygon left to right, and back on a second click', async ({ page }) => {
    // A right trapezoid in the fixture box: square corners on the left, the
    // slanted side on the right. The box centre, where clickItem clicks, is
    // inside it either way round.
    const trapezoid = [
      { x: 200, y: 200 },
      { x: 320, y: 200 },
      { x: 440, y: 440 },
      { x: 200, y: 440 },
    ];
    const mirroredTrapezoid = [
      { x: 440, y: 200 },
      { x: 320, y: 200 },
      { x: 200, y: 440 },
      { x: 440, y: 440 },
    ];
    // Just below the top edge: near the left side, and the same distance in
    // from the right. Only the square corner's side is filled.
    const points = [
      { x: 220, y: 230 },
      { x: 420, y: 230 },
    ];

    await openFreshEditor(page);
    await uploadProject(
      page,
      {
        ...createProjectDocument([createPolygonFixture({ vertices: trapezoid })]),
        background: '#ffffffff',
      },
      'polygon-mirror.json',
    );
    await expect.poll(async () => (await readStageDebug(page)).renderedItemCount).toBe(1);
    expect(await exportAndSample(page, points)).toEqual(['orange', 'other']);

    await clickItem(page, 'polygon-item');
    await openPropertiesTab(page);
    // A one-click action, not a toggle: there is no pressed state.
    const mirrorButton = page.getByRole('button', { name: 'Mirror' });
    await expect(mirrorButton).not.toHaveAttribute('aria-pressed');

    await test.step('first click flips it in place', async () => {
      await mirrorButton.click();
      expect(await exportAndSample(page, points)).toEqual(['other', 'orange']);

      const saved = await saveAndReadProject(page);
      expect(saved.nodes).toEqual([
        expect.objectContaining({
          vertices: mirroredTrapezoid,
          x: 200,
          y: 200,
          width: 240,
          height: 240,
        }),
      ]);
    });

    await test.step('second click flips it back', async () => {
      await mirrorButton.click();
      expect(await exportAndSample(page, points)).toEqual(['orange', 'other']);

      const saved = await saveAndReadProject(page);
      expect(saved.nodes).toEqual([expect.objectContaining({ vertices: trapezoid })]);
    });

    await test.step('undo brings the flip back', async () => {
      await page.keyboard.press('ControlOrMeta+z');
      expect(await exportAndSample(page, points)).toEqual(['other', 'orange']);
    });
  });

  test('Mirror flips the gradient along with the polygon', async ({ page }) => {
    // The fixture square, orange on the left fading to blue on the right.
    const points = [
      { x: 215, y: 320 },
      { x: 425, y: 320 },
    ];

    await openFreshEditor(page);
    await uploadProject(
      page,
      {
        ...createProjectDocument([
          createPolygonFixture({ gradientEnabled: true, gradientAngle: 90 }),
        ]),
        background: '#ffffffff',
      },
      'polygon-mirror-gradient.json',
    );
    await expect.poll(async () => (await readStageDebug(page)).renderedItemCount).toBe(1);
    expect(await exportAndSample(page, points)).toEqual(['orange', 'blue']);

    await clickItem(page, 'polygon-item');
    await openPropertiesTab(page);
    await page.getByRole('button', { name: 'Mirror' }).click();

    expect(await exportAndSample(page, points)).toEqual(['blue', 'orange']);
    await expect(page.getByRole('spinbutton', { name: 'Gradient angle' })).toHaveValue('-90');

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([expect.objectContaining({ gradientAngle: -90 })]);
  });
});

type Ink = 'orange' | 'blue' | 'other';

/**
 * Export > PNG and name the colour at each canvas point: mostly the fixture's
 * orange fill (#f97316), mostly its blue secondary fill (#0840e9), or neither
 * (the white background).
 */
async function exportAndSample(
  page: Page,
  points: Array<{ x: number; y: number }>,
): Promise<Ink[]> {
  return (await exportPngPixels(page, points)).map(({ r, b }) => {
    if (r > b + 80) return 'orange';
    if (b > r + 80) return 'blue';
    return 'other';
  });
}
