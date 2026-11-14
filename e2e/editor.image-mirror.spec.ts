import { expect, test, type Page } from '@playwright/test';

import {
  clickItem,
  createImageFixture,
  createProjectDocument,
  exportPngPixels,
  openFreshEditor,
  openPropertiesTab,
  readStageDebug,
  uploadProject,
} from './support/editor';

type Ink = 'cyan' | 'orange' | 'other';

/** Export > PNG and name the colour at each canvas point. */
async function exportAndSample(
  page: Page,
  points: Array<{ x: number; y: number }>,
): Promise<Ink[]> {
  return (await exportPngPixels(page, points)).map(({ r, g, b }) => {
    // The fixture's circle is #22d3ee, its rounded rectangle #f97316.
    if (r < 90 && g > 170 && b > 190) return 'cyan';
    if (r > 200 && g > 70 && g < 160 && b < 80) return 'orange';
    return 'other';
  });
}

test.describe('Image mirror', () => {
  // Pixi's width setter keeps the sign the sprite's scale already has. The
  // mirror used to be drawn with a negative sprite width, so un-mirroring left
  // the sprite flipped and moved it outside its clip mask: the image vanished,
  // and came and went on further clicks.
  test('flips the image back and forth on repeated clicks', async ({ page }) => {
    // 160x90 at (520, 320): a cyan circle on the left, an orange block on the right.
    const image = createImageFixture({ id: 'mirror-image' });

    await openFreshEditor(page);
    await uploadProject(
      page,
      { ...createProjectDocument([image]), background: '#ffffffff' },
      'image-mirror.json',
    );
    await expect.poll(async () => (await readStageDebug(page)).renderedItemCount).toBe(1);

    // The circle's centre, and the same distance in from the opposite edge,
    // which falls inside the orange block.
    const points = [
      { x: 520 + 45, y: 320 + 45 },
      { x: 520 + 160 - 45, y: 320 + 45 },
    ];
    const plain: Ink[] = ['cyan', 'orange'];
    const mirrored: Ink[] = ['orange', 'cyan'];

    expect(await exportAndSample(page, points)).toEqual(plain);

    await clickItem(page, 'mirror-image');
    await openPropertiesTab(page);
    const mirrorButton = page.getByRole('button', { name: 'Mirror' });

    for (const [click, expected] of [mirrored, plain, mirrored, plain].entries()) {
      await test.step(`click ${click + 1}`, async () => {
        await mirrorButton.click();
        await expect(mirrorButton).toHaveAttribute(
          'aria-pressed',
          expected === mirrored ? 'true' : 'false',
        );
        expect(await exportAndSample(page, points)).toEqual(expected);
      });
    }
  });
});
