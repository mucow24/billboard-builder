import { expect, test } from '@playwright/test';

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
    await page.getByRole('spinbutton', { name: 'Opacity' }).fill('0.4');

    const savedProject = await saveAndReadProject(page);
    expect(savedProject.nodes).toEqual([
      expect.objectContaining({ id: 'multi-opacity-first', opacity: 0.4 }),
      expect.objectContaining({ id: 'multi-opacity-second', opacity: 0.4 }),
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
    await expect(page.getByRole('button', { name: 'Color' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Geometry' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Shadow' })).toBeVisible();
    await expect(page.getByLabel('Fill')).toBeVisible();
    await expect(page.getByLabel('Stroke width')).toHaveCount(0);
    await expect(page.getByLabel('Font')).toHaveCount(0);

    await page.getByRole('button', { name: 'Geometry' }).click();
    await expect(page.getByRole('spinbutton', { name: 'X' })).toBeVisible();
    await page.getByRole('button', { name: 'Shadow' }).click();
    await expect(page.getByRole('spinbutton', { name: 'Blur' })).toBeVisible();

    await page.getByRole('button', { name: 'Fill' }).click();
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
    await page.getByRole('button', { name: 'Fill' }).click();
    await page.getByLabel('Fill hex').fill('#123456ff');
    await page.getByLabel('Fill hex').press('Enter');
    await page.getByRole('button', { name: 'Stroke' }).click();
    await page.getByLabel('Stroke hex').fill('#abcdef80');
    await page.getByLabel('Stroke hex').press('Enter');
    await page.getByRole('spinbutton', { name: 'Stroke width' }).fill('5');
    await page.getByRole('spinbutton', { name: 'Corner radius' }).fill('12');
    await page.getByRole('spinbutton', { name: 'Rotation' }).fill('22');

    await clickCanvas(page, { x: 220, y: 540 });
    await openPropertiesTab(page);
    await page.getByRole('spinbutton', { name: 'Stroke width' }).fill('9');
    await page.getByRole('button', { name: /Geometry/ }).click();
    await page.getByRole('spinbutton', { name: 'Start X' }).fill('150');
    await page.getByRole('spinbutton', { name: 'End Y' }).fill('590');

    await clickCanvas(page, { x: 620, y: 220 });
    await openPropertiesTab(page);
    await page.getByLabel('Preserve aspect ratio').uncheck();
    await page.getByRole('spinbutton', { name: 'Brightness value' }).fill('120');
    await page.getByRole('spinbutton', { name: 'Contrast value' }).fill('70');
    await page.getByRole('spinbutton', { name: 'Tint strength value' }).fill('25');
    await page.getByRole('button', { name: 'Tint color' }).click();
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
});
