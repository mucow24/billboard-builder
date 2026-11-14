import { expect, test, type Page } from '@playwright/test';

import {
  clickItem,
  clickLayerRow,
  createLegacyLineFixture,
  createLineFixture,
  createProjectDocument,
  dragEmptyCanvas,
  dragHandle,
  exportPngPixels,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  readStageDebug,
  saveAndReadProject,
  selectTool,
  uploadProject,
} from './support/editor';

// A line is an open polygon: two vertices when drawn, more once it is split
// with the "+" on a segment. These flows cover what that adds; the line's
// older behaviour (dragging it, its endpoint handles, groups) is covered in
// the transforms, entrypoints and groups specs.

// The fixture line: (200,300) to (600,300), far from every snap candidate's
// reach in the directions the tests drag.
function uploadLineFixture(page: Page, overrides: Record<string, unknown> = {}) {
  return uploadProject(
    page,
    createProjectDocument([
      createLineFixture({
        id: 'line-item',
        startX: 200,
        startY: 300,
        endX: 600,
        endY: 300,
        stroke: '#ff0000ff',
        strokeWidth: 10,
        ...overrides,
      }),
    ]),
    'line-fixture.json',
  );
}

// A bent line is selected from Layers: clickItem clicks the middle of an
// item's box, which for an open line is usually empty space.
async function selectLineFromLayers(page: Page) {
  await openLayersTab(page);
  await clickLayerRow(page, 'Line');
}

test.describe('line flows', () => {
  test('drags out a line with the Line tool and saves a two-vertex open polygon', async ({ page }) => {
    await openFreshEditor(page);

    await selectTool(page, 'Line');
    await dragEmptyCanvas(page, { x: 200, y: 300 }, { x: 620, y: 420 });

    // Selected like a line always was: two endpoint handles, no transform box.
    const stageDebug = await readStageDebug(page);
    expect(stageDebug.hasLineHandles).toBe(true);
    expect(stageDebug.hasShapeHandles).toBe(false);

    await openLayersTab(page);
    await expect(
      page.getByTestId('layers-tab-body').getByRole('button', { name: 'Line', exact: true }),
    ).toBeVisible();

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({
        kind: 'polygon',
        name: 'Line',
        closed: false,
        curveRadius: 0,
        vertices: [
          { x: 200, y: 300 },
          { x: 620, y: 420 },
        ],
      }),
    ]);
  });

  test('opens a line saved in the old format as a two-vertex line', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createLegacyLineFixture({
          id: 'old-line',
          name: 'Old Line',
          x: 200,
          y: 300,
          width: 400,
          height: 80,
          startX: 200,
          startY: 380,
          endX: 600,
          endY: 300,
          stroke: '#00ff00ff',
          strokeWidth: 8,
        }),
      ]),
      'old-line.json',
    );

    await clickItem(page, 'old-line');
    const stageDebug = await readStageDebug(page);
    expect(stageDebug.hasLineHandles).toBe(true);
    expect(stageDebug.hasShapeHandles).toBe(false);

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toHaveLength(1);
    const savedLine = saved.nodes[0] as Record<string, unknown>;
    expect(savedLine).toEqual(
      expect.objectContaining({
        id: 'old-line',
        kind: 'polygon',
        name: 'Old Line',
        closed: false,
        curveRadius: 0,
        stroke: '#00ff00ff',
        strokeWidth: 8,
        // Start first, end last: the direction the line was drawn in is kept.
        vertices: [
          { x: 200, y: 380 },
          { x: 600, y: 300 },
        ],
      }),
    );
    expect(savedLine).not.toHaveProperty('startX');
    expect(savedLine).not.toHaveProperty('endY');
  });

  test('splits a line with the + on its middle and bends it there', async ({ page }) => {
    await openFreshEditor(page);
    await uploadLineFixture(page);

    await clickItem(page, 'line-item');
    // The "+" sits on the middle of the only segment, (400,300). Dragging it
    // adds a vertex there and moves it in the same gesture.
    await dragHandle(page, 'line-item', 'polygon-edge-0', 40, 160);

    // A bent line gets the transform box as well as its handles.
    const stageDebug = await readStageDebug(page);
    expect(stageDebug.hasShapeHandles).toBe(true);
    expect(stageDebug.hasLineHandles).toBe(true);

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({
        kind: 'polygon',
        closed: false,
        vertices: [
          { x: 200, y: 300 },
          { x: 440, y: 460 },
          { x: 600, y: 300 },
        ],
      }),
    ]);

    // The line follows the bend and is still open: red on both segments,
    // nothing along the straight path it used to take, and no fill between.
    const [onFirstSegment, onSecondSegment, onOldPath, inside] = await exportPngPixels(page, [
      { x: 320, y: 380 },
      { x: 520, y: 380 },
      { x: 400, y: 300 },
      { x: 420, y: 360 },
    ]);
    expect(onFirstSegment).toMatchObject({ r: 255, g: 0, b: 0, a: 255 });
    expect(onSecondSegment).toMatchObject({ r: 255, g: 0, b: 0, a: 255 });
    expect(onOldPath.a).toBe(0);
    expect(inside.a).toBe(0);
  });

  test('Delete removes the selected point of a bent line, then the line itself', async ({ page }) => {
    await openFreshEditor(page);
    await uploadLineFixture(page, {
      vertices: [
        { x: 200, y: 300 },
        { x: 440, y: 500 },
        { x: 600, y: 300 },
      ],
    });

    await selectLineFromLayers(page);
    // Tap (no move) on the middle point selects it; Delete removes it.
    await dragHandle(page, 'line-item', 'polygon-vertex-1', 0, 0);
    await page.keyboard.press('Delete');

    let saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({
        vertices: [
          { x: 200, y: 300 },
          { x: 600, y: 300 },
        ],
      }),
    ]);

    // Straight again: tapping an end selects no point, so Delete removes the
    // whole line, as it always has for a line.
    await dragHandle(page, 'line-item', 'line-start', 0, 0);
    await page.keyboard.press('Delete');

    saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([]);
  });

  test('Line section sets a Curve radius that rounds the bends', async ({ page }) => {
    await openFreshEditor(page);
    // A right-angle bend at (600,300): along the top, then straight down.
    await uploadLineFixture(page, {
      vertices: [
        { x: 200, y: 300 },
        { x: 600, y: 300 },
        { x: 600, y: 700 },
      ],
    });

    await selectLineFromLayers(page);
    await openPropertiesTab(page);
    const properties = page.getByTestId('properties-tab-body');

    await test.step('shows Stroke, then Line (open), and neither Fill nor Polygon nor Closed', async () => {
      await expect(properties.getByRole('button', { name: 'Line', exact: true })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      const sectionKeys = await properties
        .locator('[data-section]')
        .evaluateAll((sections) => sections.map((section) => section.getAttribute('data-section')));
      expect(sectionKeys.slice(0, 2)).toEqual(['stroke', 'line']);
      expect(sectionKeys).not.toContain('fill');
      expect(sectionKeys).not.toContain('polygon');
      await expect(page.getByRole('button', { name: 'Toggle gradient' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Mirror' })).toHaveCount(0);

      await properties.getByRole('button', { name: 'Geometry' }).click();
      await expect(page.getByRole('checkbox', { name: 'Closed' })).toHaveCount(0);
    });

    await test.step('paints the sharp corner before rounding', async () => {
      const [corner] = await exportPngPixels(page, [{ x: 600, y: 300 }]);
      expect(corner).toMatchObject({ r: 255, g: 0, b: 0, a: 255 });
    });

    await test.step('rounds the bend and saves the radius', async () => {
      const radius = page.getByRole('spinbutton', { name: 'Curve radius' });
      await expect(page.getByRole('slider', { name: 'Curve radius' })).toHaveAttribute('max', '500');
      await radius.fill('150');
      await radius.press('Enter');

      const saved = await saveAndReadProject(page);
      expect(saved.nodes).toEqual([
        expect.objectContaining({
          closed: false,
          curveRadius: 150,
          // Rounding is drawn, not baked in: the points stay where they were.
          vertices: [
            { x: 200, y: 300 },
            { x: 600, y: 300 },
            { x: 600, y: 700 },
          ],
        }),
      ]);

      // The curve cuts the corner, so the corner point itself is now empty;
      // the ends are untouched.
      const [corner, nearStart, nearEnd] = await exportPngPixels(page, [
        { x: 600, y: 300 },
        { x: 220, y: 300 },
        { x: 600, y: 680 },
      ]);
      expect(corner.a).toBe(0);
      expect(nearStart).toMatchObject({ r: 255, g: 0, b: 0, a: 255 });
      expect(nearEnd).toMatchObject({ r: 255, g: 0, b: 0, a: 255 });
    });

    await test.step('keeps a typed radius past the end of the slider and turns a negative one into 0', async () => {
      const radius = page.getByRole('spinbutton', { name: 'Curve radius' });
      await radius.fill('100000');
      await radius.press('Enter');
      await expect(radius).toHaveValue('100000');

      await radius.fill('-5');
      await radius.press('Enter');
      await expect(radius).toHaveValue('0');

      const saved = await saveAndReadProject(page);
      expect(saved.nodes).toEqual([expect.objectContaining({ curveRadius: 0 })]);
    });
  });

  test('a straight line ends square at its two points', async ({ page }) => {
    await openFreshEditor(page);
    await uploadLineFixture(page, { strokeWidth: 40 });

    // 40 wide from x=200 to x=600: paint stops at the ends rather than
    // rounding out past them.
    const [inside, pastStart, pastEnd] = await exportPngPixels(page, [
      { x: 210, y: 300 },
      { x: 190, y: 300 },
      { x: 610, y: 300 },
    ]);
    expect(inside).toMatchObject({ r: 255, g: 0, b: 0, a: 255 });
    expect(pastStart.a).toBe(0);
    expect(pastEnd.a).toBe(0);
  });
});
