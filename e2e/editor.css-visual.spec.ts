import { expect, test, type Page } from '@playwright/test';

import {
  clickCanvas,
  clickLayerRow,
  createLayersPanelMockParityFixture,
  createProjectDocument,
  createRectangleFixture,
  createTextFixture,
  openFavoritesTab,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  openToolbarPopover,
  uploadProject,
} from './support/editor';

async function seedMockFavorites(page: Page) {
  await page.addInitScript(() => {
    const timestamp = '2026-03-20T12:00:00.000Z';
    window.localStorage.setItem(
      'billboard-builder:favorites:v1',
      JSON.stringify({
        version: 1,
        favorites: [
          {
            id: 'css-favorite-1',
            name: 'Design A',
            nodes: [],
            fonts: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: 'css-favorite-2',
            name: 'Design B',
            nodes: [],
            fonts: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      }),
    );
  });
}

test.describe('editor CSS visual regression — chrome', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CSS visual snapshots run only on Chromium.');

  test('chrome-shell: full editor layout', async ({ page }) => {
    await openFreshEditor(page);
    await expect(page.locator('.selection-inspector')).toContainText('uploaded font(s) ready');
    await expect(page).toHaveScreenshot('chrome-shell.png');
  });

  test('chrome-toolbar: toolbar in default state', async ({ page }) => {
    await openFreshEditor(page);
    await expect(page.locator('.top-toolbar')).toHaveScreenshot('chrome-toolbar.png');
  });

  test('chrome-toolbar-menu: toolbar with Canvas menu open', async ({ page }) => {
    await openFreshEditor(page);
    await openToolbarPopover(page, 'Canvas');
    await expect(page.locator('.top-toolbar')).toHaveScreenshot('chrome-toolbar-menu.png');
  });

  test('chrome-tool-palette: tool button strip', async ({ page }) => {
    await openFreshEditor(page);
    await expect(page.locator('.tool-palette')).toHaveScreenshot('chrome-tool-palette.png');
  });

  test('chrome-canvas-hud: zoom and pan controls', async ({ page }) => {
    await openFreshEditor(page);
    await expect(page.locator('.canvas-hud')).toHaveScreenshot('chrome-canvas-hud.png');
  });

  test('chrome-properties-tab: properties panel empty state', async ({ page }) => {
    await openFreshEditor(page);
    await openPropertiesTab(page);
    await expect(page.getByTestId('layers-panel-rail')).toHaveScreenshot('chrome-properties-tab-empty.png');
  });

  test('chrome-properties-tab-selection: properties panel with a selected rectangle', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({ id: 'css-rect', x: 180, y: 180, width: 240, height: 160 }),
      ]),
      'css-visual-rect.json',
    );
    await clickCanvas(page, { x: 300, y: 260 });
    await openPropertiesTab(page);
    await expect(page.getByTestId('layers-panel-rail')).toHaveScreenshot('chrome-properties-tab-selection.png');
  });

  test('chrome-layers-tab: layers tab empty state', async ({ page }) => {
    await openFreshEditor(page);
    await openLayersTab(page);
    await expect(page.getByTestId('layers-panel-rail')).toHaveScreenshot('chrome-layers-tab-empty.png');
  });

  test('chrome-layers-tab-content: layers tab with fixture content', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, createLayersPanelMockParityFixture(), 'css-visual-layers.json');
    await openLayersTab(page);
    await clickLayerRow(page, 'Hero Group');
    await page.getByRole('button', { name: 'Collapse Legal' }).click();
    await expect(page.getByTestId('layers-panel-rail')).toHaveScreenshot('chrome-layers-tab-content.png');
  });

  test('chrome-favorites-tab: favorites tab with seeded entries', async ({ page }) => {
    await seedMockFavorites(page);
    await openFreshEditor(page);
    await openFavoritesTab(page);
    await expect(page.getByTestId('layers-panel-rail')).toHaveScreenshot('chrome-favorites-tab.png');
  });

  test('chrome-color-picker: fill color picker open', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({ id: 'css-picker-rect', x: 180, y: 180, width: 240, height: 160 }),
      ]),
      'css-visual-color-picker.json',
    );
    await clickCanvas(page, { x: 300, y: 260 });
    await openPropertiesTab(page);
    await page.getByRole('button', { name: 'Fill', exact: true }).click();
    await expect(page.locator('.color-picker-panel')).toBeVisible();
    await expect(page.getByTestId('layers-panel-rail')).toHaveScreenshot('chrome-color-picker.png');
  });

  test('chrome-font-picker: font family picker open', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createTextFixture({ id: 'css-text', x: 180, y: 180, width: 320, height: 100, text: 'Headline' }),
      ]),
      'css-visual-font-picker.json',
    );
    await clickCanvas(page, { x: 340, y: 230 });
    await openPropertiesTab(page);
    await page.getByTestId('font-family-picker-trigger').click();
    await expect(page.getByTestId('font-family-picker-listbox')).toBeVisible();
    await expect(page.getByTestId('layers-panel-rail')).toHaveScreenshot('chrome-font-picker.png');
  });
});
