import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, type Download, type Locator, type Page } from '@playwright/test';

export const APP_CLIPBOARD_MIME_TYPE = 'application/x-billboard-builder-selection+json';

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface StageDebugInfo {
  sessionKind?: string | null;
  sessionHandle?: string | null;
  viewport: {
    zoom: number;
    panX: number;
    panY: number;
  };
  previewItem?: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    kind: string;
    id: string;
  } | null;
  selectedItemViewportRect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  marqueeViewportRect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  groupOverlayViewportRect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  groupHandleViewportPoints?: Record<string, CanvasPoint> | null;
  groupRotaterViewportPoint?: CanvasPoint | null;
  groupFrame?: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  } | null;
  subgroupOutlineFrames?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> | null;
  hasGroupOverlay?: boolean;
  hasShapeHandles?: boolean;
  hasLineHandles?: boolean;
  selectedItems?: Array<{
    id: string;
    kind: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
  }> | null;
}

export interface RenderSnapshotItem {
  id: string;
  kind: string;
  outlinePoints: CanvasPoint[];
  geometry: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
}

export interface RenderSnapshot {
  sessionKind?: string | null;
  sessionHandle?: string | null;
  viewport: {
    zoom: number;
    panX: number;
    panY: number;
  };
  selectedItemIds: string[];
  selectedItems: RenderSnapshotItem[];
  groupOverlay: {
    x: number;
    y: number;
    width: number;
    height: number;
    center: CanvasPoint;
    rotation: number;
    viewportRect: {
      left: number;
      top: number;
      width: number;
      height: number;
      center: CanvasPoint;
    };
  } | null;
  groupHandles: Record<string, CanvasPoint>;
  groupRotater: CanvasPoint | null;
  subgroupOutlines?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> | null;
  hasGroupOverlay?: boolean;
  hasShapeHandles?: boolean;
  hasLineHandles?: boolean;
}

export interface BrowserClipboardEventResult {
  defaultPrevented: boolean;
  payload: Record<string, string>;
}

interface CanvasFixtureBase {
  id: string;
  kind: string;
  name: string;
}

export interface GroupNodeFixture extends CanvasFixtureBase {
  kind: 'group';
  opacity: number;
  children: CanvasNodeFixture[];
}

export type CanvasNodeFixture = GroupNodeFixture | Record<string, unknown>;

const DEFAULT_SHADOW = {
  color: '#000000',
  blur: 0,
  offsetX: 0,
  offsetY: 0,
  opacity: 0,
};

const DEFAULT_CANVAS = {
  width: 1024,
  height: 1024,
  presetId: 'square-lg',
};

export function createRectangleFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rectangle-item',
    kind: 'rectangle',
    name: 'Rectangle',
    x: 120,
    y: 120,
    width: 220,
    height: 140,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    zIndex: 0,
    locked: false,
    hidden: false,
    opacity: 1,
    shadow: DEFAULT_SHADOW,
    fill: '#f97316',
    stroke: '#c2410cff',
    strokeWidth: 0,
    cornerRadius: 0,
    ...overrides,
  };
}

export function createTextFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'text-item',
    kind: 'text',
    name: 'Text',
    x: 420,
    y: 140,
    width: 320,
    height: 96,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    zIndex: 1,
    locked: false,
    hidden: false,
    opacity: 1,
    shadow: DEFAULT_SHADOW,
    text: 'Integration text',
    fontFamily: 'Arial',
    fontSize: 42,
    fontStyle: 'normal',
    fontWeight: 'normal',
    fill: '#ffffff',
    align: 'left',
    verticalAlign: 'top',
    lineHeight: 1.1,
    letterSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    ...overrides,
  };
}

export function createLineFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-item',
    kind: 'line',
    name: 'Line',
    x: 160,
    y: 160,
    width: 240,
    height: 24,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    zIndex: 2,
    locked: false,
    hidden: false,
    opacity: 1,
    shadow: DEFAULT_SHADOW,
    stroke: '#111827ff',
    strokeWidth: 6,
    startX: 160,
    startY: 160,
    endX: 400,
    endY: 184,
    ...overrides,
  };
}

export function createProjectDocument(items: Array<Record<string, unknown>> = []) {
  // Flat project fixtures are for legacy and temporary multi-select coverage.
  // True group-node workflows should use createGroupedProjectDocument().
  return {
    version: 1,
    canvas: DEFAULT_CANVAS,
    background: '#ffffff00',
    fonts: [],
    items: items.map((item, index) => ({
      ...item,
      zIndex: Number(item.zIndex ?? index),
    })),
  };
}

export function createGroupNodeFixture(
  children: CanvasNodeFixture[] = [],
  overrides: Partial<GroupNodeFixture> = {},
): GroupNodeFixture {
  return {
    id: 'group-node',
    kind: 'group',
    name: 'Group',
    opacity: 1,
    children,
    ...overrides,
  };
}

interface GroupedProjectOptions {
  background?: string;
  canvas?: typeof DEFAULT_CANVAS;
  fonts?: Array<Record<string, unknown>>;
}

export function createGroupedProjectDocument(
  nodes: CanvasNodeFixture[] = [],
  options: GroupedProjectOptions = {},
) {
  return {
    version: 2,
    canvas: options.canvas ?? DEFAULT_CANVAS,
    background: options.background ?? '#ffffff00',
    fonts: options.fonts ?? [],
    nodes,
  };
}

export function createSimpleGroupFixture() {
  return createGroupedProjectDocument([
    createGroupNodeFixture([
      createRectangleFixture({
        id: 'group-rect-1',
        x: 140,
        y: 160,
        width: 140,
        height: 80,
        zIndex: 0,
      }),
      createRectangleFixture({
        id: 'group-rect-2',
        x: 340,
        y: 220,
        width: 120,
        height: 72,
        fill: '#0ea5e9',
        stroke: '#0369a1ff',
        zIndex: 1,
      }),
    ], {
      id: 'simple-group',
      name: 'Simple Group',
    }),
  ]);
}

export function createNestedGroupFixture() {
  return createGroupedProjectDocument([
    createGroupNodeFixture([
      createRectangleFixture({
        id: 'outer-rect',
        x: 120,
        y: 140,
        width: 140,
        height: 90,
        zIndex: 0,
      }),
      createGroupNodeFixture([
        createRectangleFixture({
          id: 'inner-rect',
          x: 340,
          y: 180,
          width: 130,
          height: 76,
          fill: '#22c55e',
          stroke: '#15803dff',
          zIndex: 1,
        }),
      ], {
        id: 'inner-group',
        name: 'Inner Group',
      }),
    ], {
      id: 'outer-group',
      name: 'Outer Group',
    }),
  ]);
}

export function createMixedShapeTextGroupFixture() {
  return createGroupedProjectDocument([
    createGroupNodeFixture([
      createRectangleFixture({
        id: 'mixed-rect',
        x: 140,
        y: 180,
        width: 220,
        height: 140,
        zIndex: 0,
      }),
      createTextFixture({
        id: 'mixed-text',
        x: 200,
        y: 210,
        width: 260,
        height: 90,
        text: 'Grouped text',
        zIndex: 1,
      }),
    ], {
      id: 'mixed-shape-text-group',
      name: 'Mixed Shape Text',
    }),
  ]);
}

export function createMixedShapeLineGroupFixture() {
  return createGroupedProjectDocument([
    createGroupNodeFixture([
      createRectangleFixture({
        id: 'line-group-rect',
        x: 140,
        y: 160,
        width: 180,
        height: 100,
        zIndex: 0,
      }),
      createLineFixture({
        id: 'line-group-line',
        x: 180,
        y: 220,
        startX: 180,
        startY: 220,
        endX: 440,
        endY: 280,
        width: 260,
        height: 60,
        zIndex: 1,
      }),
    ], {
      id: 'mixed-shape-line-group',
      name: 'Mixed Shape Line',
    }),
  ]);
}

export async function waitForEditor(page: Page) {
  await expect(page.getByTestId('canvas-stage-root')).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await expect(page.getByTestId('stage-debug')).toBeVisible();
}

export async function openFreshEditor(page: Page) {
  await page.goto('/');
  await waitForEditor(page);
  await clearPersistence(page);
  await page.reload();
  await waitForEditor(page);
}

export async function readStageDebug(page: Page): Promise<StageDebugInfo> {
  const raw = await page.getByTestId('stage-debug').textContent();
  return JSON.parse(raw ?? '{}') as StageDebugInfo;
}

export async function readRenderSnapshot(page: Page): Promise<RenderSnapshot> {
  return page.evaluate(() => {
    const snapshot = window.__BB_TEST__?.captureRenderSnapshot?.();
    if (!snapshot) {
      throw new Error('Render snapshot helper is unavailable.');
    }
    return snapshot as RenderSnapshot;
  });
}

async function getStageRootBounds(page: Page) {
  const bounds = await page.getByTestId('canvas-stage-root').boundingBox();
  if (!bounds) {
    throw new Error('Canvas stage root is not visible.');
  }
  return bounds;
}

async function hookCenter(locator: Locator) {
  const bounds = await locator.boundingBox();
  if (!bounds) {
    throw new Error('Canvas test hook is not visible.');
  }
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

export async function canvasPointToPage(page: Page, point: CanvasPoint) {
  const [bounds, debug] = await Promise.all([getStageRootBounds(page), readStageDebug(page)]);
  return {
    x: bounds.x + debug.viewport.panX + point.x * debug.viewport.zoom,
    y: bounds.y + debug.viewport.panY + point.y * debug.viewport.zoom,
  };
}

export async function clickCanvas(page: Page, point: CanvasPoint) {
  const target = await canvasPointToPage(page, point);
  await page.mouse.click(target.x, target.y);
}

export async function doubleClickCanvas(page: Page, point: CanvasPoint) {
  const target = await canvasPointToPage(page, point);
  await page.mouse.dblclick(target.x, target.y);
}

export async function dragCanvas(page: Page, from: CanvasPoint, to: CanvasPoint, steps = 18) {
  const start = await canvasPointToPage(page, from);
  const end = await canvasPointToPage(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps });
  await page.mouse.up();
}

export async function setCanvasTestHooksEnabled(page: Page, enabled: boolean) {
  await page.evaluate((nextEnabled) => {
    const hooks = document.querySelector<HTMLElement>('[data-testid="canvas-test-hooks"]');
    if (hooks) {
      hooks.style.display = nextEnabled ? '' : 'none';
      hooks.style.pointerEvents = nextEnabled ? 'auto' : 'none';
    }
  }, enabled);
}

export async function beginVisibleCanvasDrag(page: Page, point: CanvasPoint) {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
}

export async function movePointerToPagePoint(page: Page, point: CanvasPoint, steps = 18) {
  await page.mouse.move(point.x, point.y, { steps });
}

export async function beginCanvasDrag(page: Page, from: CanvasPoint) {
  const start = await canvasPointToPage(page, from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
}

export async function movePointerToCanvasPoint(page: Page, destination: CanvasPoint, steps = 18) {
  const end = await canvasPointToPage(page, destination);
  await page.mouse.move(end.x, end.y, { steps });
}

export async function clickCanvasHook(page: Page, testId: string) {
  const center = await hookCenter(page.getByTestId(testId));
  await page.mouse.click(center.x, center.y);
}

export async function beginCanvasHookDrag(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  const start = await hookCenter(locator);
  await page.mouse.move(start.x, start.y);
  await locator.dispatchEvent('mousedown', {
    button: 0,
    buttons: 1,
    bubbles: true,
    clientX: start.x,
    clientY: start.y,
  });
}

export async function beginCanvasHookMiddleDrag(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  const start = await hookCenter(locator);
  await page.mouse.move(start.x, start.y);
  await locator.dispatchEvent('mousedown', {
    button: 1,
    buttons: 4,
    bubbles: true,
    clientX: start.x,
    clientY: start.y,
  });
}

export async function dragCanvasHookToPoint(
  page: Page,
  testId: string,
  destination: CanvasPoint,
  steps = 18
) {
  await beginCanvasHookDrag(page, testId);
  await movePointerToCanvasPoint(page, destination, steps);
  await releasePointer(page);
}

export async function releasePointer(page: Page) {
  await page.mouse.up();
}

export async function selectTool(page: Page, name: string) {
  await page.getByRole('button', { name: new RegExp(`^${name} \\(`) }).click();
}

export async function openLayersTab(page: Page) {
  await page.getByRole('tab', { name: /Layers/ }).click();
}

export async function openPropertiesTab(page: Page) {
  await page.getByRole('tab', { name: 'Properties' }).click();
}

export async function clickLayerRow(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
}

export async function doubleClickLayerRow(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).dblclick();
}

export async function uploadProject(page: Page, document: Record<string, unknown>, fileName = 'fixture.json') {
  await page.getByTestId('project-open-input').setInputFiles({
    name: fileName,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document), 'utf8'),
  });
}

export async function uploadSvgImage(page: Page, name = 'fixture.svg') {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">',
    '<rect width="160" height="90" fill="#111827"/>',
    '<circle cx="45" cy="45" r="24" fill="#22d3ee"/>',
    '<rect x="82" y="20" width="42" height="50" rx="8" fill="#f97316"/>',
    '</svg>',
  ].join('');

  await page.getByTestId('image-upload-input').setInputFiles({
    name,
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svg, 'utf8'),
  });
}

export async function uploadFont(page: Page, filePath: string) {
  await page.getByTestId('font-upload-input').setInputFiles(filePath);
}

export async function captureDownload(page: Page, action: () => Promise<void>) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    action(),
  ]);
  return download;
}

export async function saveAndReadProject(page: Page) {
  return readDownloadedJson(
    await captureDownload(page, async () => {
      await page.getByRole('button', { name: 'Save' }).click();
    }),
  );
}

async function dispatchBrowserClipboardEvent(
  page: Page,
  type: 'copy' | 'cut' | 'paste',
  payload: Record<string, string> = {}
): Promise<BrowserClipboardEventResult> {
  return page.evaluate(({ nextType, nextPayload }) => {
    const dataTransfer = new DataTransfer();
    for (const [mimeType, value] of Object.entries(nextPayload)) {
      dataTransfer.setData(mimeType, value);
    }

    const event = new ClipboardEvent(nextType, {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer,
    });
    document.dispatchEvent(event);

    const serializedPayload = Object.fromEntries(
      Array.from(dataTransfer.types, (mimeType) => [mimeType, dataTransfer.getData(mimeType)])
    );

    return {
      defaultPrevented: event.defaultPrevented,
      payload: serializedPayload,
    };
  }, { nextType: type, nextPayload: payload });
}

export async function copySelectionToClipboardPayload(page: Page) {
  return dispatchBrowserClipboardEvent(page, 'copy');
}

export async function cutSelectionToClipboardPayload(page: Page) {
  return dispatchBrowserClipboardEvent(page, 'cut');
}

export async function pasteClipboardPayload(page: Page, payload: Record<string, string>) {
  return dispatchBrowserClipboardEvent(page, 'paste', payload);
}

async function materializeDownload(download: Download) {
  const existingPath = await download.path();
  if (existingPath) {
    return existingPath;
  }
  const tempPath = path.join(os.tmpdir(), `bb-download-${Date.now()}-${download.suggestedFilename()}`);
  await download.saveAs(tempPath);
  return tempPath;
}

export async function readDownloadedJson(download: Download) {
  const filePath = await materializeDownload(download);
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

export async function assertNoDocumentTextSelection(page: Page) {
  const selectionText = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  expect(selectionText).toBe('');
}

export async function assertFocusNotInToolbarOrInputs(page: Page) {
  const focusInfo = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active) {
      return { tagName: null, inToolbar: false, dataTestId: null };
    }
    return {
      tagName: active.tagName,
      inToolbar: Boolean(active.closest('.top-toolbar')),
      dataTestId: active.getAttribute('data-testid'),
    };
  });

  expect(focusInfo.inToolbar).toBe(false);
  expect(['INPUT', 'TEXTAREA', 'SELECT']).not.toContain(focusInfo.tagName);
}

export async function readDownloadedPngSize(download: Download) {
  const filePath = await materializeDownload(download);
  const buffer = await fs.readFile(filePath);
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error('Downloaded file is not a PNG.');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export async function seedPersistence(page: Page, payload: string | Record<string, unknown>) {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('billboard-builder', 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('canvas')) {
          database.createObjectStore('canvas');
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('canvas', 'readwrite');
        const store = transaction.objectStore('canvas');
        store.put(value, 'current');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
      };
    });
  }, serialized);
}

export async function primePersistenceBeforeLoad(page: Page, payload: string | Record<string, unknown>) {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  await page.addInitScript(async (value) => {
    if (window.sessionStorage.getItem('bb-persist-seeded') === 'true') {
      return;
    }
    window.sessionStorage.setItem('bb-persist-seeded', 'true');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('billboard-builder', 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('canvas')) {
          database.createObjectStore('canvas');
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('canvas', 'readwrite');
        const store = transaction.objectStore('canvas');
        store.put(value, 'current');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
      };
    });
  }, serialized);
}

export async function clearPersistence(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('billboard-builder');
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
      request.onsuccess = () => resolve();
    });
  });
}
