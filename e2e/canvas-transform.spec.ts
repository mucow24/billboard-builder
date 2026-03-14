import { expect, test } from '@playwright/test';

test.use({
  viewport: {
    width: 1700,
    height: 1600,
  },
});

async function getJson(locatorText: Promise<string | null>) {
  const raw = await locatorText;
  if (!raw) {
    throw new Error('Expected debug JSON but found nothing');
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

interface ClientRectJson {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getRectCenter(rect: ClientRectJson) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

test('keeps a dragged item visible near the right edge of the canvas', async ({ page }) => {
  await page.goto('/');
  await page.locator('.konvajs-content').scrollIntoViewIfNeeded();

  await page.getByRole('button', { name: 'Rect' }).click();
  await page.locator('.layer-row', { hasText: 'Rectangle' }).click();

  const stage = page.locator('.konvajs-content');
  const stageBox = await stage.boundingBox();
  if (!stageBox) {
    throw new Error('Missing stage bounds');
  }

  const debugBefore = await getJson(page.getByTestId('selected-item-debug').textContent());
  const stageDebug = await getJson(page.getByTestId('stage-debug').textContent());
  const clientRect = debugBefore.nodeClientRect as ClientRectJson;
  const stageWidth = Number(stageDebug.stageSize.width);
  const dragTargetX = stageWidth - clientRect.width - 8;
  const itemCenter = getRectCenter(clientRect);

  await page.mouse.move(stageBox.x + itemCenter.x, stageBox.y + itemCenter.y);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + dragTargetX + clientRect.width / 2, stageBox.y + itemCenter.y, {
    steps: 20,
  });
  await expect(stage).toHaveScreenshot('right-edge-visible.png');
  await page.mouse.up();

  const debugAfter = await getJson(page.getByTestId('selected-item-debug').textContent());
  const afterRect = debugAfter.nodeClientRect as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  expect(afterRect.x).toBeGreaterThan(clientRect.x + 250);
  expect(afterRect.width).toBeGreaterThan(0);
  expect(afterRect.x + afterRect.width).toBeLessThanOrEqual(stageWidth + 1);
});

test('rotates an item without disappearing or teleporting away', async ({ page }) => {
  await page.goto('/');
  await page.locator('.konvajs-content').scrollIntoViewIfNeeded();

  await page.getByRole('button', { name: 'Rect' }).click();
  await page.locator('.layer-row', { hasText: 'Rectangle' }).click();

  const stage = page.locator('.konvajs-content');
  const stageBox = await stage.boundingBox();
  if (!stageBox) {
    throw new Error('Missing stage bounds');
  }

  const debugBefore = await getJson(page.getByTestId('selected-item-debug').textContent());
  const rect = debugBefore.nodeClientRect as ClientRectJson;
  const beforeCenter = getRectCenter(rect);
  const anchorClientRects = debugBefore.anchorClientRects as Record<string, ClientRectJson | null>;
  const rotationHandle = anchorClientRects.rotater;
  if (!rotationHandle) {
    throw new Error('Missing rotation handle bounds');
  }
  const rotationHandleCenter = getRectCenter(rotationHandle);

  await page.mouse.move(stageBox.x + rotationHandleCenter.x, stageBox.y + rotationHandleCenter.y);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + rotationHandleCenter.x - 2, stageBox.y + rotationHandleCenter.y, {
    steps: 2,
  });
  await expect
    .poll(async () => {
      const debug = await getJson(page.getByTestId('selected-item-debug').textContent());
      return debug.activeAnchor;
    })
    .toBe('rotater');
  await page.mouse.move(stageBox.x + rect.x - 60, stageBox.y + rect.y + rect.height / 2, {
    steps: 24,
  });
  await expect(stage).toHaveScreenshot('rotation-mid-gesture.png');
  await page.mouse.up();

  const debugAfter = await getJson(page.getByTestId('selected-item-debug').textContent());
  const afterRect = debugAfter.nodeClientRect as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  const afterCenter = getRectCenter(afterRect);
  expect(afterRect.width).toBeGreaterThan(0);
  expect(afterRect.height).toBeGreaterThan(0);
  expect(Math.abs(Number(debugAfter.documentItem.rotation))).toBeGreaterThan(45);
  expect(Math.abs(afterCenter.x - beforeCenter.x)).toBeLessThan(2);
  expect(Math.abs(afterCenter.y - beforeCenter.y)).toBeLessThan(2);
});

test('reflows multiline text live while resizing narrower', async ({ page }) => {
  await page.goto('/');
  await page.locator('.konvajs-content').scrollIntoViewIfNeeded();

  await page.getByRole('button', { name: 'Text' }).click();
  await page.locator('.layer-row', { hasText: 'Text' }).click();
  await page.getByLabel('Text content').fill(
    'One two three four five six seven eight nine ten eleven twelve.'
  );

  const stage = page.locator('.konvajs-content');
  const stageBox = await stage.boundingBox();
  if (!stageBox) {
    throw new Error('Missing stage bounds');
  }

  const beforeDebug = await getJson(page.getByTestId('selected-item-debug').textContent());
  const beforeRect = beforeDebug.nodeClientRect as ClientRectJson;
  const anchorClientRects = beforeDebug.anchorClientRects as Record<string, ClientRectJson | null>;
  const rightMiddle = anchorClientRects['middle-right'];
  if (!rightMiddle) {
    throw new Error('Missing right resize handle bounds');
  }
  const rightMiddleCenter = getRectCenter(rightMiddle);

  await page.mouse.move(stageBox.x + rightMiddleCenter.x, stageBox.y + rightMiddleCenter.y);
  await page.mouse.down();
  await page.mouse.move(
    stageBox.x + rightMiddleCenter.x - 2,
    stageBox.y + rightMiddleCenter.y,
    {
      steps: 2,
    }
  );
  await expect
    .poll(async () => {
      const debug = await getJson(page.getByTestId('selected-item-debug').textContent());
      return debug.activeAnchor;
    })
    .toBe('middle-right');
  await page.mouse.move(stageBox.x + rightMiddleCenter.x - 120, stageBox.y + rightMiddleCenter.y, {
    steps: 20,
  });

  const midDebug = await getJson(page.getByTestId('selected-item-debug').textContent());
  expect(midDebug.previewItem).not.toBeNull();
  expect(Number((midDebug.previewItem as Record<string, number>).height)).toBeGreaterThan(
    beforeRect.height
  );
  await page.mouse.up();
});
