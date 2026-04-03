import { expect, test } from '@playwright/test';

import {
  clickLayerRow,
  clickCanvas,
  clickToolbarPopoverItem,
  createGroupNodeFixture,
  createGroupedProjectDocument,
  createImageFixture,
  createLayersPanelMockParityFixture,
  createRectangleFixture,
  createTextFixture,
  doubleClickLayerRow,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  saveAndReadProject,
  setCanvasTestHooksEnabled,
  uploadProject,
  dragLayerGrip,
} from './support/editor';

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('editor group layers and inspector flows', () => {
  test('renders top-level layers from front to back in the Layers tab', async ({ page }) => {
    const document = createGroupedProjectDocument([
      createGroupNodeFixture([], {
        id: 'layers-order-back',
        name: 'Back Layer',
      }),
      createGroupNodeFixture([], {
        id: 'layers-order-middle',
        name: 'Middle Layer',
      }),
      createGroupNodeFixture([], {
        id: 'layers-order-front',
        name: 'Front Layer',
      }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, document, 'layers-front-to-back.json');

    await openLayersTab(page);
    await expect(page.locator('.layer-row-label')).toHaveText([
      'Front Layer',
      'Middle Layer',
      'Back Layer',
    ]);
  });

  test('selects a top-level item from Layers and surfaces its Properties state', async ({ page }) => {
    const document = createGroupedProjectDocument([
      createRectangleFixture({
        id: 'layers-top-level-rect',
        x: 180,
        y: 180,
        width: 200,
        height: 120,
        zIndex: 0,
      }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, document, 'layers-top-level.json');

    await openLayersTab(page);
    await clickLayerRow(page, 'Rectangle');
    await expect(page.locator('.layer-row.active').filter({ hasText: 'Rectangle' })).toHaveCount(1);
    await openPropertiesTab(page);
    await expect(page.getByRole('heading', { name: 'Rectangle' })).toBeVisible();
  });

  test('shows an image thumbnail preview for image rows in Layers', async ({ page }) => {
    const document = createGroupedProjectDocument([
      createImageFixture({
        id: 'layers-image-preview',
        zIndex: 0,
      }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, document, 'layers-image-preview.json');

    await openLayersTab(page);
    const thumbnail = page.getByTestId('layers-thumbnail-layers-image-preview');

    await expect(page.getByRole('button', { name: 'Image', exact: true })).toBeVisible();
    await expect(thumbnail).toBeVisible();
    await expect(thumbnail).toHaveAttribute('src', /^data:image\/svg\+xml;base64,/);
  });

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

    await clickToolbarPopoverItem(page, 'Canvas', 'Reset');
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
    await expect(
      page.locator('.layer-row.contains-selection').filter({ hasText: 'Inspector Group' }),
    ).toHaveCount(1);
    await openPropertiesTab(page);
    await expect(page.getByLabel('Text content')).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Group Opacity' })).toHaveCount(0);

    // Selecting all on a grouped document should switch the Properties panel
    // to multi-selection UI rather than the single-group controls.
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur?.();
    });
    await page.keyboard.press(`${modifier}+A`);
    await openPropertiesTab(page);
    await expect(page.locator('h2').filter({ hasText: /items selected/ })).toBeVisible();
    await expect(page.getByLabel('Fill', { exact: true })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Group Opacity' })).toHaveCount(0);
  });

  test('updates the canvas background from Layers and persists the new value', async ({ page }) => {
    await openFreshEditor(page);
    await openLayersTab(page);

    await expect(page.locator('.color-picker-trigger-compact')).toHaveCount(1);
    await page.getByRole('button', { name: 'Canvas background' }).click();
    await page.getByLabel('Canvas background hex').fill('#11223344');
    await page.getByLabel('Canvas background hex').press('Enter');

    const savedProject = await saveAndReadProject(page);
    expect(savedProject.background).toBe('#11223344');
  });

  test('surfaces the compact Layers background trigger in the utility controls for the mock parity fixture', async ({
    page,
  }) => {
    await openFreshEditor(page);
    await uploadProject(page, createLayersPanelMockParityFixture(), 'layers-panel-mock-parity.json');

    await openLayersTab(page);
    await expect(page.locator('.layers-panel-utilities .color-picker-trigger-compact')).toHaveCount(
      1,
    );
    await page.getByRole('button', { name: 'Canvas background' }).click();
    await expect(page.getByLabel('Canvas background hex')).toBeVisible();
  });

  test('shows immediate child counts for nested groups', async ({ page }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createGroupNodeFixture(
            [
              createRectangleFixture({
                id: 'nested-group-rect',
                x: 220,
                y: 220,
                width: 180,
                height: 120,
                zIndex: 0,
              }),
            ],
            {
              id: 'nested-group',
              name: 'Nested Group',
            },
          ),
          createTextFixture({
            id: 'outer-text',
            x: 460,
            y: 240,
            width: 220,
            height: 72,
            text: 'Outer sibling text',
            zIndex: 1,
          }),
        ],
        {
          id: 'outer-group',
          name: 'Outer Group',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'layers-immediate-child-counts.json');

    await openLayersTab(page);
    await expect(page.locator('.layer-row').filter({ hasText: 'Outer Group' })).toContainText(
      '2 items',
    );
    await expect(page.locator('.layer-row').filter({ hasText: 'Nested Group' })).toContainText(
      '1 item',
    );
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
    const groupRow = page.locator('.layer-row').filter({ hasText: 'Delete Group' });
    await groupRow.hover();
    await groupRow.getByRole('button', { name: 'Delete layer' }).click();
    await expect(page.locator('.layer-row')).toHaveCount(0);

    const savedProject = await saveAndReadProject(page);
    expect(savedProject.nodes).toEqual([]);
  });

  test('deleting a grouped child from Layers collapses the singleton parent group', async ({ page }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'collapse-first-rect',
            x: 180,
            y: 200,
            width: 200,
            height: 120,
            zIndex: 0,
          }),
          createRectangleFixture({
            id: 'collapse-second-rect',
            x: 430,
            y: 210,
            width: 180,
            height: 110,
            fill: '#0ea5e9',
            stroke: '#0369a1ff',
            zIndex: 1,
          }),
        ],
        {
          id: 'collapse-group',
          name: 'Collapse Group',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'collapse-singleton-group.json');

    await openLayersTab(page);
    const targetRow = page.getByTestId('layers-row-collapse-first-rect');
    await targetRow.hover();
    await targetRow.getByRole('button', { name: 'Delete layer' }).click();

    await expect(page.getByTestId('layers-row-collapse-first-rect')).toHaveCount(0);
    await expect(page.getByTestId('layers-row-collapse-group')).toHaveCount(0);
    await expect(page.getByTestId('layers-row-collapse-second-rect')).toHaveCount(1);
    await expect(page.getByTestId('layers-row-collapse-second-rect')).toHaveAttribute('data-depth', '0');

    const savedProject = await saveAndReadProject(page);
    expect(savedProject.nodes).toEqual([
      expect.objectContaining({
        id: 'collapse-second-rect',
        kind: 'rectangle',
      }),
    ]);
  });

  test('deletes a single layer via its inline delete button', async ({ page }) => {
    const document = createGroupedProjectDocument([
      createRectangleFixture({
        id: 'keep-rect',
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        zIndex: 0,
      }),
      createTextFixture({
        id: 'delete-text',
        x: 300,
        y: 100,
        width: 200,
        height: 50,
        zIndex: 1,
      }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, document, 'inline-delete.json');
    await openLayersTab(page);

    await expect(page.locator('.layer-row')).toHaveCount(2);

    const targetRow = page.locator('.layer-row').filter({ hasText: 'Text' });
    await targetRow.hover();
    await targetRow.getByRole('button', { name: 'Delete layer' }).click();

    await expect(page.locator('.layer-row')).toHaveCount(1);
    await expect(page.locator('.layer-row')).toContainText('Rectangle');

    const savedProject = await saveAndReadProject(page);
    expect(savedProject.nodes).toHaveLength(1);
    expect(savedProject.nodes[0].id).toBe('keep-rect');
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

    await page.getByRole('button', { name: 'Move up' }).click();
    let savedProject = await saveAndReadProject(page);
    expect((savedProject.nodes as Array<{ id: string }>).map((node) => node.id)).toEqual([
      'layers-order-first',
      'layers-order-last',
      'layers-order-group',
    ]);

    await page.getByRole('button', { name: 'Move down' }).click();
    savedProject = await saveAndReadProject(page);
    expect((savedProject.nodes as Array<{ id: string }>).map((node) => node.id)).toEqual([
      'layers-order-first',
      'layers-order-group',
      'layers-order-last',
    ]);

    await page.getByRole('button', { name: 'Move to top' }).click();
    savedProject = await saveAndReadProject(page);
    expect((savedProject.nodes as Array<{ id: string }>).map((node) => node.id)).toEqual([
      'layers-order-first',
      'layers-order-last',
      'layers-order-group',
    ]);

    await page.getByRole('button', { name: 'Move to bottom' }).click();
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
    await expect(page.getByRole('button', { name: /^Group/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Ungroup/ })).toBeDisabled();
  });

  test('renames a group from the layers panel and persists the new name', async ({ page }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'rename-rect',
            x: 180,
            y: 200,
            width: 200,
            height: 120,
            zIndex: 0,
          }),
        ],
        {
          id: 'rename-group',
          name: 'Original Name',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'rename-group.json');

    await openLayersTab(page);
    const groupRow = page.locator('.layer-row').filter({ hasText: 'Original Name' });
    await groupRow.hover();
    await groupRow.getByRole('button', { name: 'Rename group' }).click();

    const input = page.locator('.layer-rename-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('Original Name');

    await input.fill('Renamed Group');
    await input.press('Enter');

    await expect(page.locator('.layer-row-label').filter({ hasText: 'Renamed Group' })).toBeVisible();

    const savedProject = await saveAndReadProject(page);
    expect(savedProject.nodes).toEqual([
      expect.objectContaining({
        id: 'rename-group',
        name: 'Renamed Group',
      }),
    ]);
  });

  test('cancels group rename on Escape without changing the name', async ({ page }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'cancel-rename-rect',
            x: 180,
            y: 200,
            width: 200,
            height: 120,
            zIndex: 0,
          }),
        ],
        {
          id: 'cancel-rename-group',
          name: 'Keep This Name',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'cancel-rename-group.json');

    await openLayersTab(page);
    const groupRow = page.locator('.layer-row').filter({ hasText: 'Keep This Name' });
    await groupRow.hover();
    await groupRow.getByRole('button', { name: 'Rename group' }).click();

    const input = page.locator('.layer-rename-input');
    await input.fill('Something Else');
    await input.press('Escape');

    await expect(page.locator('.layer-rename-input')).toHaveCount(0);
    await expect(page.locator('.layer-row-label').filter({ hasText: 'Keep This Name' })).toBeVisible();

    const savedProject = await saveAndReadProject(page);
    expect(savedProject.nodes).toEqual([
      expect.objectContaining({
        id: 'cancel-rename-group',
        name: 'Keep This Name',
      }),
    ]);
  });

  test('reorders flat siblings via grip drag', async ({ page }) => {
    // Data order is back-to-front: [A=back, B=middle, C=front]
    // Visual order is front-to-back: [C, B, A]
    const document = createGroupedProjectDocument([
      createRectangleFixture({ id: 'drag-a', name: 'Alpha', x: 100, y: 100, width: 80, height: 80, zIndex: 0 }),
      createRectangleFixture({ id: 'drag-b', name: 'Beta', x: 200, y: 100, width: 80, height: 80, zIndex: 1 }),
      createRectangleFixture({ id: 'drag-c', name: 'Charlie', x: 300, y: 100, width: 80, height: 80, zIndex: 2 }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, document, 'drag-reorder-flat.json');
    await openLayersTab(page);

    // Visual order before: C (front), B, A (back)
    await expect(page.getByTestId('layers-row-drag-c')).toBeVisible();
    await expect(page.getByTestId('layers-row-drag-b')).toBeVisible();
    await expect(page.getByTestId('layers-row-drag-a')).toBeVisible();

    // Drag Charlie grip down past Beta (to second position)
    const betaGrip = page.getByRole('button', { name: 'Reorder Beta' });
    const betaBox = await betaGrip.boundingBox();
    await dragLayerGrip(page, 'Reorder Charlie', betaBox!.y + betaBox!.height + 2);

    // Verify persistence: data order should be [A, C, B] (C moved between A and B)
    const savedProject = await saveAndReadProject(page);
    expect((savedProject.nodes as Array<{ id: string }>).map((n) => n.id)).toEqual([
      'drag-a', 'drag-c', 'drag-b',
    ]);
  });

  test('reorders children within an expanded group via grip drag', async ({ page }) => {
    const document = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({ id: 'child-a', name: 'Child A', x: 100, y: 100, width: 80, height: 80, zIndex: 0 }),
          createRectangleFixture({ id: 'child-b', name: 'Child B', x: 200, y: 100, width: 80, height: 80, zIndex: 1 }),
          createRectangleFixture({ id: 'child-c', name: 'Child C', x: 300, y: 100, width: 80, height: 80, zIndex: 2 }),
        ],
        { id: 'reorder-group', name: 'Reorder Group' },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, document, 'drag-reorder-group-children.json');
    await openLayersTab(page);

    await expect(page.getByTestId('layers-row-reorder-group')).toBeVisible();

    // Drag Child C (first child visually) down past Child B
    const childBGrip = page.getByRole('button', { name: 'Reorder Child B' });
    const childBBox = await childBGrip.boundingBox();
    await dragLayerGrip(page, 'Reorder Child C', childBBox!.y + childBBox!.height + 2);

    // Verify: child-c moved from data index 2 to data index 1
    const savedProject = await saveAndReadProject(page);
    const group = savedProject.nodes.find((n: { id: string }) => n.id === 'reorder-group') as {
      id: string;
      children: Array<{ id: string }>;
    };
    expect(group.children.map((c) => c.id)).toEqual(['child-a', 'child-c', 'child-b']);
  });

  test('drags an item into an expanded group', async ({ page }) => {
    const document = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({ id: 'inside-rect', name: 'Inside', x: 100, y: 100, width: 80, height: 80, zIndex: 0 }),
        ],
        { id: 'target-group', name: 'Target Group' },
      ),
      createRectangleFixture({ id: 'outside-rect', name: 'Outside', x: 300, y: 100, width: 80, height: 80, zIndex: 1 }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, document, 'drag-into-group.json');
    await openLayersTab(page);

    await expect(page.getByTestId('layers-row-outside-rect')).toBeVisible();
    await expect(page.getByTestId('layers-row-target-group')).toBeVisible();

    // Drag Outside down between "Target Group" header and "Inside",
    // with cursor positioned RIGHT of the group indent to signal "into group"
    const insideGrip = page.getByRole('button', { name: 'Reorder Inside' });
    const insideBox = await insideGrip.boundingBox();
    // Target Y: just above Inside row. Target X: indented right (inside the group)
    await dragLayerGrip(page, 'Reorder Outside', insideBox!.y - 2, insideBox!.x);

    // Outside should now be inside Target Group
    const savedProject = await saveAndReadProject(page);
    const group = savedProject.nodes.find((n: { id: string }) => n.id === 'target-group') as {
      id: string;
      children: Array<{ id: string }>;
    };
    expect(group.children.map((c) => c.id)).toContain('outside-rect');
    // The root should only have the group now
    expect(savedProject.nodes).toHaveLength(1);
  });

  test('drags an item out of a group to root level', async ({ page }) => {
    const document = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({ id: 'escape-rect', name: 'Escape', x: 100, y: 100, width: 80, height: 80, zIndex: 0 }),
          createRectangleFixture({ id: 'stay-rect', name: 'Stay', x: 200, y: 100, width: 80, height: 80, zIndex: 1 }),
        ],
        { id: 'source-group', name: 'Source Group' },
      ),
      createRectangleFixture({ id: 'bottom-rect', name: 'Bottom', x: 300, y: 100, width: 80, height: 80, zIndex: 2 }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, document, 'drag-out-of-group.json');
    await openLayersTab(page);

    await expect(page.getByTestId('layers-row-escape-rect')).toBeVisible();

    // Drag Escape to after Bottom at root level (cursor far left for shallow depth)
    const bottomGrip = page.getByRole('button', { name: 'Reorder Bottom' });
    const bottomBox = await bottomGrip.boundingBox();
    // Drop just above Bottom, cursor far left to indicate root level
    await dragLayerGrip(page, 'Reorder Escape', bottomBox!.y - 2, bottomBox!.x);

    // Escape should now be a root-level node above Bottom
    const savedProject = await saveAndReadProject(page);
    const rootIds = (savedProject.nodes as Array<{ id: string }>).map((n) => n.id);
    expect(rootIds).toContain('escape-rect');
    expect(rootIds).toContain('source-group');
    expect(rootIds).toContain('bottom-rect');
  });

  test('drags a flat item past an expanded group with children', async ({ page }) => {
    const document = createGroupedProjectDocument([
      createRectangleFixture({ id: 'top-rect', name: 'Top', x: 100, y: 100, width: 80, height: 80, zIndex: 0 }),
      createGroupNodeFixture(
        [
          createRectangleFixture({ id: 'g-child-a', name: 'GChild A', x: 200, y: 100, width: 80, height: 80, zIndex: 1 }),
          createRectangleFixture({ id: 'g-child-b', name: 'GChild B', x: 300, y: 100, width: 80, height: 80, zIndex: 2 }),
        ],
        { id: 'middle-group', name: 'Middle Group' },
      ),
      createRectangleFixture({ id: 'bot-rect', name: 'Bot', x: 400, y: 100, width: 80, height: 80, zIndex: 3 }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, document, 'drag-past-group.json');
    await openLayersTab(page);

    await expect(page.getByTestId('layers-row-bot-rect')).toBeVisible();
    await expect(page.getByTestId('layers-row-top-rect')).toBeVisible();

    // Drag Bot down past the entire group (past GChild A) to after Top at root level
    const topGrip = page.getByRole('button', { name: 'Reorder Top' });
    const topBox = await topGrip.boundingBox();
    // Drop below Top with cursor far left for root level (more steps for longer drag)
    await dragLayerGrip(page, 'Reorder Bot', topBox!.y + topBox!.height + 2, topBox!.x, 10);

    // Data order: [bot-rect, top-rect, middle-group(g-child-a, g-child-b)]
    const savedProject = await saveAndReadProject(page);
    const rootIds = (savedProject.nodes as Array<{ id: string }>).map((n) => n.id);
    // Bot moved behind Top — both at root level, group still between or before them
    expect(rootIds.indexOf('bot-rect')).toBeLessThan(rootIds.indexOf('top-rect'));
    // Group still exists as root node
    expect(rootIds).toContain('middle-group');
  });
});
