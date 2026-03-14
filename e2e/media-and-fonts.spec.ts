import { EditorPage } from './helpers/editorPage';
import {
  createInvalidFontBuffer,
  createInvalidImageBuffer,
  createPngBuffer,
} from './helpers/fixtures';
import { expect, test } from './helpers/test';

const FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

test('@p1 reopens uploaded-font projects with a missing-font warning and keeps editing', async ({
  page,
}) => {
  const editor = new EditorPage(page);
  await editor.goto();

  await editor.uploadFont(FONT_PATH);
  await editor.createItem('Text');
  await page.getByLabel('Font family').selectOption('DejaVuSans');

  const projectDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save' }).click();
  const downloadedProject = await projectDownload;
  const projectPath = await downloadedProject.path();
  if (!projectPath) {
    throw new Error('Project download path was not available');
  }

  await page.reload();
  await editor.openProject(projectPath);

  await expect(page.getByText('Missing fonts')).toBeVisible();
  await expect(page.locator('.warning p')).toContainText('DejaVuSans');

  const textContent = page.getByLabel('Text content');
  await textContent.fill('Still editable');
  await expect(textContent).toHaveValue('Still editable');
});

test('@p1 surfaces visible errors for broken image and font uploads', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();

  await editor.uploadImage({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: createInvalidImageBuffer(),
  });
  await expect(page.getByRole('alert')).toContainText('Failed to import image');

  await editor.uploadFont({
    name: 'broken-font.ttf',
    mimeType: 'font/ttf',
    buffer: createInvalidFontBuffer(),
  });
  await expect(page.getByRole('alert')).toContainText('Failed to register font');

  await editor.uploadImage({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: createPngBuffer(),
  });
  await expect(editor.layerRows).toHaveCount(1);
});
