import { isGroupNode } from '../document/sceneGraph';
import type { CanvasNode, EditorCommand } from '../document/documentTypes';

export type SelectionLockState = 'locked' | 'unlocked' | 'mixed';

type LockCommand = Extract<EditorCommand, { type: 'update_node' | 'update_group' }>;

function combineLockStates(states: SelectionLockState[]): SelectionLockState {
  if (states.every((state) => state === 'locked')) {
    return 'locked';
  }
  return states.every((state) => state === 'unlocked') ? 'unlocked' : 'mixed';
}

/**
 * Lock state of one node as the user experiences it. A group counts as locked
 * through its own flag or because everything inside it is locked, and as
 * mixed when only part of its contents is locked: the canvas refuses to move
 * a group that holds any locked item, so "unlocked" would be a lie there.
 */
export function getNodeLockState(node: CanvasNode): SelectionLockState {
  if (node.locked) {
    return 'locked';
  }
  if (!isGroupNode(node) || node.children.length === 0) {
    return 'unlocked';
  }
  return combineLockStates(node.children.map(getNodeLockState));
}

/** Lock state of a whole selection, or null when nothing is selected. */
export function getSelectionLockState(nodes: CanvasNode[]): SelectionLockState | null {
  return nodes.length === 0 ? null : combineLockStates(nodes.map(getNodeLockState));
}

function setLockedCommand(node: CanvasNode, locked: boolean): LockCommand {
  return isGroupNode(node)
    ? { type: 'update_group', groupId: node.id, changes: { locked } }
    : { type: 'update_node', itemId: node.id, changes: { locked } };
}

function collectUnlockCommands(node: CanvasNode): LockCommand[] {
  const own = node.locked ? [setLockedCommand(node, false)] : [];
  return isGroupNode(node) ? [...own, ...node.children.flatMap(collectUnlockCommands)] : own;
}

/**
 * Commands that bring every given node to one lock state.
 *
 * Locking sets each node's own flag only, which is enough to pin a group and
 * keeps the individual locks inside it. Unlocking also clears every lock
 * inside a group, since a group stays immovable while any descendant is
 * locked.
 */
export function buildSelectionLockCommands(nodes: CanvasNode[], locked: boolean): LockCommand[] {
  if (locked) {
    return nodes.filter((node) => !node.locked).map((node) => setLockedCommand(node, true));
  }
  return nodes.flatMap(collectUnlockCommands);
}
