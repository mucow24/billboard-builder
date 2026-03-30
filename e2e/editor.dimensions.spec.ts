import { expect, test } from '@playwright/test';

import {
  clickCanvas,
  createImageFixture,
  createProjectDocument,
  createRectangleFixture,
  openFreshEditor,
  openPropertiesTab,
  saveAndReadProject,
  uploadProject,
} from './support/editor';

test.describe('editor dimensions widget', () => {
  async function openGeometry(page: Parameters<typeof clickCanvas>[0]) {
    await openPropertiesTab(page);
    await page.getByRole('button', { name: 'Geometry' }).click();
  }

  test('DIM-01 dimensions widget shows 4 inputs and lock button', async ({ page }) => {
    const rect = createRectangleFixture({ id: 'dim-rect', x: 120, y: 120 });
    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rect]), 'dim-01.json');
    await clickCanvas(page, { x: 230, y: 190 });
    await openGeometry(page);

    await expect(page.getByRole('spinbutton', { name: 'Width', exact: true })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Height', exact: true })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Width %' })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Height %' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Lock aspect ratio' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Lock aspect ratio' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  test('DIM-02 editing absolute width updates item width', async ({ page }) => {
    const rect = createRectangleFixture({ id: 'dim-rect', x: 120, y: 120 });
    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rect]), 'dim-02.json');
    await clickCanvas(page, { x: 230, y: 190 });
    await openGeometry(page);

    await page.getByRole('spinbutton', { name: 'Width', exact: true }).fill('300');
    await page.getByRole('spinbutton', { name: 'Width', exact: true }).press('Tab');

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({ id: 'dim-rect', width: 300, scaleX: 1 }),
    ]);
  });

  test('DIM-03 editing width % sets scaleX without changing raw width', async ({ page }) => {
    const rect = createRectangleFixture({ id: 'dim-rect', x: 120, y: 120, width: 200 });
    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rect]), 'dim-03.json');
    await clickCanvas(page, { x: 230, y: 190 });
    await openGeometry(page);

    await page.getByRole('spinbutton', { name: 'Width %' }).fill('50');
    await page.getByRole('spinbutton', { name: 'Width %' }).press('Tab');

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({ id: 'dim-rect', width: 200, scaleX: 0.5 }),
    ]);
  });

  test('DIM-04 lock state persists to document', async ({ page }) => {
    const rect = createRectangleFixture({ id: 'dim-rect', x: 120, y: 120 });
    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rect]), 'dim-04.json');
    await clickCanvas(page, { x: 230, y: 190 });
    await openGeometry(page);

    await page.getByRole('button', { name: 'Lock aspect ratio' }).click();

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({ id: 'dim-rect', lockAspectRatio: true }),
    ]);
  });

  test('DIM-05 lock on: editing width updates height proportionally', async ({ page }) => {
    const rect = createRectangleFixture({
      id: 'dim-rect',
      x: 120,
      y: 120,
      width: 400,
      height: 200,
    });
    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rect]), 'dim-05.json');
    await clickCanvas(page, { x: 320, y: 220 });
    await openGeometry(page);

    await page.getByRole('button', { name: 'Lock aspect ratio' }).click();
    await page.getByRole('spinbutton', { name: 'Width', exact: true }).fill('200');
    await page.getByRole('spinbutton', { name: 'Width', exact: true }).press('Tab');

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({ id: 'dim-rect', width: 200, height: 100 }),
    ]);
  });

  test('DIM-06 lock on: editing width % updates both scaleX and scaleY', async ({ page }) => {
    const rect = createRectangleFixture({ id: 'dim-rect', x: 120, y: 120 });
    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rect]), 'dim-06.json');
    await clickCanvas(page, { x: 230, y: 190 });
    await openGeometry(page);

    await page.getByRole('button', { name: 'Lock aspect ratio' }).click();
    await page.getByRole('spinbutton', { name: 'Width %' }).fill('50');
    await page.getByRole('spinbutton', { name: 'Width %' }).press('Tab');

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({ id: 'dim-rect', scaleX: 0.5, scaleY: 0.5 }),
    ]);
  });

  test('DIM-07 image shows Reset to original size button', async ({ page }) => {
    const image = createImageFixture({
      id: 'dim-image',
      x: 100,
      y: 100,
      width: 800,
      height: 600,
      originalWidth: 800,
      originalHeight: 600,
    });
    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([image]), 'dim-07.json');
    await clickCanvas(page, { x: 500, y: 400 });
    await openGeometry(page);

    await expect(page.getByRole('button', { name: 'Reset to original size' })).toBeVisible();
  });

  test('DIM-08 image reset restores original dimensions', async ({ page }) => {
    const image = createImageFixture({
      id: 'dim-image',
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      originalWidth: 800,
      originalHeight: 600,
    });
    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([image]), 'dim-08.json');
    await clickCanvas(page, { x: 300, y: 250 });
    await openGeometry(page);

    await page.getByRole('button', { name: 'Reset to original size' }).click();

    const saved = await saveAndReadProject(page);
    expect(saved.nodes).toEqual([
      expect.objectContaining({
        id: 'dim-image',
        width: 800,
        height: 600,
        scaleX: 1,
        scaleY: 1,
      }),
    ]);
  });
});
