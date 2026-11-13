import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  captureDownload,
  clickItem,
  clickToolbarPopoverItem,
  createProjectDocument,
  createRectangleFixture,
  createTextFixture,
  openFreshEditor,
  openLayersTab,
  openLibrary,
  readDownloadedJson,
  unsavedChangesPrompt,
  uploadProject,
  waitForEditor,
  waitForLibraryIdle,
} from './support/editor';
import { readPersistedCanvasDocument } from './support/persistence';

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

function namedDocument(name: string, items: Array<Record<string, unknown>>) {
  return { ...createProjectDocument(items), name };
}

function unsavedDot(page: Page) {
  return page.getByTestId('canvas-unsaved-indicator');
}

function layerRows(page: Page) {
  return page.locator('.layer-row');
}

/** Opens the Canvas menu, checks whether Save and Revert are available, and closes it again. */
async function expectSaveAndRevert(page: Page, expected: { save: boolean; revert: boolean }) {
  await page.getByRole('button', { name: 'Canvas', exact: true }).click();
  const menu = page.getByRole('group', { name: 'Canvas actions' });
  const save = menu.getByRole('button', { name: 'Save', exact: true });
  const revert = menu.getByRole('button', { name: 'Revert', exact: true });
  await (expected.save ? expect(save).toBeEnabled() : expect(save).toBeDisabled());
  await (expected.revert ? expect(revert).toBeEnabled() : expect(revert).toBeDisabled());
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
}

function libraryCards(dialog: Locator) {
  return dialog.getByTestId('library-card');
}

async function libraryNames(dialog: Locator) {
  return dialog.locator('.library-card-name').allTextContents();
}

async function closeLibrary(page: Page) {
  await page.getByRole('button', { name: 'Close library' }).click();
  await expect(page.getByRole('dialog', { name: 'Library' })).toHaveCount(0);
}

/** Waits until the autosaved working copy holds this many top-level items. */
async function expectAutosavedItemCount(page: Page, count: number) {
  await expect
    .poll(async () => {
      const persisted = await readPersistedCanvasDocument(page);
      return Array.isArray(persisted?.nodes) ? persisted.nodes.length : null;
    })
    .toBe(count);
}

/** Picks Canvas > New and leaves the unsaved-changes question, if it comes up, unanswered. */
async function pickNewCanvas(page: Page) {
  await page.getByRole('button', { name: 'Canvas', exact: true }).click();
  await page
    .getByRole('group', { name: 'Canvas actions' })
    .getByRole('button', { name: 'New', exact: true })
    .click();
}

/** Leaves two saved canvases in the library, "Alpha" and "Beta", with "Beta" open. */
async function openEditorWithAlphaAndBeta(page: Page) {
  await openFreshEditor(page);
  await uploadProject(
    page,
    namedDocument('Alpha', [createRectangleFixture({ id: 'alpha-rect' })]),
    'alpha.json',
  );
  await clickToolbarPopoverItem(page, 'Canvas', 'Save');
  await clickToolbarPopoverItem(page, 'Canvas', 'New');
  await uploadProject(
    page,
    namedDocument('Beta', [
      createRectangleFixture({ id: 'beta-rect' }),
      createTextFixture({ id: 'beta-text', text: 'Beta' }),
    ]),
    'beta.json',
  );
  await clickToolbarPopoverItem(page, 'Canvas', 'Save');
  await expect(unsavedDot(page)).toHaveCount(0);
}

test.describe('document library', () => {
  test('LIB-01 tracks unsaved changes: the dot, Save and Revert', async ({ page }) => {
    await openFreshEditor(page);

    // A blank canvas that was never saved has nothing to save.
    await expect(unsavedDot(page)).toHaveCount(0);
    await expectSaveAndRevert(page, { save: false, revert: false });

    await uploadProject(
      page,
      namedDocument('Poster', [
        createRectangleFixture({ id: 'poster-rect' }),
        createTextFixture({ id: 'poster-text', text: 'Poster' }),
      ]),
      'poster.json',
    );
    await openLayersTab(page);
    await expect(layerRows(page)).toHaveCount(2);

    // Not in the library yet: there is something to save, nothing to revert to.
    await expect(unsavedDot(page)).toBeVisible();
    await expectSaveAndRevert(page, { save: true, revert: false });

    await clickToolbarPopoverItem(page, 'Canvas', 'Save');
    await expect(unsavedDot(page)).toHaveCount(0);
    await expectSaveAndRevert(page, { save: false, revert: false });

    await clickItem(page, 'poster-rect');
    await page.keyboard.press('Delete');
    await expect(layerRows(page)).toHaveCount(1);
    await expect(unsavedDot(page)).toBeVisible();
    await expectSaveAndRevert(page, { save: true, revert: true });

    // Undoing back to the saved version leaves nothing unsaved.
    await page.keyboard.press(`${modifier}+Z`);
    await expect(layerRows(page)).toHaveCount(2);
    await expect(unsavedDot(page)).toHaveCount(0);
    await page.keyboard.press(`${modifier}+Shift+Z`);
    await expect(unsavedDot(page)).toBeVisible();

    await clickToolbarPopoverItem(page, 'Canvas', 'Revert');
    await expect(layerRows(page)).toHaveCount(2);
    await expect(unsavedDot(page)).toHaveCount(0);

    // Revert is one undoable step.
    await page.keyboard.press(`${modifier}+Z`);
    await expect(layerRows(page)).toHaveCount(1);
    await expect(unsavedDot(page)).toBeVisible();
  });

  test('LIB-02 keeps unsaved changes, and the saved version to revert to, across a reload', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      namedDocument('Poster', [
        createRectangleFixture({ id: 'poster-rect' }),
        createTextFixture({ id: 'poster-text', text: 'Poster' }),
      ]),
      'poster.json',
    );
    await clickToolbarPopoverItem(page, 'Canvas', 'Save');
    await expect(unsavedDot(page)).toHaveCount(0);

    // A saved canvas comes back from a reload with nothing unsaved.
    await page.reload();
    await waitForEditor(page);
    await openLayersTab(page);
    await expect(layerRows(page)).toHaveCount(2);
    await expect(unsavedDot(page)).toHaveCount(0);
    await expectSaveAndRevert(page, { save: false, revert: false });

    await clickItem(page, 'poster-text');
    await page.keyboard.press('Delete');
    await expect(unsavedDot(page)).toBeVisible();
    await expectAutosavedItemCount(page, 1);

    // The working copy survives with its unsaved change, still marked as such.
    await page.reload();
    await waitForEditor(page);
    await openLayersTab(page);
    await expect(layerRows(page)).toHaveCount(1);
    await expect(unsavedDot(page)).toBeVisible();

    await clickToolbarPopoverItem(page, 'Canvas', 'Revert');
    await expect(layerRows(page)).toHaveCount(2);
    await expect(unsavedDot(page)).toHaveCount(0);
  });

  test('LIB-03 saves with the keyboard shortcut', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      namedDocument('Poster', [createRectangleFixture({ id: 'poster-rect' })]),
      'poster.json',
    );
    await expect(unsavedDot(page)).toBeVisible();

    await page.keyboard.press(`${modifier}+S`);
    await waitForLibraryIdle(page);

    await expect(unsavedDot(page)).toHaveCount(0);
    const dialog = await openLibrary(page);
    expect(await libraryNames(dialog)).toEqual(['Poster']);
  });

  test('LIB-04 asks before replacing a canvas with unsaved changes, and Save puts it in the library', async ({ page }) => {
    await openFreshEditor(page);

    // Leaving a blank canvas asks nothing and puts nothing in the library.
    await pickNewCanvas(page);
    await expect(page.locator('.app-shell')).toHaveAttribute('data-library-busy', 'false');
    await expect(unsavedChangesPrompt(page)).toHaveCount(0);
    let dialog = await openLibrary(page);
    await expect(dialog.getByText('Nothing saved yet')).toBeVisible();
    await closeLibrary(page);

    await uploadProject(
      page,
      namedDocument('Alpha', [createRectangleFixture({ id: 'alpha-rect' })]),
      'alpha.json',
    );
    await expect(unsavedDot(page)).toBeVisible();

    // New asks about "Alpha"; Save puts it in the library on the way out.
    await clickToolbarPopoverItem(page, 'Canvas', 'New', 'Save');
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Untitled canvas');
    await expect(unsavedDot(page)).toHaveCount(0);
    await openLayersTab(page);
    await expect(layerRows(page)).toHaveCount(0);

    await uploadProject(
      page,
      namedDocument('Beta', [
        createRectangleFixture({ id: 'beta-rect' }),
        createTextFixture({ id: 'beta-text', text: 'Beta' }),
      ]),
      'beta.json',
    );

    // "Beta" is open and not saved yet, so only "Alpha" is listed.
    dialog = await openLibrary(page);
    expect(await libraryNames(dialog)).toEqual(['Alpha']);

    // Opening "Alpha" asks about "Beta", on top of the library.
    await dialog.getByRole('button', { name: 'Open Alpha' }).click();
    await waitForLibraryIdle(page, 'Save');
    await expect(page.getByRole('dialog', { name: 'Library' })).toHaveCount(0);
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Alpha');
    await expect(layerRows(page)).toHaveCount(1);
    await expect(unsavedDot(page)).toHaveCount(0);

    dialog = await openLibrary(page);
    expect(await libraryNames(dialog)).toEqual(['Beta', 'Alpha']);
    await expect(libraryCards(dialog).filter({ hasText: 'Alpha' }).getByText('Open', { exact: true })).toBeVisible();

    // Nothing is unsaved now, so nothing is asked.
    await dialog.getByRole('button', { name: 'Open Beta' }).click();
    await expect(page.getByRole('dialog', { name: 'Library' })).toHaveCount(0);
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Beta');
    await expect(layerRows(page)).toHaveCount(2);
    await expect(unsavedDot(page)).toHaveCount(0);

    // The library and the open canvas are still there after a reload.
    await page.reload();
    await waitForEditor(page);
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Beta');
    await expect(unsavedDot(page)).toHaveCount(0);
    dialog = await openLibrary(page);
    expect((await libraryNames(dialog)).sort()).toEqual(['Alpha', 'Beta']);
  });

  test('LIB-05 shows a preview of each saved canvas', async ({ page }) => {
    await openFreshEditor(page);
    const document = namedDocument('Red', []);
    // One rectangle over the whole canvas, so the middle of the preview has its colour.
    document.nodes = [
      createRectangleFixture({
        id: 'cover',
        x: 0,
        y: 0,
        width: document.canvas.width,
        height: document.canvas.height,
        fill: '#ff0000',
        secondaryFill: '#ff0000',
      }),
    ];
    await uploadProject(page, document, 'red.json');
    await clickToolbarPopoverItem(page, 'Canvas', 'Save');

    // Previews are not read at startup: after a reload the library fetches
    // them from storage when it opens.
    await page.reload();
    await waitForEditor(page);

    const dialog = await openLibrary(page);
    const preview = dialog.getByRole('button', { name: 'Open Red' }).locator('img');
    await expect(preview).toHaveAttribute('src', /^data:image\/png;base64,/);

    const sample = await preview.evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('No 2d context to read the preview with.');
      }
      context.drawImage(image, 0, 0);
      const [red, green, blue, alpha] = context.getImageData(
        Math.floor(canvas.width / 2),
        Math.floor(canvas.height / 2),
        1,
        1,
      ).data;
      return { width: canvas.width, height: canvas.height, red, green, blue, alpha };
    });

    // Small, and in the proportions of the canvas.
    expect(Math.max(sample.width, sample.height)).toBeLessThanOrEqual(480);
    expect(sample.width / sample.height).toBeCloseTo(document.canvas.width / document.canvas.height, 1);
    expect(sample).toMatchObject({ red: 255, green: 0, blue: 0, alpha: 255 });
  });

  test('LIB-06 renames canvases from the library and from the toolbar, without marking them unsaved', async ({ page }) => {
    await openEditorWithAlphaAndBeta(page);

    // Another canvas, renamed in the library.
    let dialog = await openLibrary(page);
    await dialog.getByRole('button', { name: 'Rename Alpha' }).click();
    const nameField = dialog.getByRole('textbox', { name: 'New name for Alpha' });
    await nameField.fill('Alpha renamed');
    await nameField.press('Enter');
    expect((await libraryNames(dialog)).sort()).toEqual(['Alpha renamed', 'Beta']);

    // The open canvas, renamed in the library: the toolbar follows.
    await dialog.getByRole('button', { name: 'Rename Beta' }).click();
    await dialog.getByRole('textbox', { name: 'New name for Beta' }).fill('Beta renamed');
    await dialog.getByRole('textbox', { name: 'New name for Beta' }).press('Enter');
    await expect(dialog.locator('.library-card-name', { hasText: 'Beta renamed' })).toBeVisible();
    await closeLibrary(page);
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Beta renamed');
    await expect(unsavedDot(page)).toHaveCount(0);

    // The open canvas, renamed in the toolbar: the library follows.
    await page.getByTestId('canvas-name-display').click();
    await page.getByTestId('canvas-name-input').fill('Beta again');
    await page.getByTestId('canvas-name-input').press('Enter');
    await expect(unsavedDot(page)).toHaveCount(0);
    dialog = await openLibrary(page);
    expect((await libraryNames(dialog)).sort()).toEqual(['Alpha renamed', 'Beta again']);

    // Both names are stored: they are still there after a reload.
    await closeLibrary(page);
    await page.reload();
    await waitForEditor(page);
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Beta again');
    dialog = await openLibrary(page);
    expect((await libraryNames(dialog)).sort()).toEqual(['Alpha renamed', 'Beta again']);

    await dialog.getByRole('button', { name: 'Open Alpha renamed' }).click();
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Alpha renamed');
  });

  test('LIB-07 exports a library canvas as JSON, and the open canvas from the Export menu', async ({ page }) => {
    await openEditorWithAlphaAndBeta(page);

    // An unsaved change to the open canvas: only Export > JSON includes it.
    await clickItem(page, 'beta-rect');
    await page.keyboard.press('Delete');
    await expect(unsavedDot(page)).toBeVisible();

    const dialog = await openLibrary(page);
    const alphaDownload = await captureDownload(page, async () => {
      await dialog.getByRole('button', { name: 'Export Alpha as JSON' }).click();
    });
    expect(alphaDownload.suggestedFilename()).toBe('Alpha.json');
    const alpha = await readDownloadedJson(alphaDownload);
    expect(alpha.name).toBe('Alpha');
    expect(alpha.nodes).toEqual([expect.objectContaining({ id: 'alpha-rect' })]);

    const savedBeta = await readDownloadedJson(
      await captureDownload(page, async () => {
        await dialog.getByRole('button', { name: 'Export Beta as JSON' }).click();
      }),
    );
    expect((savedBeta.nodes as unknown[]).length).toBe(2);
    await closeLibrary(page);

    const workingDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'JSON');
    });
    expect(workingDownload.suggestedFilename()).toBe('Beta.json');
    const workingBeta = await readDownloadedJson(workingDownload);
    expect(workingBeta.nodes).toEqual([expect.objectContaining({ id: 'beta-text' })]);
  });

  test('LIB-08 deletes canvases from the library after asking, including the open one', async ({ page }) => {
    await openEditorWithAlphaAndBeta(page);

    let dialog = await openLibrary(page);
    await dialog.getByRole('button', { name: 'Delete Alpha' }).click();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect((await libraryNames(dialog)).sort()).toEqual(['Alpha', 'Beta']);

    await dialog.getByRole('button', { name: 'Delete Alpha' }).click();
    await dialog.getByRole('group', { name: 'Delete Alpha?' }).getByRole('button', { name: 'Delete' }).click();
    await waitForLibraryIdle(page);
    expect(await libraryNames(dialog)).toEqual(['Beta']);

    // Deleting the open canvas leaves a blank one in the editor.
    await dialog.getByRole('button', { name: 'Delete Beta' }).click();
    await dialog.getByRole('group', { name: 'Delete Beta?' }).getByRole('button', { name: 'Delete' }).click();
    await waitForLibraryIdle(page);
    await expect(dialog.getByText('Nothing saved yet')).toBeVisible();
    await closeLibrary(page);
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Untitled canvas');
    await expect(unsavedDot(page)).toHaveCount(0);
    await openLayersTab(page);
    await expect(layerRows(page)).toHaveCount(0);

    // Both stay deleted, and the blank canvas is what comes back.
    await expectAutosavedItemCount(page, 0);
    await page.reload();
    await waitForEditor(page);
    await openLayersTab(page);
    await expect(layerRows(page)).toHaveCount(0);
    dialog = await openLibrary(page);
    await expect(dialog.getByText('Nothing saved yet')).toBeVisible();
  });

  test('LIB-09 keeps editor shortcuts away from the canvas while the library is open', async ({ page }) => {
    await openEditorWithAlphaAndBeta(page);
    await openLayersTab(page);
    await clickItem(page, 'beta-rect');

    await openLibrary(page);
    await page.keyboard.press('Delete');
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press('Backspace');

    // Escape closes the library rather than clearing the selection behind it.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Library' })).toHaveCount(0);
    await expect(layerRows(page)).toHaveCount(2);
    await expect(unsavedDot(page)).toHaveCount(0);

    // With the library closed the shortcut works again.
    await page.keyboard.press('Delete');
    await expect(layerRows(page)).toHaveCount(1);
  });

  test('LIB-10 keeps the canvas on Cancel, and drops unsaved changes on Discard without touching the saved version', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      namedDocument('Alpha', [createRectangleFixture({ id: 'alpha-rect' })]),
      'alpha.json',
    );
    await openLayersTab(page);
    const prompt = unsavedChangesPrompt(page);

    // Never saved: discarding would lose the whole canvas, and the question says so.
    await pickNewCanvas(page);
    await expect(prompt).toContainText('"Alpha" has not been saved to the library');
    await prompt.getByRole('button', { name: 'Cancel' }).click();
    await expect(prompt).toHaveCount(0);
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Alpha');
    await expect(layerRows(page)).toHaveCount(1);
    await expect(unsavedDot(page)).toBeVisible();

    await clickToolbarPopoverItem(page, 'Canvas', 'Save');
    await clickItem(page, 'alpha-rect');
    await page.keyboard.press('Delete');
    await expect(layerRows(page)).toHaveCount(0);

    // Saved before: only the changes are at stake. Escape cancels too.
    await pickNewCanvas(page);
    await expect(prompt).toContainText('"Alpha" has changes that are not in the library');
    await page.keyboard.press('Escape');
    await expect(prompt).toHaveCount(0);
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Alpha');
    await expect(unsavedDot(page)).toBeVisible();

    // Discard: the change is gone, and the library still holds the saved version.
    await uploadProject(
      page,
      namedDocument('Beta', [createRectangleFixture({ id: 'beta-rect' })]),
      'beta.json',
      'Discard',
    );
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Beta');

    // Asked on top of the library; Escape answers the question, not the library.
    let dialog = await openLibrary(page);
    expect(await libraryNames(dialog)).toEqual(['Alpha']);
    await dialog.getByRole('button', { name: 'Open Alpha' }).click();
    await expect(prompt).toContainText('"Beta" has not been saved to the library');
    await page.keyboard.press('Escape');
    await expect(prompt).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Beta');

    // Discarding "Beta" leaves no trace of it; "Alpha" comes back as it was saved.
    await dialog.getByRole('button', { name: 'Open Alpha' }).click();
    await waitForLibraryIdle(page, 'Discard');
    await expect(page.getByRole('dialog', { name: 'Library' })).toHaveCount(0);
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Alpha');
    await expect(layerRows(page)).toHaveCount(1);
    await expect(unsavedDot(page)).toHaveCount(0);
    dialog = await openLibrary(page);
    expect(await libraryNames(dialog)).toEqual(['Alpha']);
  });

  test('LIB-11 says so when part of the library cannot be read, and still lists the rest', async ({ page }) => {
    await openEditorWithAlphaAndBeta(page);

    // An entry the app cannot make sense of, as left behind by a damaged store.
    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('billboard-builder');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('canvas', 'readwrite');
        transaction.objectStore('canvas').put({ id: 'broken' }, 'library-entry:broken');
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
      });
      database.close();
    });
    await page.reload();
    await waitForEditor(page);

    const dialog = await openLibrary(page);
    await expect(dialog.getByRole('alert')).toHaveText(
      'Part of the library could not be read. Some canvases may be missing from this list.',
    );
    expect((await libraryNames(dialog)).sort()).toEqual(['Alpha', 'Beta']);
  });
});
