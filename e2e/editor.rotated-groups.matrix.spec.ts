import { expect, test } from '@playwright/test';

import {
  beginGroupHandleDrag,
  createLineFixture,
  createProjectDocument,
  createRectangleFixture,
  dragEmptyCanvas,
  movePointerToCanvasPoint,
  openFreshEditor,
  readStageDebug,
  releasePointer,
  uploadProject,
} from './support/editor';
import {
  assertFiniteGeometry,
  assertGroupFrameTightlyWrapsSelectedItems,
  assertGroupOverlayGeometry,
  assertSelectedItemsFollowFrameTransform,
  frameCenter,
  pointForHandle,
  requireGroupFrame,
  rotateGroupTo,
} from './support/rotatedGroups';

type FixtureFactory = () => Array<Record<string, unknown>>;

const fixtureFactories: Array<{ name: string; build: FixtureFactory; dragStart: { x: number; y: number }; dragEnd: { x: number; y: number } }> = [
  {
    name: 'rectangles',
    build: () => [
      createRectangleFixture({ id: 'first', x: 120, y: 140, width: 120, height: 64, zIndex: 0 }),
      createRectangleFixture({
        id: 'second',
        x: 320,
        y: 180,
        width: 110,
        height: 58,
        fill: '#0ea5e9',
        stroke: '#0369a1ff',
        zIndex: 1,
      }),
    ],
    dragStart: { x: 90, y: 110 },
    dragEnd: { x: 470, y: 300 },
  },
  {
    name: 'mixed',
    build: () => [
      createRectangleFixture({ id: 'rect-a', x: 100, y: 120, width: 100, height: 50, zIndex: 0 }),
      createLineFixture({
        id: 'line-b',
        startX: 250,
        startY: 120,
        endX: 360,
        endY: 210,
        x: 250,
        y: 120,
        width: 110,
        height: 90,
        zIndex: 1,
      }),
      createRectangleFixture({
        id: 'rect-c',
        x: 390,
        y: 170,
        width: 90,
        height: 70,
        fill: '#facc15',
        stroke: '#ca8a04ff',
        zIndex: 2,
      }),
    ],
    dragStart: { x: 70, y: 90 },
    dragEnd: { x: 520, y: 290 },
  },
];

const matrixCases = [
  {
    name: 'side resize after rotate',
    angle: 33,
    handle: 'middle-right',
    delta: { x: 100, y: 0 },
  },
  {
    name: 'corner resize after rotate',
    angle: 61,
    handle: 'bottom-right',
    delta: { x: 90, y: 80 },
  },
  {
    name: 'drag after second rotate',
    angle: 121,
    handle: 'drag',
    delta: { x: 90, y: 70 },
  },
] as const;

test.describe('rotated group browser matrix', () => {
  for (const fixture of fixtureFactories) {
    for (const matrixCase of matrixCases) {
      test(`${fixture.name}: ${matrixCase.name}`, async ({ page }) => {
        await openFreshEditor(page);
        await uploadProject(
          page,
          createProjectDocument(fixture.build()),
          `${fixture.name}-${matrixCase.name.replace(/\s+/g, '-')}.json`
        );

        await dragEmptyCanvas(page, fixture.dragStart, fixture.dragEnd);
        let baseline = await rotateGroupTo(page, matrixCase.angle);

        if (matrixCase.handle === 'drag') {
          baseline = await rotateGroupTo(page, matrixCase.angle + 28);

          await beginGroupHandleDrag(page, 'overlay');
          await movePointerToCanvasPoint(page, {
            x: frameCenter(requireGroupFrame(baseline, 'matrix drag baseline')).x + matrixCase.delta.x,
            y: frameCenter(requireGroupFrame(baseline, 'matrix drag baseline')).y + matrixCase.delta.y,
          });
          await expect.poll(async () => (await readStageDebug(page)).sessionKind).toBe('group-drag');
        } else {
          await beginGroupHandleDrag(page, matrixCase.handle);
          await movePointerToCanvasPoint(
            page,
            pointForHandle(requireGroupFrame(baseline, 'matrix resize baseline'), matrixCase.handle, matrixCase.delta)
          );
          await expect.poll(async () => (await readStageDebug(page)).sessionKind).toBe('group-resize');
        }

        const preview = await readStageDebug(page);
        assertFiniteGeometry(preview, `${fixture.name} ${matrixCase.name} preview`);
        assertGroupOverlayGeometry(preview, `${fixture.name} ${matrixCase.name} preview`);
        assertSelectedItemsFollowFrameTransform(
          baseline,
          preview,
          `${fixture.name} ${matrixCase.name} preview`,
          matrixCase.handle === 'drag' ? 'drag' : 'resize'
        );
        assertGroupFrameTightlyWrapsSelectedItems(preview, `${fixture.name} ${matrixCase.name} preview`);
        await releasePointer(page);

        const committed = await readStageDebug(page);
        assertFiniteGeometry(committed, `${fixture.name} ${matrixCase.name} commit`);
        assertGroupFrameTightlyWrapsSelectedItems(committed, `${fixture.name} ${matrixCase.name} commit`);
      });
    }
  }
});
