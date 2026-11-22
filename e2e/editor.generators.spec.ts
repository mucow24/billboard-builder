import { expect, test, type Page } from '@playwright/test';

import {
  addGenerator,
  clickLayerRow,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
} from './support/editor';

test.describe('generator layers', () => {
  /**
   * The slider's range, and the text box's. The text box has the slider's range
   * unless `text` says otherwise: null for an end it does not limit.
   */
  async function expectRangeFieldBounds(
    page: Page,
    label: string,
    bounds: { min: string; max: string; step: string },
    text: { min?: string | null; max?: string | null } = {},
  ) {
    const slider = page.getByRole('slider', { name: label, exact: true });
    const textBox = page.getByRole('spinbutton', { name: `${label} value`, exact: true });
    await expect(slider).toHaveAttribute('min', bounds.min);
    await expect(slider).toHaveAttribute('max', bounds.max);
    await expect(slider).toHaveAttribute('step', bounds.step);
    for (const end of ['min', 'max'] as const) {
      const limit = text[end] === undefined ? bounds[end] : text[end];
      if (limit === null) {
        await expect(textBox).not.toHaveAttribute(end);
      } else {
        await expect(textBox).toHaveAttribute(end, limit);
      }
    }
    await expect(textBox).toHaveAttribute('step', bounds.step);
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
    await expectRangeFieldBounds(page, 'Band Width Jitter', { min: '0', max: '5', step: '0.01' }, { max: null });
    await expectRangeFieldBounds(page, 'Skew Intensity', { min: '0', max: '3', step: '0.01' }, { max: null });

    await addGenerator(page, 'Burst Rays');
    await openLayersTab(page);
    await clickLayerRow(page, 'Burst Rays');
    await openPropertiesTab(page);
    await expectRangeFieldBounds(page, 'Ray Count', { min: '1', max: '48', step: '1' }, { max: null });
    // The sliders reach three quarters of the 2048 x 2048 default canvas, either way.
    await expectRangeFieldBounds(page, 'Offset X', { min: '-1536', max: '1536', step: '1' }, { min: null, max: null });
    await expectRangeFieldBounds(page, 'Offset Y', { min: '-1536', max: '1536', step: '1' }, { min: null, max: null });

    await addGenerator(page, 'Zigzags');
    await openLayersTab(page);
    await clickLayerRow(page, 'Zigzags');
    await openPropertiesTab(page);
    await expectRangeFieldBounds(page, 'Count', { min: '1', max: '48', step: '1' }, { max: null });
    await expectRangeFieldBounds(page, 'Thickness', { min: '1', max: '64', step: '1' }, { max: null });

    await addGenerator(page, 'Flat Grid');
    await openLayersTab(page);
    await clickLayerRow(page, 'Flat Grid');
    await openPropertiesTab(page);
    await expectRangeFieldBounds(page, 'Thickness', { min: '1', max: '64', step: '1' }, { max: null });
    // The grid repeats, so the offset sliders span one grid spacing and follow it.
    const offsetXSlider = page.getByRole('slider', { name: 'Offset X', exact: true });
    await expect(offsetXSlider).toHaveAttribute('min', '0');
    await expect(offsetXSlider).toHaveAttribute('max', '40');
    await page.getByLabel('Spacing X value').fill('10');
    await page.getByLabel('Spacing X value').blur();
    await expect(offsetXSlider).toHaveAttribute('max', '10');
    await expect(page.getByRole('slider', { name: 'Offset Y', exact: true })).toHaveAttribute('max', '40');

    await addGenerator(page, 'Noise');
    await openLayersTab(page);
    await clickLayerRow(page, 'Noise');
    await openPropertiesTab(page);
    await expectRangeFieldBounds(page, 'Intensity', { min: '0', max: '1', step: '0.001' });

    await addGenerator(page, 'Shapes');
    await openLayersTab(page);
    await clickLayerRow(page, 'Shapes');
    await openPropertiesTab(page);
    await expectRangeFieldBounds(page, 'Count', { min: '1', max: '256', step: '1' }, { max: null });
    await expectRangeFieldBounds(page, 'Min Size', { min: '1', max: '384', step: '1' }, { max: null });
    await expectRangeFieldBounds(page, 'Max Size', { min: '1', max: '384', step: '1' }, { max: null });
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
    // Opacity is a setting of its own, starting fully opaque.
    await expect(page.getByLabel('Opacity value')).toHaveValue('1');
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

  test('text input takes values past the slider range where nothing but the slider limits them', async ({ page }) => {
    await openFreshEditor(page);

    await addGenerator(page, 'Burst Rays');
    await openLayersTab(page);
    await clickLayerRow(page, 'Burst Rays');
    await openPropertiesTab(page);

    // The sliders stop at 48 rays and three quarters of the canvas.
    for (const [label, typed] of [
      ['Ray Count value', '100'],
      ['Offset X value', '5000'],
      ['Offset Y value', '-5000'],
    ]) {
      const input = page.getByLabel(label);
      await input.fill(typed);
      await input.blur();
      await expect(input).toHaveValue(typed);
    }

    // A ray count still cannot go below 1.
    const rays = page.getByLabel('Ray Count value');
    await rays.fill('0');
    await rays.blur();
    await expect(rays).toHaveValue('1');
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
