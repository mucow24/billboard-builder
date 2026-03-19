import { expect, test, type Page } from '@playwright/test';

import {
  assertFocusNotInToolbarOrInputs,
  assertNoDocumentTextSelection,
  clickCanvas,
  createGroupNodeFixture,
  createGroupedProjectDocument,
  createProjectDocument,
  createRectangleFixture,
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
    await openPropertiesTab(page);
    await expect(page.getByLabel('Fill')).toBeVisible();

    let stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(1);

    await clickCanvas(page, { x: 360, y: 260 });
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
});
