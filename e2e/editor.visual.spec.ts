import { expect, test, type Page } from '@playwright/test';

import {
  beginCanvasDrag,
  beginCanvasHookDrag,
  canvasPointToPage,
  clickCanvas,
  clickLayerRow,
  createLineFixture,
  createLayersPanelMockParityFixture,
  createMixedShapeTextGroupFixture,
  createNestedGroupFixture,
  createProjectDocument,
  createRectangleFixture,
  createSimpleGroupFixture,
  createTextFixture,
  dragCanvas,
  movePointerToCanvasPoint,
  openFreshEditor,
  openLayersTab,
  readStageDebug,
  releasePointer,
  setCanvasTestHooksEnabled,
  uploadProject,
} from './support/editor';

async function seedMockFavorites(page: Page) {
  await page.addInitScript(() => {
    const timestamp = '2026-03-20T12:00:00.000Z';
    window.localStorage.setItem(
      'billboard-builder:favorites:v1',
      JSON.stringify({
        version: 1,
        favorites: [
          {
            id: 'mock-favorite-1',
            name: 'Mock Favorite 1',
            nodes: [],
            fonts: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: 'mock-favorite-2',
            name: 'Mock Favorite 2',
            nodes: [],
            fonts: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      }),
    );
  });
}

async function prepareLayersPanelMockParity(page: Page) {
  await seedMockFavorites(page);
  await openFreshEditor(page);
  await uploadProject(page, createLayersPanelMockParityFixture(), 'layers-panel-mock-parity.json');

  await openLayersTab(page);
  await clickLayerRow(page, 'Hero Group');
  await page.getByRole('button', { name: 'Collapse Legal' }).click();
}

async function getLayersPanelRailBounds(page: Page) {
  const railBounds = await page.getByTestId('layers-panel-rail').boundingBox();
  if (!railBounds) {
    throw new Error('Expected the layers panel rail to have a bounding box.');
  }
  return railBounds;
}

async function readLayersTreeGeometry(page: Page) {
  return page.evaluate(() => {
    function roundToNearestHalfPixel(value: number) {
      return Math.round(value * 2) / 2;
    }

    function readJunctionMetric(nodeId: string) {
      const junction = document.querySelector<HTMLElement>(`[data-testid="layers-preview-anchor-${nodeId}"]`);
      const list = document.querySelector<HTMLElement>('[data-testid="layers-layer-list"]');
      if (!junction || !list) {
        throw new Error(`Expected junction metric elements for ${nodeId}.`);
      }
      const junctionRect = junction.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      const left = junctionRect.left - listRect.left + list.scrollLeft;
      const top = junctionRect.top - listRect.top + list.scrollTop;
      return {
        junctionX: roundToNearestHalfPixel(left + 0.5),
        junctionY: roundToNearestHalfPixel(top + junctionRect.height / 2),
      };
    }

    function readToggleOutflowMetric(nodeId: string) {
      const toggle = document.querySelector<HTMLElement>(`[data-testid="layers-preview-anchor-${nodeId}"]`);
      const list = document.querySelector<HTMLElement>('[data-testid="layers-layer-list"]');
      if (!toggle || !list) {
        throw new Error(`Expected toggle metric elements for ${nodeId}.`);
      }
      const toggleRect = toggle.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      const left = toggleRect.left - listRect.left + list.scrollLeft;
      const top = toggleRect.top - listRect.top + list.scrollTop;
      return {
        outflowX: roundToNearestHalfPixel(left + toggleRect.width / 2),
        outflowY: roundToNearestHalfPixel(top + toggleRect.height - 0.5),
      };
    }

    function readLineMetric(testId: string) {
      const line = document.querySelector<SVGLineElement>(`[data-testid="${testId}"]`);
      if (!line) {
        throw new Error(`Expected overlay line ${testId}.`);
      }
      return {
        x1: Number(line.getAttribute('x1')),
        y1: Number(line.getAttribute('y1')),
        x2: Number(line.getAttribute('x2')),
        y2: Number(line.getAttribute('y2')),
      };
    }

    return {
      junctions: {
        detailsCluster: readJunctionMetric('details-cluster'),
        detailsText: readJunctionMetric('details-text'),
        heroLine: readJunctionMetric('hero-line'),
        heroText: readJunctionMetric('hero-text'),
      },
      toggles: {
        heroGroup: readToggleOutflowMetric('hero-group'),
      },
      lines: {
        heroTrunk: readLineMetric('layers-tree-trunk-hero-group'),
        heroDetailsBranch: readLineMetric('layers-tree-branch-hero-group-details-cluster'),
        detailsTrunk: readLineMetric('layers-tree-trunk-details-cluster'),
        heroTextBranch: readLineMetric('layers-tree-branch-hero-group-hero-text'),
        detailsTextBranch: readLineMetric('layers-tree-branch-details-cluster-details-text'),
        heroLineBranch: readLineMetric('layers-tree-branch-hero-group-hero-line'),
      },
    };
  });
}

test.describe('editor visual regression', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Visual snapshots run only on Chromium.');

  test('captures the default canvas shell', async ({ page }) => {
    await openFreshEditor(page);

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('default-canvas-shell.png');
  });

  test('captures marquee preview rendering', async ({ page }) => {
    await openFreshEditor(page);

    const start = await canvasPointToPage(page, { x: 120, y: 120 });
    const end = await canvasPointToPage(page, { x: 360, y: 300 });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 16 });

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('marquee-preview.png');
    await page.mouse.up();
  });

  test('captures single-item selection handles', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'visual-rect',
          x: 180,
          y: 180,
          width: 240,
          height: 160,
        }),
      ]),
      'visual-rect.json'
    );

    await clickCanvas(page, { x: 300, y: 260 });
    await expect(page.getByTestId('canvas-shape-handle-middle-right')).toBeAttached();

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('single-selection-handles.png');
  });

  test('captures a rotated rectangle with an item-local gradient fill', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'gradient-visual-rect',
          x: 260,
          y: 220,
          width: 280,
          height: 180,
          rotation: 32,
          fill: '#ff0000ff',
          secondaryFill: '#00ff00ff',
          gradientEnabled: true,
        }),
      ]),
      'visual-gradient-rotated-rectangle.json'
    );

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('gradient-rotated-rectangle.png');
  });

  test('captures text padding moving glyphs through a fixed item-frame gradient', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createTextFixture({
          id: 'gradient-text-no-padding',
          x: 140,
          y: 180,
          width: 300,
          height: 150,
          text: 'Top anchored',
          fill: '#ffcc00ff',
          secondaryFill: '#0066ffff',
          gradientEnabled: true,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
        }),
        createTextFixture({
          id: 'gradient-text-with-padding',
          x: 520,
          y: 180,
          width: 300,
          height: 150,
          text: 'Padded down',
          fill: '#ffcc00ff',
          secondaryFill: '#0066ffff',
          gradientEnabled: true,
          padding: { top: 32, right: 0, bottom: 0, left: 0 },
        }),
      ]),
      'visual-gradient-text-padding.json'
    );

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('gradient-text-padding.png');
  });

  test.describe('layers panel mock parity', () => {
    test.use({
      deviceScaleFactor: 2,
      viewport: {
        width: 1600,
        height: 1600,
      },
    });

    test('captures the layers panel mock parity rail', async ({ page }) => {
      await prepareLayersPanelMockParity(page);
      const railBounds = await getLayersPanelRailBounds(page);

      const screenshot = await page.screenshot({
        clip: {
          x: railBounds.x,
          y: railBounds.y,
          width: 317,
          height: 760,
        },
        scale: 'device',
      });

      expect(screenshot).toMatchSnapshot('layers-panel-mock-parity.png');
    });

    test('captures the layers panel mock parity tree region', async ({ page }) => {
      await prepareLayersPanelMockParity(page);
      const railBounds = await getLayersPanelRailBounds(page);

      const screenshot = await page.screenshot({
        clip: {
          x: railBounds.x,
          y: railBounds.y + 85,
          width: 317,
          height: 260,
        },
        scale: 'device',
      });

      expect(screenshot).toMatchSnapshot('layers-panel-mock-tree-parity.png');
    });

    test('anchors layers tree lines to row edges and disclosure outflows', async ({
      page,
    }) => {
      await prepareLayersPanelMockParity(page);
      const geometry = await readLayersTreeGeometry(page);

      expect(geometry.lines.heroTrunk.x1).toBe(geometry.toggles.heroGroup.outflowX);
      expect(geometry.lines.heroTrunk.y1).toBe(geometry.toggles.heroGroup.outflowY);

      expect(geometry.lines.heroTextBranch.x2).toBe(geometry.junctions.heroText.junctionX);
      expect(geometry.lines.heroTextBranch.y1).toBe(geometry.junctions.heroText.junctionY);

      expect(geometry.lines.heroDetailsBranch.x2).toBe(geometry.junctions.detailsCluster.junctionX);
      expect(geometry.lines.heroDetailsBranch.y1).toBe(geometry.junctions.detailsCluster.junctionY);

      expect(geometry.lines.detailsTrunk.x1).toBe(geometry.junctions.detailsCluster.junctionX);
      expect(geometry.lines.detailsTrunk.y1).toBe(geometry.junctions.detailsCluster.junctionY);

      expect(geometry.lines.detailsTextBranch.x2).toBe(geometry.junctions.detailsText.junctionX);
      expect(geometry.lines.detailsTextBranch.y1).toBe(geometry.junctions.detailsText.junctionY);

      expect(geometry.lines.heroLineBranch.x2).toBe(geometry.junctions.heroLine.junctionX);
      expect(geometry.lines.heroLineBranch.y1).toBe(geometry.junctions.heroLine.junctionY);
    });
  });

  test('captures a rectangle snapped flush to the right canvas edge without checkerboard bleed', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'edge-flush-rect',
          x: 784,
          y: 240,
          width: 240,
          height: 180,
          fill: '#f97316',
          stroke: '#ea580cff',
        }),
      ]),
      'edge-flush-rect.json'
    );

    await clickCanvas(page, { x: 904, y: 330 });
    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('right-edge-snap-shell.png');
  });

  test('captures unclipped off-canvas content outside the canvas bounds', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'off-canvas-visible-rect',
          x: -72,
          y: 180,
          width: 280,
          height: 180,
          fill: '#f97316',
          stroke: '#ea580cff',
        }),
        createRectangleFixture({
          id: 'inside-rect',
          x: 340,
          y: 220,
          width: 220,
          height: 140,
          fill: '#22c55e',
          stroke: '#15803dff',
          zIndex: 1,
        }),
      ]),
      'off-canvas-visible.json',
    );

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('off-canvas-visible.png');
  });

  test('captures the export-bounds cue with a translucent canvas background without contaminating the canvas interior', async ({
    page,
  }) => {
    await openFreshEditor(page);
    const document = createProjectDocument([
      createRectangleFixture({
        id: 'off-canvas-visible-rect',
        x: -72,
        y: 180,
        width: 280,
        height: 180,
        fill: '#eab308',
        stroke: '#ca8a04ff',
      }),
      createRectangleFixture({
        id: 'inside-rect',
        x: 320,
        y: 220,
        width: 260,
        height: 180,
        fill: '#0ea5e9',
        stroke: '#0369a1ff',
        zIndex: 1,
      }),
    ]);
    document.background = '#11223344';

    await uploadProject(page, document, 'export-bounds-cue-translucent.json');
    await page.getByRole('button', { name: 'Export PNG' }).hover();

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot(
      'export-bounds-cue-translucent-background.png',
    );
  });

  test('captures live single-item drag, resize, and rotate previews', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'single-live',
          x: 180,
          y: 180,
          width: 220,
          height: 140,
        }),
      ]),
      'single-live.json'
    );

    await clickCanvas(page, { x: 300, y: 260 });

    await beginCanvasHookDrag(page, 'canvas-selected-item-overlay');
    await movePointerToCanvasPoint(page, { x: 410, y: 360 });
    await expect
      .poll(async () => (await readStageDebug(page)).sessionKind)
      .toBe('drag');
    await expect
      .poll(async () => (await readStageDebug(page)).previewItem?.x ?? 0)
      .toBeGreaterThan(180);
    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('single-drag-preview.png');
    await releasePointer(page);

    await beginCanvasHookDrag(page, 'canvas-shape-handle-middle-right');
    await movePointerToCanvasPoint(page, { x: 560, y: 320 });
    await expect
      .poll(async () => (await readStageDebug(page)).sessionKind)
      .toBe('resize');
    await expect
      .poll(async () => (await readStageDebug(page)).previewItem?.width ?? 0)
      .toBeGreaterThan(220);
    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('single-resize-preview.png');
    await releasePointer(page);

    await beginCanvasHookDrag(page, 'canvas-shape-handle-rotater');
    await movePointerToCanvasPoint(page, { x: 560, y: 470 });
    await expect
      .poll(async () => (await readStageDebug(page)).sessionKind)
      .toBe('rotate');
    await expect
      .poll(async () => Math.abs((await readStageDebug(page)).previewItem?.rotation ?? 0))
      .toBeGreaterThan(15);
    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('single-rotate-preview.png');
    await releasePointer(page);
  });

  test('captures live single-item resize and rotate previews from real canvas handles', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'single-live-real',
          x: 180,
          y: 180,
          width: 220,
          height: 140,
        }),
      ]),
      'single-live-real.json'
    );
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 300, y: 260 });

    await beginCanvasDrag(page, { x: 400, y: 250 });
    await movePointerToCanvasPoint(page, { x: 560, y: 250 });
    await expect
      .poll(async () => (await readStageDebug(page)).sessionKind)
      .toBe('resize');
    await expect
      .poll(async () => (await readStageDebug(page)).previewItem?.width ?? 0)
      .toBeGreaterThan(220);
    await releasePointer(page);

    const resizedItem = (await readStageDebug(page)).selectedItems?.[0];
    if (!resizedItem) {
      throw new Error('Expected selected item geometry after resize.');
    }

    await beginCanvasDrag(page, {
      x: resizedItem.x + resizedItem.width / 2,
      y: resizedItem.y - 50,
    });
    await movePointerToCanvasPoint(page, { x: 520, y: 420 });
    await expect
      .poll(async () => (await readStageDebug(page)).sessionKind)
      .toBe('rotate');
    await expect
      .poll(async () => Math.abs((await readStageDebug(page)).previewItem?.rotation ?? 0))
      .toBeGreaterThan(15);
    await releasePointer(page);
  });

  test('captures rotated multi-selection overlay rendering', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'first',
          x: 120,
          y: 140,
          width: 120,
          height: 64,
          zIndex: 0,
        }),
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
      ]),
      'visual-group.json'
    );

    await dragCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });
    const initialDebug = await readStageDebug(page);
    const initialFrame = initialDebug.groupFrame;
    if (!initialFrame) {
      throw new Error('Expected a group frame before previewing rotated overlays.');
    }
    const rotaterDistance = initialFrame.height / 2 + 50;

    await beginCanvasHookDrag(page, 'canvas-group-rotater');
    await movePointerToCanvasPoint(page, {
      x: initialFrame.x + initialFrame.width / 2 + rotaterDistance,
      y: initialFrame.y + initialFrame.height / 2,
    });
    await expect
      .poll(async () => (await readStageDebug(page)).sessionKind)
      .toBe('group-rotate');
    await expect
      .poll(async () => Math.abs((await readStageDebug(page)).groupFrame?.rotation ?? 0))
      .toBeGreaterThan(80);

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('rotated-group-overlay.png');
    await releasePointer(page);
  });

  test('UI-01 captures a true top-level group selection state', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, createSimpleGroupFixture(), 'visual-true-group.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 210, y: 200 });

    const stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(true);
    expect(stageDebug.hasShapeHandles).toBe(false);
    expect(stageDebug.hasLineHandles).toBe(false);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(0);

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('true-group-selected.png');
  });

  test('UI-02 captures a drilled-in grouped child selection state', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, createSimpleGroupFixture(), 'visual-drilled-child.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 210, y: 200 });
    await clickCanvas(page, { x: 210, y: 200 });

    const stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);
    expect(stageDebug.hasLineHandles).toBe(false);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(1);

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('group-child-selected.png');
  });

  test('UI-03 captures a nested group selection state with the ancestor outline intact', async ({
    page,
  }) => {
    await openFreshEditor(page);
    await uploadProject(page, createNestedGroupFixture(), 'visual-nested-group.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 400, y: 210 });
    await clickCanvas(page, { x: 400, y: 210 });

    const stageDebug = await readStageDebug(page);
    expect(stageDebug.groupFrame).not.toBeNull();
    expect(stageDebug.groupHandleViewportPoints).not.toBeNull();
    expect(stageDebug.groupRotaterViewportPoint).not.toBeNull();
    expect(stageDebug.hasShapeHandles).toBe(false);
    expect(stageDebug.hasLineHandles).toBe(false);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(0);

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('nested-group-selected.png');
  });

  test('UI-04 captures a nested drilled-in child selection state with ancestor outline', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, createNestedGroupFixture(), 'visual-nested-child.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 400, y: 210 });
    await clickCanvas(page, { x: 400, y: 210 });
    await clickCanvas(page, { x: 400, y: 210 });

    const stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(1);

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('nested-group-child-selected.png');
  });

  test('UI-02 captures grouped text drill-in affordances without group handles', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, createMixedShapeTextGroupFixture(), 'visual-grouped-text.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 320, y: 245 });
    await clickCanvas(page, { x: 320, y: 245 });

    const stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(1);

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('grouped-text-child-selected.png');
  });

  test('UI-06 UI-07 captures line and text single-selection affordances distinctly', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createLineFixture({
          id: 'visual-line',
          x: 180,
          y: 220,
          startX: 180,
          startY: 220,
          endX: 420,
          endY: 280,
          width: 240,
          height: 60,
          zIndex: 0,
        }),
        createTextFixture({
          id: 'visual-text',
          x: 180,
          y: 420,
          width: 260,
          height: 96,
          text: 'Visual text item',
          zIndex: 1,
        }),
      ]),
      'visual-line-text.json',
    );
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 300, y: 250 });
    let stageDebug = await readStageDebug(page);
    expect(stageDebug.hasLineHandles).toBe(true);
    expect(stageDebug.hasShapeHandles).toBe(false);
    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('single-line-selection.png');

    await clickCanvas(page, { x: 300, y: 465 });
    stageDebug = await readStageDebug(page);
    expect(stageDebug.hasLineHandles).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);
    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('single-text-selection.png');
  });

  test('captures live rotated-group rotate previews at an arbitrary angle', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'first',
          x: 120,
          y: 140,
          width: 120,
          height: 64,
          zIndex: 0,
        }),
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
      ]),
      'rotated-group-rotate-preview.json'
    );

    await dragCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });
    const initialDebug = await readStageDebug(page);
    const initialFrame = initialDebug.groupFrame;
    if (!initialFrame) {
      throw new Error('Expected a group frame before previewing rotated overlays.');
    }
    const rotaterDistance = initialFrame.height / 2 + 50;

    await beginCanvasHookDrag(page, 'canvas-group-rotater');
    await movePointerToCanvasPoint(page, {
      x: initialFrame.x + initialFrame.width / 2 + rotaterDistance * Math.sin((33 * Math.PI) / 180),
      y: initialFrame.y + initialFrame.height / 2 - rotaterDistance * Math.cos((33 * Math.PI) / 180),
    });
    await expect
      .poll(async () => (await readStageDebug(page)).sessionKind)
      .toBe('group-rotate');
    await expect
      .poll(async () => Math.abs((await readStageDebug(page)).groupFrame?.rotation ?? 0))
      .toBeGreaterThan(25);

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('rotated-group-rotate-preview.png');
    await releasePointer(page);
  });

  test('captures live rotated-group drag and resize previews', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'first',
          x: 120,
          y: 140,
          width: 120,
          height: 64,
          zIndex: 0,
        }),
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
      ]),
      'rotated-group-live.json'
    );

    await dragCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });
    const initialDebug = await readStageDebug(page);
    const initialFrame = initialDebug.groupFrame;
    if (!initialFrame) {
      throw new Error('Expected a group frame before rotating the live preview group.');
    }
    const rotaterDistance = initialFrame.height / 2 + 50;

    await beginCanvasHookDrag(page, 'canvas-group-rotater');
    await movePointerToCanvasPoint(page, {
      x: initialFrame.x + initialFrame.width / 2 + rotaterDistance,
      y: initialFrame.y + initialFrame.height / 2,
    });
    await expect
      .poll(async () => Math.abs((await readStageDebug(page)).groupFrame?.rotation ?? 0))
      .toBeGreaterThan(80);
    await releasePointer(page);

    const rotatedDebug = await readStageDebug(page);
    const rotatedFrame = rotatedDebug.groupFrame;
    if (!rotatedFrame) {
      throw new Error('Expected a committed rotated group frame before drag preview.');
    }

    await beginCanvasHookDrag(page, 'canvas-group-overlay');
    await movePointerToCanvasPoint(page, {
      x: rotatedFrame.x + rotatedFrame.width / 2,
      y: rotatedFrame.y + rotatedFrame.height / 2 + 120,
    });
    await expect
      .poll(async () => (await readStageDebug(page)).sessionKind)
      .toBe('group-drag');
    await expect
      .poll(async () => Math.abs((await readStageDebug(page)).groupFrame?.rotation ?? 0))
      .toBeGreaterThan(80);
    await expect
      .poll(async () => (await readStageDebug(page)).groupFrame?.y ?? 0)
      .toBeGreaterThan(rotatedFrame.y + 5);
    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('rotated-group-drag-preview.png');
    await releasePointer(page);

    const draggedDebug = await readStageDebug(page);
    const draggedFrame = draggedDebug.groupFrame;
    if (!draggedFrame) {
      throw new Error('Expected a committed dragged group frame before resize preview.');
    }

    await beginCanvasHookDrag(page, 'canvas-group-handle-middle-right');
    await movePointerToCanvasPoint(page, {
      x: draggedFrame.x + draggedFrame.width / 2,
      y: draggedFrame.y + draggedFrame.width / 2 + 120,
    });
    await expect
      .poll(async () => (await readStageDebug(page)).sessionKind)
      .toBe('group-resize');
    await expect
      .poll(async () => Math.abs((await readStageDebug(page)).groupFrame?.rotation ?? 0))
      .toBeGreaterThan(80);
    await expect
      .poll(async () => (await readStageDebug(page)).groupFrame?.width ?? 0)
      .toBeGreaterThan(draggedFrame.width + 40);
    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('rotated-group-resize-preview.png');
    await releasePointer(page);
  });
});
