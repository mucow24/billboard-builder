import { expect, test } from '@playwright/test';

import {
  clickCanvas,
  createGroupedProjectDocument,
  createRectangleFixture,
  openFreshEditor,
  openLayersTab,
  openTemplatesTab,
  waitForEditor,
  uploadProject,
} from './support/editor';

test.describe('editor template library flows', () => {
  test('TL-01 TL-02 TL-03 TL-04 saves, inserts, persists, and deletes templates from the real inspector flow', async ({
    page,
  }) => {
    const rectangle = createRectangleFixture({
      id: 'template-rectangle',
      x: 180,
      y: 180,
      width: 220,
      height: 120,
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createGroupedProjectDocument([rectangle]),
      'template-library.json',
    );

    await clickCanvas(page, { x: 240, y: 220 });
    await page.getByRole('button', { name: 'Save as template' }).click();

    await openTemplatesTab(page);
    await expect(page.getByRole('button', { name: 'Insert Rectangle template' })).toBeVisible();

    await page.getByRole('button', { name: 'Insert Rectangle template' }).click();
    await expect(page.getByRole('tab', { name: /Templates/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toHaveCount(2);

    await page.reload();
    await waitForEditor(page);
    await openTemplatesTab(page);
    await expect(page.getByRole('button', { name: 'Insert Rectangle template' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete template Rectangle template' }).click();
    await expect(page.getByText('No templates yet')).toBeVisible();

    await page.reload();
    await waitForEditor(page);
    await openTemplatesTab(page);
    await expect(page.getByText('No templates yet')).toBeVisible();
  });
});
