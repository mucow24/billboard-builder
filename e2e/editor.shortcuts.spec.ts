import { expect, test } from '@playwright/test';

import {
  APP_CLIPBOARD_MIME_TYPE,
  clickCanvas,
  clickLayerRow,
  clickToolbarPopoverItem,
  copySelectionToClipboardPayload,
  createGroupNodeFixture,
  createGroupedProjectDocument,
  createLineFixture,
  createProjectDocument,
  createRectangleFixture,
  cutSelectionToClipboardPayload,
  dragCanvas,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  pasteClipboardPayloadOnActiveElement,
  pasteClipboardPayloadWithImageFile,
  pasteClipboardPayload,
  pasteImageClipboardFile,
  saveAndReadProject,
  uploadProject,
} from './support/editor';

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

interface SavedNode {
  id: string;
  kind: string;
  x?: number;
  y?: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  children?: SavedNode[];
}

function expectSavedGroup(project: Record<string, unknown>, nodeId: string): SavedNode {
  const nodes = project.nodes as SavedNode[];
  const group = nodes.find((node) => node.id === nodeId);
  if (!group || group.kind !== 'group') {
    throw new Error(`Expected grouped project to include group ${nodeId}.`);
  }
  return group;
}

test.describe('editor shortcuts', () => {
  test('KB-01 switches tools through real browser keyboard input', async ({ page }) => {
    await openFreshEditor(page);

    await page.keyboard.press('H');
    await expect(page.getByRole('button', { name: 'Hand (H)' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Z');
    await expect(page.getByRole('button', { name: 'Zoom (Z)' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('T');
    await expect(page.getByRole('button', { name: 'Text (T)' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('R');
    await expect(page.getByRole('button', { name: 'Rect (R)' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('O');
    await expect(page.getByRole('button', { name: 'Ellipse (O)' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('L');
    await expect(page.getByRole('button', { name: 'Line (L)' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('V');
    await expect(page.getByRole('button', { name: 'Select (V)' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('nudges, duplicates, deletes, undoes, and redoes against the real document state', async ({ page }) => {
    const rectangle = createRectangleFixture({
      id: 'nudge-shape',
      x: 180,
      y: 180,
      width: 200,
      height: 120,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rectangle]));

    await clickCanvas(page, { x: 280, y: 240 });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');

    const nudgedProject = await saveAndReadProject(page);

    const nudgedItem = (nudgedProject.nodes as Array<Record<string, number | string>>)[0];
    expect(Number(nudgedItem.x)).toBe(181);
    expect(Number(nudgedItem.y)).toBe(185);

    await page.keyboard.press(`${modifier}+D`);
    await openLayersTab(page);
    await expect(page.locator('.layer-row-select')).toHaveCount(2);

    await page.keyboard.press('Delete');
    await expect(page.locator('.layer-row-select')).toHaveCount(1);

    await page.keyboard.press(`${modifier}+Z`);
    await expect(page.locator('.layer-row-select')).toHaveCount(2);

    await page.keyboard.press(`${modifier}+Shift+Z`);
    await expect(page.locator('.layer-row-select')).toHaveCount(1);
  });

  test('selects all and clears selection through keyboard commands', async ({ page }) => {
    const first = createRectangleFixture({
      id: 'first',
      x: 100,
      y: 100,
      width: 80,
      height: 40,
      zIndex: 0,
    });
    const second = createRectangleFixture({
      id: 'second',
      x: 260,
      y: 220,
      width: 90,
      height: 60,
      fill: '#0ea5e9',
      stroke: '#0369a1ff',
      zIndex: 1,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([first, second]));
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur?.();
    });

    await page.keyboard.press(`${modifier}+A`);
    await expect(page.getByTestId('canvas-group-rotater')).toBeAttached();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('canvas-group-rotater')).toHaveCount(0);

    await dragCanvas(page, { x: 80, y: 80 }, { x: 380, y: 320 });
    await expect(page.getByTestId('canvas-group-rotater')).toBeAttached();
  });

  test('nudges, duplicates, deletes, undoes, and redoes grouped nodes as whole subtrees', async ({
    page,
  }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'shortcut-group-rect',
            x: 180,
            y: 180,
            width: 180,
            height: 120,
            zIndex: 0,
          }),
          createLineFixture({
            id: 'shortcut-group-line',
            x: 220,
            y: 260,
            startX: 220,
            startY: 260,
            endX: 430,
            endY: 318,
            width: 210,
            height: 58,
            zIndex: 1,
          }),
        ],
        {
          id: 'shortcut-group',
          name: 'Shortcut Group',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'shortcut-group.json');

    await openLayersTab(page);
    await clickLayerRow(page, 'Shortcut Group');

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');

    const nudgedProject = await saveAndReadProject(page);
    const nudgedGroup = expectSavedGroup(nudgedProject, 'shortcut-group');
    expect(nudgedGroup.children).toEqual([
      expect.objectContaining({
        id: 'shortcut-group-rect',
        x: 181,
        y: 185,
      }),
      expect.objectContaining({
        id: 'shortcut-group-line',
        startX: 221,
        startY: 265,
        endX: 431,
        endY: 323,
      }),
    ]);

    await page.keyboard.press(`${modifier}+D`);
    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Shortcut Group', exact: true })).toHaveCount(2);

    const duplicatedProject = await saveAndReadProject(page);
    const duplicatedGroups = (duplicatedProject.nodes as SavedNode[]).filter(
      (node) => node.kind === 'group',
    );
    expect(duplicatedGroups).toHaveLength(2);
    expect(duplicatedGroups[0].id).toBe('shortcut-group');
    expect(duplicatedGroups[1].id).not.toBe('shortcut-group');
    expect(duplicatedGroups[1].children).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        x: 205,
        y: 209,
      }),
      expect.objectContaining({
        id: expect.any(String),
        startX: 245,
        startY: 289,
        endX: 455,
        endY: 347,
      }),
    ]);

    await page.keyboard.press('Delete');
    await expect(page.getByRole('button', { name: 'Shortcut Group', exact: true })).toHaveCount(1);

    await page.keyboard.press(`${modifier}+Z`);
    await expect(page.getByRole('button', { name: 'Shortcut Group', exact: true })).toHaveCount(2);

    await page.keyboard.press(`${modifier}+Shift+Z`);
    await expect(page.getByRole('button', { name: 'Shortcut Group', exact: true })).toHaveCount(1);
  });

  test('reorders selected groups as units and surfaces grouped multi-selection in properties', async ({
    page,
  }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'reorder-group-rect',
            x: 140,
            y: 180,
            width: 180,
            height: 120,
            zIndex: 0,
          }),
        ],
        {
          id: 'reorder-group',
          name: 'Reorder Group',
        },
      ),
      createRectangleFixture({
        id: 'reorder-sibling',
        name: 'Reorder Sibling',
        x: 520,
        y: 220,
        width: 180,
        height: 120,
        fill: '#0ea5e9',
        stroke: '#0369a1ff',
        zIndex: 1,
      }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'reorder-group.json');

    await openLayersTab(page);
    await clickLayerRow(page, 'Reorder Group');
    await page.keyboard.press(`${modifier}+ArrowUp`);

    let reorderedProject = await saveAndReadProject(page);
    expect((reorderedProject.nodes as SavedNode[]).map((node) => node.id)).toEqual([
      'reorder-sibling',
      'reorder-group',
    ]);

    await page.keyboard.press(`${modifier}+ArrowDown`);
    reorderedProject = await saveAndReadProject(page);
    expect((reorderedProject.nodes as SavedNode[]).map((node) => node.id)).toEqual([
      'reorder-group',
      'reorder-sibling',
    ]);

    await page.keyboard.press(`Shift+${modifier}+ArrowUp`);
    reorderedProject = await saveAndReadProject(page);
    expect((reorderedProject.nodes as SavedNode[]).map((node) => node.id)).toEqual([
      'reorder-sibling',
      'reorder-group',
    ]);

    await page.keyboard.press(`Shift+${modifier}+ArrowDown`);
    reorderedProject = await saveAndReadProject(page);
    expect((reorderedProject.nodes as SavedNode[]).map((node) => node.id)).toEqual([
      'reorder-group',
      'reorder-sibling',
    ]);

    await page.keyboard.press(`${modifier}+A`);
    await openLayersTab(page);
    await expect(page.locator('.layer-row.active')).toHaveCount(2);
    await expect(page.locator('.layer-row.active').filter({ hasText: 'Reorder Group' })).toHaveCount(1);
    await expect(page.locator('.layer-row.active').filter({ hasText: 'Reorder Group' })).toContainText('Reorder Group');
    await expect(page.locator('.layer-row.active').filter({ hasText: 'Rectangle' })).toContainText('Rectangle');
    await openPropertiesTab(page);
    await expect(page.getByRole('heading', { name: '2 items selected' })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Opacity' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Group Opacity' })).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('canvas-group-rotater')).toHaveCount(0);
  });

  test('copies, cuts, and pastes grouped subtrees through browser clipboard events', async ({
    page,
  }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'clipboard-group-rect',
            x: 180,
            y: 180,
            width: 180,
            height: 120,
            zIndex: 0,
          }),
          createRectangleFixture({
            id: 'clipboard-group-rect-2',
            x: 400,
            y: 240,
            width: 160,
            height: 96,
            fill: '#22c55e',
            stroke: '#15803dff',
            zIndex: 1,
          }),
        ],
        {
          id: 'clipboard-group',
          name: 'Clipboard Group',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'clipboard-group.json');

    await openLayersTab(page);
    await clickLayerRow(page, 'Clipboard Group');

    const copied = await copySelectionToClipboardPayload(page);
    expect(copied.defaultPrevented).toBe(true);
    expect(copied.payload[APP_CLIPBOARD_MIME_TYPE]).toContain('"version":2');

    const pasted = await pasteClipboardPayload(page, copied.payload);
    expect(pasted.defaultPrevented).toBe(true);
    await expect(page.getByRole('button', { name: 'Clipboard Group', exact: true })).toHaveCount(2);

    let clipboardProject = await saveAndReadProject(page);
    let groupedNodes = (clipboardProject.nodes as SavedNode[]).filter((node) => node.kind === 'group');
    expect(groupedNodes).toHaveLength(2);
    expect(groupedNodes[1].id).not.toBe('clipboard-group');

    const cut = await cutSelectionToClipboardPayload(page);
    expect(cut.defaultPrevented).toBe(true);
    expect(cut.payload[APP_CLIPBOARD_MIME_TYPE]).toContain('"version":2');
    await expect(page.getByRole('button', { name: 'Clipboard Group', exact: true })).toHaveCount(1);

    const rePasted = await pasteClipboardPayload(page, cut.payload);
    expect(rePasted.defaultPrevented).toBe(true);
    await expect(page.getByRole('button', { name: 'Clipboard Group', exact: true })).toHaveCount(2);

    clipboardProject = await saveAndReadProject(page);
    groupedNodes = (clipboardProject.nodes as SavedNode[]).filter((node) => node.kind === 'group');
    expect(groupedNodes).toHaveLength(2);
  });

  test('ignores invalid group and ungroup shortcuts for ineligible selections', async ({ page }) => {
    const rectangle = createRectangleFixture({
      id: 'shortcut-noop-rect',
      name: 'Shortcut Noop Rectangle',
      x: 180,
      y: 180,
      width: 200,
      height: 120,
      zIndex: 0,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rectangle]), 'shortcut-noop.json');

    await clickCanvas(page, { x: 280, y: 240 });
    await page.keyboard.press(`${modifier}+G`);
    await page.keyboard.press(`Shift+${modifier}+G`);

    const savedProject = await saveAndReadProject(page);

    expect(savedProject.version).toBe(2);
    expect(savedProject.nodes).toEqual([
      expect.objectContaining({
        id: 'shortcut-noop-rect',
        kind: 'rectangle',
      }),
    ]);
  });

  test('CB-06 CB-07 CB-08 prioritizes app clipboard payloads, pastes images, and ignores clipboard events from editable targets', async ({
    page,
  }) => {
    const rectangle = createRectangleFixture({
      id: 'clipboard-priority-rect',
      name: 'Clipboard Priority Rectangle',
      x: 180,
      y: 180,
      width: 200,
      height: 120,
      zIndex: 0,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rectangle]), 'clipboard-priority.json');

    await clickCanvas(page, { x: 280, y: 240 });
    const copied = await copySelectionToClipboardPayload(page);
    const prioritizedPaste = await pasteClipboardPayloadWithImageFile(page, copied.payload);
    expect(prioritizedPaste.defaultPrevented).toBe(true);

    let savedProject = await saveAndReadProject(page);
    expect((savedProject.nodes as SavedNode[])).toHaveLength(2);
    expect((savedProject.nodes as SavedNode[]).every((node) => node.kind === 'rectangle')).toBe(true);

    await clickToolbarPopoverItem(page, 'Canvas', 'Reset');
    const pastedImage = await pasteImageClipboardFile(page);
    expect(pastedImage.defaultPrevented).toBe(true);
    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Image', exact: true })).toBeVisible();

    savedProject = await saveAndReadProject(page);
    expect(savedProject.nodes).toEqual([expect.objectContaining({ kind: 'image' })]);

    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'clipboard-editable-target';
      document.body.appendChild(input);
      input.focus();
    });
    const ignoredPaste = await pasteClipboardPayloadOnActiveElement(page, copied.payload);
    expect(ignoredPaste.defaultPrevented).toBe(false);

    await clickToolbarPopoverItem(page, 'Canvas', 'Reset');
    await openLayersTab(page);
    await expect(page.locator('.layer-row-select')).toHaveCount(0);
  });
});
