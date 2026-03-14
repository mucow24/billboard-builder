import { EditorPage } from './helpers/editorPage';
import { expect, test } from './helpers/test';

test('@p0 handles undo, redo, delete, and redo-stack reset flows', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();

  await editor.createItem('Rect');
  await editor.createItem('Text');
  await expect(editor.layerRows).toHaveCount(2);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(editor.layerRows).toHaveCount(1);

  await page.keyboard.press('Control+Shift+Z');
  await expect(editor.layerRows).toHaveCount(2);

  await page.keyboard.press('Control+Z');
  await expect(editor.layerRows).toHaveCount(1);

  await editor.createItem('Ellipse');
  await expect(editor.layerRows).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();

  await page.locator('.layer-row', { hasText: 'Ellipse' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(editor.layerRows).toHaveCount(1);

  await page.locator('.layer-row', { hasText: 'Rectangle' }).click();
  await page.keyboard.press('Delete');
  await expect(editor.layerRows).toHaveCount(0);
});

test('@p1 ignores destructive hotkeys while text inputs are focused', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();

  await editor.createItem('Text');
  await expect(editor.layerRows).toHaveCount(1);

  const textarea = page.getByLabel('Text content');
  await textarea.click();
  await page.keyboard.press('Backspace');

  await expect(editor.layerRows).toHaveCount(1);
  await expect(textarea).toBeVisible();
});

test('@p1 handles clipboard and z-order keyboard shortcuts', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();

  await editor.createItem('Rect');
  await editor.createItem('Text');
  await expect(editor.layerRows).toHaveCount(2);

  await page.keyboard.press('Control+D');
  await expect(editor.layerRows).toHaveCount(3);

  await page.keyboard.press('Control+X');
  await expect(editor.layerRows).toHaveCount(2);

  await page.keyboard.press('Control+V');
  await expect(editor.layerRows).toHaveCount(3);

  await page.locator('.layer-row', { hasText: 'Rectangle' }).last().click();
  await page.keyboard.press('Control+Shift+ArrowUp');
  await expect(editor.layerRows.first()).toContainText('Rectangle');

  await page.keyboard.press('Control+Shift+ArrowDown');
  await expect(editor.layerRows.last()).toContainText('Rectangle');
});
