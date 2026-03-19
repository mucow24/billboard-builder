import { expect, test } from '@playwright/test';

import {
  clickLayerRow,
  clickCanvas,
  createGroupNodeFixture,
  createGroupedProjectDocument,
  createRectangleFixture,
  createTextFixture,
  doubleClickLayerRow,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  saveAndReadProject,
  setCanvasTestHooksEnabled,
  uploadProject,
} from './support/editor';

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('editor group layers and inspector flows', () => {
  test('shows grouped hierarchy, toggles collapse, opens properties from layers, and persists group opacity edits', async ({
    page,
  }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'layers-rect',
            name: 'Layer Rectangle',
            x: 160,
            y: 180,
            width: 220,
            height: 120,
            zIndex: 0,
          }),
          createTextFixture({
            id: 'layers-text',
            name: 'Layer Text',
            x: 220,
            y: 220,
            width: 240,
            height: 72,
            text: 'Layer group text',
            zIndex: 1,
          }),
        ],
        {
          id: 'layers-group',
          name: 'Layer Group',
          opacity: 0.68,
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'layers-group.json');

    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Layer Group', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Text', exact: true })).toBeVisible();

    const chevron = page.getByRole('button', { name: 'Collapse Layer Group' });
    await chevron.click();
    await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Text', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Expand Layer Group' }).click();
    await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Text', exact: true })).toBeVisible();

    // Double-clicking from Layers should move the user into Properties for the
    // selected group without reaching into store internals.
    await doubleClickLayerRow(page, 'Layer Group');
    await expect(page.getByRole('slider', { name: 'Group Opacity' })).toBeVisible();
    const opacityInput = page.getByRole('spinbutton', { name: 'Group Opacity value' });
    await expect(opacityInput).toHaveValue('0.68');

    await opacityInput.fill('0.55');
    await expect(opacityInput).toHaveValue('0.55');

    const savedProject = await saveAndReadProject(page);
    expect(savedProject.nodes).toEqual([
      expect.objectContaining({
        id: 'layers-group',
        kind: 'group',
        opacity: 0.55,
      }),
    ]);

    await page.getByRole('button', { name: 'New' }).click();
    await uploadProject(page, savedProject, 'layers-group-roundtrip.json');
    await openLayersTab(page);
    await clickLayerRow(page, 'Layer Group');
    await openPropertiesTab(page);
    await expect(page.getByRole('spinbutton', { name: 'Group Opacity value' })).toHaveValue('0.55');
  });

  test('switches between child editing and multi-selection inspector state for grouped documents', async ({
    page,
  }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'inspector-rect',
            name: 'Inspector Rectangle',
            x: 140,
            y: 180,
            width: 220,
            height: 132,
            zIndex: 0,
          }),
          createTextFixture({
            id: 'inspector-text',
            name: 'Inspector Text',
            x: 200,
            y: 218,
            width: 280,
            height: 84,
            text: 'Inspector text child',
            zIndex: 1,
          }),
        ],
        {
          id: 'inspector-group',
          name: 'Inspector Group',
        },
      ),
      createRectangleFixture({
        id: 'top-level-rect',
        name: 'Top Level Rectangle',
        x: 580,
        y: 180,
        width: 180,
        height: 120,
        fill: '#0ea5e9',
        stroke: '#0369a1ff',
        zIndex: 2,
      }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'inspector-group.json');

    await openLayersTab(page);
    await clickLayerRow(page, 'Text');
    await openPropertiesTab(page);
    await expect(page.getByLabel('Text content')).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Group Opacity' })).toHaveCount(0);

    // Selecting all on a grouped document should switch the Properties panel
    // to multi-selection UI rather than the single-group controls.
    await page.keyboard.press(`${modifier}+A`);
    await openPropertiesTab(page);
    await expect(page.getByRole('heading', { name: '3 items selected' })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Opacity' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Group Opacity' })).toHaveCount(0);
  });

  test('deletes a grouped subtree from the layers tab', async ({ page }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'delete-group-rect',
            x: 180,
            y: 200,
            width: 200,
            height: 120,
            zIndex: 0,
          }),
        ],
        {
          id: 'delete-group',
          name: 'Delete Group',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'delete-group.json');

    await openLayersTab(page);
    await page.getByRole('button', { name: 'Delete Delete Group' }).click({ force: true });
    await expect(page.locator('.layer-row-select')).toHaveCount(0);

    const savedProject = await saveAndReadProject(page);
    expect(savedProject.nodes).toEqual([]);
  });

  test('reorders groups from the layers footer controls as whole top-level nodes', async ({
    page,
  }) => {
    const groupedDocument = createGroupedProjectDocument([
      createRectangleFixture({
        id: 'layers-order-first',
        name: 'Layers Order First',
        x: 100,
        y: 160,
        width: 140,
        height: 90,
        zIndex: 0,
      }),
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'layers-order-group-child',
            x: 300,
            y: 180,
            width: 180,
            height: 120,
            zIndex: 1,
          }),
        ],
        {
          id: 'layers-order-group',
          name: 'Layers Order Group',
        },
      ),
      createRectangleFixture({
        id: 'layers-order-last',
        name: 'Layers Order Last',
        x: 620,
        y: 180,
        width: 160,
        height: 110,
        fill: '#0ea5e9',
        stroke: '#0369a1ff',
        zIndex: 2,
      }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'layers-order-group.json');

    await openLayersTab(page);
    await clickLayerRow(page, 'Layers Order Group');

    await page.getByRole('button', { name: 'Forward' }).click();
    let savedProject = await saveAndReadProject(page);
    expect((savedProject.nodes as Array<{ id: string }>).map((node) => node.id)).toEqual([
      'layers-order-first',
      'layers-order-last',
      'layers-order-group',
    ]);

    await page.getByRole('button', { name: 'Backward' }).click();
    savedProject = await saveAndReadProject(page);
    expect((savedProject.nodes as Array<{ id: string }>).map((node) => node.id)).toEqual([
      'layers-order-first',
      'layers-order-group',
      'layers-order-last',
    ]);

    await page.getByRole('button', { name: 'Bring front' }).click();
    savedProject = await saveAndReadProject(page);
    expect((savedProject.nodes as Array<{ id: string }>).map((node) => node.id)).toEqual([
      'layers-order-first',
      'layers-order-last',
      'layers-order-group',
    ]);

    await page.getByRole('button', { name: 'Send back' }).click();
    savedProject = await saveAndReadProject(page);
    expect((savedProject.nodes as Array<{ id: string }>).map((node) => node.id)).toEqual([
      'layers-order-group',
      'layers-order-first',
      'layers-order-last',
    ]);
  });

  test('keeps group actions disabled for mixed-parent selections built through real browser interaction', async ({
    page,
  }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createTextFixture({
            id: 'mixed-parent-text',
            name: 'Mixed Parent Text',
            x: 180,
            y: 200,
            width: 240,
            height: 80,
            text: 'Child inside group',
            zIndex: 0,
          }),
        ],
        {
          id: 'mixed-parent-group',
          name: 'Mixed Parent Group',
        },
      ),
      createRectangleFixture({
        id: 'mixed-parent-top-level',
        name: 'Mixed Parent Top Level',
        x: 620,
        y: 220,
        width: 180,
        height: 120,
        fill: '#0ea5e9',
        stroke: '#0369a1ff',
        zIndex: 1,
      }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'mixed-parent-group.json');
    await setCanvasTestHooksEnabled(page, false);

    await openLayersTab(page);
    await clickLayerRow(page, 'Text');

    // Build a mixed-parent selection through the visible browser path: one
    // child leaf from inside the group plus one top-level sibling.
    await page.keyboard.down('Shift');
    await clickCanvas(page, { x: 710, y: 280 });
    await page.keyboard.up('Shift');

    await openPropertiesTab(page);
    await expect(page.getByRole('heading', { name: '2 items selected' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Group', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Ungroup', exact: true })).toBeDisabled();
  });
});
