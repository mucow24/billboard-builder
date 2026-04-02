import { expect, test, type Page } from '@playwright/test';

import {
  clickCanvas,
  createImageFixture,
  createLineFixture,
  createProjectDocument,
  createRectangleFixture,
  createTextFixture,
  openFreshEditor,
  openPropertiesTab,
  saveAndReadProject,
  uploadProject,
} from './support/editor';

async function expectSliders(page: Page, sectionName: string, labels: string[]) {
  const toggle = page.locator('button.property-block-toggle').filter({
    has: page.locator('span', { hasText: new RegExp(`^${sectionName}$`) }),
  });
  if (await toggle.getAttribute('aria-expanded') !== 'true') {
    await toggle.click();
  }
  const section = toggle.locator('..');
  for (const label of labels) {
    await expect(section.getByRole('slider', { name: label, exact: true })).toBeVisible();
  }
}

test.describe('editor properties flows', () => {
  test('PI-01 PI-05 shows the empty state and updates shared opacity for multi-selection', async ({
    page,
  }) => {
    const first = createRectangleFixture({
      id: 'multi-opacity-first',
      name: 'Multi Opacity First',
      x: 140,
      y: 160,
      width: 160,
      height: 100,
      zIndex: 0,
    });
    const second = createRectangleFixture({
      id: 'multi-opacity-second',
      name: 'Multi Opacity Second',
      x: 360,
      y: 210,
      width: 180,
      height: 110,
      fill: '#0ea5e9',
      stroke: '#0369a1ff',
      zIndex: 1,
    });

    await openFreshEditor(page);
    await openPropertiesTab(page);
    await expect(page.getByText('Nothing selected')).toBeVisible();

    await uploadProject(page, createProjectDocument([first, second]), 'properties-multi.json');
    await clickCanvas(page, { x: 220, y: 210 });
    await page.keyboard.down('Shift');
    await clickCanvas(page, { x: 450, y: 265 });
    await page.keyboard.up('Shift');
    await openPropertiesTab(page);

    await expect(page.getByRole('heading', { name: '2 items selected' })).toBeVisible();
    await page.getByRole('button', { name: 'Geometry' }).click();
    await page.getByRole('spinbutton', { name: 'Rotation' }).fill('45');

    const savedProject = await saveAndReadProject(page);
    expect(savedProject.nodes).toEqual([
      expect.objectContaining({ id: 'multi-opacity-first', rotation: 45 }),
      expect.objectContaining({ id: 'multi-opacity-second', rotation: 45 }),
    ]);
  });

  test('PI-04 PI-05 PI-10 PI-11 shows exact shared fields across mixed kinds and applies shared edits', async ({
    page,
  }) => {
    const rectangle = createRectangleFixture({
      id: 'shared-rect',
      name: 'Shared Rectangle',
      x: 140,
      y: 160,
      width: 170,
      height: 110,
      fill: '#f97316',
      shadow: {
        color: '#111111',
        blur: 2,
        offsetX: 3,
        offsetY: 4,
        opacity: 0.3,
      },
      zIndex: 0,
    });
    const text = createTextFixture({
      id: 'shared-text',
      name: 'Shared Text',
      x: 430,
      y: 170,
      width: 260,
      height: 96,
      fill: '#ffffff',
      shadow: {
        color: '#222222',
        blur: 7,
        offsetX: 8,
        offsetY: 9,
        opacity: 0.6,
      },
      zIndex: 1,
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([rectangle, text]),
      'properties-shared-cross-kind.json',
    );

    await clickCanvas(page, { x: 225, y: 215 });
    await page.keyboard.down('Shift');
    await clickCanvas(page, { x: 510, y: 220 });
    await page.keyboard.up('Shift');
    await openPropertiesTab(page);

    await expect(page.getByRole('heading', { name: '2 items selected' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Geometry' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Shadow' })).toBeVisible();
    await expect(page.getByLabel('Fill', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Stroke width')).toHaveCount(0);
    await expect(page.getByLabel('Font')).toHaveCount(0);

    await page.getByRole('button', { name: 'Geometry' }).click();
    await expect(page.getByRole('spinbutton', { name: 'X' })).toBeVisible();
    await page.getByRole('button', { name: 'Shadow' }).click();
    await expect(page.getByRole('spinbutton', { name: 'Blur' })).toBeVisible();

    await page.getByLabel('Fill', { exact: true }).click();
    await page.getByLabel('Fill hex').fill('#33669980');
    await page.getByLabel('Fill hex').press('Enter');
    await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('280');
    await page.getByRole('spinbutton', { name: 'Blur' }).fill('12');

    const savedProject = await saveAndReadProject(page);
    expect(savedProject.nodes).toEqual([
      expect.objectContaining({
        id: 'shared-rect',
        fill: '#33669980',
        x: 280,
        shadow: expect.objectContaining({
          color: '#111111',
          blur: 12,
          offsetX: 3,
          offsetY: 4,
          opacity: 0.3,
        }),
      }),
      expect.objectContaining({
        id: 'shared-text',
        fill: '#33669980',
        x: 280,
        shadow: expect.objectContaining({
          color: '#222222',
          blur: 12,
          offsetX: 8,
          offsetY: 9,
          opacity: 0.6,
        }),
      }),
    ]);
  });

  test('PI-06 PI-10 PI-11 edits text content, font, advanced text, geometry, and shadow through the Properties panel', async ({
    page,
  }) => {
    const text = createTextFixture({
      id: 'properties-text',
      name: 'Properties Text',
      x: 180,
      y: 180,
      width: 320,
      height: 96,
      text: 'Original text',
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([text]), 'properties-text.json');
    await clickCanvas(page, { x: 260, y: 220 });
    await openPropertiesTab(page);

    await page.getByLabel('Text content').fill('Edited text from Properties');
    await page.getByRole('spinbutton', { name: 'Size' }).fill('1');
    await page.getByTestId('font-family-picker-trigger').click();
    await page.getByRole('option', { name: 'Georgia', exact: true }).click();
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Georgia');
    await page.getByRole('button', { name: 'Bold' }).click();
    await page.getByRole('button', { name: 'Align center' }).click();
    await page.getByRole('button', { name: 'Align middle' }).click();

    await page.getByRole('button', { name: 'Advanced text' }).click();
    await page.getByRole('spinbutton', { name: 'Line height' }).fill('1.4');
    await page.getByRole('spinbutton', { name: 'Character spacing' }).fill('2');
    await page.getByRole('spinbutton', { name: 'Padding top' }).fill('8');

    await page.getByRole('button', { name: /Geometry/ }).click();
    await page.getByRole('spinbutton', { name: 'X' }).fill('260');
    await page.getByRole('spinbutton', { name: 'Rotation' }).fill('18');
    await page.getByRole('button', { name: /Geometry/ }).click();
    await expect(page.getByRole('spinbutton', { name: 'X' })).toBeHidden();
    await page.getByRole('button', { name: /Geometry/ }).click();
    await expect(page.getByRole('spinbutton', { name: 'X' })).toBeVisible();

    await page.getByRole('button', { name: 'Shadow' }).click();
    await page.getByRole('button', { name: 'Shadow color' }).click();
    await page.getByLabel('Shadow color hex').fill('#33669980');
    await page.getByLabel('Shadow color hex').press('Enter');
    await page.getByRole('spinbutton', { name: 'Blur' }).fill('12');
    await page.getByRole('spinbutton', { name: 'Offset X' }).fill('6');

    const savedProject = await saveAndReadProject(page);
    expect(savedProject.nodes).toEqual([
      expect.objectContaining({
        id: 'properties-text',
        text: 'Edited text from Properties',
        fontSize: 1,
        fontFamily: 'Georgia',
        fontWeight: 'bold',
        align: 'center',
        verticalAlign: 'middle',
        lineHeight: 1.4,
        letterSpacing: 2,
        x: 260,
        rotation: 18,
        padding: expect.objectContaining({ top: 8 }),
        shadow: expect.objectContaining({
          color: '#33669980',
          blur: 12,
          offsetX: 6,
        }),
      }),
    ]);
  });

  test('PI-07 PI-08 PI-09 edits shape, line, and image properties through the Properties panel', async ({
    page,
  }) => {
    const rectangle = createRectangleFixture({
      id: 'properties-rect',
      name: 'Properties Rectangle',
      x: 140,
      y: 140,
      width: 180,
      height: 120,
      zIndex: 0,
    });
    const line = createLineFixture({
      id: 'properties-line',
      name: 'Properties Line',
      x: 140,
      y: 520,
      startX: 140,
      startY: 520,
      endX: 420,
      endY: 560,
      width: 280,
      height: 40,
      zIndex: 1,
    });
    const image = createImageFixture({
      id: 'properties-image',
      name: 'Properties Image',
      x: 560,
      y: 180,
      width: 160,
      height: 90,
      zIndex: 2,
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([rectangle, line, image]),
      'properties-shape-line-image.json',
    );

    await clickCanvas(page, { x: 220, y: 200 });
    await openPropertiesTab(page);
    await page.getByLabel('Fill', { exact: true }).click();
    await page.getByLabel('Fill hex').fill('#123456ff');
    await page.getByLabel('Fill hex').press('Enter');
    await page.getByLabel('Stroke', { exact: true }).click();
    await page.getByLabel('Stroke hex').fill('#abcdef80');
    await page.getByLabel('Stroke hex').press('Enter');
    await page.getByRole('spinbutton', { name: 'Stroke width' }).fill('5');
    await page.getByRole('button', { name: 'Geometry' }).click();
    await page.getByRole('spinbutton', { name: 'Corner radius' }).fill('12');
    await page.getByRole('spinbutton', { name: 'Rotation' }).fill('22');
    await page.getByRole('spinbutton', { name: 'Rotation' }).press('Enter');

    await clickCanvas(page, { x: 220, y: 540 });
    await openPropertiesTab(page);
    await page.getByRole('spinbutton', { name: 'Stroke width' }).fill('9');
    await page.getByRole('spinbutton', { name: 'Start X' }).fill('150');
    await page.getByRole('spinbutton', { name: 'End Y' }).fill('590');
    await page.getByRole('spinbutton', { name: 'End Y' }).press('Enter');

    await clickCanvas(page, { x: 620, y: 220 });
    await openPropertiesTab(page);
    await page.getByRole('button', { name: 'Mirror' }).click();
    await expect(page.getByRole('button', { name: 'Mirror' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByLabel('Preserve aspect ratio').uncheck();
    await page.getByRole('spinbutton', { name: 'Brightness value' }).fill('120');
    await page.getByRole('spinbutton', { name: 'Contrast value' }).fill('70');
    await page.getByRole('spinbutton', { name: 'Tint strength value' }).fill('25');
    await page.getByRole('button', { name: 'Tint color', exact: true }).click();
    await page.getByLabel('Tint color hex').fill('#ff0000ff');
    await page.getByLabel('Tint color hex').press('Enter');

    const savedProject = await saveAndReadProject(page);
    expect(savedProject.nodes).toEqual([
      expect.objectContaining({
        id: 'properties-rect',
        fill: '#123456ff',
        stroke: '#abcdef80',
        strokeWidth: 5,
        cornerRadius: 12,
        rotation: 22,
      }),
      expect.objectContaining({
        id: 'properties-line',
        strokeWidth: 9,
        startX: 150,
        endY: 590,
      }),
      expect.objectContaining({
        id: 'properties-image',
        mirrorHorizontal: true,
        preserveAspectRatio: false,
        adjustments: expect.objectContaining({
          brightness: 120,
          contrast: 70,
          tintStrength: 25,
          tintColor: '#ff0000',
        }),
      }),
    ]);
  });

  test('PI-12 edits blur radius through the Properties panel and persists the value', async ({
    page,
  }) => {
    const rectangle = createRectangleFixture({
      id: 'blur-rect',
      name: 'Blur Rectangle',
      x: 180,
      y: 180,
      width: 200,
      height: 140,
      zIndex: 0,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rectangle]), 'properties-blur.json');
    await clickCanvas(page, { x: 280, y: 250 });
    await openPropertiesTab(page);

    await page.getByRole('button', { name: 'Blur' }).click();
    await page.getByRole('spinbutton', { name: 'Blur radius' }).fill('10');

    const savedProject = await saveAndReadProject(page);
    expect(savedProject.nodes).toEqual([
      expect.objectContaining({
        id: 'blur-rect',
        blurRadius: 10,
      }),
    ]);
  });

  test('edits rectangle and text gradient properties through the Properties panel', async ({
    page,
  }) => {
    const rectangle = createRectangleFixture({
      id: 'gradient-rect',
      name: 'Gradient Rectangle',
      x: 160,
      y: 160,
      width: 220,
      height: 160,
      fill: '#ff0000ff',
    });
    const text = createTextFixture({
      id: 'gradient-text',
      name: 'Gradient Text',
      x: 460,
      y: 180,
      width: 280,
      height: 120,
      text: 'Gradient headline',
      fill: '#ffffff',
      padding: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rectangle, text]), 'properties-gradients.json');

    await clickCanvas(page, { x: 270, y: 240 });
    await openPropertiesTab(page);
    let inspector = page.getByTestId('properties-tab-body');
    await expect(inspector.getByLabel('Secondary fill')).toBeDisabled();
    await inspector
      .locator('.inspector-field-shell:has-text("Gradient") input[aria-label="Gradient"]')
      .evaluate((node: HTMLInputElement) => node.click());
    await expect(inspector.getByLabel('Secondary fill')).toBeEnabled();
    await inspector.getByRole('button', { name: 'Secondary fill', exact: true }).click();
    await page.getByLabel('Secondary fill hex').fill('#00ff00ff');
    await page.getByLabel('Secondary fill hex').press('Enter');

    await clickCanvas(page, { x: 580, y: 220 });
    await openPropertiesTab(page);
    inspector = page.getByTestId('properties-tab-body');
    await inspector
      .locator('.inspector-field-shell:has-text("Gradient") input[aria-label="Gradient"]')
      .evaluate((node: HTMLInputElement) => node.click());
    await inspector.getByRole('button', { name: 'Secondary fill', exact: true }).click();
    await page.getByLabel('Secondary fill hex').fill('#ff00ffff');
    await page.getByLabel('Secondary fill hex').press('Enter');
    await inspector.getByRole('button', { name: 'Advanced text' }).click();
    await inspector.getByRole('spinbutton', { name: 'Padding top' }).fill('18');

    const savedProject = await saveAndReadProject(page);
    expect(savedProject.nodes).toEqual([
      expect.objectContaining({
        id: 'gradient-rect',
        gradientEnabled: true,
        fill: '#ff0000ff',
        secondaryFill: '#00ff00ff',
      }),
      expect.objectContaining({
        id: 'gradient-text',
        gradientEnabled: true,
        fill: '#ffffff',
        secondaryFill: '#ff00ffff',
        padding: expect.objectContaining({
          top: 18,
        }),
      }),
    ]);
  });

  test('numeric properties render slider+input combos', async ({ page }) => {
    const rectangle = createRectangleFixture({
      id: 'slider-rect',
      name: 'Slider Rectangle',
      x: 140,
      y: 160,
      width: 180,
      height: 120,
      zIndex: 0,
    });
    const text = createTextFixture({
      id: 'slider-text',
      name: 'Slider Text',
      x: 420,
      y: 160,
      width: 280,
      height: 96,
      zIndex: 1,
    });
    const image = createImageFixture({
      id: 'slider-image',
      name: 'Slider Image',
      x: 140,
      y: 380,
      width: 160,
      height: 90,
      zIndex: 2,
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([rectangle, text, image]),
      'properties-sliders.json',
    );

    const inspector = page.getByTestId('properties-tab-body');

    // Rectangle: stroke width, corner radius, rotation, blur radius, shadow fields
    await clickCanvas(page, { x: 230, y: 220 });
    await openPropertiesTab(page);
    await expect(inspector.getByText('Slider Rectangle')).toBeVisible();
    await expectSliders(page, 'Stroke', ['Stroke width']);
    await expectSliders(page, 'Geometry', ['Rotation', 'Corner radius']);
    await expectSliders(page, 'Blur', ['Blur radius']);
    await expectSliders(page, 'Shadow', ['Blur', 'Opacity', 'Offset X', 'Offset Y']);

    // Text: font size, line height, character spacing, rotation
    await clickCanvas(page, { x: 560, y: 208 });
    await openPropertiesTab(page);
    await expect(inspector.getByText('Slider Text')).toBeVisible();
    await expectSliders(page, 'Text', ['Size']);
    await expectSliders(page, 'Advanced text', ['Line height', 'Character spacing']);
    await expectSliders(page, 'Geometry', ['Rotation']);

    // Image: opacity, rotation
    await clickCanvas(page, { x: 220, y: 420 });
    await openPropertiesTab(page);
    await expect(inspector.getByText('Slider Image')).toBeVisible();
    await expectSliders(page, 'Image', ['Opacity']);
    await expectSliders(page, 'Geometry', ['Rotation']);
  });
});
