import { describe, expect, it } from 'vitest';

import {
  createImageItem,
  createLineItem,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';

import {
  buildFontOptions,
  buildImageAdjustmentsChange,
  formatDisplayedNumber,
  getGeometrySummary,
  getLayerPreviewStyle,
  getLayerPrimaryLabel,
  getLayerSecondaryLabel,
  getSelectionSummary,
  getSortedLayerItems,
  getTextStyleCapabilities,
} from './inspectorModel';

describe('inspectorModel', () => {
  it('formats displayed numbers and geometry summaries for box and line items', () => {
    const rectangle = createRectangleItem({
      x: 12.345,
      y: 67.891,
      width: 45.678,
      height: 90.123,
    });
    const line = createLineItem({
      startX: 1.234,
      startY: 5.678,
      endX: 9.876,
      endY: 4.321,
    });

    expect(formatDisplayedNumber(Number.NaN)).toBe('0');
    expect(formatDisplayedNumber(12.345, 1)).toBe('12.3');
    expect(getGeometrySummary(rectangle)).toBe('X 12.3 · Y 67.9 · W 45.7 · H 90.1');
    expect(getGeometrySummary(line)).toBe('X1 1.2 · Y1 5.7 · X2 9.9 · Y2 4.3');
  });

  it('deduplicates system, session, and document fonts by family and kind, then sorts by family', () => {
    const options = buildFontOptions(
      [
        {
          family: 'Zulu Display',
          sourceName: 'ZuluDisplay.ttf',
          weight: '400',
          style: 'normal',
          kind: 'uploaded',
        },
        {
          family: 'Alpha Sans',
          sourceName: 'AlphaSans.ttf',
          weight: '400',
          style: 'normal',
          kind: 'uploaded',
        },
      ],
      [
        {
          family: 'Zulu Display',
          sourceName: 'ZuluDisplay.ttf',
          kind: 'uploaded',
        },
        {
          family: 'Arial',
          sourceName: 'Arial',
          kind: 'system',
        },
      ],
    );

    expect(options.filter((font) => font.family === 'Zulu Display')).toHaveLength(1);
    expect(options.some((font) => font.family === 'Arial')).toBe(true);
    expect(options.map((font) => font.family)).toEqual([
      'Alpha Sans',
      'Arial',
      'Georgia',
      'Helvetica',
      'Impact',
      'Tahoma',
      'Times New Roman',
      'Trebuchet MS',
      'Verdana',
      'Zulu Display',
    ]);
  });

  it('computes text style capability rules for system and uploaded fonts', () => {
    const uploadedText = createTextItem({
      fontFamily: 'Custom Family',
      fontStyle: 'italic',
      fontWeight: 'normal',
    });
    const systemText = createTextItem({
      fontFamily: 'Arial',
      fontStyle: 'normal',
      fontWeight: 'normal',
    });

    expect(
      getTextStyleCapabilities(uploadedText, [
        {
          family: 'Custom Family',
          sourceName: 'CustomFamily-Regular.ttf',
          weight: '400',
          style: 'normal',
          kind: 'uploaded',
        },
        {
          family: 'Custom Family',
          sourceName: 'CustomFamily-Italic.ttf',
          weight: '400',
          style: 'italic',
          kind: 'uploaded',
        },
        {
          family: 'Custom Family',
          sourceName: 'CustomFamily-Bold.ttf',
          weight: '700',
          style: 'normal',
          kind: 'uploaded',
        },
      ]),
    ).toEqual({
      canToggleBold: false,
      canToggleItalic: true,
    });

    expect(getTextStyleCapabilities(systemText, [])).toEqual({
      canToggleBold: true,
      canToggleItalic: true,
    });
  });

  it('derives layer metadata and sorted ordering from canvas items', () => {
    const backItem = createRectangleItem({ zIndex: 0, fill: '#ff0000ff' });
    const frontItem = createTextItem({
      zIndex: 2,
      text: 'Headline goes here and keeps going',
    });
    const imageItem = createImageItem({
      src: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      originalWidth: 20,
      originalHeight: 10,
    });
    imageItem.zIndex = 1;

    expect(getLayerPrimaryLabel(backItem)).toBe('Rectangle');
    expect(getLayerSecondaryLabel(frontItem)).toContain('Headline goes here');
    expect(getLayerPreviewStyle(backItem)).toEqual({
      background: '#ff0000ff',
      borderColor: '#ff0000ff',
      borderWidth: '',
      color: '#ff0000ff',
    });
    expect(getLayerPreviewStyle(imageItem)).toEqual({});
    expect(getSortedLayerItems([backItem, frontItem, imageItem]).map((item) => item.id)).toEqual([
      frontItem.id,
      imageItem.id,
      backItem.id,
    ]);
  });

  it('builds image adjustment patches and multi-selection summaries', () => {
    const image = createImageItem({
      src: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      originalWidth: 20,
      originalHeight: 10,
    });
    const first = createRectangleItem({ opacity: 0.5 });
    const second = createRectangleItem({ opacity: 0.7 });

    expect(
      buildImageAdjustmentsChange(image.adjustments, { brightness: 150 }),
    ).toEqual({
      adjustments: {
        ...image.adjustments,
        brightness: 150,
      },
    });
    expect(getSelectionSummary([first, second])).toEqual({
      allSelectedOpacityEqual: false,
      isMultiSelection: true,
      opacityValue: 0.5,
    });
  });
});
