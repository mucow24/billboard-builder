import { expect, test } from '@playwright/test';

import {
  clickCanvas,
  createNgonFixture,
  createProjectDocument,
  dragCanvas,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  saveAndReadProject,
  selectTool,
  uploadProject,
} from './support/editor';

test.describe('ngon tool flows', () => {
  test('selects Polygon tool from toolbar, drags out a polygon, and it appears in layers', async ({ page }) => {
    await openFreshEditor(page);

    await selectTool(page, 'Polygon');
    await dragCanvas(page, { x: 200, y: 200 }, { x: 400, y: 400 });

    await openLayersTab(page);
    await expect(page.getByRole('button', { name: /^Polygon \(/ })).toBeVisible();
  });

  test('activates polygon tool via G hotkey', async ({ page }) => {
    await openFreshEditor(page);

    await page.keyboard.press('g');
    await dragCanvas(page, { x: 150, y: 150 }, { x: 350, y: 350 });

    await openLayersTab(page);
    await expect(page.getByRole('button', { name: /^Polygon \(/ })).toBeVisible();
  });

  test('shows Sides slider in properties panel for ngon', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([createNgonFixture()]),
      'ngon-properties.json',
    );

    await clickCanvas(page, { x: 300, y: 300 });
    await openPropertiesTab(page);

    await page.getByRole('button', { name: 'Geometry' }).click();
    await expect(page.getByRole('slider', { name: 'Sides' })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Sides' })).toBeVisible();
  });

  test('updates Sides value and persists through save', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([createNgonFixture({ id: 'ngon-sides-test' })]),
      'ngon-sides.json',
    );

    await clickCanvas(page, { x: 300, y: 300 });
    await openPropertiesTab(page);
    await page.getByRole('button', { name: 'Geometry' }).click();
    await page.getByRole('spinbutton', { name: 'Sides' }).fill('5');

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({ id: 'ngon-sides-test', sides: 5 }),
    ]);
  });

  test('enables gradient on ngon and persists through save', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([createNgonFixture({ id: 'ngon-gradient-test' })]),
      'ngon-gradient.json',
    );

    await clickCanvas(page, { x: 300, y: 300 });
    await openPropertiesTab(page);
    await page.getByRole('button', { name: 'Toggle gradient' }).click();

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({ id: 'ngon-gradient-test', gradientEnabled: true }),
    ]);
  });
});
