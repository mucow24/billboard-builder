import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  clickCanvas,
  createProjectDocument,
  createGroupedProjectDocument,
  createRectangleFixture,
  createTextFixture,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  openFavoritesTab,
  waitForEditor,
  uploadProject,
} from './support/editor';
import {
  expectPersistedCanvasToReferenceFontFamily,
  uploadNamedFontFromPath,
} from './support/persistence';

test.describe('editor favorite library flows', () => {
  test('TL-01 TL-02 TL-03 TL-04 saves, inserts, persists, and deletes favorites from the real inspector flow', async ({
    page,
  }) => {
    const rectangle = createRectangleFixture({
      id: 'favorite-rectangle',
      x: 180,
      y: 180,
      width: 220,
      height: 120,
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createGroupedProjectDocument([rectangle]),
      'favorite-library.json',
    );

    await clickCanvas(page, { x: 240, y: 220 });
    await page.getByRole('button', { name: 'Save as favorite' }).click();
    await expect(page.getByRole('status')).toHaveText('Added to favorites');

    await openFavoritesTab(page);
    await expect(page.getByRole('button', { name: 'Insert Rectangle favorite' })).toBeVisible();

    await page.getByRole('button', { name: 'Insert Rectangle favorite' }).click();
    await expect(page.getByRole('tab', { name: /Favorites/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toHaveCount(2);

    await page.reload();
    await waitForEditor(page);
    await openFavoritesTab(page);
    await expect(page.getByRole('button', { name: 'Insert Rectangle favorite' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete favorite Rectangle favorite' }).click();
    await expect(page.getByText('No favorites yet')).toBeVisible();

    await page.reload();
    await waitForEditor(page);
    await openFavoritesTab(page);
    await expect(page.getByText('No favorites yet')).toBeVisible();
  });

  test('TL-06 reorders favorites via drag and persists the new order', async ({ page }) => {
    const rectA = createRectangleFixture({ id: 'rect-a', x: 100, y: 100, width: 80, height: 80 });
    const rectB = createRectangleFixture({ id: 'rect-b', x: 300, y: 300, width: 80, height: 80 });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createGroupedProjectDocument([rectA, rectB]),
      'reorder-test.json',
    );

    // Save first item as favorite
    await clickCanvas(page, { x: 140, y: 140 });
    await page.getByRole('button', { name: 'Save as favorite' }).click();
    await expect(page.getByRole('status')).toHaveText('Added to favorites');

    // Deselect, then save second item as favorite
    await clickCanvas(page, { x: 500, y: 500 });
    await clickCanvas(page, { x: 340, y: 340 });
    await page.getByRole('button', { name: 'Save as favorite' }).click();
    await expect(page.getByRole('status')).toHaveText('Added to favorites');

    await openFavoritesTab(page);
    const grips = page.getByRole('button', { name: /Reorder/ });
    await expect(grips).toHaveCount(2);

    // Read initial order
    const insertButtons = page.getByRole('button', { name: /^Insert / });
    const namesBefore = await insertButtons.allInnerTexts();
    expect(namesBefore).toHaveLength(2);

    // Drag second grip above the first
    const secondGrip = grips.nth(1);
    const firstGrip = grips.nth(0);

    const secondBox = await secondGrip.boundingBox();
    const firstBox = await firstGrip.boundingBox();
    expect(secondBox).toBeTruthy();
    expect(firstBox).toBeTruthy();

    await page.mouse.move(secondBox!.x + secondBox!.width / 2, secondBox!.y + secondBox!.height / 2);
    await page.mouse.down();
    // Move above the first grip with enough distance to pass threshold
    await page.mouse.move(firstBox!.x + firstBox!.width / 2, firstBox!.y - 2, { steps: 5 });
    await page.mouse.up();

    // Verify order reversed
    const namesAfterDrag = await insertButtons.allInnerTexts();
    expect(namesAfterDrag[0]).toBe(namesBefore[1]);
    expect(namesAfterDrag[1]).toBe(namesBefore[0]);

    // Verify persistence after reload
    await page.reload();
    await waitForEditor(page);
    await openFavoritesTab(page);
    const namesAfterReload = await insertButtons.allInnerTexts();
    expect(namesAfterReload[0]).toBe(namesBefore[1]);
    expect(namesAfterReload[1]).toBe(namesBefore[0]);
  });

  test('TL-07 reorders favorites via keyboard and persists the new order', async ({ page }) => {
    const rectA = createRectangleFixture({ id: 'rect-c', x: 100, y: 100, width: 80, height: 80 });
    const rectB = createRectangleFixture({ id: 'rect-d', x: 300, y: 300, width: 80, height: 80 });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createGroupedProjectDocument([rectA, rectB]),
      'kb-reorder-test.json',
    );

    // Save first item as favorite
    await clickCanvas(page, { x: 140, y: 140 });
    await page.getByRole('button', { name: 'Save as favorite' }).click();
    await expect(page.getByRole('status')).toHaveText('Added to favorites');

    // Deselect, then save second item as favorite
    await clickCanvas(page, { x: 500, y: 500 });
    await clickCanvas(page, { x: 340, y: 340 });
    await page.getByRole('button', { name: 'Save as favorite' }).click();
    await expect(page.getByRole('status')).toHaveText('Added to favorites');

    await openFavoritesTab(page);
    const insertButtons = page.getByRole('button', { name: /^Insert / });
    const namesBefore = await insertButtons.allInnerTexts();

    // Focus first grip and press Alt+ArrowDown
    const firstGrip = page.getByRole('button', { name: /Reorder/ }).nth(0);
    await firstGrip.focus();
    await page.keyboard.press('Alt+ArrowDown');

    // Verify order swapped
    const namesAfterKeyboard = await insertButtons.allInnerTexts();
    expect(namesAfterKeyboard[0]).toBe(namesBefore[1]);
    expect(namesAfterKeyboard[1]).toBe(namesBefore[0]);

    // Verify persistence
    await page.reload();
    await waitForEditor(page);
    await openFavoritesTab(page);
    const namesAfterReload = await insertButtons.allInnerTexts();
    expect(namesAfterReload[0]).toBe(namesBefore[1]);
    expect(namesAfterReload[1]).toBe(namesBefore[0]);
  });

  test('TL-08 filter and sort toolbar filters, sorts, and gates manual drag', async ({ page }) => {
    const rectA = createRectangleFixture({ id: 'rect-e', x: 80, y: 80, width: 80, height: 80 });
    const rectB = createRectangleFixture({ id: 'rect-f', x: 240, y: 240, width: 80, height: 80 });
    const rectC = createRectangleFixture({ id: 'rect-g', x: 420, y: 420, width: 80, height: 80 });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createGroupedProjectDocument([rectA, rectB, rectC]),
      'toolbar-test.json',
    );

    // Save three rectangles as favorites. uniquifyFavoriteName produces:
    //   "Rectangle favorite", "Rectangle favorite (2)", "Rectangle favorite (3)".
    for (const { x, y } of [
      { x: 120, y: 120 },
      { x: 280, y: 280 },
      { x: 460, y: 460 },
    ]) {
      await clickCanvas(page, { x: 600, y: 600 }); // deselect
      await clickCanvas(page, { x, y });
      await page.getByRole('button', { name: 'Save as favorite' }).click();
      await expect(page.getByRole('status')).toHaveText('Added to favorites');
    }

    await openFavoritesTab(page);

    const toolbar = page.getByRole('toolbar', { name: /Favorites filter and sort/ });
    await expect(toolbar).toBeVisible();

    const search = page.getByRole('searchbox', { name: /Filter favorites by name/ });
    const sortSelect = page.getByRole('combobox', { name: /Sort favorites by/ });
    const directionButton = page.getByRole('button', { name: /Toggle sort direction/ });
    const insertButtons = page.getByRole('button', { name: /^Insert Rectangle favorite/ });
    const grips = page.getByRole('button', { name: /^Reorder Rectangle favorite/ });

    await expect(insertButtons).toHaveCount(3);
    await expect(sortSelect).toHaveValue('manual');
    await expect(directionButton).toBeDisabled();

    // Filter: type "(3)" to isolate the third favorite
    await search.fill('(3)');
    await expect(insertButtons).toHaveCount(1);
    await expect(insertButtons.first()).toHaveText(/\(3\)/);

    // Grips go inert while filtering (search non-empty)
    for (let i = 0; i < (await grips.count()); i += 1) {
      await expect(grips.nth(i)).toHaveAttribute('aria-disabled', 'true');
    }

    // Clear button restores the full list and refocuses the search box
    await page.getByRole('button', { name: /Clear search/ }).click();
    await expect(insertButtons).toHaveCount(3);
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('');

    // Switch to Name sort → direction button enabled, grips become inert
    await sortSelect.selectOption('name');
    await expect(directionButton).toBeEnabled();
    const namesAscending = await insertButtons.allInnerTexts();
    expect(namesAscending).toEqual([...namesAscending].sort());
    for (let i = 0; i < 3; i += 1) {
      await expect(grips.nth(i)).toHaveAttribute('aria-disabled', 'true');
    }

    // Toggle direction → order reverses
    await directionButton.click();
    const namesDescending = await insertButtons.allInnerTexts();
    expect(namesDescending).toEqual([...namesAscending].reverse());

    // Switch back to Manual → direction button disabled, grips re-enabled
    await sortSelect.selectOption('manual');
    await expect(directionButton).toBeDisabled();
    for (let i = 0; i < 3; i += 1) {
      await expect(grips.nth(i)).not.toHaveAttribute('aria-disabled', 'true');
    }

    // Sort selection persists across reload; search resets
    await sortSelect.selectOption('name');
    await search.fill('favorite');
    await page.reload();
    await waitForEditor(page);
    await openFavoritesTab(page);
    await expect(page.getByRole('combobox', { name: /Sort favorites by/ })).toHaveValue('name');
    await expect(page.getByRole('searchbox', { name: /Filter favorites by name/ })).toHaveValue('');
  });

  test('TL-05 lazily restores a favorite-only uploaded font after reload', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([createTextFixture({ id: 'favorite-font-text' })]),
      'favorite-font-library.json',
    );

    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);

    const fontPath = path.join(process.cwd(), 'src/assets/fonts/CalSans-Regular.ttf');
    await uploadNamedFontFromPath(page, fontPath, 'Uploaded-Favorite-Regular.ttf');
    await page.getByTestId('font-family-picker-trigger').click();
    await page.getByRole('option', { name: 'Uploaded Favorite' }).first().click();
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Uploaded Favorite');

    await page.getByRole('button', { name: 'Save as favorite' }).click();
    await openFavoritesTab(page);
    await expect(
      page.getByRole('button', { name: 'Insert Text:Integration text' }),
    ).toBeVisible();

    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);
    await page.getByTestId('font-family-picker-trigger').click();
    await page.getByRole('option', { name: 'Arial' }).first().click();
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Arial');
    await expectPersistedCanvasToReferenceFontFamily(page, 'Arial', []);

    await page.reload();
    await waitForEditor(page);
    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Arial');
    await page.getByTestId('font-family-picker-trigger').click();
    await expect(page.getByRole('option', { name: 'Uploaded Favorite' })).toHaveCount(0);

    await openFavoritesTab(page);
    await page.getByRole('button', { name: 'Insert Text:Integration text' }).click();
    await openPropertiesTab(page);
    await expect(page.getByText('Missing fonts')).toHaveCount(0);
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Uploaded Favorite');
  });
});
