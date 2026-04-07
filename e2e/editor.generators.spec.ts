import { expect, test, type Page } from '@playwright/test';

import {
  addGenerator,
  clickLayerRow,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
} from './support/editor';

test.describe('generator layers', () => {
  async function expectRangeFieldBounds(
    page: Page,
    label: string,
    bounds: { min: string; max: string; step: string },
  ) {
    await expect(page.getByRole('slider', { name: label, exact: true })).toHaveAttribute('min', bounds.min);
    await expect(page.getByRole('slider', { name: label, exact: true })).toHaveAttribute('max', bounds.max);
    await expect(page.getByRole('slider', { name: label, exact: true })).toHaveAttribute('step', bounds.step);
    await expect(page.getByRole('spinbutton', { name: `${label} value`, exact: true })).toHaveAttribute('min', bounds.min);
    await expect(page.getByRole('spinbutton', { name: `${label} value`, exact: true })).toHaveAttribute('max', bounds.max);
    await expect(page.getByRole('spinbutton', { name: `${label} value`, exact: true })).toHaveAttribute('step', bounds.step);
  }

  test('adds a Diagonal Bands generator from the toolbar and shows its properties', async ({ page }) => {
    await openFreshEditor(page);

    await addGenerator(page,'Diagonal Bands');

    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Diagonal Bands', exact: true })).toBeVisible();

    await clickLayerRow(page, 'Diagonal Bands');
    await openPropertiesTab(page);
    await expect(page.getByTestId('properties-tab-body')).toBeVisible();
    await expect(page.getByText('Band Color A')).toBeVisible();
    await expect(page.getByText('Band Count')).toBeVisible();
    await expect(page.getByText('Band Angle')).toBeVisible();
  });

  test('shows the updated generator slider bounds in the live inspector', async ({ page }) => {
    await openFreshEditor(page);

    await addGenerator(page, 'Diagonal Bands');
    await openLayersTab(page);
    await clickLayerRow(page, 'Diagonal Bands');
    await openPropertiesTab(page);
    await expectRangeFieldBounds(page, 'Spacing Jitter', { min: '0', max: '5', step: '0.01' });
    await expectRangeFieldBounds(page, 'Skew Intensity', { min: '0', max: '3', step: '0.01' });

    await addGenerator(page, 'Burst Rays');
    await openLayersTab(page);
    await clickLayerRow(page, 'Burst Rays');
    await openPropertiesTab(page);
    await expectRangeFieldBounds(page, 'Ray Count', { min: '1', max: '48', step: '1' });
    await expectRangeFieldBounds(page, 'Offset X', { min: '-512', max: '512', step: '1' });
    await expectRangeFieldBounds(page, 'Offset Y', { min: '-512', max: '512', step: '1' });

    await addGenerator(page, 'Zigzags');
    await openLayersTab(page);
    await clickLayerRow(page, 'Zigzags');
    await openPropertiesTab(page);
    await expectRangeFieldBounds(page, 'Count', { min: '1', max: '48', step: '1' });
    await expectRangeFieldBounds(page, 'Thickness', { min: '1', max: '64', step: '1' });

    await addGenerator(page, 'Flat Grid');
    await openLayersTab(page);
    await clickLayerRow(page, 'Flat Grid');
    await openPropertiesTab(page);
    await expectRangeFieldBounds(page, 'Thickness', { min: '1', max: '64', step: '1' });

    await addGenerator(page, 'Noise');
    await openLayersTab(page);
    await clickLayerRow(page, 'Noise');
    await openPropertiesTab(page);
    await expectRangeFieldBounds(page, 'Intensity', { min: '0', max: '1', step: '0.001' });

    await addGenerator(page, 'Shapes');
    await openLayersTab(page);
    await clickLayerRow(page, 'Shapes');
    await openPropertiesTab(page);
    await expectRangeFieldBounds(page, 'Count', { min: '1', max: '256', step: '1' });
    await expectRangeFieldBounds(page, 'Min Size', { min: '1', max: '384', step: '1' });
    await expectRangeFieldBounds(page, 'Max Size', { min: '1', max: '384', step: '1' });
    await expectRangeFieldBounds(page, 'Rotation', { min: '0', max: '1', step: '0.01' });
  });

  test('text input accepts values beyond slider range but clamps to correctness bounds', async ({ page }) => {
    await openFreshEditor(page);

    // Scanlines is cheap to render — height=1 and spacing=0 fills every row
    await addGenerator(page,'Scanlines');
    await openLayersTab(page);
    await clickLayerRow(page, 'Scanlines');
    await openPropertiesTab(page);

    await expect(page.getByText('Scanline Color')).toBeVisible();
    await expect(page.getByText('Height:')).toBeVisible();

    const spacingInput = page.getByLabel('Spacing value');
    await expect(spacingInput).toBeVisible();

    // Type 0 — below slider min (1) but accepted (textMin is 0)
    await spacingInput.fill('0');
    await spacingInput.blur();
    await expect(spacingInput).toHaveValue('0');

    // Type -1 — below textMin (0), clamped
    await spacingInput.fill('-1');
    await spacingInput.blur();
    await expect(spacingInput).toHaveValue('0');

    // Type 100 — beyond slider max (20) but accepted (textMax is Infinity)
    await spacingInput.fill('100');
    await spacingInput.blur();
    await expect(spacingInput).toHaveValue('100');
  });

  test('shapes generator shows toggle buttons for shape types', async ({ page }) => {
    await openFreshEditor(page);

    await addGenerator(page,'Shapes');
    await openLayersTab(page);
    await clickLayerRow(page, 'Shapes');
    await openPropertiesTab(page);

    // All 5 shape toggles should be visible and pressed
    for (const name of ['Rect', 'Diamond', 'Tri', 'Circle', 'Bar']) {
      const btn = page.getByRole('button', { name, exact: true });
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute('aria-pressed', 'true');
    }

    // Toggle Circle off
    await page.getByRole('button', { name: 'Circle', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Circle', exact: true })).toHaveAttribute('aria-pressed', 'false');

    // Toggle Circle back on
    await page.getByRole('button', { name: 'Circle', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Circle', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('generator layer row shows G icon with primary and secondary colors', async ({ page }) => {
    await openFreshEditor(page);

    await addGenerator(page,'Diagonal Bands');
    await openLayersTab(page);

    const icon = page.locator('.layer-row-generator-icon').first();
    await expect(icon).toBeVisible();
    await expect(icon).toHaveText('G');

    // Primary color (bandColorA #8d1fff) → rgb(141, 31, 255)
    const textColor = await icon.evaluate((el) => getComputedStyle(el).color);
    expect(textColor).toBe('rgb(141, 31, 255)');

    // Secondary color (bandColorB #30f2ff) as background on parent swatch
    const swatch = page.locator('.layer-row-type-generator').first();
    const bgColor = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bgColor).toBe('rgb(48, 242, 255)');
  });

  test('colorless generator shows muted fallback G icon', async ({ page }) => {
    await openFreshEditor(page);

    await addGenerator(page,'Noise');
    await openLayersTab(page);

    const icon = page.locator('.layer-row-generator-icon').first();
    await expect(icon).toBeVisible();
    await expect(icon).toHaveText('G');

    // Should NOT be the bands primary color — should be a muted fallback
    const textColor = await icon.evaluate((el) => getComputedStyle(el).color);
    expect(textColor).not.toBe('rgb(141, 31, 255)');
  });

  test('generator layer icon updates when color parameter changes', async ({ page }) => {
    await openFreshEditor(page);

    await addGenerator(page,'Diagonal Bands');
    await openLayersTab(page);

    const icon = page.locator('.layer-row-generator-icon').first();
    const initialColor = await icon.evaluate((el) => getComputedStyle(el).color);
    expect(initialColor).toBe('rgb(141, 31, 255)');

    // Select and change Band Color A
    await clickLayerRow(page, 'Diagonal Bands');
    await openPropertiesTab(page);

    // Open the Band Color A picker and change the hex value
    await page.getByRole('button', { name: 'Band Color A', exact: true }).click();
    const hexInput = page.getByLabel('Band Color A hex');
    await hexInput.fill('#ff0000');
    await hexInput.press('Enter');

    // Check layer icon updated
    await openLayersTab(page);
    const updatedColor = await icon.evaluate((el) => getComputedStyle(el).color);
    expect(updatedColor).toBe('rgb(255, 0, 0)');
  });
});
