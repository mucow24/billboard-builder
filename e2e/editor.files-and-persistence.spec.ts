import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  captureDownload,
  clearPersistence,
  clickItem,
  clickToolbarPopoverItem,
  createGroupNodeFixture,
  createGroupedProjectDocument,
  createProjectDocument,
  createRectangleFixture,
  createTextFixture,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  primePersistenceBeforeLoad,
  readDownloadedJson,
  readDownloadedPngSize,
  readStageDebug,
  setCanvasTestHooksEnabled,
  seedPersistence,
  startToolbarFileChooser,
  uploadFont,
  uploadProject,
  uploadSvgImage,
  waitForEditor,
} from './support/editor';
import {
  expectPersistedCanvasToReferenceFontFamily,
  uploadNamedFontFromPath,
} from './support/persistence';

async function countUploadedFontRecords(page: Parameters<typeof test>[0]['page']) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('billboard-builder', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      return await new Promise<number>((resolve, reject) => {
        const transaction = database.transaction('uploaded-fonts', 'readonly');
        const store = transaction.objectStore('uploaded-fonts');
        const request = store.count();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    } finally {
      database.close();
    }
  });
}

async function expectUploadedFontRecordCount(
  page: Parameters<typeof test>[0]['page'],
  expectedCount: number,
) {
  await expect
    .poll(async () => countUploadedFontRecords(page), {
      message: `Expected uploaded font store count to become ${expectedCount}.`,
    })
    .toBe(expectedCount);
}

test.describe('editor file and persistence flows', () => {
  test.describe.configure({ mode: 'serial' });

  test('uploads images and fonts through the real hidden file inputs', async ({ page }) => {
    await openFreshEditor(page);

    await uploadSvgImage(page);
    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Image', exact: true })).toBeVisible();

    await uploadProject(page, createProjectDocument([createTextFixture({ id: 'text-upload' })]), 'text-project.json');
    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);

    const fontPath = path.join(process.cwd(), 'src/assets/fonts/CalSans-Regular.ttf');
    await uploadFont(page, fontPath);
    await page.getByTestId('font-family-picker-trigger').click();
    const uploadedFontOption = page.getByRole('option', { name: 'Cal Sans' }).first();
    await expect(uploadedFontOption).toBeVisible();
    await uploadedFontOption.click();
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Cal Sans');
  });

  test('sizes uploaded SVGs from their viewBox when explicit dimensions are missing', async ({ page }) => {
    await openFreshEditor(page);

    await uploadSvgImage(
      page,
      'viewbox-only.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#22d3ee"/></svg>',
    );

    // Newly added images are auto-selected; sizing must come from the parsed
    // viewBox rather than the browser-dependent natural size.
    await expect
      .poll(async () => {
        const debug = await readStageDebug(page);
        return (debug.selectedItems ?? []).map((item) => ({
          kind: item.kind,
          width: item.width,
          height: item.height,
        }));
      })
      .toEqual([{ kind: 'image', width: 320, height: 180 }]);
  });

  test('reload restores uploaded fonts used by the persisted canvas without showing a missing-font warning', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([createTextFixture({ id: 'persisted-font-text' })]),
      'persisted-font-project.json',
    );
    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);

    const fontPath = path.join(process.cwd(), 'src/assets/fonts/CalSans-Regular.ttf');
    await uploadNamedFontFromPath(page, fontPath, 'Uploaded-Only-Regular.ttf');
    await page.getByTestId('font-family-picker-trigger').click();
    const uploadedFontOption = page.getByRole('option', { name: 'Uploaded Only' }).first();
    await expect(uploadedFontOption).toBeVisible();
    await uploadedFontOption.click();
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Uploaded Only');

    await expectUploadedFontRecordCount(page, 1);
    await expectPersistedCanvasToReferenceFontFamily(page, 'Uploaded Only', ['Uploaded Only']);

    await page.reload();
    await waitForEditor(page);
    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);
    await expect(page.getByText('Missing fonts')).toHaveCount(0);
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Uploaded Only');
    await expectUploadedFontRecordCount(page, 1);
  });

  test('reload purges persisted uploaded fonts once neither canvas nor favorites reference them', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([createTextFixture({ id: 'purged-font-text' })]),
      'purged-font-project.json',
    );
    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);

    const fontPath = path.join(process.cwd(), 'src/assets/fonts/CalSans-Regular.ttf');
    await uploadNamedFontFromPath(page, fontPath, 'Uploaded-Only-Regular.ttf');
    await page.getByTestId('font-family-picker-trigger').click();
    await page.getByRole('option', { name: 'Uploaded Only' }).first().click();
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Uploaded Only');
    await expectUploadedFontRecordCount(page, 1);
    await expectPersistedCanvasToReferenceFontFamily(page, 'Uploaded Only', ['Uploaded Only']);

    await page.getByTestId('font-family-picker-trigger').click();
    await page.getByRole('option', { name: 'Arial' }).first().click();
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Arial');
    await expectPersistedCanvasToReferenceFontFamily(page, 'Arial', []);

    await page.reload();
    await waitForEditor(page);
    await openLayersTab(page);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await openPropertiesTab(page);
    await expect(page.getByText('Missing fonts')).toHaveCount(0);
    await expect(page.getByTestId('font-family-picker-trigger')).toContainText('Arial');
    await expectUploadedFontRecordCount(page, 0);

    await page.getByTestId('font-family-picker-trigger').click();
    await expect(page.getByRole('option', { name: 'Uploaded Only' })).toHaveCount(0);
  });

  test('round-trips project save/open and exports a PNG with the canvas dimensions', async ({ page }) => {
    const document = createProjectDocument([
      createRectangleFixture({ id: 'roundtrip-rect', x: 120, y: 140, width: 240, height: 140 }),
      createTextFixture({ id: 'roundtrip-text', x: 460, y: 160, text: 'Round trip' }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, document, 'roundtrip.json');

    const projectDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'File', 'Save');
    });
    const savedDocument = await readDownloadedJson(projectDownload);

    expect(savedDocument.version).toBe(2);
    expect((savedDocument.nodes as Array<unknown>).length).toBe(2);
    expect(savedDocument.canvas).toEqual(document.canvas);

    await clickToolbarPopoverItem(page, 'File', 'New');
    await openLayersTab(page);
    await expect(page.locator('.layer-row')).toHaveCount(0);

    const savedPath = await projectDownload.path();
    if (!savedPath) {
      throw new Error('Saved project download did not produce a local file.');
    }
    const chooser = await startToolbarFileChooser(page, 'File', 'Load...');
    await chooser.setFiles(savedPath);
    await openLayersTab(page);
    await expect(page.locator('.layer-row')).toHaveCount(2);

    const pngSize = await readDownloadedPngSize(
      await captureDownload(page, async () => {
        await clickToolbarPopoverItem(page, 'Export', 'PNG');
      })
    );
    expect(pngSize).toEqual({ width: 1024, height: 1024 });
  });

  test('writes the canvas to the system clipboard as image/png from the Export menu', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({ id: 'clipboard-rect', x: 200, y: 200, width: 240, height: 160 }),
      ]),
      'clipboard-fixture.json',
    );

    // Stub the clipboard API before any user-script can call it. We can't rely
    // on real clipboard permissions in headless Chromium, so we observe the
    // call instead and recover the captured Blob via a base64 round-trip
    // (Blob isn't serializable across the page<->test boundary).
    await page.evaluate(() => {
      const captured: Array<{ types: string[]; payloads: Record<string, string> }> = [];
      const originalClipboardItem = window.ClipboardItem;
      const PatchedClipboardItem = function (this: object, data: Record<string, Blob>) {
        Object.defineProperty(this, '__bbData', { value: data, enumerable: false });
        Object.defineProperty(this, 'types', { value: Object.keys(data), enumerable: true });
      } as unknown as typeof ClipboardItem;
      PatchedClipboardItem.supports = originalClipboardItem?.supports ?? (() => true);
      window.ClipboardItem = PatchedClipboardItem;

      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          write: async (items: Array<{ __bbData: Record<string, Blob> }>) => {
            const result: Array<{ types: string[]; payloads: Record<string, string> }> = [];
            for (const item of items) {
              const types = Object.keys(item.__bbData);
              const payloads: Record<string, string> = {};
              for (const type of types) {
                const blob = item.__bbData[type];
                const buffer = await blob.arrayBuffer();
                payloads[type] = btoa(String.fromCharCode(...new Uint8Array(buffer.slice(0, 8))));
              }
              result.push({ types, payloads });
            }
            captured.push(...result);
            (window as unknown as { __clipboardCaptures: typeof captured }).__clipboardCaptures = captured;
          },
        },
      });
      (window as unknown as { __clipboardCaptures: typeof captured }).__clipboardCaptures = captured;
    });

    await clickToolbarPopoverItem(page, 'Export', 'To clipboard');

    await expect(page.getByRole('status', { name: '' })).toHaveText('Copied to clipboard');

    const captures = await page.evaluate(
      () => (window as unknown as { __clipboardCaptures: Array<{ types: string[]; payloads: Record<string, string> }> }).__clipboardCaptures,
    );
    expect(captures).toHaveLength(1);
    expect(captures[0].types).toEqual(['image/png']);
    // The first 8 bytes of any PNG blob are the PNG signature: 89 50 4E 47 0D 0A 1A 0A.
    // Base64 of that signature is 'iVBORw0KGgo='.
    expect(captures[0].payloads['image/png']).toBe('iVBORw0KGgo=');
  });

  test('resets to a new empty project through the real toolbar flow', async ({ page }) => {
    const document = createProjectDocument([
      createRectangleFixture({ id: 'new-project-rect', x: 140, y: 140, width: 180, height: 120 }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, document, 'new-project-fixture.json');

    await clickToolbarPopoverItem(page, 'File', 'New');
    await openLayersTab(page);
    await expect(page.locator('.layer-row')).toHaveCount(0);
    await openPropertiesTab(page);
    await expect(page.getByText('Nothing selected')).toBeVisible();

    const savedProject = await readDownloadedJson(
      await captureDownload(page, async () => {
        await clickToolbarPopoverItem(page, 'File', 'Save');
      }),
    );
    expect(savedProject.nodes).toEqual([]);
  });

  test('restores valid persisted state and safely clears corrupt persisted state on reload', async ({ page }) => {
    const persistedDocument = createProjectDocument([
      createRectangleFixture({ id: 'persisted-rect', x: 200, y: 220, width: 180, height: 120 }),
    ]);

    await openFreshEditor(page);
    await seedPersistence(page, persistedDocument);
    await page.reload();
    await waitForEditor(page);
    await expect
      .poll(async () => (await readStageDebug(page)).renderedItemCount, {
        message: 'waiting for persisted item to render after reload',
        timeout: 30_000,
      })
      .toBeGreaterThanOrEqual(1);
    await openLayersTab(page);
    await expect(page.locator('.layer-row')).toHaveCount(1);

    await clearPersistence(page);
    await primePersistenceBeforeLoad(page, '{not-valid-json');
    await page.reload();
    await waitForEditor(page);
    await openLayersTab(page);
    await expect(page.locator('.layer-row')).toHaveCount(0);
  });

  test('canvas name defaults to "Untitled canvas", is editable, drives the save filename, and persists across reload', async ({ page }) => {
    await openFreshEditor(page);

    const display = page.getByTestId('canvas-name-display');
    await expect(display).toHaveText('Untitled canvas');

    await display.click();
    const input = page.getByTestId('canvas-name-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('Untitled canvas');
    await input.fill('My Banner');
    await input.press('Enter');

    await expect(display).toHaveText('My Banner');

    const projectDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'File', 'Save');
    });
    expect(projectDownload.suggestedFilename()).toBe('My Banner.json');

    const savedDocument = await readDownloadedJson(projectDownload);
    expect(savedDocument.name).toBe('My Banner');

    // Wait past the 150ms autosave debounce in useCanvasPersistence so
    // the rename has been written to IDB before we reload.
    await page.waitForTimeout(250);
    await page.reload();
    await waitForEditor(page);
    await expect(page.getByTestId('canvas-name-display')).toHaveText('My Banner');

    await clickToolbarPopoverItem(page, 'File', 'New');
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Untitled canvas');

    const renamedFixture = createProjectDocument([]);
    (renamedFixture as Record<string, unknown>).name = 'Loaded Project';
    await uploadProject(page, renamedFixture, 'loaded-project.json');
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Loaded Project');

    const renamedDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'PNG');
    });
    expect(renamedDownload.suggestedFilename()).toBe('Loaded Project.png');
  });

  test('round-trips grouped documents through save/open and restores grouped persistence on reload', async ({ page }) => {
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture(
        [
          createRectangleFixture({
            id: 'persisted-group-rect',
            name: 'Persisted Group Rect',
            x: 180,
            y: 220,
            width: 180,
            height: 120,
            zIndex: 0,
          }),
          createTextFixture({
            id: 'persisted-group-text',
            name: 'Persisted Group Text',
            x: 230,
            y: 250,
            width: 220,
            height: 80,
            text: 'Persisted group',
            zIndex: 1,
          }),
        ],
        {
          id: 'persisted-group',
          name: 'Persisted Group',
          opacity: 0.72,
        },
      ),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'persisted-group.json');

    const savedGroupedDocument = await readDownloadedJson(
      await captureDownload(page, async () => {
        await clickToolbarPopoverItem(page, 'File', 'Save');
      }),
    );

    expect(savedGroupedDocument.version).toBe(2);
    expect(savedGroupedDocument.nodes).toEqual([
      expect.objectContaining({
        id: 'persisted-group',
        kind: 'group',
        opacity: 0.72,
        children: [
          expect.objectContaining({ id: 'persisted-group-rect' }),
          expect.objectContaining({ id: 'persisted-group-text' }),
        ],
      }),
    ]);

    await clickToolbarPopoverItem(page, 'File', 'New');
    await uploadProject(page, savedGroupedDocument, 'persisted-group-roundtrip.json');

    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Persisted Group', exact: true })).toBeVisible();
    const persistedChevron = page.getByRole('button', { name: /^(Expand|Collapse) Persisted Group$/ });
    const persistedChevronLabel = await persistedChevron.getAttribute('aria-label');
    if (persistedChevronLabel?.startsWith('Expand')) {
      await persistedChevron.click();
    }
    await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Text', exact: true })).toBeVisible();

    await setCanvasTestHooksEnabled(page, false);
    await clickItem(page, 'persisted-group-rect');
    await openPropertiesTab(page);
    await expect(page.getByRole('spinbutton', { name: 'Group Opacity value' })).toHaveValue('0.72');

    await seedPersistence(page, savedGroupedDocument);
    await page.reload();
    await waitForEditor(page);
    await openLayersTab(page);
    await expect(page.getByRole('button', { name: 'Persisted Group', exact: true })).toBeVisible();
    await setCanvasTestHooksEnabled(page, false);
    await clickItem(page, 'persisted-group-rect');
    await openPropertiesTab(page);
    await expect(page.getByRole('spinbutton', { name: 'Group Opacity value' })).toHaveValue('0.72');
  });
});
