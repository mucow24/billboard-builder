import { expect, test, type Page } from '@playwright/test';

import {
  assertFocusNotInToolbarOrInputs,
  assertNoDocumentTextSelection,
  clickCanvas,
  createGroupNodeFixture,
  createGroupedProjectDocument,
  createLineFixture,
  createMixedShapeLineGroupFixture,
  createProjectDocument,
  createRectangleFixture,
  createSimpleGroupFixture,
  createTextFixture,
  dragCanvas,
  dragCanvasHookToPoint,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  readStageDebug,
  saveAndReadProject,
  setCanvasTestHooksEnabled,
  uploadProject,
} from './support/editor';

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

type SavedNode = {
  id: string;
  kind: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  children?: SavedNode[];
};

async function expectActiveLayerLabel(page: Page, label: string) {
  await expect(page.locator('.layer-row.active .layer-row-select')).toContainText(label);
}

function expectSavedNode(project: Record<string, unknown>, nodeId: string): SavedNode {
  function visit(nodes: SavedNode[]): SavedNode | null {
    for (const node of nodes) {
      if (node.id === nodeId) {
        return node;
      }
      if (node.children) {
        const nested = visit(node.children);
        if (nested) {
          return nested;
        }
      }
    }
    return null;
  }

  const found = visit(project.nodes as SavedNode[]);
  if (!found) {
    throw new Error(`Expected saved project to contain node ${nodeId}.`);
  }
  return found;
}

function frameCenter(frame: NonNullable<Awaited<ReturnType<typeof readStageDebug>>['groupFrame']>) {
  return {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
  };
}

function rotatePoint(
  point: { x: number; y: number },
  origin: { x: number; y: number },
  rotation: number,
) {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: origin.x + (point.x - origin.x) * cos - (point.y - origin.y) * sin,
    y: origin.y + (point.x - origin.x) * sin + (point.y - origin.y) * cos,
  };
}

function groupHandlePoint(
  frame: NonNullable<Awaited<ReturnType<typeof readStageDebug>>['groupFrame']>,
  handle: 'middle-right' | 'bottom-right',
) {
  const center = frameCenter(frame);
  const local =
    handle === 'middle-right'
      ? { x: frame.x + frame.width, y: frame.y + frame.height / 2 }
      : { x: frame.x + frame.width, y: frame.y + frame.height };
  return rotatePoint(local, center, frame.rotation);
}

function groupRotaterPoint(frame: NonNullable<Awaited<ReturnType<typeof readStageDebug>>['groupFrame']>) {
  const center = frameCenter(frame);
  return rotatePoint(
    {
      x: frame.x + frame.width / 2,
      y: frame.y - 50,
    },
    center,
    frame.rotation,
  );
}

test.describe('editor groups', () => {
  test('GD-11 GD-12 GD-13 groups and ungroups sibling nodes through the real toolbar and keyboard flows', async ({
    page,
  }) => {
    const alpha = createRectangleFixture({
      id: 'alpha-rect',
      name: 'Alpha Rect',
      x: 120,
      y: 140,
      width: 160,
      height: 96,
      zIndex: 0,
    });
    const beta = createRectangleFixture({
      id: 'beta-rect',
      name: 'Beta Rect',
      x: 320,
      y: 220,
      width: 140,
      height: 88,
      fill: '#0ea5e9',
      stroke: '#0369a1ff',
      zIndex: 1,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([alpha, beta]), 'ungrouped.json');

    await expect(page.getByRole('button', { name: 'Group', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Ungroup', exact: true })).toBeDisabled();

    // Select both siblings through the real canvas so the toolbar enablement
    // and grouping commands exercise the app shell instead of store internals.
    await dragCanvas(page, { x: 90, y: 110 }, { x: 500, y: 340 });
    await expect(page.getByRole('button', { name: 'Group', exact: true })).toBeEnabled();

    await page.getByRole('button', { name: 'Group', exact: true }).click();

    const groupedDocument = await saveAndReadProject(page);
    expect(groupedDocument.version).toBe(2);
    expect(groupedDocument.nodes).toEqual([
      expect.objectContaining({
        kind: 'group',
        children: [
          expect.objectContaining({ id: alpha.id }),
          expect.objectContaining({ id: beta.id }),
        ],
      }),
    ]);

    await page.getByRole('button', { name: 'New' }).click();
    await uploadProject(page, groupedDocument, 'grouped.json');

    await openLayersTab(page);
    await expect(page.locator('.layer-list').getByRole('button', { name: 'Group', exact: true })).toBeVisible();
    await clickCanvas(page, { x: 150, y: 170 });
    await expect(page.getByRole('button', { name: 'Ungroup', exact: true })).toBeEnabled();

    await page.keyboard.press(`Shift+${modifier}+G`);

    const ungroupedDocument = await saveAndReadProject(page);
    expect(ungroupedDocument.version).toBe(2);
    expect(ungroupedDocument.nodes).toEqual([
      expect.objectContaining({ id: alpha.id, kind: 'rectangle' }),
      expect.objectContaining({ id: beta.id, kind: 'rectangle' }),
    ]);
  });

  test('GT-10 starts a one-gesture pickup drag from an unselected real group node on the canvas', async ({
    page,
  }) => {
    await openFreshEditor(page);
    await uploadProject(page, createSimpleGroupFixture(), 'pickup-group.json');
    await setCanvasTestHooksEnabled(page, false);

    await dragCanvas(page, { x: 210, y: 200 }, { x: 330, y: 280 });

    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Simple Group');

    const stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(true);
    expect(stageDebug.hasShapeHandles).toBe(false);

    const savedProject = await saveAndReadProject(page);
    expect(Number(expectSavedNode(savedProject, 'group-rect-1').x)).toBeGreaterThan(240);
    expect(Number(expectSavedNode(savedProject, 'group-rect-1').y)).toBeGreaterThan(220);
    expect(Number(expectSavedNode(savedProject, 'group-rect-2').x)).toBeGreaterThan(430);
    expect(Number(expectSavedNode(savedProject, 'group-rect-2').y)).toBeGreaterThan(280);
  });

  test('GD-01 GD-02 GD-04 GD-05 GD-06 GD-07 CS-01 KB-11 selects from the canvas, drills into nested descendants, clears, and escapes back out', async ({
    page,
  }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'outer-rect',
            name: 'Outer Rectangle',
            x: 120,
            y: 140,
            width: 140,
            height: 90,
            zIndex: 0,
          }),
          createGroupNodeFixture(
            [
              createRectangleFixture({
                id: 'inner-rect',
                name: 'Inner Rectangle',
                x: 340,
                y: 180,
                width: 130,
                height: 76,
                fill: '#22c55e',
                stroke: '#15803dff',
                zIndex: 1,
              }),
            ],
            {
              id: 'inner-group',
              name: 'Inner Group',
            },
          ),
        ],
        {
          id: 'outer-group',
          name: 'Outer Group',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'nested-groups.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 400, y: 210 });
    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Outer Group');
    await openPropertiesTab(page);
    await expect(page.getByRole('slider', { name: 'Group Opacity' })).toBeVisible();
    let stageDebug = await readStageDebug(page);
    expect(stageDebug.groupFrame).not.toBeNull();
    expect(stageDebug.hasShapeHandles).toBe(false);

    await clickCanvas(page, { x: 400, y: 210 });
    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Inner Group');
    await openPropertiesTab(page);
    await expect(page.getByRole('slider', { name: 'Group Opacity' })).toBeVisible();
    stageDebug = await readStageDebug(page);
    expect(stageDebug.groupFrame).not.toBeNull();
    expect(stageDebug.hasShapeHandles).toBe(false);

    await clickCanvas(page, { x: 400, y: 210 });
    await assertNoDocumentTextSelection(page);
    await assertFocusNotInToolbarOrInputs(page);
    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Rectangle');
    await openPropertiesTab(page);
    await expect(page.getByLabel('Fill')).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Group Opacity' })).toHaveCount(0);
    stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(1);

    await clickCanvas(page, { x: 40, y: 40 });
    await expect(page.locator('.layer-row.active')).toHaveCount(0);
    stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);

    await clickCanvas(page, { x: 400, y: 210 });
    await clickCanvas(page, { x: 400, y: 210 });
    await clickCanvas(page, { x: 400, y: 210 });

    await page.keyboard.press('Escape');
    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Inner Group');

    await page.keyboard.press('Escape');
    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Outer Group');

    await page.keyboard.press('Escape');
    await expect(page.locator('.layer-row.active')).toHaveCount(0);
    stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
  });

  test('GD-08 drills into grouped text from the canvas without leaving browser text selection or stealing toolbar focus', async ({
    page,
  }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'text-drill-rect',
            name: 'Text Drill Rect',
            x: 140,
            y: 180,
            width: 220,
            height: 140,
            zIndex: 0,
          }),
          createTextFixture({
            id: 'text-drill-child',
            name: 'Grouped Text Child',
            x: 200,
            y: 210,
            width: 260,
            height: 90,
            text: 'Grouped text child',
            zIndex: 1,
          }),
        ],
        {
          id: 'text-drill-group',
          name: 'Text Drill Group',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'grouped-text.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 340, y: 245 });
    await clickCanvas(page, { x: 340, y: 245 });

    await assertNoDocumentTextSelection(page);
    await assertFocusNotInToolbarOrInputs(page);
    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Text');
    await openPropertiesTab(page);
    await expect(page.getByLabel('Text content')).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Group Opacity' })).toHaveCount(0);

    const stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);
    expect(stageDebug.hasLineHandles).toBe(false);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(1);
  });

  test('GD-09 drills into a grouped child through the direct item-hit path', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Explicit drill-in route proof stays Chromium-only.');

    await openFreshEditor(page);
    await uploadProject(page, createSimpleGroupFixture(), 'group-drill-item-hit.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 210, y: 200 });
    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Simple Group');

    await clickCanvas(page, { x: 210, y: 200 });
    const stageDebug = await readStageDebug(page);

    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Rectangle');
    await openPropertiesTab(page);
    await expect(page.getByLabel('Fill')).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Group Opacity' })).toHaveCount(0);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);
    expect(stageDebug.hasLineHandles).toBe(false);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(1);
  });

  test('GD-10 drills into a grouped child through the stage-surface fallback path', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Explicit drill-in route proof stays Chromium-only.');

    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'fallback-rect',
            name: 'Fallback Rect',
            x: 140,
            y: 160,
            width: 120,
            height: 60,
            zIndex: 0,
          }),
          createLineFixture({
            id: 'fallback-line',
            name: 'Fallback Line',
            x: 180,
            y: 220,
            startX: 180,
            startY: 220,
            endX: 440,
            endY: 280,
            width: 260,
            height: 60,
            zIndex: 1,
          }),
        ],
        {
          id: 'fallback-group',
          name: 'Fallback Group',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'group-drill-stage-surface.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 220, y: 210 });
    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Fallback Group');

    // This point misses the rendered stroke but remains inside the line's
    // descendant-resolvable bounds, so the stage-surface drill-in path owns it.
    await clickCanvas(page, { x: 320, y: 228 });
    const stageDebug = await readStageDebug(page);

    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Line');
    await openPropertiesTab(page);
    await expect(page.getByRole('slider', { name: 'Group Opacity' })).toHaveCount(0);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(false);
    expect(stageDebug.hasLineHandles).toBe(true);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(1);
  });

  test('GD-03 NI-01 selects sibling children from the canvas and drags only the drilled-in child', async ({
    page,
  }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'alpha-child',
            name: 'Alpha Child',
            x: 120,
            y: 160,
            width: 140,
            height: 96,
            zIndex: 0,
          }),
          createRectangleFixture({
            id: 'beta-child',
            name: 'Beta Child',
            x: 320,
            y: 220,
            width: 130,
            height: 90,
            fill: '#0ea5e9',
            stroke: '#0369a1ff',
            zIndex: 1,
          }),
        ],
        {
          id: 'drag-group',
          name: 'Drag Group',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'drag-child.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 180, y: 210 });
    await clickCanvas(page, { x: 180, y: 210 });
    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Rectangle');
    await openPropertiesTab(page);
    await expect(page.getByLabel('Fill')).toBeVisible();

    let stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(1);

    await clickCanvas(page, { x: 360, y: 260 });
    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Rectangle');
    await dragCanvas(page, { x: 360, y: 260 }, { x: 480, y: 340 });

    stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);

    const savedProject = await saveAndReadProject(page);
    expect(expectSavedNode(savedProject, 'alpha-child')).toEqual(
      expect.objectContaining({
        x: 120,
        y: 160,
      }),
    );
    expect(expectSavedNode(savedProject, 'beta-child')).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
      }),
    );
    expect(Number(expectSavedNode(savedProject, 'beta-child').x)).toBeGreaterThan(430);
    expect(Number(expectSavedNode(savedProject, 'beta-child').y)).toBeGreaterThan(295);

    await page.keyboard.press('Escape');
    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Drag Group');
  });

  test('NI-02 NI-03 rotates and resizes only the drilled-in child, not the parent group', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Lane A precision handles stay Chromium-only.');

    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'rotate-child',
            name: 'Rotate Child',
            x: 150,
            y: 170,
            width: 160,
            height: 100,
            zIndex: 0,
          }),
          createRectangleFixture({
            id: 'sibling-child',
            name: 'Sibling Child',
            x: 380,
            y: 200,
            width: 140,
            height: 90,
            fill: '#22c55e',
            stroke: '#15803dff',
            zIndex: 1,
          }),
        ],
        {
          id: 'precision-group',
          name: 'Precision Group',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'precision-group.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 220, y: 220 });
    await clickCanvas(page, { x: 220, y: 220 });

    await openPropertiesTab(page);
    await expect(page.getByLabel('Fill')).toBeVisible();

    let stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(1);

    await setCanvasTestHooksEnabled(page, true);
    await dragCanvasHookToPoint(page, 'canvas-shape-handle-middle-right', { x: 420, y: 220 });
    await dragCanvasHookToPoint(page, 'canvas-shape-handle-rotater', { x: 420, y: 360 });

    stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);

    const savedProject = await saveAndReadProject(page);
    expect(expectSavedNode(savedProject, 'precision-group')).toEqual(
      expect.objectContaining({
        kind: 'group',
      }),
    );
    expect(expectSavedNode(savedProject, 'rotate-child')).toEqual(
      expect.objectContaining({
        width: expect.any(Number),
        rotation: expect.any(Number),
      }),
    );
    expect(Number(expectSavedNode(savedProject, 'rotate-child').width)).toBeGreaterThan(160);
    expect(Math.abs(Number(expectSavedNode(savedProject, 'rotate-child').rotation))).toBeGreaterThan(10);
    expect(expectSavedNode(savedProject, 'sibling-child')).toEqual(
      expect.objectContaining({
        x: 380,
        y: 200,
        width: 140,
        rotation: 0,
      }),
    );
  });

  test('NI-06 NI-07 NI-08 drags, rotates, and resizes only the drilled-in inner group', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Lane A precision handles stay Chromium-only.');

    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'outer-anchor',
            name: 'Outer Anchor',
            x: 100,
            y: 130,
            width: 120,
            height: 90,
            zIndex: 0,
          }),
          createGroupNodeFixture(
            [
              createRectangleFixture({
                id: 'inner-left-leaf',
                name: 'Inner Left Leaf',
                x: 320,
                y: 200,
                width: 140,
                height: 92,
                fill: '#0ea5e9',
                stroke: '#0369a1ff',
                zIndex: 1,
              }),
              createRectangleFixture({
                id: 'inner-right-leaf',
                name: 'Inner Right Leaf',
                x: 500,
                y: 220,
                width: 120,
                height: 80,
                fill: '#22c55e',
                stroke: '#15803dff',
                zIndex: 2,
              }),
            ],
            {
              id: 'inner-group-node',
              name: 'Inner Group Node',
            },
          ),
        ],
        {
          id: 'outer-group-node',
          name: 'Outer Group Node',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'nested-precision-group.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 380, y: 240 });
    await clickCanvas(page, { x: 380, y: 240 });

    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Inner Group Node');
    await openPropertiesTab(page);
    await expect(page.getByRole('slider', { name: 'Group Opacity' })).toBeVisible();

    let stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(true);
    expect(stageDebug.hasShapeHandles).toBe(false);

    await setCanvasTestHooksEnabled(page, true);
    await dragCanvasHookToPoint(page, 'canvas-group-overlay', { x: 470, y: 330 });
    await dragCanvasHookToPoint(page, 'canvas-group-handle-middle-right', { x: 560, y: 330 });
    await dragCanvasHookToPoint(page, 'canvas-group-rotater', { x: 560, y: 440 });

    stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(true);
    expect(stageDebug.hasShapeHandles).toBe(false);

    const savedProject = await saveAndReadProject(page);
    expect(expectSavedNode(savedProject, 'outer-anchor')).toEqual(
      expect.objectContaining({
        x: 100,
        y: 130,
        width: 120,
        rotation: 0,
      }),
    );
    expect(expectSavedNode(savedProject, 'inner-left-leaf')).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        rotation: expect.any(Number),
      }),
    );
    expect(Number(expectSavedNode(savedProject, 'inner-left-leaf').x)).toBeGreaterThan(320);
    expect(Number(expectSavedNode(savedProject, 'inner-left-leaf').width)).not.toBeCloseTo(140, 3);
    expect(Math.abs(Number(expectSavedNode(savedProject, 'inner-left-leaf').rotation))).toBeGreaterThan(10);
    expect(expectSavedNode(savedProject, 'inner-right-leaf')).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        rotation: expect.any(Number),
      }),
    );
  });

  test('NI-04 NI-05 drills into and manipulates only the grouped line child', async ({
    page,
  }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'line-parent-rect',
            name: 'Line Parent Rect',
            x: 140,
            y: 160,
            width: 120,
            height: 60,
            zIndex: 0,
          }),
          createLineFixture({
            id: 'line-child',
            name: 'Line Child',
            x: 180,
            y: 220,
            startX: 180,
            startY: 220,
            endX: 440,
            endY: 280,
            width: 260,
            height: 60,
            zIndex: 1,
          }),
        ],
        {
          id: 'line-child-group',
          name: 'Line Child Group',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'grouped-line-child.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 220, y: 210 });
    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Line Child Group');

    // This click lands inside the line bounding box but away from the visible stroke,
    // so the stage-surface fallback path is the one that must resolve the drill-in.
    await clickCanvas(page, { x: 320, y: 228 });
    await assertNoDocumentTextSelection(page);
    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Line');

    let stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(false);
    expect(stageDebug.hasLineHandles).toBe(true);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(1);

    await dragCanvas(page, { x: 180, y: 220 }, { x: 260, y: 260 });
    await dragCanvas(page, { x: 350, y: 260 }, { x: 470, y: 340 });

    stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasLineHandles).toBe(true);

    const savedProject = await saveAndReadProject(page);
    expect(expectSavedNode(savedProject, 'line-parent-rect')).toEqual(
      expect.objectContaining({
        x: 140,
        y: 160,
        width: 120,
        rotation: 0,
      }),
    );
    expect(expectSavedNode(savedProject, 'line-child')).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        startX: expect.any(Number),
        startY: expect.any(Number),
        endX: expect.any(Number),
        endY: expect.any(Number),
      }),
    );
    expect(Number(expectSavedNode(savedProject, 'line-child').startX)).toBeGreaterThan(240);
    expect(Number(expectSavedNode(savedProject, 'line-child').startY)).toBeGreaterThan(250);
    expect(Number(expectSavedNode(savedProject, 'line-child').x)).toBeGreaterThan(280);
    expect(Number(expectSavedNode(savedProject, 'line-child').y)).toBeGreaterThan(300);
  });

  test('NI-11 NI-12 true grouped-node child manipulation survives undo, redo, and escape with the correct hierarchy state', async ({
    page,
  }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'undo-child',
            name: 'Undo Child',
            x: 160,
            y: 180,
            width: 180,
            height: 120,
            zIndex: 0,
          }),
          createRectangleFixture({
            id: 'undo-sibling',
            name: 'Undo Sibling',
            x: 420,
            y: 220,
            width: 140,
            height: 96,
            fill: '#22c55e',
            stroke: '#15803dff',
            zIndex: 1,
          }),
        ],
        {
          id: 'undo-group',
          name: 'Undo Group',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'undo-group-child.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 240, y: 240 });
    await clickCanvas(page, { x: 240, y: 240 });
    await dragCanvas(page, { x: 240, y: 240 }, { x: 360, y: 340 });

    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Rectangle');
    await openPropertiesTab(page);
    await expect(page.getByLabel('Fill')).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Group Opacity' })).toHaveCount(0);

    await page.keyboard.press(`${modifier}+Z`);
    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Rectangle');
    await openPropertiesTab(page);
    await expect(page.getByLabel('Fill')).toBeVisible();

    let savedProject = await saveAndReadProject(page);
    expect(expectSavedNode(savedProject, 'undo-child')).toEqual(
      expect.objectContaining({
        x: 160,
        y: 180,
      }),
    );

    await page.keyboard.press(`${modifier}+Shift+Z`);
    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Rectangle');
    await openPropertiesTab(page);
    await expect(page.getByLabel('Fill')).toBeVisible();

    savedProject = await saveAndReadProject(page);
    expect(Number(expectSavedNode(savedProject, 'undo-child').x)).toBeGreaterThan(250);
    expect(Number(expectSavedNode(savedProject, 'undo-child').y)).toBeGreaterThan(275);

    await page.keyboard.press('Escape');
    await openLayersTab(page);
    await expectActiveLayerLabel(page, 'Group');
  });

  test('GT-04 GT-05 GT-06 GT-07 GT-08 transforms a true group node through real canvas overlay interactions', async ({
    page,
  }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'transform-group-left',
            name: 'Transform Group Left',
            x: 140,
            y: 180,
            width: 160,
            height: 100,
            zIndex: 0,
          }),
          createRectangleFixture({
            id: 'transform-group-right',
            name: 'Transform Group Right',
            x: 360,
            y: 220,
            width: 150,
            height: 96,
            fill: '#0ea5e9',
            stroke: '#0369a1ff',
            zIndex: 1,
          }),
        ],
        {
          id: 'transform-group-node',
          name: 'Transform Group Node',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'true-group-transform.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 220, y: 230 });

    let stageDebug = await readStageDebug(page);
    const initialFrame = stageDebug.groupFrame;
    expect(initialFrame).not.toBeNull();
    if (!initialFrame) {
      throw new Error('Expected an initial true group frame.');
    }
    expect(stageDebug.hasGroupOverlay).toBe(true);
    expect(stageDebug.hasShapeHandles).toBe(false);

    const initialCenter = frameCenter(initialFrame);
    await dragCanvas(page, initialCenter, { x: initialCenter.x + 110, y: initialCenter.y + 70 });

    stageDebug = await readStageDebug(page);
    const draggedFrame = stageDebug.groupFrame;
    expect(draggedFrame).not.toBeNull();
    if (!draggedFrame) {
      throw new Error('Expected a committed dragged true group frame.');
    }

    const resizeStart = groupHandlePoint(draggedFrame, 'middle-right');
    await dragCanvas(page, resizeStart, { x: resizeStart.x + 90, y: resizeStart.y });

    stageDebug = await readStageDebug(page);
    const resizedFrame = stageDebug.groupFrame;
    expect(resizedFrame).not.toBeNull();
    if (!resizedFrame) {
      throw new Error('Expected a committed resized true group frame.');
    }
    expect(resizedFrame.width).toBeGreaterThan(draggedFrame.width + 40);

    const rotaterStart = groupRotaterPoint(resizedFrame);
    await dragCanvas(page, rotaterStart, { x: resizedFrame.x + resizedFrame.width + 80, y: resizedFrame.y + resizedFrame.height / 2 });

    stageDebug = await readStageDebug(page);
    const rotatedFrame = stageDebug.groupFrame;
    expect(rotatedFrame).not.toBeNull();
    if (!rotatedFrame) {
      throw new Error('Expected a committed rotated true group frame.');
    }
    expect(Math.abs(rotatedFrame.rotation)).toBeGreaterThan(10);

    const rotatedCenter = frameCenter(rotatedFrame);
    await dragCanvas(page, rotatedCenter, { x: rotatedCenter.x + 60, y: rotatedCenter.y - 90 });

    stageDebug = await readStageDebug(page);
    const redraggedFrame = stageDebug.groupFrame;
    expect(redraggedFrame).not.toBeNull();
    if (!redraggedFrame) {
      throw new Error('Expected a committed re-dragged true group frame.');
    }
    expect(redraggedFrame.x).not.toBeCloseTo(rotatedFrame.x, 2);

    const rotatedResizeStart = groupHandlePoint(redraggedFrame, 'bottom-right');
    await dragCanvas(page, rotatedResizeStart, {
      x: rotatedResizeStart.x + 70,
      y: rotatedResizeStart.y + 60,
    });

    const savedProject = await saveAndReadProject(page);
    expect(expectSavedNode(savedProject, 'transform-group-left')).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        rotation: expect.any(Number),
      }),
    );
    expect(expectSavedNode(savedProject, 'transform-group-right')).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        rotation: expect.any(Number),
      }),
    );
    expect(Number(expectSavedNode(savedProject, 'transform-group-left').x)).toBeGreaterThan(250);
    expect(Math.abs(Number(expectSavedNode(savedProject, 'transform-group-left').rotation))).toBeGreaterThan(10);
    expect(Number(expectSavedNode(savedProject, 'transform-group-right').width)).toBeGreaterThan(180);
  });

  test('GT-09 transforms a true mixed line-and-shape group through the real group overlay', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Mixed grouped transform coverage stays Chromium-only.');

    await openFreshEditor(page);
    await uploadProject(page, createMixedShapeLineGroupFixture(), 'mixed-line-shape-group.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 220, y: 210 });

    const stageDebug = await readStageDebug(page);
    const initialFrame = stageDebug.groupFrame;
    expect(initialFrame).not.toBeNull();
    if (!initialFrame) {
      throw new Error('Expected an initial true group frame for the mixed line-and-shape group.');
    }

    const resizeStart = groupHandlePoint(initialFrame, 'middle-right');
    await dragCanvas(page, resizeStart, { x: resizeStart.x + 90, y: resizeStart.y });

    const savedProject = await saveAndReadProject(page);
    const savedRectangle = expectSavedNode(savedProject, 'line-group-rect');
    const savedLine = expectSavedNode(savedProject, 'line-group-line');

    expect(savedRectangle).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
      }),
    );
    expect(Number(savedRectangle.x)).toBeCloseTo(140, 0);
    expect(Number(savedRectangle.width)).toBeGreaterThan(220);
    expect(Number(savedRectangle.height)).toBeCloseTo(100, 0);

    expect(savedLine).toEqual(
      expect.objectContaining({
        startX: expect.any(Number),
        startY: expect.any(Number),
        endX: expect.any(Number),
        endY: expect.any(Number),
      }),
    );
    expect(Number(savedLine.startX)).toBeGreaterThanOrEqual(180);
    expect(Number(savedLine.startY)).toBeCloseTo(220, 0);
    expect(Number(savedLine.endX)).toBeGreaterThan(520);
    expect(Number(savedLine.endY)).toBeCloseTo(280, 0);
    expect(Number(savedLine.endX) - Number(savedLine.startX)).toBeGreaterThan(290);
  });

});
