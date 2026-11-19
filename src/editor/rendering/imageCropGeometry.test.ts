import { describe, expect, it } from 'vitest';

import { createImageItem, createRectangleItem } from '../document/documentDefaults';
import type { ImageCanvasItem } from '../document/documentTypes';
import {
  buildCroppedImagePreviewItem,
  buildFullImageTransformItem,
  buildImageCropResetChanges,
  isImageUncropped,
  panImageUnderCrop,
  resizeImageCrop,
} from './imageCropGeometry';

describe('image crop geometry', () => {
  it('derives the full image transform item from a cropped visible image', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 90,
      width: 80,
      height: 45,
    });
    item.x = 30;
    item.y = 20;
    item.crop = {
      x: 20,
      y: 10,
      width: 80,
      height: 45,
    };
    item.sourceTransform = {
      x: -20,
      y: -10,
      width: 160,
      height: 90,
      rotation: 0,
    };
    item.sourceTransform = {
      x: -20,
      y: -10,
      width: 160,
      height: 90,
      rotation: 18,
    };

    expect(buildFullImageTransformItem(item)).toMatchObject({
      x: 10,
      y: 10,
      width: 160,
      height: 90,
      rotation: 18,
      crop: { x: 0, y: 0, width: 160, height: 90 },
    });
  });

  it('rebuilds the visible cropped image from the persisted source transform', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 90,
      width: 80,
      height: 45,
    });
    item.crop = {
      x: 20,
      y: 10,
      width: 80,
      height: 45,
    };
    item.sourceTransform = {
      x: -20,
      y: -10,
      width: 160,
      height: 90,
      rotation: 18,
    };

    expect(
      buildCroppedImagePreviewItem(item, item.sourceTransform),
    ).toMatchObject({
      x: item.x,
      y: item.y,
      width: 80,
      height: 45,
      rotation: item.rotation,
      sourceTransform: item.sourceTransform,
    });
  });

  it('rebuilds the visible mirrored crop from the persisted source transform', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 90,
      width: 80,
      height: 45,
    });
    item.mirrorHorizontal = true;
    item.crop = {
      x: 20,
      y: 10,
      width: 80,
      height: 45,
    };
    item.sourceTransform = {
      x: -60,
      y: -10,
      width: 160,
      height: 90,
      rotation: 0,
    };

    expect(buildCroppedImagePreviewItem(item, item.sourceTransform)).toMatchObject({
      crop: {
        x: 20,
        y: 10,
        width: 80,
        height: 45,
      },
      sourceTransform: item.sourceTransform,
    });
  });

  it('resizes crop bounds against the fixed full-image frame', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 90,
      width: 80,
      height: 45,
    });
    item.x = 30;
    item.y = 20;
    item.crop = {
      x: 20,
      y: 10,
      width: 80,
      height: 45,
    };
    item.sourceTransform = {
      x: -20,
      y: -10,
      width: 160,
      height: 90,
      rotation: 0,
    };

    const resized = resizeImageCrop({
      baseItem: item,
      handle: 'middle-right',
      pointer: { x: 150, y: 30 },
      siblingItems: [],
      snapEnabled: false,
      stageRect: { x: 0, y: 0, width: 300, height: 200 },
    });

    expect(resized.crop).toMatchObject({
      x: 20,
      y: 10,
      width: 120,
      height: 45,
    });
    expect(resized.previewItem).toMatchObject({
      x: 30,
      y: 20,
      width: 120,
      height: 45,
      sourceTransform: {
        x: -20,
        y: -10,
        width: 160,
        height: 90,
        rotation: 0,
      },
    });
    expect(resized.guides).toEqual([]);
  });

  it('snaps crop bounds to sibling guides and allows ctrl-style unsnapped drags', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 50,
      width: 100,
      height: 50,
    });
    item.x = 20;
    item.y = 10;
    item.crop = {
      x: 20,
      y: 0,
      width: 100,
      height: 50,
    };
    item.sourceTransform = {
      x: -20,
      y: 0,
      width: 160,
      height: 50,
      rotation: 0,
    };
    const sibling = createRectangleItem({
      x: 132,
      y: 0,
      width: 40,
      height: 80,
    });

    const snapped = resizeImageCrop({
      baseItem: item,
      handle: 'middle-right',
      pointer: { x: 126, y: 35 },
      siblingItems: [sibling],
      stageRect: { x: 0, y: 0, width: 300, height: 200 },
    });

    expect(snapped.crop.width).toBeCloseTo(112, 10);
    expect(snapped.previewItem.width).toBeCloseTo(112, 10);
    expect(snapped.guides).toEqual([
      { orientation: 'vertical', position: 132 },
    ]);

    const unsnapped = resizeImageCrop({
      baseItem: item,
      handle: 'middle-right',
      pointer: { x: 126, y: 35 },
      siblingItems: [sibling],
      snapEnabled: false,
      stageRect: { x: 0, y: 0, width: 300, height: 200 },
    });

    expect(unsnapped.crop.width).toBeCloseTo(106, 10);
    expect(unsnapped.guides).toEqual([]);
  });

  it('preserves the crop-handle pointer offset while snapping', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 50,
      width: 100,
      height: 50,
    });
    item.x = 20;
    item.y = 10;
    item.crop = {
      x: 20,
      y: 0,
      width: 100,
      height: 50,
    };
    item.sourceTransform = {
      x: -20,
      y: 0,
      width: 160,
      height: 50,
      rotation: 0,
    };
    const sibling = createRectangleItem({
      x: 132,
      y: 0,
      width: 40,
      height: 80,
    });

    const snapped = resizeImageCrop({
      baseItem: item,
      handle: 'middle-right',
      pointer: { x: 123, y: 35 },
      pointerOffset: { x: -5, y: 0 },
      siblingItems: [sibling],
      stageRect: { x: 0, y: 0, width: 300, height: 200 },
    });

    expect(snapped.crop.width).toBeCloseTo(112, 10);
    expect(snapped.guides).toEqual([
      { orientation: 'vertical', position: 132 },
    ]);
  });

  it('pans the source image under a fixed crop frame', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 90,
      width: 80,
      height: 45,
    });
    item.x = 30;
    item.y = 20;
    item.crop = {
      x: 20,
      y: 10,
      width: 80,
      height: 45,
    };
    item.sourceTransform = {
      x: -20,
      y: -10,
      width: 160,
      height: 90,
      rotation: 0,
    };

    const panned = panImageUnderCrop({
      baseItem: item,
      pointerStart: { x: 40, y: 30 },
      pointer: { x: 50, y: 40 },
    });

    expect(panned.crop).toMatchObject({
      x: 10,
      y: 0,
      width: 80,
      height: 45,
    });
    expect(panned.previewItem).toMatchObject({
      x: 30,
      y: 20,
      width: 80,
      height: 45,
      sourceTransform: {
        x: -10,
        y: 0,
        width: 160,
        height: 90,
        rotation: 0,
      },
    });
    expect(panned.fullImageItem).toMatchObject({
      x: 20,
      y: 20,
      width: 160,
      height: 90,
    });
  });

  it('pans a mirrored source image under a fixed crop frame', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 90,
      width: 80,
      height: 45,
    });
    item.x = 30;
    item.y = 20;
    item.mirrorHorizontal = true;
    item.crop = {
      x: 20,
      y: 10,
      width: 80,
      height: 45,
    };
    item.sourceTransform = {
      x: -60,
      y: -10,
      width: 160,
      height: 90,
      rotation: 0,
    };

    const panned = panImageUnderCrop({
      baseItem: item,
      pointerStart: { x: 40, y: 30 },
      pointer: { x: 50, y: 40 },
    });

    expect(panned.crop).toMatchObject({
      x: 30,
      y: 0,
      width: 80,
      height: 45,
    });
    expect(panned.previewItem).toMatchObject({
      sourceTransform: {
        x: -50,
        y: 0,
        width: 160,
        height: 90,
        rotation: 0,
      },
    });
  });
});

describe('resetting an image crop', () => {
  function createCroppableImage(): ImageCanvasItem {
    return createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 90,
      x: 30,
      y: 20,
    });
  }

  it('counts an image as uncropped when the whole image fills its box', () => {
    const item = createCroppableImage();
    expect(isImageUncropped(item)).toBe(true);

    // Scaled with the box, by a resize or by Width % / Height %.
    item.width = 80;
    item.scaleX = 1.5;
    item.sourceTransform = { x: 0, y: 0, width: 120, height: 90, rotation: 0 };
    expect(isImageUncropped(item)).toBe(true);

    // Rounding left over from the crop maths is not a crop.
    item.sourceTransform = { x: 1e-9, y: -1e-9, width: 120 + 1e-9, height: 90, rotation: 1e-9 };
    expect(isImageUncropped(item)).toBe(true);
  });

  it.each([
    ['moved inside its box', { x: -10 }],
    ['zoomed inside its box', { width: 200, height: 112.5 }],
    ['cropped on one side', { width: 200 }],
    ['turned inside its box', { rotation: 5 }],
    ['moved by a fraction of a pixel', { y: 0.25 }],
  ])('counts an image %s as cropped', (_label, sourceTransformChange) => {
    const item = createCroppableImage();
    item.sourceTransform = { ...item.sourceTransform, ...sourceTransformChange };
    expect(isImageUncropped(item)).toBe(false);
  });

  it.each([
    {
      label: 'an image moved and zoomed inside its box',
      change: {
        sourceTransform: { x: -35, y: -12, width: 240, height: 135, rotation: 0 },
      },
      filledBox: { width: 160, height: 90 },
    },
    {
      label: 'a turned, moved image that was also turned inside its box',
      change: {
        x: 300,
        y: 140,
        rotation: 30,
        sourceTransform: { x: -20, y: -10, width: 240, height: 135, rotation: 18 },
      },
      filledBox: { width: 160, height: 90 },
    },
    {
      label: 'a mirrored image turned inside its box',
      change: {
        mirrorHorizontal: true,
        sourceTransform: { x: -60, y: -10, width: 200, height: 112.5, rotation: 25 },
      },
      filledBox: { width: 160, height: 90 },
    },
    {
      label: 'an image whose crop box was resized in crop mode',
      change: {
        width: 80,
        height: 45,
        sourceTransform: { x: -20, y: -10, width: 160, height: 90, rotation: 0 },
      },
      filledBox: { width: 80, height: 45 },
    },
    {
      label: 'a cropped image scaled since',
      change: {
        scaleX: 1.5,
        scaleY: 2,
        sourceTransform: { x: -30, y: -20, width: 360, height: 270, rotation: 0 },
      },
      filledBox: { width: 240, height: 180 },
    },
  ])('fills the box of $label with the whole image, and leaves the box alone', ({ change, filledBox }) => {
    const item: ImageCanvasItem = { ...createCroppableImage(), ...change };
    expect(isImageUncropped(item)).toBe(false);

    const changes = buildImageCropResetChanges(item);
    // Only what crop mode edits changes: the box keeps its place, size,
    // scale and angle on the canvas.
    expect(Object.keys(changes).sort()).toEqual(['crop', 'sourceTransform']);

    const reset: ImageCanvasItem = { ...item, ...changes };
    expect(isImageUncropped(reset)).toBe(true);
    expect(reset.crop).toEqual({ x: 0, y: 0, width: 160, height: 90 });
    expect(reset.sourceTransform).toEqual({ x: 0, y: 0, ...filledBox, rotation: 0 });
  });
});
