import { expect, test, type Page } from '@playwright/test';

import {
  createProjectDocument,
  createTextFixture,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  uploadProject,
  waitForBundledFonts,
  waitForEditor,
} from './support/editor';
import { mockGoogleFonts, type GoogleFontFixture } from './support/googleFonts';
import {
  expectPersistedCanvasFontFiles,
  expectPersistedCanvasToReferenceFontFamily,
  expectStoredUploadedFontFiles,
} from './support/persistence';

// The stand-in Google Fonts. Each style of the family under test is served as
// a different bundled file, so a mix-up between styles shows.
const GOOGLE_FONTS: GoogleFontFixture[] = [
  {
    family: 'Testfont Display',
    category: 'display',
    files: { regular: 'Righteous-Regular.ttf' },
  },
  {
    family: 'Testfont Grotesk',
    category: 'sans-serif',
    files: {
      '300': 'Barlow-Light.ttf',
      regular: 'Barlow-Regular.ttf',
      italic: 'Barlow-Italic.ttf',
      '700': 'Barlow-Bold.ttf',
      '900': 'Barlow-Black.ttf',
    },
  },
  {
    family: 'Other Sans',
    category: 'sans-serif',
    files: { regular: 'Aldrich-Regular.ttf' },
  },
];

const trigger = (page: Page) => page.getByTestId('font-family-picker-trigger');
const menu = (page: Page) => page.getByTestId('font-family-picker-listbox');
const submenu = (page: Page) => page.getByTestId('font-family-picker-submenu');

async function openEditorWithSelectedText(page: Page) {
  await openFreshEditor(page);
  await uploadProject(page, createProjectDocument([createTextFixture({ id: 'font-menu-text' })]));
  await selectTextLayer(page);
}

async function selectTextLayer(page: Page) {
  await openLayersTab(page);
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await openPropertiesTab(page);
}

/** How wide the browser draws a sample in `family`: it differs between the font files used here. */
async function measureSample(page: Page, family: string) {
  return page.evaluate((fontFamily) => {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) {
      throw new Error('2D canvas is unavailable.');
    }
    context.font = `48px "${fontFamily}"`;
    return context.measureText('Hamburgefonstiv 0123').width;
  }, family);
}

test.describe('font menu', () => {
  test('gathers the weights of a bundled typeface under one row with a submenu', async ({ page }) => {
    await openEditorWithSelectedText(page);
    await waitForBundledFonts(page);

    await trigger(page).click();

    // One row for the family, and none for its weights.
    const family = menu(page).getByRole('option', { name: 'Barlow', exact: true });
    await expect(family).toHaveAttribute('aria-expanded', 'false');
    await expect(menu(page).getByRole('option', { name: /^Barlow / })).toHaveCount(0);
    await expect(submenu(page)).toHaveCount(0);

    await family.scrollIntoViewIfNeeded();
    await family.hover();

    await expect(submenu(page).getByRole('option')).toHaveText([
      'Thin',
      'Extra Light',
      'Light',
      'Regular',
      'Medium',
      'Semibold',
      'Extrabold',
      'Black',
    ]);
    // The submenu is beside the menu, to its left, and wholly on the page.
    const menuBox = await page.locator('.font-family-picker-popover').boundingBox();
    const submenuBox = await submenu(page).boundingBox();
    const viewport = page.viewportSize();
    expect(menuBox && submenuBox && viewport).toBeTruthy();
    expect(submenuBox!.x + submenuBox!.width).toBeLessThanOrEqual(menuBox!.x);
    expect(submenuBox!.y).toBeGreaterThanOrEqual(0);
    expect(submenuBox!.y + submenuBox!.height).toBeLessThanOrEqual(viewport!.height);
    // Each weight is shown in its own face.
    await expect(submenu(page).getByRole('option', { name: 'Barlow Black' })).toHaveCSS(
      'font-family',
      /^"Barlow Black"/,
    );

    await submenu(page).getByRole('option', { name: 'Barlow Thin' }).click();

    await expect(trigger(page)).toHaveText('Barlow Thin');
    await expect(menu(page)).toHaveCount(0);
    await expect(submenu(page)).toHaveCount(0);
    await expectPersistedCanvasToReferenceFontFamily(page, 'Barlow Thin', ['Barlow Thin']);

    // Reopened, the menu is on the family, and its submenu on the weight in use.
    await trigger(page).click();
    await expect(family).toHaveAttribute('aria-selected', 'true');
    await expect(family).toBeInViewport();
    await page.keyboard.press('ArrowLeft');
    await expect(submenu(page).getByRole('option', { name: 'Barlow Thin' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(trigger(page)).toHaveText('Barlow Extra Light');
  });

  test('steps through the weights one by one with the arrow buttons', async ({ page }) => {
    await openEditorWithSelectedText(page);
    await waitForBundledFonts(page);
    await trigger(page).click();
    await menu(page).getByRole('option', { name: 'Barlow', exact: true }).click();
    await submenu(page).getByRole('option', { name: 'Barlow Regular' }).click();
    await expect(trigger(page)).toHaveText('Barlow');

    // The flat list is in name order, as before the menu had families.
    const next = page.getByRole('button', { name: 'Next font' });
    for (const family of ['Barlow Black', 'Barlow Extra Light', 'Barlow Extrabold', 'Barlow Light']) {
      await next.click();
      await expect(trigger(page)).toHaveText(family);
    }
    await page.getByRole('button', { name: 'Previous font' }).click();
    await expect(trigger(page)).toHaveText('Barlow Extrabold');
  });

  test('imports a family from Google Fonts into the menu', async ({ page }) => {
    const google = await mockGoogleFonts(page, GOOGLE_FONTS);
    await openEditorWithSelectedText(page);
    await waitForBundledFonts(page);

    await trigger(page).click();
    await expect(page.getByRole('button', { name: 'Import font from file…' })).toBeVisible();
    // Nothing is asked of Google before its dialog is opened.
    expect(google.requests).toEqual([]);
    await page.getByRole('button', { name: 'Import font from Google…' }).click();

    const dialog = page.getByRole('dialog', { name: 'Import font from Google' });
    const nameBox = dialog.getByRole('combobox', { name: 'Font name' });
    await expect(nameBox).toBeFocused();
    await expect(menu(page)).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Add font' })).toBeDisabled();

    // The matches are listed while typing, each in its own typeface.
    await nameBox.pressSequentially('testf');
    const suggestions = dialog.getByRole('option');
    await expect(suggestions.locator('.google-font-suggestion-name')).toHaveText([
      'Testfont Display',
      'Testfont Grotesk',
    ]);
    await expect(suggestions.nth(0)).toContainText('Display');
    await expect(suggestions.nth(1)).toContainText('Sans serif · 5 styles');
    for (const [index, fileFamily] of [
      [0, 'Righteous'],
      [1, 'Barlow'],
    ] as const) {
      const name = suggestions.nth(index).locator('.google-font-suggestion-name');
      await expect(suggestions.nth(index)).toHaveAttribute('data-preview-ready', 'true');
      await expect(name).toHaveCSS('font-family', /^"gf-preview-name:Testfont /);
      // The name is drawn with the family's own file: as wide as in the bundled font it stands in for.
      const previewFamily = `gf-preview-name:${await name.textContent()}`;
      expect(await measureSample(page, previewFamily)).toBe(await measureSample(page, fileFamily));
    }

    // Picking a family shows a line in each of its styles.
    await nameBox.press('ArrowDown');
    await nameBox.press('Enter');
    await expect(nameBox).toHaveValue('Testfont Grotesk');
    await expect(suggestions).toHaveCount(0);
    const specimen = dialog.getByTestId('google-font-specimen');
    await expect(specimen).toHaveAttribute('data-preview-ready', 'true');
    await expect(specimen.locator('.google-font-specimen-label')).toHaveText([
      'Light',
      'Regular',
      'Italic',
      'Bold',
      'Black',
    ]);
    const blackSample = specimen
      .locator('label')
      .filter({ has: page.locator('.google-font-specimen-label', { hasText: /^Black$/ }) })
      .locator('.google-font-specimen-sample');
    await expect(blackSample).toHaveCSS('font-weight', '900');
    await expect(blackSample).toHaveCSS('font-family', /^"gf-preview-specimen:Testfont Grotesk"/);

    // A style can be left out.
    await specimen.getByRole('checkbox', { name: /Italic/ }).uncheck();
    await dialog.getByRole('button', { name: 'Add 4 fonts' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    await expectStoredUploadedFontFiles(page, [
      'TestfontGrotesk-Black.ttf',
      'TestfontGrotesk-Bold.ttf',
      'TestfontGrotesk-Light.ttf',
      'TestfontGrotesk-Regular.ttf',
    ]);
    // The previews were for the dialog only.
    expect(
      await page.evaluate(() =>
        [...document.fonts].filter((face) => face.family.includes('gf-preview')).length,
      ),
    ).toBe(0);
    // The key the build was given went to the API, and only there.
    const apiRequests = google.requests.filter((url) => url.includes('www.googleapis.com'));
    expect(apiRequests.length).toBe(2);
    expect(apiRequests.map((url) => new URL(url).searchParams.get('key'))).toEqual([
      'e2e-placeholder-key',
      'e2e-placeholder-key',
    ]);
    expect(
      google.requests.filter(
        (url) => !url.includes('www.googleapis.com') && url.includes('e2e-placeholder-key'),
      ),
    ).toEqual([]);

    // The family is one row of the menu, its weights in the submenu; bold is a
    // face of the regular entry, not a weight of its own.
    await trigger(page).click();
    const family = menu(page).getByRole('option', { name: 'Testfont Grotesk', exact: true });
    await family.scrollIntoViewIfNeeded();
    await family.click();
    await expect(submenu(page).getByRole('option')).toHaveText(['Light', 'Regular', 'Black']);
    await submenu(page).getByRole('option', { name: 'Testfont Grotesk Black' }).click();
    await expect(trigger(page)).toHaveText('Testfont Grotesk Black');

    // Each entry draws with the file of its own style.
    expect(await measureSample(page, 'Testfont Grotesk Black')).toBe(
      await measureSample(page, 'Barlow Black'),
    );
    expect(await measureSample(page, 'Testfont Grotesk Light')).toBe(
      await measureSample(page, 'Barlow Light'),
    );
    expect(await measureSample(page, 'Testfont Grotesk')).toBe(await measureSample(page, 'Barlow'));
    expect(await measureSample(page, 'Testfont Grotesk Black')).not.toBe(
      await measureSample(page, 'Testfont Grotesk'),
    );
    await expectPersistedCanvasFontFiles(page, ['TestfontGrotesk-Black.ttf']);

    // What the canvas uses survives a reload, like any imported font; the
    // styles nothing uses are dropped.
    await page.reload();
    await waitForEditor(page);
    await selectTextLayer(page);
    await expect(page.getByText('Missing fonts')).toHaveCount(0);
    await expect(trigger(page)).toHaveText('Testfont Grotesk Black');
    await expectStoredUploadedFontFiles(page, ['TestfontGrotesk-Black.ttf']);
    await waitForBundledFonts(page);
    expect(await measureSample(page, 'Testfont Grotesk Black')).toBe(
      await measureSample(page, 'Barlow Black'),
    );
  });

  test('says so in the dialog when Google Fonts cannot be reached, and tries again on request', async ({ page }) => {
    let reachable = false;
    await mockGoogleFonts(page, GOOGLE_FONTS);
    // Registered last, so asked first: the list of fonts fails until `reachable`.
    await page.route('https://www.googleapis.com/webfonts/v1/webfonts**', async (route) => {
      if (reachable) {
        await route.fallback();
      } else {
        await route.abort('internetdisconnected');
      }
    });
    await openEditorWithSelectedText(page);

    await trigger(page).click();
    await page.getByRole('button', { name: 'Import font from Google…' }).click();

    const dialog = page.getByRole('dialog', { name: 'Import font from Google' });
    await expect(dialog.getByRole('alert')).toContainText('Could not reach Google Fonts.');

    reachable = true;
    await dialog.getByRole('button', { name: 'Try again' }).click();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await dialog.getByRole('combobox', { name: 'Font name' }).fill('other');
    await expect(dialog.getByRole('option').locator('.google-font-suggestion-name')).toHaveText([
      'Other Sans',
    ]);

    // Escape closes the dialog and leaves the editor as it was.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger(page)).toHaveText('Arial');
  });
});
