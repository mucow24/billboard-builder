import { expect, test, type Page } from '@playwright/test';

import {
  clickItem,
  createProjectDocument,
  createSimpleGroupFixture,
  createTextFixture,
  movePointerToCanvasPoint,
  openFreshEditor,
  selectTool,
  uploadProject,
} from './support/editor';

/** The node the hover outline is drawn around, or null without an outline. */
function hoverOutline(page: Page) {
  return page.getByTestId('canvas-stage-root').getAttribute('data-hover-outline');
}

test.describe('canvas hover outline', () => {
  test('outlines the unselected text box under the pointer', async ({ page }) => {
    // Two text boxes side by side, far wider than their text: nothing drawn
    // shows where one ends and the other begins.
    const left = createTextFixture({ id: 'left-text', x: 100, y: 200, width: 300, height: 100, text: 'L' });
    const right = createTextFixture({ id: 'right-text', x: 400, y: 200, width: 300, height: 100, text: 'R' });
    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([left, right]), 'hover.json');

    await movePointerToCanvasPoint(page, { x: 390, y: 250 });
    await expect.poll(() => hoverOutline(page)).toBe('left-text');

    await movePointerToCanvasPoint(page, { x: 410, y: 250 });
    await expect.poll(() => hoverOutline(page)).toBe('right-text');

    // Off both: nothing to outline.
    await movePointerToCanvasPoint(page, { x: 410, y: 400 });
    await expect.poll(() => hoverOutline(page)).toBeNull();

    // A selected item has its selection outline; only the other one is pointed out.
    await clickItem(page, 'right-text');
    await expect.poll(() => hoverOutline(page)).toBeNull();
    // (Clear of the selection's handles, which take the pointer themselves.)
    await movePointerToCanvasPoint(page, { x: 250, y: 250 });
    await expect.poll(() => hoverOutline(page)).toBe('left-text');

    // With another tool a click selects nothing, so nothing is pointed out.
    await selectTool(page, 'Rect');
    await expect.poll(() => hoverOutline(page)).toBeNull();
    // Back on the select tool, the next move inside the same item counts.
    await selectTool(page, 'Select');
    await movePointerToCanvasPoint(page, { x: 200, y: 250 });
    await expect.poll(() => hoverOutline(page)).toBe('left-text');
  });

  test('outlines the group that a click on one of its items would select', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, createSimpleGroupFixture(), 'hover-group.json');

    // Inside group-rect-1 (140,160 140x80).
    await movePointerToCanvasPoint(page, { x: 200, y: 200 });
    await expect.poll(() => hoverOutline(page)).toBe('simple-group');
  });
});
