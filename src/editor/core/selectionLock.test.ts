import { describe, expect, it } from 'vitest';

import { createGroupNode, createRectangleItem } from '../document/documentDefaults';
import type { GroupNode } from '../document/documentTypes';

import {
  buildSelectionLockCommands,
  getNodeLockState,
  getSelectionLockState,
} from './selectionLock';

function group(id: string, children: GroupNode['children'], locked = false): GroupNode {
  return { ...createGroupNode(children, id), id, locked };
}

describe('getNodeLockState', () => {
  it('reads a leaf item from its own flag', () => {
    expect(getNodeLockState(createRectangleItem({ locked: true }))).toBe('locked');
    expect(getNodeLockState(createRectangleItem({ locked: false }))).toBe('unlocked');
  });

  it('treats a locked group as locked whatever its children say', () => {
    const node = group('g', [createRectangleItem({ locked: false })], true);

    expect(getNodeLockState(node)).toBe('locked');
  });

  it('reports an unlocked group by its contents', () => {
    const free = createRectangleItem({ id: 'free' });
    const pinned = createRectangleItem({ id: 'pinned', locked: true });

    expect(getNodeLockState(group('none', [free]))).toBe('unlocked');
    expect(getNodeLockState(group('some', [free, pinned]))).toBe('mixed');
    expect(getNodeLockState(group('all', [pinned]))).toBe('locked');
    expect(getNodeLockState(group('empty', []))).toBe('unlocked');
  });

  it('sees locks nested several groups deep', () => {
    const pinned = createRectangleItem({ id: 'pinned', locked: true });
    const free = createRectangleItem({ id: 'free' });
    const inner = group('inner', [pinned]);

    expect(getNodeLockState(group('outer', [inner, free]))).toBe('mixed');
    expect(getNodeLockState(group('outer', [group('inner-locked', [free], true)]))).toBe('locked');
  });
});

describe('getSelectionLockState', () => {
  it('returns null for an empty selection', () => {
    expect(getSelectionLockState([])).toBeNull();
  });

  it('combines the selected nodes', () => {
    const free = createRectangleItem({ id: 'free' });
    const pinned = createRectangleItem({ id: 'pinned', locked: true });

    expect(getSelectionLockState([free, free])).toBe('unlocked');
    expect(getSelectionLockState([pinned, group('g', [free], true)])).toBe('locked');
    expect(getSelectionLockState([free, pinned])).toBe('mixed');
    expect(getSelectionLockState([free, group('g', [free, pinned])])).toBe('mixed');
  });
});

describe('buildSelectionLockCommands', () => {
  it('locks only the selected nodes that are not locked yet, leaving children alone', () => {
    const free = createRectangleItem({ id: 'free' });
    const pinned = createRectangleItem({ id: 'pinned', locked: true });
    const child = createRectangleItem({ id: 'child' });

    expect(buildSelectionLockCommands([free, pinned, group('g', [child])], true)).toEqual([
      { type: 'update_node', itemId: 'free', changes: { locked: true } },
      { type: 'update_group', groupId: 'g', changes: { locked: true } },
    ]);
  });

  it('unlocks a group together with every lock inside it', () => {
    const free = createRectangleItem({ id: 'free' });
    const pinned = createRectangleItem({ id: 'pinned', locked: true });
    const inner = group('inner', [pinned], true);

    expect(buildSelectionLockCommands([group('outer', [free, inner], true)], false)).toEqual([
      { type: 'update_group', groupId: 'outer', changes: { locked: false } },
      { type: 'update_group', groupId: 'inner', changes: { locked: false } },
      { type: 'update_node', itemId: 'pinned', changes: { locked: false } },
    ]);
  });

  it('returns nothing when the selection is already in the requested state', () => {
    const free = createRectangleItem({ id: 'free' });
    const pinned = createRectangleItem({ id: 'pinned', locked: true });

    expect(buildSelectionLockCommands([pinned], true)).toEqual([]);
    expect(buildSelectionLockCommands([free, group('g', [free])], false)).toEqual([]);
  });
});
