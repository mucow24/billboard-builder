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
});
