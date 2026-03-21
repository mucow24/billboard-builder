import type { LayerRow } from '../../document/sceneGraph';

export type TreeGuideKind = 'pipe' | 'branch' | 'branch-last' | 'empty';

/**
 * Computes CSS tree guide slots for each visible row in the layers panel.
 *
 * For a row at depth d, returns an array of d guide kinds — one per ancestor
 * depth level — that tell the renderer which connector line to draw.
 *
 * - `'pipe'`: vertical continuation line (ancestor still has children below)
 * - `'branch'`: vertical line + horizontal branch (sibling follows)
 * - `'branch-last'`: half vertical + horizontal branch (last child)
 * - `'empty'`: no line (ancestor's children are done)
 */
export function computeTreeGuides(rows: LayerRow[]): Map<string, TreeGuideKind[]> {
  const result = new Map<string, TreeGuideKind[]>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.depth === 0) {
      result.set(row.node.id, []);
      continue;
    }

    const guides: TreeGuideKind[] = [];

    // For each depth level 0..depth-1, determine the guide kind.
    for (let d = 0; d < row.depth; d++) {
      if (d === row.depth - 1) {
        // Direct parent connection — branch or branch-last
        guides.push(isLastChildAtDepth(rows, i) ? 'branch-last' : 'branch');
      } else {
        // Ancestor continuation — pipe or empty
        // Check if the ancestor at depth d has more descendants after this row
        guides.push(hasMoreChildrenAtDepth(rows, i, d) ? 'pipe' : 'empty');
      }
    }

    result.set(row.node.id, guides);
  }

  return result;
}

/**
 * Returns true if row at index `rowIndex` is the last child of its direct parent.
 * This is true when no subsequent row shares the same parent (same depth and same
 * ancestor group).
 */
function isLastChildAtDepth(rows: LayerRow[], rowIndex: number): boolean {
  const row = rows[rowIndex];
  const depth = row.depth;

  for (let j = rowIndex + 1; j < rows.length; j++) {
    if (rows[j].depth < depth) {
      // We've gone back up past the parent — no more siblings
      return true;
    }
    if (rows[j].depth === depth) {
      // Found a sibling at the same depth
      return false;
    }
    // rows[j].depth > depth — this is a descendant of the current row, keep scanning
  }

  // Reached end of list — this row is the last child
  return true;
}

/**
 * Returns true if there are more rows below `rowIndex` that belong to the ancestor
 * at the given depth level. This determines whether to draw a vertical continuation
 * line ('pipe') or leave the slot empty.
 */
function hasMoreChildrenAtDepth(rows: LayerRow[], rowIndex: number, ancestorDepth: number): boolean {
  for (let j = rowIndex + 1; j < rows.length; j++) {
    if (rows[j].depth <= ancestorDepth) {
      // We've gone back up to or past the ancestor's level — no more children
      return false;
    }
    if (rows[j].depth === ancestorDepth + 1) {
      // Found another direct child of the ancestor — pipe needed
      return true;
    }
    // rows[j].depth > ancestorDepth + 1 — deeper descendant, keep scanning
  }
  return false;
}
