import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, type Download, type Locator, type Page } from '@playwright/test';

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
}

const DEFAULT_SHADOW = {
  color: '#000000',
  blur: 0,
  offsetX: 0,
  offsetY: 0,
  opacity: 0,
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
  return {
    version: 1,
    canvas: {
      width: 1024,
      height: 1024,
      presetId: 'square-lg',
    },
    background: '#ffffff00',
    fonts: [],
    items: items.map((item, index) => ({
      ...item,
      zIndex: Number(item.zIndex ?? index),
    })),
  };
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
