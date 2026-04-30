import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, type Download, type FileChooser, type Locator, type Page } from '@playwright/test';

export const APP_CLIPBOARD_MIME_TYPE = 'application/x-billboard-builder-selection+json';
const EDITOR_TEST_URL = '/?bb-test=1';
const EDITOR_DATABASE_VERSION = 2;

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface StageDebugInfo {
  renderedItemCount?: number;
  sessionKind?: string | null;
  sessionHandle?: string | null;
  cropSession?: {
    crop: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    previewItem: {
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
    };
    fullImageItem: {
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
    };
    cropHandlePoints?: Record<string, CanvasPoint> | null;
    fullImageHandlePoints?: Record<string, CanvasPoint> | null;
    cropHandleViewportPoints?: Record<string, CanvasPoint> | null;
    fullImageHandleViewportPoints?: Record<string, CanvasPoint> | null;
    fullImageRotaterViewportPoint?: CanvasPoint | null;
  } | null;
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
  lastDrilldownSource?: 'item-hit' | 'stage-surface' | null;
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
  selectedNodeIds: string[];
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
    lockAspectRatio: false,
    hidden: false,
    opacity: 1,
    shadow: DEFAULT_SHADOW,
    fill: '#f97316',
    secondaryFill: '#f97316',
    gradientEnabled: false,
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
    lockAspectRatio: false,
    hidden: false,
    opacity: 1,
    shadow: DEFAULT_SHADOW,
    text: 'Integration text',
    fontFamily: 'Arial',
    fontSize: 42,
    fontStyle: 'normal',
    fontWeight: 'normal',
    fill: '#ffffff',
    secondaryFill: '#ffffff',
    gradientEnabled: false,
    align: 'left',
    verticalAlign: 'top',
    lineHeight: 1.1,
    letterSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    ...overrides,
  };
}

export function createEllipseFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ellipse-item',
    kind: 'ellipse',
    name: 'Ellipse',
    x: 180,
    y: 320,
    width: 200,
    height: 120,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    zIndex: 2,
    locked: false,
    lockAspectRatio: false,
    hidden: false,
    opacity: 1,
    shadow: DEFAULT_SHADOW,
    fill: '#0ea5e9',
    secondaryFill: '#0ea5e9',
    gradientEnabled: false,
    stroke: '#0369a1ff',
    strokeWidth: 0,
    ...overrides,
  };
}

export function createNgonFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ngon-item',
    kind: 'ngon',
    name: 'Polygon',
    x: 200,
    y: 200,
    width: 200,
    height: 200,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    zIndex: 0,
    locked: false,
    lockAspectRatio: false,
    hidden: false,
    opacity: 1,
    shadow: DEFAULT_SHADOW,
    fill: '#8b5cf6',
    secondaryFill: '#8b5cf6',
    gradientEnabled: false,
    stroke: '#6d28d9ff',
    strokeWidth: 0,
    sides: 6,
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
    lockAspectRatio: false,
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

function buildSvgFixture() {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">',
    '<rect width="160" height="90" fill="#111827"/>',
    '<circle cx="45" cy="45" r="24" fill="#22d3ee"/>',
    '<rect x="82" y="20" width="42" height="50" rx="8" fill="#f97316"/>',
    '</svg>',
  ].join('');
}

export function createImageFixture(overrides: Record<string, unknown> = {}) {
  const svg = buildSvgFixture();
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  const baseItem = {
    id: 'image-item',
    kind: 'image',
    name: 'Image',
    x: 520,
    y: 320,
    width: 160,
    height: 90,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    zIndex: 3,
    locked: false,
    lockAspectRatio: false,
    hidden: false,
    opacity: 1,
    shadow: DEFAULT_SHADOW,
    src: dataUrl,
    mimeType: 'image/svg+xml',
    originalWidth: 160,
    originalHeight: 90,
    crop: {
      x: 0,
      y: 0,
      width: 160,
      height: 90,
    },
    mirrorHorizontal: false,
    preserveAspectRatio: true,
    adjustments: {
      brightness: 100,
      contrast: 50,
      tintColor: '#ffffff',
      tintStrength: 0,
    },
    ...overrides,
  };

  const crop = baseItem.crop as { x: number; y: number; width: number; height: number };
  const scaleX = Number(baseItem.width) / Math.max(crop.width, 1);
  const scaleY = Number(baseItem.height) / Math.max(crop.height, 1);
  const mirrorHorizontal = Boolean(baseItem.mirrorHorizontal);

  return {
    ...baseItem,
    sourceTransform:
      overrides.sourceTransform ??
      {
        x: mirrorHorizontal
          ? -(Number(baseItem.originalWidth) - crop.x - crop.width) * scaleX
          : -crop.x * scaleX,
        y: -crop.y * scaleY,
        width: Number(baseItem.originalWidth) * scaleX,
        height: Number(baseItem.originalHeight) * scaleY,
        rotation: 0,
      },
  };
}

export function createProjectDocument(items: Array<Record<string, unknown>> = []) {
  return {
    version: 2,
    canvas: DEFAULT_CANVAS,
    background: '#ffffff00',
    fonts: [],
    nodes: items.map((item) => ({
      ...item,
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

export function createLayersPanelMockParityFixture() {
  return createGroupedProjectDocument([
    createGroupNodeFixture(
      [
        createRectangleFixture({
          id: 'legal-rectangle',
          name: 'Rectangle',
          x: 690,
          y: 700,
          width: 180,
          height: 90,
          fill: '#2d86ff',
          stroke: '#2563ebff',
          zIndex: 0,
        }),
      ],
      {
        id: 'legal-group',
        name: 'Legal',
      },
    ),
    createRectangleFixture({
      id: 'base-rectangle',
      name: 'Rectangle',
      x: 620,
      y: 620,
      width: 200,
      height: 110,
      fill: '#2563eb',
      stroke: '#22c55eff',
      zIndex: 1,
    }),
    createGroupNodeFixture(
      [
        createLineFixture({
          id: 'hero-line',
          name: 'Line',
          x: 170,
          y: 470,
          width: 250,
          height: 28,
          stroke: '#d6e2f5ff',
          strokeWidth: 4,
          startX: 170,
          startY: 492,
          endX: 420,
          endY: 464,
          zIndex: 0,
        }),
        createGroupNodeFixture(
          [
            createEllipseFixture({
              id: 'details-ellipse',
              name: 'Ellipse',
              x: 340,
              y: 390,
              width: 56,
              height: 56,
              fill: '#00000000',
              stroke: '#a855f7ff',
              zIndex: 0,
            }),
            createTextFixture({
              id: 'details-text',
              name: 'Text',
              x: 208,
              y: 358,
              width: 320,
              height: 56,
              text: 'Free shipping over $75',
              fill: '#17deef',
              fontSize: 28,
              zIndex: 1,
            }),
          ],
          {
            id: 'details-cluster',
            name: 'Details Cluster',
          },
        ),
        createEllipseFixture({
          id: 'hero-ellipse',
          name: 'Ellipse',
          x: 170,
          y: 300,
          width: 72,
          height: 72,
          fill: '#3b82f6',
          stroke: '#93a8c942',
          zIndex: 2,
        }),
        createTextFixture({
          id: 'hero-text',
          name: 'Text',
          x: 210,
          y: 200,
          width: 420,
          height: 70,
          text: 'Spring drop now live',
          fill: '#f3f6fc',
          fontSize: 34,
          zIndex: 3,
        }),
      ],
      {
        id: 'hero-group',
        name: 'Hero Group',
      },
    ),
    createRectangleFixture({
      id: 'top-rectangle',
      name: 'Rectangle',
      x: 120,
      y: 120,
      width: 180,
      height: 110,
      fill: '#ff4d4d',
      stroke: '#93a8c942',
      zIndex: 3,
    }),
  ]);
}

export async function waitForEditor(page: Page) {
  await expect(page.getByTestId('canvas-stage-root')).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await expect(page.getByTestId('stage-debug')).toBeVisible();
  // Wait for the Pixi <Application> to finish initializing.  The in-page
  // test API checks `getCanvas() != null` to know the canvas element is
  // attached; until then any clickItem/dragItem call would throw.
  // Generous timeout: under workers=8 load, Pixi init has been observed
  // to take well past 10s on a contended box; 30s gives slow workers
  // room without making fast paths any slower (the poll exits the
  // moment rendererReady flips true).
  await expect
    .poll(async () => page.evaluate(() => Boolean(window.__BB_TEST__?.rendererReady?.())), {
      message: 'waiting for Pixi renderer to initialize',
      timeout: 30_000,
    })
    .toBe(true);
}

export async function openFreshEditor(page: Page) {
  await page.goto(EDITOR_TEST_URL);
  await waitForEditor(page);
  await clearPersistence(page);
  await page.reload();
  await waitForEditor(page);
}

export async function gotoEditor(page: Page) {
  await page.goto(EDITOR_TEST_URL);
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
  const [target] = await canvasPointsToPage(page, [point]);
  return target;
}

/**
 * Convert multiple canvas points using a single viewport+bounds snapshot.
 * Use this for any gesture spanning multiple points (drag start/end) so the
 * points share a reference frame even if the editor's viewport or DOM
 * layout shifts between calls (e.g. auto-fit zoom, inspector layout).
 */
export async function canvasPointsToPage(page: Page, points: CanvasPoint[]) {
  const [bounds, debug] = await Promise.all([getStageRootBounds(page), readStageDebug(page)]);
  return points.map((p) => ({
    x: bounds.x + debug.viewport.panX + p.x * debug.viewport.zoom,
    y: bounds.y + debug.viewport.panY + p.y * debug.viewport.zoom,
  }));
}

/**
 * Yield until React has committed any pending state from the most recent
 * Playwright action (toolbar click, keyboard event, etc).  We post a task
 * via `setTimeout(0)` after a paint frame — that gives React's scheduler
 * room to process its work queue including any concurrent-mode deferrals.
 *
 * NOTE: this only synchronizes Playwright→React; it is not a workaround
 * for the in-page dispatch path, which is race-free by construction.
 */
async function flushCanvasFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            // setTimeout posts a macrotask, which runs after any React
            // microtask-flush triggered by the rAF callback.
            setTimeout(() => resolve(), 0),
          ),
        ),
      ),
  );
}

// ── ID-based canvas interactions (race-free, in-page dispatch) ───────────────
//
// These thunk through `window.__BB_TEST__` (set up by `useCanvasTestApi`)
// so coordinate computation and event dispatch happen atomically inside
// one `page.evaluate` callback.  No two-RPC race against viewport / layout
// shifts.  See `src/editor/rendering/stage/canvasTestApi.ts`.

export interface ClickOpts {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  button?: number;
}

export interface DragOpts extends ClickOpts {
  steps?: number;
}

export type HandleName =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'rotater'
  | 'line-start'
  | 'line-end';

/**
 * Each wrapper does a `flushCanvasFrames` *before* it dispatches.
 *
 * Why: prior Playwright actions (toolbar button click, `keyboard.down(' ')`,
 * etc.) trigger React state changes that don't commit until the next frame.
 * The in-page methods read refs that mirror React props — without this
 * flush, a freshly-pressed spacebar isn't reflected in `spacebarHeld` at the
 * moment the synthetic pointerdown dispatches, etc.
 *
 * This is *not* the bandage we removed.  The bandage was sandwich-flushing
 * around `clickCanvas` to paper over coord/dispatch races that no longer
 * exist with in-page atomicity.  The flush here only synchronizes Playwright
 * → React; the in-page dispatch is still race-free.
 */

// Per-page, per-item memory of the last clickItem time, used to avoid
// accidentally triggering the editor's 400ms double-click detection.  Each
// rendered item has its own `lastClickRef` in PixiItemLayer, so this map
// must be keyed by item id, not just "the last clicked item".
//
// CDP-driven `page.mouse.click` was naturally throttled by ~tens of ms per
// command, so the test never bumped into the 400ms threshold.  Our in-page
// dispatch is sub-millisecond, exposing the race.
const DOUBLE_CLICK_THRESHOLD_MS = 410;
const lastItemClickAt = new WeakMap<Page, Map<string, number>>();

async function avoidSameItemDoubleClick(page: Page, id: string) {
  const map = lastItemClickAt.get(page);
  const last = map?.get(id);
  if (last !== undefined) {
    const elapsed = Date.now() - last;
    const remaining = DOUBLE_CLICK_THRESHOLD_MS - elapsed;
    if (remaining > 0) await page.waitForTimeout(remaining);
  }
}

function recordItemClick(page: Page, id: string) {
  let map = lastItemClickAt.get(page);
  if (!map) {
    map = new Map();
    lastItemClickAt.set(page, map);
  }
  map.set(id, Date.now());
}

export async function clickItem(page: Page, id: string, opts: ClickOpts = {}) {
  await avoidSameItemDoubleClick(page, id);
  await flushCanvasFrames(page);
  await page.evaluate(
    ({ id, opts }) => {
      const api = window.__BB_TEST__;
      if (!api?.clickItem) {
        throw new Error('__BB_TEST__.clickItem is not available — is the editor in test mode (?bb-test=1)?');
      }
      return api.clickItem(id, opts);
    },
    { id, opts },
  );
  recordItemClick(page, id);
}

export async function doubleClickItem(page: Page, id: string, opts: ClickOpts = {}) {
  // The first click of the double-click pair must NOT form a double-click with
  // a prior single click on the same item — otherwise the editor fires
  // double-click on (prior + first) and the second click is just a stray
  // single click. Wait past the editor's 400ms threshold first.
  await avoidSameItemDoubleClick(page, id);
  await flushCanvasFrames(page);
  await page.evaluate(
    ({ id, opts }) => {
      const api = window.__BB_TEST__;
      if (!api?.doubleClickItem) {
        throw new Error('__BB_TEST__.doubleClickItem is not available');
      }
      return api.doubleClickItem(id, opts);
    },
    { id, opts },
  );
  // The editor resets lastClickRef on double-click. Clear our tracked entry
  // so the next clickItem() doesn't wait unnecessarily.
  lastItemClickAt.get(page)?.delete(id);
}

export async function dragItemTo(
  page: Page,
  id: string,
  canvasX: number,
  canvasY: number,
  opts: DragOpts = {},
) {
  // The drag's pointerdown lands at the item's current center, hitting the
  // item's onMouseDown handler — same double-click pitfall as clickItem.
  await avoidSameItemDoubleClick(page, id);
  await flushCanvasFrames(page);
  await page.evaluate(
    ({ id, canvasX, canvasY, opts }) => {
      const api = window.__BB_TEST__;
      if (!api?.dragItemTo) {
        throw new Error('__BB_TEST__.dragItemTo is not available');
      }
      return api.dragItemTo(id, canvasX, canvasY, opts);
    },
    { id, canvasX, canvasY, opts },
  );
  recordItemClick(page, id);
}

export async function dragHandle(
  page: Page,
  itemId: string,
  handle: HandleName,
  dx: number,
  dy: number,
  opts: DragOpts = {},
) {
  await flushCanvasFrames(page);
  await page.evaluate(
    ({ itemId, handle, dx, dy, opts }) => {
      const api = window.__BB_TEST__;
      if (!api?.dragHandle) {
        throw new Error('__BB_TEST__.dragHandle is not available');
      }
      return api.dragHandle(itemId, handle, dx, dy, opts);
    },
    { itemId, handle, dx, dy, opts },
  );
}

export async function clickEmptyCanvas(page: Page, point: CanvasPoint, opts: ClickOpts = {}) {
  await flushCanvasFrames(page);
  await page.evaluate(
    ({ point, opts }) => {
      const api = window.__BB_TEST__;
      if (!api?.clickEmptyCanvas) {
        throw new Error('__BB_TEST__.clickEmptyCanvas is not available');
      }
      return api.clickEmptyCanvas(point.x, point.y, opts);
    },
    { point, opts },
  );
}

export async function dragEmptyCanvas(
  page: Page,
  from: CanvasPoint,
  to: CanvasPoint,
  opts: DragOpts = {},
) {
  await flushCanvasFrames(page);
  await page.evaluate(
    ({ from, to, opts }) => {
      const api = window.__BB_TEST__;
      if (!api?.dragEmptyCanvas) {
        throw new Error('__BB_TEST__.dragEmptyCanvas is not available');
      }
      return api.dragEmptyCanvas(from.x, from.y, to.x, to.y, opts);
    },
    { from, to, opts },
  );
}

export async function wheelAt(
  page: Page,
  point: CanvasPoint,
  deltaY: number,
  deltaX = 0,
) {
  await flushCanvasFrames(page);
  await page.evaluate(
    ({ point, deltaY, deltaX }) => {
      const api = window.__BB_TEST__;
      if (!api?.wheelAt) {
        throw new Error('__BB_TEST__.wheelAt is not available');
      }
      api.wheelAt(point.x, point.y, deltaY, deltaX);
    },
    { point, deltaY, deltaX },
  );
}

// ── Coord-based double-click ────────────────────────────────────────────────
// Used by tests that intentionally click at a coordinate (e.g. inside a crop
// preview) rather than on a known fixture item.  Delegates to the in-page
// test API for race-free dispatch.

export async function doubleClickCanvas(page: Page, point: CanvasPoint) {
  await flushCanvasFrames(page);
  await page.evaluate(
    async ({ point }) => {
      const api = window.__BB_TEST__;
      if (!api?.clickEmptyCanvas) {
        throw new Error('__BB_TEST__.clickEmptyCanvas is not available');
      }
      await api.clickEmptyCanvas(point.x, point.y);
      await api.clickEmptyCanvas(point.x, point.y);
    },
    { point },
  );
}

const MODIFIER_TO_OPT: Record<'Shift' | 'Control' | 'Alt' | 'Meta', keyof ClickOpts> = {
  Shift: 'shiftKey',
  Control: 'ctrlKey',
  Alt: 'altKey',
  Meta: 'metaKey',
};

export async function dragCanvasWithModifier(
  page: Page,
  modifierKey: 'Shift' | 'Control' | 'Alt' | 'Meta',
  from: CanvasPoint,
  to: CanvasPoint,
  steps = 18,
) {
  const opts: DragOpts = { steps, [MODIFIER_TO_OPT[modifierKey]]: true };
  await dragEmptyCanvas(page, from, to, opts);
}

export async function setCanvasTestHooksEnabled(page: Page, enabled: boolean) {
  await page.evaluate((nextEnabled) => {
    // Inline styles on the hooks element get clobbered when React re-renders
    // the subtree (selection change, session updates, etc).  Inject a
    // <style> rule keyed by id so the override survives reconciliation and
    // applies to every element matching the test-id, including replacements.
    const STYLE_ID = '__bb-test-hooks-disable__';
    const existing = document.getElementById(STYLE_ID);
    if (nextEnabled) {
      existing?.remove();
    } else if (!existing) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent =
        '[data-testid="canvas-test-hooks"] { display: none !important; pointer-events: none !important; }';
      document.head.appendChild(style);
    }
  }, enabled);
}

export async function movePointerToPagePoint(page: Page, point: CanvasPoint, _steps = 18) {
  await page.evaluate(
    ({ point }) => {
      const api = window.__BB_TEST__;
      if (!api?.movePointerClient) {
        throw new Error('__BB_TEST__.movePointerClient is not available');
      }
      api.movePointerClient(point.x, point.y);
    },
    { point },
  );
}

export async function beginCanvasDrag(page: Page, from: CanvasPoint) {
  await flushCanvasFrames(page);
  await page.evaluate(
    ({ from }) => {
      const api = window.__BB_TEST__;
      if (!api?.beginDrag) {
        throw new Error('__BB_TEST__.beginDrag is not available');
      }
      api.beginDrag(from.x, from.y);
    },
    { from },
  );
}

export type GroupHandleName =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'rotater'
  | 'overlay';

/**
 * Begin a drag from a group-overlay handle (resize / rotater / body).
 *
 * Replaces the legacy `beginCanvasHookDrag('canvas-group-handle-*')` flow
 * which read the test-hook DOM div's `boundingBox()` to find the handle.
 * Under CPU load, the hook divs sometimes haven't re-rendered to their
 * post-commit position when boundingBox is read, so the click lands on
 * the overlay body instead of the handle (group-drag instead of
 * group-resize).  The in-page version reads handle positions directly
 * from React state, eliminating the DOM-render race.
 *
 * Pair with `movePointerToCanvasPoint` and `releasePointer` like the
 * legacy hook drag.
 */
export async function beginGroupHandleDrag(
  page: Page,
  handle: GroupHandleName,
  opts: ClickOpts = {},
) {
  await flushCanvasFrames(page);
  await page.evaluate(
    ({ handle, opts }) => {
      const api = window.__BB_TEST__;
      if (!api?.beginGroupHandleDrag) {
        throw new Error('__BB_TEST__.beginGroupHandleDrag is not available');
      }
      api.beginGroupHandleDrag(handle, opts);
    },
    { handle, opts },
  );
}

export async function movePointerToCanvasPoint(page: Page, destination: CanvasPoint, _steps = 18) {
  await page.evaluate(
    ({ destination }) => {
      const api = window.__BB_TEST__;
      if (!api?.movePointerCanvas) {
        throw new Error('__BB_TEST__.movePointerCanvas is not available');
      }
      api.movePointerCanvas(destination.x, destination.y);
    },
    { destination },
  );
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
  await page.evaluate(() => {
    const api = window.__BB_TEST__;
    if (!api?.releaseDrag) {
      throw new Error('__BB_TEST__.releaseDrag is not available');
    }
    api.releaseDrag();
  });
  // Wait for any active interaction session to finalize. The session is settled
  // when sessionKind is null (no session) or 'image-crop' (crop mode persists
  // across handle drags within the crop session).
  await expect.poll(async () => {
    const kind = (await readStageDebug(page)).sessionKind;
    return kind === null || kind === undefined || kind === 'image-crop';
  }).toBe(true);
}

export async function selectTool(page: Page, name: string) {
  const button = page.getByRole('button', { name: new RegExp(`^${name} \\(`) });
  await button.click();
  // Ensure the tool change has actually committed to the canvas event handlers.
  // Without this wait, a subsequent clickCanvas/dragCanvas can race against
  // @pixi/react's prop-sync to the Pixi event-root container — the click then
  // hits the previous tool's handler closure (e.g. zoom click ignored, text
  // creation skipped). The aria-pressed gate ensures React state committed;
  // the rAF gate ensures the Pixi listener has been swapped.
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await flushCanvasFrames(page);
}

export async function openLayersTab(page: Page) {
  const tabBody = page.getByTestId('layers-tab-body');
  if (await tabBody.isVisible().catch(() => false)) {
    return;
  }
  await page.getByRole('tab', { name: /Layers/ }).click();
}

export async function openPropertiesTab(page: Page) {
  const tabBody = page.getByTestId('properties-tab-body');
  if (await tabBody.isVisible().catch(() => false)) {
    return;
  }
  await page.getByRole('tab', { name: 'Properties' }).click();
}

export async function openFavoritesTab(page: Page) {
  const tabBody = page.getByTestId('favorites-tab-body');
  if (await tabBody.isVisible().catch(() => false)) {
    return;
  }
  await page.getByRole('tab', { name: /Favorites/ }).click();
}

export async function clickLayerRow(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
}

export async function doubleClickLayerRow(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).dblclick();
}

/**
 * Drags a layer grip handle to a target Y position with a specified X offset.
 * The X offset controls horizontal depth sensing for cross-parent drops.
 *
 * @param gripLabel - the aria-label of the grip (e.g. "Reorder Rectangle")
 * @param targetY - the page-space Y coordinate to drop at
 * @param targetX - optional page-space X coordinate (defaults to grip center X)
 */
export async function dragLayerGrip(
  page: Page,
  gripLabel: string,
  targetY: number,
  targetX?: number,
  steps = 5,
) {
  const grip = page.getByRole('button', { name: gripLabel });
  const box = await grip.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  const endX = targetX ?? startX;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, targetY, { steps });
  await page.mouse.up();
}

export async function openToolbarPopover(page: Page, triggerName: string) {
  await page.getByRole('button', { name: triggerName, exact: true }).click();
}

export async function clickToolbarPopoverItem(page: Page, triggerName: string, itemName: string) {
  await openToolbarPopover(page, triggerName);
  await page.getByRole('button', { name: itemName, exact: true }).click();
}

export async function addGenerator(page: Page, generatorName: string) {
  await page.getByRole('button', { name: 'Add generator', exact: true }).click();
  await page.getByRole('button', { name: generatorName, exact: true }).click();
}

export async function startToolbarFileChooser(page: Page, triggerName: string, itemName: string): Promise<FileChooser> {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    clickToolbarPopoverItem(page, triggerName, itemName),
  ]);
  return chooser;
}

export function collectLeafNodes(nodes: Array<Record<string, unknown>>) {
  return nodes.flatMap((node) => {
    if (node.kind === 'group' && Array.isArray(node.children)) {
      return collectLeafNodes(node.children as Array<Record<string, unknown>>);
    }
    return [node];
  });
}

function countVisibleLeafNodes(nodes: unknown[]): number {
  let count = 0;
  for (const node of nodes) {
    const n = node as { kind?: string; children?: unknown[]; hidden?: boolean };
    if (n.hidden) {
      continue;
    }
    if (n.kind === 'group' && Array.isArray(n.children)) {
      count += countVisibleLeafNodes(n.children);
    } else {
      count += 1;
    }
  }
  return count;
}

export async function uploadProject(page: Page, document: Record<string, unknown>, fileName = 'fixture.json') {
  const chooser = await startToolbarFileChooser(page, 'File', 'Load...');
  await chooser.setFiles({
    name: fileName,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document), 'utf8'),
  });

  // Wait for the canvas to finish rendering the uploaded nodes.
  // Without this, fast canvas interactions right after upload can race
  // against the React render cycle.
  const leafCount = countVisibleLeafNodes(
    (document as { nodes?: unknown[] }).nodes ?? [],
  );
  if (leafCount > 0) {
    await expect
      .poll(async () => (await readStageDebug(page)).renderedItemCount, {
        message: `waiting for ${leafCount} rendered leaf items after upload`,
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(leafCount);
  }
}

export async function uploadSvgImage(page: Page, name = 'fixture.svg') {
  const svg = buildSvgFixture();

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Add image', exact: true }).click(),
  ]);
  await chooser.setFiles({
    name,
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svg, 'utf8'),
  });
}

export async function uploadFont(page: Page, filePath: string) {
  await page.getByTestId('font-family-picker-trigger').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import font…' }).click(),
  ]);
  await chooser.setFiles(filePath);
}

/**
 * Locates a handle by its test ID bounding box, then drags it with real mouse
 * events. This avoids the dragCanvasHookToPoint pattern (synthetic mousedown on
 * invisible overlay) while still using test hooks to *find* the handle position.
 *
 * @param handle - test ID of the handle element (e.g. 'canvas-shape-handle-middle-right')
 * @param destination - canvas-space target point for the drag endpoint
 */
export async function dragRealHandle(
  page: Page,
  handle: string,
  destination: CanvasPoint,
  steps = 18,
) {
  const box = await page.getByTestId(handle).boundingBox();
  if (!box) {
    throw new Error(`Expected handle "${handle}" to have a bounding box.`);
  }
  const center = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
  const end = await canvasPointToPage(page, destination);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps });
  await page.mouse.up();
}

/**
 * Locates a handle by its test ID bounding box, then drags it to a viewport-
 * space offset from the handle center. Use this when the destination is easier
 * to express as a pixel delta rather than a canvas-space point.
 *
 * @param handle - test ID of the handle element
 * @param delta - viewport pixel offset from the handle center
 */
export async function dragRealHandleByDelta(
  page: Page,
  handle: string,
  delta: { dx: number; dy: number },
  steps = 18,
) {
  const box = await page.getByTestId(handle).boundingBox();
  if (!box) {
    throw new Error(`Expected handle "${handle}" to have a bounding box.`);
  }
  const center = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + delta.dx, center.y + delta.dy, { steps });
  await page.mouse.up();
}

/**
 * Opens the Properties tab and asserts that a specific property field has
 * changed relative to a baseline value. Uses expect.poll for async stability.
 *
 * @param field - accessible name or label of the property input
 * @param compare - comparison function receiving the current numeric value
 * @param description - description for the assertion (shown on failure)
 */
export async function expectPropertyValue(
  page: Page,
  field: string,
  compare: (value: number) => boolean,
  description?: string,
) {
  await openPropertiesTab(page);
  const locator = page.getByLabel(field);
  await expect(locator).toBeVisible();
  const assertion = expect.poll(
    async () => {
      const raw = await locator.inputValue();
      return parseFloat(raw);
    },
    { message: description ?? `Expected property "${field}" to satisfy condition` },
  );
  await assertion.toBeTruthy();
  // Re-check with the actual compare function
  const raw = await locator.inputValue();
  const value = parseFloat(raw);
  if (!compare(value)) {
    throw new Error(
      `${description ?? `Property "${field}"`}: got ${value}, which did not satisfy the condition`,
    );
  }
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
      await clickToolbarPopoverItem(page, 'File', 'Save');
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

export async function pasteClipboardPayloadOnActiveElement(
  page: Page,
  payload: Record<string, string>,
) {
  return page.evaluate(({ nextPayload }) => {
    const dataTransfer = new DataTransfer();
    for (const [mimeType, value] of Object.entries(nextPayload)) {
      dataTransfer.setData(mimeType, value);
    }
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer,
    });
    const target = (document.activeElement as HTMLElement | null) ?? document.body;
    target.dispatchEvent(event);

    return {
      defaultPrevented: event.defaultPrevented,
      payload: Object.fromEntries(
        Array.from(dataTransfer.types, (mimeType) => [mimeType, dataTransfer.getData(mimeType)]),
      ),
    };
  }, { nextPayload: payload }) as Promise<BrowserClipboardEventResult>;
}

export async function pasteImageClipboardFile(page: Page, name = 'clipboard-image.svg') {
  const svg = buildSvgFixture();
  return page.evaluate(({ nextName, nextSvg }) => {
    const dataTransfer = new DataTransfer();
    const file = new File([nextSvg], nextName, { type: 'image/svg+xml' });
    dataTransfer.items.add(file);

    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer,
    });
    document.dispatchEvent(event);

    return {
      defaultPrevented: event.defaultPrevented,
      payload: Object.fromEntries(
        Array.from(dataTransfer.types, (mimeType) => [mimeType, dataTransfer.getData(mimeType)]),
      ),
    };
  }, { nextName: name, nextSvg: svg }) as Promise<BrowserClipboardEventResult>;
}

export async function pasteClipboardPayloadWithImageFile(
  page: Page,
  payload: Record<string, string>,
  name = 'clipboard-image.svg',
) {
  const svg = buildSvgFixture();
  return page.evaluate(({ nextPayload, nextName, nextSvg }) => {
    const dataTransfer = new DataTransfer();
    for (const [mimeType, value] of Object.entries(nextPayload)) {
      dataTransfer.setData(mimeType, value);
    }
    const file = new File([nextSvg], nextName, { type: 'image/svg+xml' });
    dataTransfer.items.add(file);

    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer,
    });
    document.dispatchEvent(event);

    return {
      defaultPrevented: event.defaultPrevented,
      payload: Object.fromEntries(
        Array.from(dataTransfer.types, (mimeType) => [mimeType, dataTransfer.getData(mimeType)]),
      ),
    };
  }, { nextPayload: payload, nextName: name, nextSvg: svg }) as Promise<BrowserClipboardEventResult>;
}

export async function middleDragCanvas(page: Page, from: CanvasPoint, to: CanvasPoint, steps = 18) {
  // Middle-button gestures use real CDP mouse events. Pixi v8's federated
  // event dispatcher treats CDP-routed middle-button pointerdowns differently
  // from synthesized PointerEvents — CDP middle-button events skip the
  // handle's onMouseDown (which only fires for left button), so the gesture
  // bubbles to the item's pan branch. Synthesizing a PointerEvent(button:1)
  // and dispatching it on the canvas instead routes through the handle,
  // starting a resize. Use the real input pipeline here to preserve pan
  // semantics for VP-06 and any other middle-drag-on-handle test.
  const start = await canvasPointToPage(page, from);
  const end = await canvasPointToPage(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(end.x, end.y, { steps });
  await page.mouse.up({ button: 'middle' });
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
  // The app debounces autosave by 150ms after document/persistenceReady
  // changes (`useCanvasPersistence`).  Right after `openFreshEditor` boots
  // an empty document the timer is still running — if we seed IDB before it
  // fires, the timer's save() races our write and silently overwrites it
  // with the empty document.  Wait past the debounce so any pending
  // autosave has completed before we write our test data.
  await page.waitForTimeout(250);
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  await page.evaluate(async ({ value, version }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('billboard-builder', version);
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
  }, { value: serialized, version: EDITOR_DATABASE_VERSION });
}

export async function primePersistenceBeforeLoad(page: Page, payload: string | Record<string, unknown>) {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  await page.addInitScript(async ({ value, version }) => {
    if (window.sessionStorage.getItem('bb-persist-seeded') === 'true') {
      return;
    }
    window.sessionStorage.setItem('bb-persist-seeded', 'true');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('billboard-builder', version);
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
  }, { value: serialized, version: EDITOR_DATABASE_VERSION });
}

export async function clearPersistence(page: Page) {
  await page.evaluate(async (version) => {
    window.localStorage.removeItem('billboard-builder:favorites:v1');
    window.localStorage.removeItem('billboard-builder:templates:v1');
    window.sessionStorage.removeItem('bb-persist-seeded');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('billboard-builder', version);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('canvas')) {
          database.createObjectStore('canvas');
        }
        if (!database.objectStoreNames.contains('uploaded-fonts')) {
          database.createObjectStore('uploaded-fonts');
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(['canvas', 'uploaded-fonts'], 'readwrite');
        transaction.objectStore('canvas').delete('current');
        transaction.objectStore('uploaded-fonts').clear();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
      };
    });
  }, EDITOR_DATABASE_VERSION);
}

