import { EditorPage } from './helpers/editorPage';
import { expect, test } from './helpers/test';

test.describe('@p1 layout smoke at desktop width', () => {
  test.use({
    viewport: {
      width: 1280,
      height: 1000,
    },
  });

  test('keeps the primary controls reachable', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rect' })).toBeVisible();
    await expect(editor.stage).toBeVisible();
    await expect(page.getByText('No selection')).toBeVisible();
  });
});

test.describe('@p1 layout smoke at tablet width', () => {
  test.use({
    viewport: {
      width: 768,
      height: 1100,
    },
  });

  test('keeps toolbar, palette, canvas, and properties reachable', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();

    await expect(page.getByRole('button', { name: 'Export PNG' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rect' })).toBeVisible();
    await expect(editor.stage).toBeVisible();
    await expect(page.getByText('No selection')).toBeVisible();
  });
});
