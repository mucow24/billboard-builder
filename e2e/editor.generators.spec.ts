import { expect, test } from '@playwright/test';

import {
  clickLayerRow,
  clickToolbarPopoverItem,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
} from './support/editor';

test.describe('generator layers', () => {
  test('adds a Diagonal Bands generator from the toolbar and shows its properties', async ({ page }) => {
    await openFreshEditor(page);

    await clickToolbarPopoverItem(page, 'Generators', 'Diagonal Bands');

    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Diagonal Bands', exact: true })).toBeVisible();

    await clickLayerRow(page, 'Diagonal Bands');
    await openPropertiesTab(page);
    await expect(page.getByTestId('properties-tab-body')).toBeVisible();
    await expect(page.getByText('Band Color A')).toBeVisible();
    await expect(page.getByText('Band Count')).toBeVisible();
    await expect(page.getByText('Band Angle')).toBeVisible();
  });

  test('text input accepts values beyond slider range but clamps to correctness bounds', async ({ page }) => {
    await openFreshEditor(page);

    // Scanlines is cheap to render — spacing=1 fills every row
    await clickToolbarPopoverItem(page, 'Generators', 'Scanlines');
    await openLayersTab(page);
    await clickLayerRow(page, 'Scanlines');
    await openPropertiesTab(page);

    const spacingInput = page.getByLabel('Spacing value');
    await expect(spacingInput).toBeVisible();

    // Type 1 — below slider min (2) but accepted (textMin is 1)
    await spacingInput.fill('1');
    await spacingInput.blur();
    await expect(spacingInput).toHaveValue('1');

    // Type 0 — below textMin (1), clamped
    await spacingInput.fill('0');
    await spacingInput.blur();
    await expect(spacingInput).toHaveValue('1');

    // Type 100 — beyond slider max (20) but accepted (textMax is Infinity)
    await spacingInput.fill('100');
    await spacingInput.blur();
    await expect(spacingInput).toHaveValue('100');
  });
});
