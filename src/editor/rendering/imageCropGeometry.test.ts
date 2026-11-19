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
  syncImageCropSessionToDocument,
} from './imageCropGeometry';
import { localToStage, stageToLocal } from './interactionGeometry';
import { getItemAABB } from './selectionGeometry';

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

  describe('snapping a rotated crop frame to the image edges', () => {
    const stageRect = { x: 0, y: 0, width: 300, height: 200 };

    // A 160 x 50 image shown through a 100 x 50 frame that starts 20 in from
    // the image's left edge. In the frame's own axes the image spans x -20..140.
    function createRotatedCroppedImage(rotation: number) {
      const item = createImageItem({
        src: 'data:image/png;base64,AAA',
        mimeType: 'image/png',
        originalWidth: 160,
        originalHeight: 50,
        width: 100,
        height: 50,
      });
      item.x = 100;
      item.y = 100;
      item.rotation = rotation;
      item.crop = { x: 20, y: 0, width: 100, height: 50 };
      item.sourceTransform = { x: -20, y: 0, width: 160, height: 50, rotation: 0 };
      return item;
    }

    function framePoint(item: { x: number; y: number; rotation: number }, x: number, y: number) {
      return localToStage({ x, y }, { x: item.x, y: item.y }, item.rotation);
    }

    it('snaps the right edge to the image edge when dragged back in across it', () => {
      const item = createRotatedCroppedImage(30);

      const snapped = resizeImageCrop({
        baseItem: item,
        handle: 'middle-right',
        pointer: framePoint(item, 144, 25),
        siblingItems: [],
        stageRect,
      });

      expect(snapped.crop.x).toBeCloseTo(20, 10);
      expect(snapped.crop.width).toBeCloseTo(140, 10);
      expect(snapped.previewItem.width).toBeCloseTo(140, 10);
      expect(snapped.previewItem.x).toBeCloseTo(100, 10);
      expect(snapped.previewItem.y).toBeCloseTo(100, 10);
      expect(snapped.guides).toEqual([
        {
          orientation: 'vertical',
          position: 140,
          frame: { origin: { x: 100, y: 100 }, rotation: 30 },
        },
      ]);
    });

    it('snaps the left and top edges from either side of the image edge', () => {
      const item = createRotatedCroppedImage(-17);

      for (const localX of [-25, -15]) {
        const snapped = resizeImageCrop({
          baseItem: item,
          handle: 'top-left',
          pointer: framePoint(item, localX, 3),
          siblingItems: [],
          stageRect,
        });

        expect(snapped.crop.x).toBeCloseTo(0, 10);
        expect(snapped.crop.y).toBeCloseTo(0, 10);
        expect(snapped.crop.width).toBeCloseTo(120, 10);
        expect(snapped.crop.height).toBeCloseTo(50, 10);
        const corner = framePoint(item, -20, 0);
        expect(snapped.previewItem.x).toBeCloseTo(corner.x, 10);
        expect(snapped.previewItem.y).toBeCloseTo(corner.y, 10);
        expect(snapped.guides).toHaveLength(2);
      }
    });

    it('leaves the edge alone beyond the threshold and with snapping off', () => {
      const item = createRotatedCroppedImage(30);
      const far = resizeImageCrop({
        baseItem: item,
        handle: 'middle-right',
        pointer: framePoint(item, 152, 25),
        siblingItems: [],
        stageRect,
      });
      expect(far.previewItem.width).toBeCloseTo(152, 10);
      expect(far.guides).toEqual([]);

      const off = resizeImageCrop({
        baseItem: item,
        handle: 'middle-right',
        pointer: framePoint(item, 144, 25),
        siblingItems: [],
        snapEnabled: false,
        stageRect,
      });
      expect(off.previewItem.width).toBeCloseTo(144, 10);
      expect(off.guides).toEqual([]);
    });

    it('does not snap a rotated frame to the axis-aligned stage and sibling guides', () => {
      const item = createRotatedCroppedImage(30);
      // The dragged handle lands on the stage's vertical centre line (x = 150)
      // and on the sibling's left edge.
      const local = stageToLocal({ x: 150, y: 150 }, { x: item.x, y: item.y }, item.rotation);
      const sibling = createRectangleItem({ x: 150, y: 0, width: 40, height: 80 });

      const resized = resizeImageCrop({
        baseItem: item,
        handle: 'middle-right',
        pointer: { x: 151, y: 150 },
        siblingItems: [sibling],
        stageRect,
      });

      const expected = stageToLocal({ x: 151, y: 150 }, { x: item.x, y: item.y }, item.rotation);
      expect(Math.abs(local.x - 140)).toBeGreaterThan(8);
      expect(resized.previewItem.width).toBeCloseTo(expected.x, 10);
      expect(resized.guides).toEqual([]);
    });

    it('snaps to the edges of an image turned a quarter turn inside the frame', () => {
      const item = createRotatedCroppedImage(30);
      // Turned 90 degrees about its top-left corner (60, 0), the 160 x 50
      // image spans x 10..60 and y 0..160 in the frame's axes.
      item.sourceTransform = { x: 60, y: 0, width: 160, height: 50, rotation: 90 };

      const snapped = resizeImageCrop({
        baseItem: item,
        handle: 'bottom-right',
        pointer: framePoint(item, 63, 156),
        siblingItems: [],
        stageRect,
      });

      expect(snapped.previewItem.width).toBeCloseTo(60, 10);
      expect(snapped.previewItem.height).toBeCloseTo(160, 10);
    });

    it('does not snap to an image turned askew inside the frame', () => {
      for (const rotation of [0, 30]) {
        const item = createRotatedCroppedImage(rotation);
        item.sourceTransform = { ...item.sourceTransform, rotation: 18 };

        const resized = resizeImageCrop({
          baseItem: item,
          handle: 'middle-right',
          pointer: framePoint(item, 144, 25),
          siblingItems: [],
          stageRect,
        });

        expect(resized.previewItem.width).toBeCloseTo(144, 10);
        expect(resized.guides).toEqual([]);
      }
    });
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
      siblingItems: [],
      snapEnabled: false,
      stageRect: { x: 0, y: 0, width: 300, height: 200 },
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
      siblingItems: [],
      snapEnabled: false,
      stageRect: { x: 0, y: 0, width: 300, height: 200 },
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

  describe('snapping while panning', () => {
    const stageRect = { x: 0, y: 0, width: 400, height: 300 };
    // Keeps the stage's own guides far from the rotated-picture tests.
    const largeStageRect = { x: 0, y: 0, width: 4000, height: 3000 };

    // Crop frame at (30,20) 80x45; the whole picture at (10,10) 160x90.
    function createCroppedItem() {
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
      item.crop = { x: 20, y: 10, width: 80, height: 45 };
      item.sourceTransform = { x: -20, y: -10, width: 160, height: 90, rotation: 0 };
      return item;
    }

    it('snaps an edge of the whole picture to another item', () => {
      const sibling = createRectangleItem({ x: 300, y: 200, width: 50, height: 50 });

      // Unsnapped, the picture's right edge would land on x=297.
      const panned = panImageUnderCrop({
        baseItem: createCroppedItem(),
        pointerStart: { x: 40, y: 30 },
        pointer: { x: 167, y: 30 },
        siblingItems: [sibling],
        stageRect,
      });

      expect(panned.guides).toEqual([{ orientation: 'vertical', position: 300 }]);
      expect(panned.fullImageItem.x).toBeCloseTo(140, 10);
      expect(panned.fullImageItem.y).toBeCloseTo(10, 10);
      expect(panned.previewItem.sourceTransform.x).toBeCloseTo(110, 10);
      // The crop frame itself never moves.
      expect(panned.previewItem).toMatchObject({ x: 30, y: 20, width: 80, height: 45 });
    });

    it('snaps the whole picture to the crop frame', () => {
      // Unsnapped, the picture's top-left would land on (27,14).
      const panned = panImageUnderCrop({
        baseItem: createCroppedItem(),
        pointerStart: { x: 40, y: 30 },
        pointer: { x: 57, y: 34 },
        siblingItems: [],
        stageRect,
      });

      expect(panned.guides.map((guide) => guide.orientation)).toEqual(['vertical', 'horizontal']);
      expect(panned.fullImageItem.x).toBeCloseTo(30, 10);
      expect(panned.fullImageItem.y).toBeCloseTo(20, 10);
      expect(panned.previewItem.sourceTransform).toMatchObject({ x: 0, y: 0 });
    });

    it('snaps to the stage', () => {
      // Unsnapped, the picture's right edge would land on x=395.
      const panned = panImageUnderCrop({
        baseItem: createCroppedItem(),
        pointerStart: { x: 40, y: 30 },
        pointer: { x: 265, y: 30 },
        siblingItems: [],
        stageRect,
      });

      expect(panned.guides).toEqual([{ orientation: 'vertical', position: 400 }]);
      expect(panned.fullImageItem.x).toBeCloseTo(240, 10);
    });

    it('leaves the pan alone when snapping is off', () => {
      const sibling = createRectangleItem({ x: 300, y: 200, width: 50, height: 50 });

      const panned = panImageUnderCrop({
        baseItem: createCroppedItem(),
        pointerStart: { x: 40, y: 30 },
        pointer: { x: 167, y: 30 },
        siblingItems: [sibling],
        snapEnabled: false,
        stageRect,
      });

      expect(panned.guides).toEqual([]);
      expect(panned.fullImageItem.x).toBeCloseTo(137, 10);
    });

    it('respects the threshold', () => {
      const sibling = createRectangleItem({ x: 300, y: 200, width: 50, height: 50 });

      const panned = panImageUnderCrop({
        baseItem: createCroppedItem(),
        pointerStart: { x: 40, y: 30 },
        pointer: { x: 167, y: 30 },
        siblingItems: [sibling],
        stageRect,
        threshold: 2,
      });

      expect(panned.guides).toEqual([]);
      expect(panned.fullImageItem.x).toBeCloseTo(137, 10);
    });

    it('snaps the bounding box of a rotated picture', () => {
      const item = createCroppedItem();
      item.rotation = 30;
      const pan = { pointerStart: { x: 40, y: 30 }, pointer: { x: 140, y: 120 } };
      const unsnapped = getItemAABB(
        panImageUnderCrop({
          baseItem: item,
          ...pan,
          siblingItems: [],
          snapEnabled: false,
          stageRect: largeStageRect,
        }).fullImageItem,
      );
      const guideX = unsnapped.x + unsnapped.width + 2;
      const sibling = createRectangleItem({ x: guideX, y: 1000, width: 500, height: 50 });

      const panned = panImageUnderCrop({
        baseItem: item,
        ...pan,
        siblingItems: [sibling],
        stageRect: largeStageRect,
        threshold: 3,
      });

      const snapped = getItemAABB(panned.fullImageItem);
      expect(panned.guides).toEqual([{ orientation: 'vertical', position: guideX }]);
      expect(snapped.x + snapped.width).toBeCloseTo(guideX, 8);
      expect(snapped.y).toBeCloseTo(unsnapped.y, 8);
      expect(panned.previewItem).toMatchObject({ x: 30, y: 20, rotation: 30 });
    });

    it('does not snap a rotated picture to its own crop frame', () => {
      const item = createCroppedItem();
      item.rotation = 30;
      const frame = getItemAABB(item);
      const pointerStart = { x: 40, y: 30 };
      const panTo = (pointer: { x: number; y: number }, snapEnabled: boolean) =>
        panImageUnderCrop({
          baseItem: item,
          pointerStart,
          pointer,
          siblingItems: [],
          snapEnabled,
          stageRect: largeStageRect,
          threshold: 3,
        });
      // Pan so the picture's bounding box ends 2 px from the frame's
      // bounding box, well inside the threshold.
      const atRest = getItemAABB(panTo(pointerStart, false).fullImageItem);
      const pointer = { x: pointerStart.x + frame.x + 2 - atRest.x, y: pointerStart.y + 50 };
      const raw = getItemAABB(panTo(pointer, false).fullImageItem);
      expect(raw.x).toBeCloseTo(frame.x + 2, 8);

      const panned = panTo(pointer, true);

      expect(panned.guides).toEqual([]);
      expect(getItemAABB(panned.fullImageItem).x).toBeCloseTo(raw.x, 8);
      expect(getItemAABB(panned.fullImageItem).y).toBeCloseTo(raw.y, 8);
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

  // The 160 x 90 image starts in a 160 x 90 box at (30, 20). `drawnBox` is
  // the box as drawn (width x scaleX, height x scaleY) after the reset.
  it.each([
    {
      label: 'moved and zoomed inside its box',
      change: {
        sourceTransform: { x: -35, y: -12, width: 240, height: 135, rotation: 0 },
      },
      drawnBox: { width: 160, height: 90 },
    },
    {
      label: 'turned on the canvas and inside its box',
      change: {
        x: 300,
        y: 140,
        rotation: 30,
        sourceTransform: { x: -20, y: -10, width: 240, height: 135, rotation: 18 },
      },
      drawnBox: { width: 160, height: 90 },
    },
    {
      label: 'mirrored and turned inside its box',
      change: {
        mirrorHorizontal: true,
        sourceTransform: { x: -60, y: -10, width: 200, height: 112.5, rotation: 25 },
      },
      drawnBox: { width: 160, height: 90 },
    },
    {
      label: 'cut from the right with a crop edge',
      change: {
        width: 80,
        sourceTransform: { x: 0, y: 0, width: 160, height: 90, rotation: 0 },
      },
      drawnBox: { width: 160, height: 90 },
    },
    {
      label: 'cut from the left with a crop edge',
      change: {
        x: 110,
        width: 80,
        sourceTransform: { x: -80, y: 0, width: 160, height: 90, rotation: 0 },
      },
      drawnBox: { width: 160, height: 90 },
    },
    {
      label: 'cut with a crop edge and zoomed',
      change: {
        width: 80,
        sourceTransform: { x: -40, y: -20, width: 320, height: 180, rotation: 0 },
      },
      drawnBox: { width: 160, height: 90 },
    },
    {
      // The stretch to 32:9 was made outside crop mode and stays.
      label: 'stretched outside crop mode, then cut from the right',
      change: {
        sourceTransform: { x: 0, y: 0, width: 320, height: 90, rotation: 0 },
      },
      drawnBox: { width: 320, height: 90 },
    },
    {
      label: 'scaled with Width % and Height %, then cropped',
      change: {
        width: 80,
        height: 45,
        scaleX: 1.5,
        scaleY: 2,
        sourceTransform: { x: -30, y: -20, width: 320, height: 180, rotation: 0 },
      },
      drawnBox: { width: 160, height: 90 },
    },
  ])('shows all of an image $label, unstretched', ({ change, drawnBox }) => {
    const item: ImageCanvasItem = { ...createCroppableImage(), ...change };
    expect(isImageUncropped(item)).toBe(false);

    const reset: ImageCanvasItem = { ...item, ...buildImageCropResetChanges(item) };

    expect(isImageUncropped(reset)).toBe(true);
    expect(reset.crop).toEqual({ x: 0, y: 0, width: 160, height: 90 });
    // The image keeps its proportions as last drawn.
    expect(reset.sourceTransform.width / reset.sourceTransform.height).toBeCloseTo(
      item.sourceTransform.width / item.sourceTransform.height,
      9,
    );
    expect(reset.sourceTransform).toMatchObject({ x: 0, y: 0, rotation: 0 });
    // The box keeps its corner, angle and scale, never shrinks, and is drawn
    // at the expected size.
    expect(reset).toMatchObject({
      x: item.x,
      y: item.y,
      rotation: item.rotation,
      scaleX: item.scaleX,
      scaleY: item.scaleY,
      mirrorHorizontal: item.mirrorHorizontal,
    });
    expect(reset.width * reset.scaleX).toBeCloseTo(drawnBox.width, 9);
    expect(reset.height * reset.scaleY).toBeCloseTo(drawnBox.height, 9);
    expect(reset.width).toBeGreaterThanOrEqual(item.width);
    expect(reset.height).toBeGreaterThanOrEqual(item.height);
  });

  it('leaves the box exactly as it is after a pan, zoom or turn', () => {
    const item: ImageCanvasItem = {
      ...createCroppableImage(),
      width: 640,
      height: 360,
      rotation: 12,
      // A zoom whose sides are rounded slightly differently.
      sourceTransform: { x: -90.3, y: -41.7, width: 960.0000000001, height: 540, rotation: 7 },
    };

    const changes = buildImageCropResetChanges(item);

    expect(changes.width).toBe(640);
    expect(changes.height).toBe(360);
    expect(changes.sourceTransform).toEqual({ x: 0, y: 0, width: 640, height: 360, rotation: 0 });
  });
});

describe('keeping an open crop session in step with the document', () => {
  function createSession(item: ImageCanvasItem) {
    return {
      originalItem: item,
      previewItem: item,
      fullImageItem: buildFullImageTransformItem(item),
      activeInteraction: null as unknown,
    };
  }

  function createCroppedImage(): ImageCanvasItem {
    return {
      ...createImageItem({
        src: 'data:image/png;base64,AAA',
        mimeType: 'image/png',
        originalWidth: 160,
        originalHeight: 90,
        x: 30,
        y: 20,
      }),
      width: 80,
      sourceTransform: { x: 0, y: 0, width: 160, height: 90, rotation: 0 },
    };
  }

  it('keeps the session while the document item is unchanged, even as a rebuilt copy', () => {
    const item = createCroppedImage();
    const session = createSession(item);

    expect(syncImageCropSessionToDocument(session, item)).toBe(session);
    expect(
      syncImageCropSessionToDocument(session, {
        ...item,
        crop: { ...item.crop },
        sourceTransform: { ...item.sourceTransform },
        shadow: { ...item.shadow },
      }),
    ).toBe(session);
  });

  it('starts over when the item was re-cropped, moved or resized outside crop mode', () => {
    const item = createCroppedImage();
    const session = createSession(item);

    expect(
      syncImageCropSessionToDocument(session, { ...item, ...buildImageCropResetChanges(item) }),
    ).toBe('restart');
    expect(syncImageCropSessionToDocument(session, { ...item, rotation: 20 })).toBe('restart');
    expect(syncImageCropSessionToDocument(session, { ...item, scaleX: 2 })).toBe('restart');
  });

  it('shows other settings changed meanwhile and keeps the crop edits in progress', () => {
    const item = createCroppedImage();
    const panned = panImageUnderCrop({
      baseItem: item,
      pointerStart: { x: 50, y: 50 },
      pointer: { x: 60, y: 55 },
      siblingItems: [],
      snapEnabled: false,
      stageRect: { x: 0, y: 0, width: 1024, height: 1024 },
    });
    const session = {
      ...createSession(item),
      previewItem: panned.previewItem,
      fullImageItem: panned.fullImageItem,
    };
    const brighter: ImageCanvasItem = {
      ...item,
      mirrorHorizontal: true,
      adjustments: { ...item.adjustments, brightness: 140 },
    };

    const next = syncImageCropSessionToDocument(session, brighter);

    if (next === 'restart') {
      throw new Error('Expected the session to be kept.');
    }
    expect(next.originalItem).toBe(brighter);
    expect(next.previewItem).toMatchObject({
      mirrorHorizontal: true,
      adjustments: { brightness: 140 },
      sourceTransform: panned.previewItem.sourceTransform,
      width: panned.previewItem.width,
    });
    expect(next.fullImageItem).toMatchObject({
      id: panned.fullImageItem.id,
      mirrorHorizontal: true,
      adjustments: { brightness: 140 },
      x: panned.fullImageItem.x,
      y: panned.fullImageItem.y,
    });
    // Settled: the next check finds nothing to do.
    expect(syncImageCropSessionToDocument(next, brighter)).toBe(next);
  });

  it('waits while a crop-mode drag is under way', () => {
    const item = createCroppedImage();
    const session = { ...createSession(item), activeInteraction: { kind: 'image-pan' } };

    expect(syncImageCropSessionToDocument(session, { ...item, rotation: 20 })).toBe(session);
  });
});
