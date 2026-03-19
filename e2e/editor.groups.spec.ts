import { expect, test, type Page } from '@playwright/test';

import {
  assertFocusNotInToolbarOrInputs,
  assertNoDocumentTextSelection,
  clickCanvas,
  clickLayerRow,
  createGroupNodeFixture,
  createGroupedProjectDocument,
  createProjectDocument,
  createRectangleFixture,
  createTextFixture,
  dragCanvas,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  readStageDebug,
  saveAndReadProject,
  setCanvasTestHooksEnabled,
  uploadProject,
} from './support/editor';

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

async function expectActiveLayerLabel(page: Page, label: string) {
  await expect(page.locator('.layer-row.active .layer-row-select')).toContainText(label);
}

test.describe('editor groups', () => {
  test('groups and ungroups sibling nodes through the real toolbar and keyboard flows', async ({ page }) => {
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

  test('selects groups, drills into nested descendants with single clicks, and escapes back out', async ({ page }) => {
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

    await openLayersTab(page);
    await clickLayerRow(page, 'Outer Group');
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
    expect(stageDebug.hasShapeHandles).toBe(false);
  });

  test('drills into grouped text without leaving browser text selection or stealing toolbar focus', async ({ page }) => {
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

    await openLayersTab(page);
    await clickLayerRow(page, 'Text Drill Group');
    await clickCanvas(page, { x: 340, y: 245 });

    await assertNoDocumentTextSelection(page);
    await assertFocusNotInToolbarOrInputs(page);
    await openPropertiesTab(page);
    await expect(page.getByLabel('Text content')).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Group Opacity' })).toHaveCount(0);

    const stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);
    expect(stageDebug.hasLineHandles).toBe(false);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(1);
  });
});
