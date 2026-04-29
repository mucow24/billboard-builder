/**
 * In-page test API exposed on `window.__BB_TEST__`.
 *
 * Why this exists: e2e tests previously dispatched canvas clicks via
 * Playwright's `page.mouse.click(x, y)`, computing screen coords from a
 * separate `evaluate` that read viewport state.  That two-RPC pattern races
 * against React commits and layout shifts — the coord read and the dispatch
 * are not atomic, so anything that moves the canvas between them lands the
 * click on the wrong canvas point.
 *
 * The methods here run inside `page.evaluate` callbacks: they read the
 * latest viewport/items refs and dispatch a synthesized PointerEvent on the
 * `<canvas>` in a single JS frame.  No race window.
 *
 * Tests target items by id (which fixtures already provide) instead of by
 * pixel position, eliminating fragility against zoom, pan, rotation, and
 * layout changes.
 */
import { useEffect, useRef } from 'react';

import type { CanvasItem, LineCanvasItem } from '../../document/documentTypes';
import type { Point } from '../transformGeometry';
import { getItemAABB } from '../selectionGeometry';
import type { CanvasRendererHandle } from '../renderer/canvasRendererTypes';
import { toViewportPoint } from './viewportMath';
import { getShapeOverlayHandlePoints } from './overlayGeometry';

export type ResizeHandleName =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type HandleName = ResizeHandleName | 'rotater' | 'line-start' | 'line-end';

export interface ClickOpts {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  /** Mouse button: 0 = left (default), 1 = middle, 2 = right. */
  button?: number;
}

export interface DragOpts extends ClickOpts {
  /** Number of intermediate `pointermove` events between down and up. */
  steps?: number;
}

export interface BBTestApi {
  captureRenderSnapshot?: () => unknown;
  /** True once the Pixi `<Application>` has initialized and its canvas is in the DOM. */
  rendererReady?: () => boolean;
  /** Click the center of the item with the given id. */
  clickItem?: (id: string, opts?: ClickOpts) => Promise<void>;
  /** Two clicks in rapid succession (within the editor's drilldown window). */
  doubleClickItem?: (id: string, opts?: ClickOpts) => Promise<void>;
  /** Drag the item from its current center to (canvasX, canvasY) in canvas coordinates. */
  dragItemTo?: (id: string, canvasX: number, canvasY: number, opts?: DragOpts) => Promise<void>;
  /**
   * Drag a resize / rotate / line-endpoint handle of an item by (dx, dy)
   * in canvas-space pixels.  Works whether or not CanvasTestHooks is mounted —
   * coords are computed from item geometry directly.
   */
  dragHandle?: (
    itemId: string,
    handle: HandleName,
    dx: number,
    dy: number,
    opts?: DragOpts,
  ) => Promise<void>;
  /** Click an empty canvas point (e.g. to deselect, or start a marquee gesture). */
  clickEmptyCanvas?: (canvasX: number, canvasY: number, opts?: ClickOpts) => Promise<void>;
  /** Drag between two canvas points without targeting an item (marquee, create-tool, etc.). */
  dragEmptyCanvas?: (
    fromCanvasX: number,
    fromCanvasY: number,
    toCanvasX: number,
    toCanvasY: number,
    opts?: DragOpts,
  ) => Promise<void>;
  /**
   * Start a drag at a canvas point.  Use with `movePointerCanvas` and
   * `releaseDrag` for tests that need to inspect mid-drag state.
   */
  beginDrag?: (canvasX: number, canvasY: number, opts?: ClickOpts & { button?: number }) => void;
  /** Move the pointer to a canvas point (during an in-progress drag, or as a hover). */
  movePointerCanvas?: (canvasX: number, canvasY: number, opts?: ClickOpts) => void;
  /** Move the pointer to a client (page) coord — for gestures originated outside the canvas (test-hook DOM elements). */
  movePointerClient?: (clientX: number, clientY: number, opts?: ClickOpts) => void;
  /** Release the pointer at its last known position. */
  releaseDrag?: (opts?: ClickOpts & { button?: number }) => void;
  /**
   * Dispatch a wheel event on the canvas at the given canvas point.  Tests
   * that previously called `page.mouse.wheel` need this — the Playwright
   * mouse cursor is no longer kept in sync with the canvas (we dispatch
   * synthetically), so a CDP wheel lands at (0,0) and gets ignored.
   */
  wheelAt?: (canvasX: number, canvasY: number, deltaY: number, deltaX?: number) => void;
  /** [Diagnostic] Read the current held-modifier state mirrored from window keyboard events. */
  _heldModifiers?: () => { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean };
}

declare global {
  interface Window {
    __BB_TEST__?: BBTestApi;
  }
}

interface UseCanvasTestApiParams {
  stageRef: React.RefObject<CanvasRendererHandle | null>;
  renderedItems: CanvasItem[];
  pan: Point;
  zoom: number;
  /** Set to true once Pixi `<Application>`'s `onInit` has fired. */
  rendererReady: boolean;
}

export function useCanvasTestApi({
  stageRef,
  renderedItems,
  pan,
  zoom,
  rendererReady,
}: UseCanvasTestApiParams) {
  // Mirror inputs into refs so the registered methods always observe the
  // current values.  Re-registering on every render would churn `__BB_TEST__`
  // and risk dropping a method between cleanup and re-add; refs avoid that.
  const stageRefRef = useRef(stageRef);
  stageRefRef.current = stageRef;
  const renderedItemsRef = useRef(renderedItems);
  renderedItemsRef.current = renderedItems;
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const rendererReadyRef = useRef(rendererReady);
  rendererReadyRef.current = rendererReady;

  useEffect(() => {
    // Mirror Playwright's modifier-key state so synthetic events carry the
    // right shiftKey/ctrlKey/altKey/metaKey when the test does
    // `page.keyboard.down('Shift')` then calls `clickItem(...)` without
    // passing an explicit modifier.  KeyboardEvent already exposes the full
    // post-event state via `.getModifierState()`, so we don't need to track
    // each key individually — just snapshot from the latest event.
    const heldModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
    const onKey = (e: KeyboardEvent) => {
      heldModifiers.shiftKey = e.getModifierState('Shift');
      heldModifiers.ctrlKey = e.getModifierState('Control');
      heldModifiers.altKey = e.getModifierState('Alt');
      heldModifiers.metaKey = e.getModifierState('Meta');
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);

    function applyHeldModifiers(opts: ClickOpts): ClickOpts {
      // Caller-provided modifier flags override the held state.
      return {
        button: opts.button,
        shiftKey: opts.shiftKey ?? heldModifiers.shiftKey,
        ctrlKey: opts.ctrlKey ?? heldModifiers.ctrlKey,
        altKey: opts.altKey ?? heldModifiers.altKey,
        metaKey: opts.metaKey ?? heldModifiers.metaKey,
      };
    }

    function getCanvas(): HTMLCanvasElement | null {
      const node = stageRefRef.current.current?.getContainerElement() ?? null;
      // CanvasRendererHandle.getContainerElement returns HTMLCanvasElement here,
      // but its return type is the broader Element. Narrow without an unsafe cast.
      return node instanceof HTMLCanvasElement ? node : null;
    }

    function rendererReady(): boolean {
      // Two conditions: Pixi finished `<Application>` init (signaled via
      // onInit → React state → ref), AND the canvas is in the DOM.
      return rendererReadyRef.current && getCanvas() != null;
    }

    function requireCanvas(): HTMLCanvasElement {
      const canvas = getCanvas();
      if (!canvas) {
        throw new Error(
          '__BB_TEST__: Pixi <Application> has not finished initializing — no canvas in DOM.',
        );
      }
      if (!rendererReadyRef.current) {
        throw new Error(
          '__BB_TEST__: Pixi <Application> onInit has not yet fired; events would be dropped.',
        );
      }
      return canvas;
    }

    function findItem(id: string): CanvasItem {
      const item = renderedItemsRef.current.find((i) => i.id === id);
      if (!item) {
        throw new Error(
          `__BB_TEST__: no rendered item with id "${id}". ` +
            `Available: [${renderedItemsRef.current.map((i) => i.id).join(', ')}]`,
        );
      }
      return item;
    }

    function itemCenterCanvas(item: CanvasItem): Point {
      // Use rotation-aware AABB so rotated items still get a center on the
      // visible shape rather than its un-rotated bounding box.
      const box = getItemAABB(item);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }

    function canvasPointToClient(canvasPoint: Point): { clientX: number; clientY: number } {
      const canvas = requireCanvas();
      const viewportPoint = toViewportPoint(canvasPoint, zoomRef.current, panRef.current);
      const rect = canvas.getBoundingClientRect();
      return {
        clientX: rect.left + viewportPoint.x,
        clientY: rect.top + viewportPoint.y,
      };
    }

    function getHandleCanvasPoint(item: CanvasItem, handle: HandleName): Point {
      if (handle === 'line-start' || handle === 'line-end') {
        if (item.kind !== 'line') {
          throw new Error(
            `__BB_TEST__: handle "${handle}" requires a line item but item "${item.id}" is "${item.kind}"`,
          );
        }
        const line = item as LineCanvasItem;
        return handle === 'line-start'
          ? { x: line.startX, y: line.startY }
          : { x: line.endX, y: line.endY };
      }
      if (item.kind === 'line') {
        throw new Error(
          `__BB_TEST__: shape handle "${handle}" is not valid for a line item`,
        );
      }
      const points = getShapeOverlayHandlePoints(item, zoomRef.current);
      return points[handle];
    }

    // Tracks whether a button is currently pressed in our synthetic gesture.
    // pointermoves dispatched while no button is held must report buttons=0
    // (hover); during a drag they report the held bitmask.  Without this,
    // a hover-pointermove before pointerdown would look like a drag-move
    // and the editor's click-vs-drag heuristics misroute the gesture.
    let pressedButton: number | null = null;

    // Browser `buttons` bitfield doesn't match the `button` enum:
    //   left  (button=0) → bit 0x1
    //   right (button=2) → bit 0x2
    //   middle(button=1) → bit 0x4
    // So `1 << button` is wrong — middle would be 2 (right's bit).  Use a
    // lookup so middle-drag actually presents as the middle button held.
    const BUTTON_TO_BUTTONS_BIT: Record<number, number> = { 0: 1, 1: 4, 2: 2 };
    function buttonsBit(button: number): number {
      return BUTTON_TO_BUTTONS_BIT[button] ?? 1 << button;
    }

    function dispatchPointerEvent(
      type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerover',
      clientX: number,
      clientY: number,
      opts: ClickOpts,
    ) {
      const canvas = requireCanvas();
      // Real browser pointerdowns blur whatever input/button currently has
      // focus.  Our synthetic dispatch doesn't.  Be conservative: only blur
      // toolbar/aside controls so we don't disturb file-picker or other
      // focus-dependent flows.
      if (type === 'pointerdown') {
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          (active.closest('.top-toolbar') ||
            active.closest('aside.canvas-stage-aside') ||
            active.closest('[data-testid="tool-palette"]'))
        ) {
          active.blur();
        }
      }
      const button = opts.button ?? 0;
      let buttons: number;
      if (type === 'pointerdown') {
        pressedButton = button;
        buttons = buttonsBit(button);
      } else if (type === 'pointerup') {
        pressedButton = null;
        buttons = 0;
      } else {
        // pointermove / pointerover
        buttons = pressedButton == null ? 0 : buttonsBit(pressedButton);
      }
      const eventInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: type === 'pointermove' ? -1 : button,
        buttons,
        clientX,
        clientY,
        shiftKey: opts.shiftKey ?? false,
        ctrlKey: opts.ctrlKey ?? false,
        altKey: opts.altKey ?? false,
        metaKey: opts.metaKey ?? false,
      };
      canvas.dispatchEvent(
        new PointerEvent(type, {
          ...eventInit,
          pointerType: 'mouse',
          pointerId: 1,
          isPrimary: true,
        }),
      );
      // Real browsers fire BOTH pointer and mouse events for mouse input.
      // Some editor handlers (window-level mousemove fallback for crop
      // sessions, the document.addEventListener('mousemove')-style mirror,
      // etc.) listen on the mouse track only — without this dispatch, those
      // handlers never see the gesture.
      const mouseType: Record<string, string> = {
        pointerdown: 'mousedown',
        pointermove: 'mousemove',
        pointerup: 'mouseup',
        pointerover: 'mouseover',
      };
      const m = mouseType[type];
      if (m) canvas.dispatchEvent(new MouseEvent(m, eventInit));
    }

    // Yield to the event loop between dispatched events so React can commit
    // state changes triggered by the previous event before the next fires.
    // Specifically: handlers like `useCanvasInteractionSession`'s window
    // mousemove listener are added by a `useEffect` that depends on session
    // state.  React schedules effect callbacks via `MessageChannel` postMessage
    // (a macrotask), so we need to yield past that — a `setTimeout(0)` queues
    // a macrotask after React's effect flush.  rAF alone isn't enough: it
    // fires before React's macrotask, so the window listener hasn't been
    // installed yet and the next pointermove sails past unhandled.
    function yieldFrame(): Promise<void> {
      // Multiple MessageChannel round-trips.  We avoid requestAnimationFrame
      // because headless Chromium throttles rAF in non-visible windows to
      // ~1/sec, which would push our dispatched clicks past the editor's
      // 400ms double-click window.  React's scheduler also runs on
      // MessageChannel; queueing several macrotasks gives any pending
      // useEffect (e.g. the window mousemove listener registration when
      // a session begins) time to flush before the next event fires.
      return new Promise((resolve) => {
        let count = 0;
        function tick() {
          count++;
          if (count >= 5) {
            resolve();
            return;
          }
          const channel = new MessageChannel();
          channel.port1.onmessage = tick;
          channel.port2.postMessage(null);
        }
        tick();
      });
    }

    async function dispatchClick(clientX: number, clientY: number, opts: ClickOpts) {
      const merged = applyHeldModifiers(opts);
      // pointermove primes Pixi's hover/hit state for the upcoming press.
      // No yield between down and up — keeping these synchronous preserves
      // the editor's per-item double-click cadence (diff < 400ms = double).
      // Only a single trailing yield so tests see the post-up commit.
      dispatchPointerEvent('pointermove', clientX, clientY, merged);
      dispatchPointerEvent('pointerdown', clientX, clientY, merged);
      dispatchPointerEvent('pointerup', clientX, clientY, merged);
      await yieldFrame();
    }

    async function dispatchDrag(
      from: { clientX: number; clientY: number },
      to: { clientX: number; clientY: number },
      opts: DragOpts,
    ) {
      const merged = applyHeldModifiers(opts);
      const steps = Math.max(1, opts.steps ?? 8);
      dispatchPointerEvent('pointermove', from.clientX, from.clientY, merged);
      dispatchPointerEvent('pointerdown', from.clientX, from.clientY, merged);
      // Yield so React commits the session state and the window mousemove
      // listener is wired before the next event.
      await yieldFrame();
      for (let i = 1; i <= steps; i++) {
        const t = i / (steps + 1);
        dispatchPointerEvent(
          'pointermove',
          from.clientX + (to.clientX - from.clientX) * t,
          from.clientY + (to.clientY - from.clientY) * t,
          merged,
        );
      }
      dispatchPointerEvent('pointermove', to.clientX, to.clientY, merged);
      // Yield once more so all the move-driven state updates commit before
      // pointerup.  Without this, a fast-firing series of moves can race
      // against React batching and the last move's commit may not land
      // before the test reads state.
      await yieldFrame();
      dispatchPointerEvent('pointerup', to.clientX, to.clientY, merged);
      // Final yield so the post-up commit (session cleanup, finalized item
      // state) is visible to the next test step.
      await yieldFrame();
    }

    async function clickItem(id: string, opts: ClickOpts = {}) {
      const item = findItem(id);
      const { clientX, clientY } = canvasPointToClient(itemCenterCanvas(item));
      await dispatchClick(clientX, clientY, opts);
    }

    async function doubleClickItem(id: string, opts: ClickOpts = {}) {
      // Re-resolve the item position before each click. If something between
      // the two clicks shifts the item's document position (e.g. a layout
      // commit, a viewport pan, or a stray gesture commit during React's
      // batched flush), the second click still lands on the item's actual
      // current center — not where it was before the first click.
      const click = async () => {
        const item = findItem(id);
        const { clientX, clientY } = canvasPointToClient(itemCenterCanvas(item));
        await dispatchClick(clientX, clientY, opts);
      };
      await click();
      await click();
    }

    async function dragItemTo(id: string, canvasX: number, canvasY: number, opts: DragOpts = {}) {
      const item = findItem(id);
      const from = canvasPointToClient(itemCenterCanvas(item));
      const to = canvasPointToClient({ x: canvasX, y: canvasY });
      await dispatchDrag(from, to, opts);
    }

    async function dragHandle(
      itemId: string,
      handle: HandleName,
      dx: number,
      dy: number,
      opts: DragOpts = {},
    ) {
      const item = findItem(itemId);
      const fromCanvas = getHandleCanvasPoint(item, handle);
      const from = canvasPointToClient(fromCanvas);
      const to = canvasPointToClient({ x: fromCanvas.x + dx, y: fromCanvas.y + dy });
      await dispatchDrag(from, to, opts);
    }

    async function clickEmptyCanvas(canvasX: number, canvasY: number, opts: ClickOpts = {}) {
      const { clientX, clientY } = canvasPointToClient({ x: canvasX, y: canvasY });
      await dispatchClick(clientX, clientY, opts);
    }

    async function dragEmptyCanvas(
      fromCanvasX: number,
      fromCanvasY: number,
      toCanvasX: number,
      toCanvasY: number,
      opts: DragOpts = {},
    ) {
      const from = canvasPointToClient({ x: fromCanvasX, y: fromCanvasY });
      const to = canvasPointToClient({ x: toCanvasX, y: toCanvasY });
      await dispatchDrag(from, to, opts);
    }

    // ── Pause-able drag (for tests that inspect mid-drag state) ─────────
    // Each method is its own page.evaluate from the test side; between
    // calls Playwright can poll session state.  The "last pointer" is
    // tracked here so releaseDrag can complete the gesture without the
    // caller re-supplying coordinates.
    let lastPointerClient: { clientX: number; clientY: number; opts: ClickOpts } | null = null;

    function beginDrag(canvasX: number, canvasY: number, opts: ClickOpts = {}) {
      const merged = applyHeldModifiers(opts);
      const { clientX, clientY } = canvasPointToClient({ x: canvasX, y: canvasY });
      dispatchPointerEvent('pointermove', clientX, clientY, merged);
      dispatchPointerEvent('pointerdown', clientX, clientY, merged);
      lastPointerClient = { clientX, clientY, opts: merged };
    }

    function movePointerCanvas(canvasX: number, canvasY: number, opts: ClickOpts = {}) {
      const merged = applyHeldModifiers(opts);
      const { clientX, clientY } = canvasPointToClient({ x: canvasX, y: canvasY });
      dispatchPointerEvent('pointermove', clientX, clientY, merged);
      lastPointerClient = { clientX, clientY, opts: merged };
    }

    function movePointerClient(clientX: number, clientY: number, opts: ClickOpts = {}) {
      // Sanity-check the canvas exists; pointer coords are already in client space.
      requireCanvas();
      const merged = applyHeldModifiers(opts);
      dispatchPointerEvent('pointermove', clientX, clientY, merged);
      lastPointerClient = { clientX, clientY, opts: merged };
    }

    function releaseDrag(opts: ClickOpts = {}) {
      if (!lastPointerClient) {
        throw new Error('__BB_TEST__: releaseDrag called without a prior beginDrag/movePointerCanvas');
      }
      const merged = applyHeldModifiers({ ...lastPointerClient.opts, ...opts });
      dispatchPointerEvent('pointerup', lastPointerClient.clientX, lastPointerClient.clientY, merged);
      lastPointerClient = null;
    }

    function wheelAt(canvasX: number, canvasY: number, deltaY: number, deltaX = 0) {
      const canvas = requireCanvas();
      const { clientX, clientY } = canvasPointToClient({ x: canvasX, y: canvasY });
      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX,
        clientY,
        deltaX,
        deltaY,
        deltaMode: 0,
      });
      canvas.dispatchEvent(event);
    }

    window.__BB_TEST__ = {
      ...window.__BB_TEST__,
      rendererReady,
      clickItem,
      doubleClickItem,
      dragItemTo,
      dragHandle,
      clickEmptyCanvas,
      dragEmptyCanvas,
      beginDrag,
      movePointerCanvas,
      movePointerClient,
      releaseDrag,
      wheelAt,
      _heldModifiers: () => ({ ...heldModifiers }),
    };

    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      const api = window.__BB_TEST__;
      if (!api) return;
      delete api.rendererReady;
      delete api.clickItem;
      delete api.doubleClickItem;
      delete api.dragItemTo;
      delete api.dragHandle;
      delete api.clickEmptyCanvas;
      delete api.dragEmptyCanvas;
      delete api.beginDrag;
      delete api.movePointerCanvas;
      delete api.movePointerClient;
      delete api.releaseDrag;
      delete api.wheelAt;
      delete api._heldModifiers;
      if (Object.keys(api).length === 0) {
        delete window.__BB_TEST__;
      }
    };
  }, []);
}
