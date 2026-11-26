import { describe, expect, it } from 'vitest';

import {
  buildInteractionCommit,
  createGroupResizeSession,
  createResizeSession,
  resolveInteractionSession,
  type SelectionFrame,
  type SessionWithModifiers,
} from './interactionSession';
import { createRectangleItem, createTextItem } from '../document/documentDefaults';
import type { CanvasItem, TextCanvasItem } from '../document/documentTypes';

const canvasBounds = { x: 0, y: 0, width: 4000, height: 4000 };

function logoText(): TextCanvasItem {
  return {
    ...createTextItem({ id: 'word', x: 100, y: 100, width: 200, height: 60 }),
    fontSize: 40,
    letterSpacing: 3,
    strokeWidth: 2,
    padding: { top: 4, right: 6, bottom: 4, left: 6 },
    shadow: { color: '#000000', blur: 8, offsetX: 2, offsetY: 4, opacity: 0.5 },
  };
}

function groupSession(
  handle: 'bottom-right' | 'middle-right',
  items: CanvasItem[],
  frame: SelectionFrame,
  pointerStart: { x: number; y: number },
) {
  const session = createGroupResizeSession(handle, pointerStart, {
    selectedItems: items,
    siblingItems: [],
    activeSelectionFrame: frame,
  });
  if (!session) throw new Error('Expected group resize session.');
  return session;
}

function commitGroup(session: SessionWithModifiers, pointer: { x: number; y: number }, items: CanvasItem[]) {
  const resolved = resolveInteractionSession(session, pointer, { stageBounds: canvasBounds });
  const commit = buildInteractionCommit(resolved, { nodes: items, pointer, canvasBounds });
  if (commit.kind !== 'group') throw new Error('Expected group commit.');
  return commit;
}

describe('scaling resize (Alt-drag on a corner)', () => {
  // A 300x100 selection: text on the left, a rule to its right.
  const frame: SelectionFrame = { bounds: { x: 100, y: 100, width: 300, height: 100 }, rotation: 0 };
  const rule = () => ({
    ...createRectangleItem({ id: 'rule', x: 320, y: 180, width: 80, height: 20 }),
    strokeWidth: 3,
    cornerRadius: 5,
  });

  it('scales text and shape settings with a group, proportionally without Shift', () => {
    const items = [logoText(), rule()];
    const session = groupSession('bottom-right', items, frame, { x: 400, y: 200 });

    // The pointer goes well off the diagonal; the frame still doubles.
    const commit = commitGroup({ ...session, scaleContents: true }, { x: 700, y: 230 }, items);

    expect(commit.selectionFrame?.bounds).toMatchObject({ x: 100, y: 100, width: 600, height: 200 });
    const [word, line] = commit.updates.map((update) => update.changes as Record<string, unknown>);
    expect(word).toMatchObject({
      x: 100,
      y: 100,
      width: 400,
      height: 120,
      fontSize: 80,
      letterSpacing: 6,
      strokeWidth: 4,
      padding: { top: 8, right: 12, bottom: 8, left: 12 },
      shadow: { color: '#000000', blur: 16, offsetX: 4, offsetY: 8, opacity: 0.5 },
    });
    expect(line).toMatchObject({ width: 160, height: 40, strokeWidth: 6, cornerRadius: 10 });
  });

  it('keeps fractional font sizes', () => {
    const items = [logoText(), rule()];
    const session = groupSession('bottom-right', items, frame, { x: 400, y: 200 });
    const commit = commitGroup({ ...session, scaleContents: true }, { x: 437, y: 0 }, items);
    const fontSize = (commit.updates[0].changes as Partial<TextCanvasItem>).fontSize;
    expect(fontSize).toBeCloseTo(40 * (337 / 300), 6);
  });

  it('leaves the settings alone in a plain or Shift resize', () => {
    const items = [logoText(), rule()];
    const session = groupSession('bottom-right', items, frame, { x: 400, y: 200 });
    for (const modifiers of [{}, { shiftConstrain: true }]) {
      const commit = commitGroup({ ...session, ...modifiers }, { x: 700, y: 300 }, items);
      expect(commit.updates[0].changes).not.toHaveProperty('fontSize');
      expect(commit.updates[1].changes).not.toHaveProperty('strokeWidth');
    }
  });

  it('does nothing on a side handle, like Shift', () => {
    const items = [logoText(), rule()];
    const session = groupSession('middle-right', items, frame, { x: 400, y: 150 });
    const commit = commitGroup({ ...session, scaleContents: true }, { x: 700, y: 150 }, items);
    expect(commit.selectionFrame?.bounds).toMatchObject({ width: 600, height: 100 });
    expect(commit.updates[0].changes).not.toHaveProperty('fontSize');
  });

  it('scales by the same factor as the boxes in a rotated selection frame', () => {
    const items = [logoText(), rule()];
    const rotated: SelectionFrame = { bounds: frame.bounds, rotation: 30 };
    const session = groupSession('bottom-right', items, rotated, { x: 400, y: 200 });
    const commit = commitGroup({ ...session, scaleContents: true }, { x: 520, y: 330 }, items);
    const word = commit.updates[0].changes as Partial<TextCanvasItem>;
    const factor = word.fontSize! / 40;
    expect(factor).toBeGreaterThan(1.05);
    expect(word.width! / 200).toBeCloseTo(factor, 6);
    expect(word.height! / 60).toBeCloseTo(factor, 6);
    const b = commit.selectionFrame!.bounds;
    expect(b.width / b.height).toBeCloseTo(3, 6);
  });

  it('keeps a Shift resize of a rotated selection frame proportional', () => {
    // The ratio used to be enforced along the canvas axes instead of the
    // frame's own, which stretched a rotated selection.
    const items = [logoText(), rule()];
    const rotated: SelectionFrame = { bounds: frame.bounds, rotation: 30 };
    const session = groupSession('bottom-right', items, rotated, { x: 400, y: 200 });
    const commit = commitGroup({ ...session, shiftConstrain: true }, { x: 520, y: 330 }, items);
    const b = commit.selectionFrame!.bounds;
    expect(b.width).toBeGreaterThan(315);
    expect(b.width / b.height).toBeCloseTo(3, 6);
    const word = commit.updates[0].changes as Partial<TextCanvasItem>;
    expect(word.width! / 200).toBeCloseTo(word.height! / 60, 6);
    expect(word).not.toHaveProperty('fontSize');
  });

  it('scales a single text box', () => {
    const word = logoText();
    const session = createResizeSession(word, 'bottom-right', { x: 300, y: 160 }, []);
    const pointer = { x: 500, y: 170 };
    const resolved = resolveInteractionSession(
      { ...session, scaleContents: true, snapDisabled: true } as SessionWithModifiers,
      pointer,
      { stageBounds: canvasBounds },
    );
    const commit = buildInteractionCommit(resolved, { nodes: [word], pointer, canvasBounds });
    if (commit.kind !== 'single-item') throw new Error('Expected single-item commit.');
    expect(commit.changes).toMatchObject({
      x: 100,
      y: 100,
      width: 400,
      fontSize: 80,
      letterSpacing: 6,
      strokeWidth: 4,
    });
  });

  it('leaves a single text box its font size in a plain resize', () => {
    const word = logoText();
    const session = createResizeSession(word, 'bottom-right', { x: 300, y: 160 }, []);
    const pointer = { x: 500, y: 220 };
    const resolved = resolveInteractionSession(
      { ...session, snapDisabled: true } as SessionWithModifiers,
      pointer,
      { stageBounds: canvasBounds },
    );
    const commit = buildInteractionCommit(resolved, { nodes: [word], pointer, canvasBounds });
    if (commit.kind !== 'single-item') throw new Error('Expected single-item commit.');
    expect(commit.changes).not.toHaveProperty('fontSize');
  });
});
