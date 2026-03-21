import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  canvasPointToPage,
  chooseCanvasPreset,
  clickCanvas,
  clickToolbarPopoverItem,
  createGroupNodeFixture,
  createGroupedProjectDocument,
  createProjectDocument,
  createRectangleFixture,
  createTextFixture,
  dragCanvas,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  startToolbarFileChooser,
  uploadProject,
} from './support/editor';

test.describe('editor toolbar flows', () => {
  test('renders the top toolbar and opens and closes popovers from the real triggers', async ({ page }) => {
    await openFreshEditor(page);

    await expect(page.getByRole('button', { name: 'Export PNG' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Canvas', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Size', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Redo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Group', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ungroup', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save as template' })).toBeVisible();

    await page.getByRole('button', { name: 'Canvas', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Load...', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();

    await page.mouse.click(24, 220);
    await expect(page.getByRole('button', { name: 'Load...' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Image...', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Font...', exact: true })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Image...' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Size', exact: true }).click();
    await expect(page.getByLabel('Canvas width')).toBeVisible();
    await expect(page.getByLabel('Canvas height')).toBeVisible();
  });

  test('updates visible canvas dimensions from presets and clears preset selection after manual edits', async ({ page }) => {
    await openFreshEditor(page);

    await chooseCanvasPreset(page, '512 x 512');
    await page.getByRole('button', { name: 'Size' }).click();
    await expect(page.getByLabel('Canvas width')).toHaveValue('512');
    await expect(page.getByLabel('Canvas height')).toHaveValue('512');

    await expect(page.getByRole('button', { name: '512 x 512', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await page.getByLabel('Canvas width').fill('640');
    await page.getByLabel('Canvas height').fill('480');

    await expect(page.getByRole('button', { name: '512 x 512', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByLabel('Canvas width')).toHaveValue('640');
    await expect(page.getByLabel('Canvas height')).toHaveValue('480');
  });

  test('shows the export-bounds cue on hover and focus without covering the canvas interior', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'toolbar-export-off-canvas',
          x: -180,
          y: 180,
          width: 180,
          height: 140,
          fill: '#f97316',
          stroke: '#ea580cff',
        }),
      ]),
      'toolbar-export-cue.json',
    );

    const exportButton = page.getByRole('button', { name: 'Export PNG' });
    const canvasButton = page.getByRole('button', { name: 'Canvas', exact: true });
    const exportCue = page.getByTestId('export-bounds-cue');
    const cuePanels = [
      page.getByTestId('export-bounds-cue-top'),
      page.getByTestId('export-bounds-cue-right'),
      page.getByTestId('export-bounds-cue-bottom'),
      page.getByTestId('export-bounds-cue-left'),
    ];
    const canvasCenter = await canvasPointToPage(page, { x: 512, y: 512 });

    await expect(exportCue).not.toHaveClass(/active/);

    await exportButton.hover();
    await expect(exportCue).toHaveClass(/active/);

    for (const panel of cuePanels) {
      const bounds = await panel.boundingBox();
      expect(bounds).not.toBeNull();
      expect(isPointInsideRect(canvasCenter, bounds!)).toBe(false);
    }

    await canvasButton.hover();
    await expect(exportCue).not.toHaveClass(/active/);

    await exportButton.focus();
    await expect(exportCue).toHaveClass(/active/);

    await canvasButton.focus();
    await expect(exportCue).not.toHaveClass(/active/);
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

    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Group', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Ungroup', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save as template' })).toBeDisabled();

    await clickCanvas(page, { x: 220, y: 200 });
    await expect(page.getByRole('button', { name: 'Delete' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Save as template' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Group', exact: true })).toBeDisabled();

    await dragCanvas(page, { x: 100, y: 100 }, { x: 620, y: 420 });
    await expect(page.getByRole('button', { name: 'Group', exact: true })).toBeEnabled();

    await page.getByRole('button', { name: 'Group', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Ungroup', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();
  });

  test('starts load, image upload, and font upload from real toolbar menu items and filechooser events', async ({ page }) => {
    await openFreshEditor(page);

    const loadChooser = await startToolbarFileChooser(page, 'Canvas', 'Load...');
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
    await expect(page.locator('.layer-row-select')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Text', exact: true })).toBeVisible();

    const imageChooser = await startToolbarFileChooser(page, 'Upload', 'Image...');
    await imageChooser.setFiles({
      name: 'toolbar-image.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#22c55e"/></svg>',
        'utf8',
      ),
    });

    await openLayersTab(page);
    await expect(page.locator('.layer-row-select')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Image', exact: true })).toBeVisible();

    const fontChooser = await startToolbarFileChooser(page, 'Upload', 'Font...');
    await fontChooser.setFiles(path.join(process.cwd(), 'src/assets/fonts/CalSans-Regular.ttf'));

    await clickCanvas(page, { x: 240, y: 210 });
    await openPropertiesTab(page);
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

    await clickCanvas(page, { x: 260, y: 240 });
    await expect(page.getByRole('button', { name: 'Ungroup' })).toBeEnabled();

    await clickToolbarPopoverItem(page, 'Canvas', 'Reset');
    await expect(page.getByRole('button', { name: 'Ungroup' })).toBeDisabled();
  });
});

function isPointInsideRect(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}
