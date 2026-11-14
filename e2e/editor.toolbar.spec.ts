import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import {
  canvasPointsToPage,
  chooseCanvasPreset,
  clickEmptyCanvas,
  clickItem,
  clickToolbarPopoverItem,
  createGroupNodeFixture,
  createGroupedProjectDocument,
  createProjectDocument,
  createRectangleFixture,
  createTextFixture,
  dragEmptyCanvas,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  startProjectFileChooser,
  uploadProject,
} from './support/editor';

// The largest difference in any colour channel between two same-sized PNGs.
async function maxChannelDifference(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ([first, second]) => {
      const decode = async (base64: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${base64}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const [pixelsA, pixelsB] = await Promise.all([decode(first!), decode(second!)]);
      let max = 0;
      for (let i = 0; i < pixelsA.length; i++) {
        if (i % 4 === 3) continue;
        max = Math.max(max, Math.abs(pixelsA[i]! - pixelsB[i]!));
      }
      return max;
    },
    [a.toString('base64'), b.toString('base64')],
  );
}

test.describe('editor toolbar flows', () => {
  test('renders the top toolbar and opens and closes popovers from the real triggers', async ({ page }) => {
    await openFreshEditor(page);

    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Canvas', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Undo/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Redo/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Delete/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Group/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Ungroup/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save as favorite' })).toBeVisible();

    await page.getByRole('button', { name: 'Canvas', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Load', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revert', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible();

    await page.mouse.click(24, 220);
    await expect(page.getByRole('button', { name: 'Load', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Canvas', exact: true }).click();
    await page.getByRole('button', { name: 'Size', exact: true }).hover();
    await expect(page.getByLabel('Canvas width')).toBeVisible();
    await expect(page.getByLabel('Canvas height')).toBeVisible();
  });

  test('updates visible canvas dimensions from presets and clears preset selection after manual edits', async ({ page }) => {
    await openFreshEditor(page);

    await chooseCanvasPreset(page, '1024 x 1024');
    // Canvas menu and size flyout remain open after preset click
    await expect(page.getByLabel('Canvas width')).toHaveValue('1024');
    await expect(page.getByLabel('Canvas height')).toHaveValue('1024');

    await expect(page.getByRole('button', { name: '1024 x 1024', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await page.getByLabel('Canvas width').fill('640');
    await page.getByLabel('Canvas height').fill('480');

    await expect(page.getByRole('button', { name: '1024 x 1024', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByLabel('Canvas width')).toHaveValue('640');
    await expect(page.getByLabel('Canvas height')).toHaveValue('480');
  });

  test('shows the export-bounds cue over the items outside the canvas, never over the canvas or the selection', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'toolbar-export-off-canvas',
          x: -180,
          y: 180,
          width: 180,
          height: 400,
          fill: '#f97316',
          stroke: '#ea580cff',
        }),
      ]),
      'toolbar-export-cue.json',
    );

    const exportButton = page.getByRole('button', { name: 'Export', exact: true });
    const canvasButton = page.getByRole('button', { name: 'Canvas', exact: true });
    const stageRoot = page.getByTestId('canvas-stage-root');
    const [canvasCenter, offCanvasRectCenter, canvasLeftEdge, offCanvasHandle] = await canvasPointsToPage(page, [
      { x: 512, y: 512 },
      { x: -90, y: 380 },
      // On the canvas's left edge, which the rectangle touches, between its
      // resize handles there.
      { x: 0, y: 280 },
      // The rectangle's middle-left resize handle, outside the canvas.
      { x: -180, y: 380 },
    ]);
    // Either side of the edge, a few screen pixels clear of its antialiasing.
    const justInsideCanvas = { x: canvasLeftEdge.x + 4, y: canvasLeftEdge.y };
    const justOutsideCanvas = { x: canvasLeftEdge.x - 4, y: canvasLeftEdge.y };
    // A patch of the rendered page around a point. The small patches stay
    // clear of the canvas edge and inside the handle's opaque fill (radius 8
    // on screen).
    const patchAt = (point: { x: number; y: number }, half: number) =>
      page.screenshot({ clip: { x: point.x - half, y: point.y - half, width: half * 2, height: half * 2 } });
    // The veil fades over a few frames; wait for the picture to settle.
    const settledPatchAt = async (point: { x: number; y: number }, half = 8) => {
      let previous = await patchAt(point, half);
      for (;;) {
        await page.waitForTimeout(100);
        const next = await patchAt(point, half);
        if (next.equals(previous)) return next;
        previous = next;
      }
    };
    const capture = async () => ({
      canvasCenter: await settledPatchAt(canvasCenter),
      offCanvasRect: await settledPatchAt(offCanvasRectCenter),
      justInside: await settledPatchAt(justInsideCanvas, 1.5),
      justOutside: await settledPatchAt(justOutsideCanvas, 1.5),
      handle: await settledPatchAt(offCanvasHandle, 2),
    });

    await clickItem(page, 'toolbar-export-off-canvas');
    await expect(stageRoot).toHaveAttribute('data-export-bounds-cue', 'inactive');
    const withoutCue = await capture();

    await exportButton.hover();
    await expect(stageRoot).toHaveAttribute('data-export-bounds-cue', 'active');
    const withCue = await capture();

    // The veil blurs and darkens the items outside the canvas, stops at the
    // canvas's edge, and is drawn under the selection handles.
    // While the veil is up the canvas is drawn through it at the same
    // resolution, but into a multisampled texture rather than straight to
    // the screen, which can move an antialiased pixel by a level or three.
    // A handle is 95% opaque, so the veiled rectangle behind it shifts it a
    // little; a veil over the handle would darken it by most of its brightness.
    expect(await maxChannelDifference(page, withCue.offCanvasRect, withoutCue.offCanvasRect)).toBeGreaterThan(60);
    expect(await maxChannelDifference(page, withCue.justOutside, withoutCue.justOutside)).toBeGreaterThan(60);
    expect(await maxChannelDifference(page, withCue.justInside, withoutCue.justInside)).toBeLessThanOrEqual(4);
    expect(await maxChannelDifference(page, withCue.canvasCenter, withoutCue.canvasCenter)).toBeLessThanOrEqual(4);
    expect(await maxChannelDifference(page, withCue.handle, withoutCue.handle)).toBeLessThanOrEqual(16);

    await canvasButton.hover();
    await expect(stageRoot).toHaveAttribute('data-export-bounds-cue', 'inactive');

    await exportButton.focus();
    await expect(stageRoot).toHaveAttribute('data-export-bounds-cue', 'active');

    await canvasButton.focus();
    await expect(stageRoot).toHaveAttribute('data-export-bounds-cue', 'inactive');

    // Opening the export menu should keep the cue active so users see exactly
    // what the imminent click is going to capture.
    await exportButton.click();
    await expect(page.getByRole('button', { name: 'PNG', exact: true })).toBeVisible();
    await expect(stageRoot).toHaveAttribute('data-export-bounds-cue', 'active');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'PNG', exact: true })).toHaveCount(0);
  });

  test('keeps action icons visible and updates enabled states through real selection and history flows', async ({ page }) => {
    const first = createRectangleFixture({
      id: 'toolbar-first',
      x: 140,
      y: 140,
      width: 180,
      height: 120,
      zIndex: 0,
    });
    const second = createRectangleFixture({
      id: 'toolbar-second',
      x: 380,
      y: 220,
      width: 180,
      height: 120,
      fill: '#0ea5e9',
      stroke: '#0369a1ff',
      zIndex: 1,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([first, second]), 'toolbar-actions.json');

    await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Redo/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Delete/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Group/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Ungroup/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save as favorite' })).toBeDisabled();

    await clickItem(page, 'toolbar-first');
    await expect(page.getByRole('button', { name: /^Delete/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Save as favorite' })).toBeEnabled();
    await expect(page.getByRole('button', { name: /^Group/ })).toBeDisabled();

    await clickEmptyCanvas(page, { x: 50, y: 50 });
    await expect(page.getByRole('button', { name: /^Group/ })).toBeDisabled();

    await dragEmptyCanvas(page, { x: 100, y: 100 }, { x: 620, y: 420 });
    await expect(page.getByRole('button', { name: /^Group/ })).toBeEnabled();

    await page.getByRole('button', { name: /^Group/ }).click();
    await expect(page.getByRole('button', { name: /^Undo/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: /^Ungroup/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: /^Redo/ })).toBeDisabled();

    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect(page.getByRole('button', { name: /^Redo/ })).toBeEnabled();
  });

  test('starts load, image upload, and font upload from real toolbar menu items and filechooser events', async ({ page }) => {
    await openFreshEditor(page);

    const loadChooser = await startProjectFileChooser(page);
    await loadChooser.setFiles({
      name: 'toolbar-load.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify(
          createProjectDocument([
            createTextFixture({
              id: 'toolbar-loaded-text',
              name: 'Toolbar Loaded Text',
              x: 180,
              y: 180,
              width: 200,
              height: 80,
              text: 'Toolbar loaded text',
            }),
          ]),
        ),
        'utf8',
      ),
    });

    await openLayersTab(page);
    await expect(page.locator('.layer-row')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Text', exact: true })).toBeVisible();

    const [imageChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Add image', exact: true }).click(),
    ]);
    await imageChooser.setFiles({
      name: 'toolbar-image.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#22c55e"/></svg>',
        'utf8',
      ),
    });

    await openLayersTab(page);
    await expect(page.locator('.layer-row')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Image', exact: true })).toBeVisible();

    // Select the text item so the font picker is available
    await clickItem(page, 'toolbar-loaded-text');
    await openPropertiesTab(page);
    await page.getByTestId('font-family-picker-trigger').click();

    const [fontChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Import font…' }).click(),
    ]);
    await fontChooser.setFiles(path.join(process.cwd(), 'src/assets/fonts/CalSans-Regular.ttf'));

    // Re-open the font picker to verify the uploaded font appears
    await page.getByTestId('font-family-picker-trigger').click();
    await expect(page.getByRole('option', { name: 'Cal Sans' }).first()).toBeVisible();
  });

  test('enables ungroup after loading a real grouped document from the toolbar path', async ({ page }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'toolbar-group-child',
            x: 180,
            y: 180,
            width: 200,
            height: 120,
            zIndex: 0,
          }),
        ],
        {
          id: 'toolbar-group',
          name: 'Toolbar Group',
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'toolbar-grouped.json');

    await clickItem(page, 'toolbar-group-child');
    await expect(page.getByRole('button', { name: /^Ungroup/ })).toBeEnabled();

    await clickToolbarPopoverItem(page, 'Canvas', 'New');
    await expect(page.getByRole('button', { name: /^Ungroup/ })).toBeDisabled();
  });

  test('scrollbar covers full toolbar width at narrow viewports so inspector tabs are reachable', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await openFreshEditor(page);

    const favoritesTab = page.getByRole('tab', { name: 'Favorites' });
    await expect(favoritesTab).toBeAttached();

    const { scrollWidth, tabRightEdge } = await favoritesTab.evaluate((el) => ({
      scrollWidth: document.documentElement.scrollWidth,
      tabRightEdge: el.getBoundingClientRect().right + window.scrollX,
    }));

    expect(scrollWidth).toBeGreaterThanOrEqual(tabRightEdge);
  });

  test('toggles the canvas-focus overlay on and off via the toolbar button', async ({ page }) => {
    await openFreshEditor(page);

    const focusButton = page.getByRole('button', { name: /Canvas focus/ });
    const stageRoot = page.getByTestId('canvas-stage-root');

    await expect(focusButton).toBeVisible();
    await expect(focusButton).toHaveAttribute('aria-pressed', 'false');
    await expect(stageRoot).toHaveAttribute('data-export-bounds-cue', 'inactive');

    await focusButton.click();
    await expect(focusButton).toHaveAttribute('aria-pressed', 'true');
    await expect(stageRoot).toHaveAttribute('data-export-bounds-cue', 'active');

    await focusButton.click();
    await expect(focusButton).toHaveAttribute('aria-pressed', 'false');
    await expect(stageRoot).toHaveAttribute('data-export-bounds-cue', 'inactive');
  });

  test('keeps UI text unselectable while text fields stay selectable', async ({ page }) => {
    await openFreshEditor(page);
    const selectedText = () => page.evaluate(() => document.getSelection()?.toString() ?? '');

    // Drag across the Properties panel's empty-state text and double-click a word in it.
    const emptyState = page.locator('.empty-panel-inner');
    const box = await emptyState.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 4, box!.y + 4);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width - 4, box!.y + box!.height - 4, { steps: 8 });
    await page.mouse.up();
    expect(await selectedText()).toBe('');

    await emptyState.getByText('Nothing selected').dblclick();
    expect(await selectedText()).toBe('');

    // Double-clicking button text selects nothing either.
    await page.getByRole('button', { name: 'Canvas', exact: true }).dblclick();
    expect(await selectedText()).toBe('');
    await page.keyboard.press('Escape');

    // A text field still lets the mouse select inside it.
    await page.getByTestId('canvas-name-display').dblclick();
    const nameInput = page.getByTestId('canvas-name-input');
    await nameInput.fill('alpha beta');
    const inputBox = await nameInput.boundingBox();
    expect(inputBox).not.toBeNull();
    await page.mouse.click(inputBox!.x + inputBox!.width - 4, inputBox!.y + inputBox!.height / 2);
    await page.mouse.move(inputBox!.x + 6, inputBox!.y + inputBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(inputBox!.x + inputBox!.width - 4, inputBox!.y + inputBox!.height / 2, { steps: 8 });
    await page.mouse.up();
    const range = await nameInput.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]);
    expect(range[1]! - range[0]!).toBeGreaterThan(0);
  });
});
