import { describe, expect, it } from 'vitest';

import {
  createGeneratorItem,
  createImageItem,
  createLineItem,
  createPolygonItem,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';
import type { UploadedFont } from '../../document/documentTypes';

import {
  buildFontOptions,
  buildImageAdjustmentsChange,
  formatDisplayedNumber,
  getGeometrySummary,
  getInspectorHeadingSubtitle,
  getItemGlyph,
  getLayerPreviewStyle,
  getLayerPrimaryLabel,
  getLayerSecondaryLabel,
  getSelectionSummary,
  getSortedLayerItems,
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
      vertices: [{ x: 1.234, y: 5.678 }, { x: 9.876, y: 4.321 }],
    });

    expect(formatDisplayedNumber(Number.NaN)).toBe('0');
    expect(formatDisplayedNumber(12.345, 1)).toBe('12.3');
    expect(getGeometrySummary(rectangle)).toBe('X 12.3 · Y 67.9 · W 45.7 · H 90.1');
    expect(getGeometrySummary(line)).toBe('X1 1.2 · Y1 5.7 · X2 9.9 · Y2 4.3');
    // A bent line is still summed up by its two ends.
    const bent = createLineItem({
      vertices: [{ x: 1.234, y: 5.678 }, { x: 50, y: 50 }, { x: 9.876, y: 4.321 }],
    });
    expect(getGeometrySummary(bent)).toBe('X1 1.2 · Y1 5.7 · X2 9.9 · Y2 4.3');
  });

  it('labels an open polygon as a line and a closed one as a polygon', () => {
    const line = createLineItem({ stroke: '#ff0000ff' });
    const polygon = createPolygonItem({ fill: '#00ff00' });

    expect(getLayerPrimaryLabel(line)).toBe('Line');
    expect(getLayerPrimaryLabel(polygon)).toBe('Polygon');
    expect(getLayerPrimaryLabel(createPolygonItem({ closed: false }))).toBe('Line');
    expect(getItemGlyph(line)).toBe(getItemGlyph(createPolygonItem({ closed: false })));
    expect(getItemGlyph(line)).not.toBe(getItemGlyph(polygon));
    // A line has no fill to show: its stroke color on a dark chip.
    expect(getLayerPreviewStyle(line)).toEqual({
      background: 'rgba(12, 19, 32, 0.92)',
      borderColor: 'rgba(147, 168, 201, 0.26)',
      color: '#ff0000ff',
    });
    expect(getLayerPreviewStyle(polygon)).toMatchObject({ background: '#00ff00' });
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

  it('leaves the emoji fallback out of the available fonts, but not out of the document\'s', () => {
    const notoEmoji: UploadedFont = {
      family: 'Noto Emoji',
      sourceName: 'NotoEmoji-Regular.ttf',
      weight: '400',
      style: 'normal',
      kind: 'bundled',
    };
    const barlow: UploadedFont = { ...notoEmoji, family: 'Barlow', sourceName: 'Barlow-Regular.ttf' };

    const families = (options: ReturnType<typeof buildFontOptions>) => options.map((font) => font.family);
    expect(families(buildFontOptions([notoEmoji, barlow], []))).not.toContain('Noto Emoji');
    expect(families(buildFontOptions([notoEmoji, barlow], []))).toContain('Barlow');
    expect(
      families(
        buildFontOptions([notoEmoji], [{ family: 'Noto Emoji', sourceName: 'NotoEmoji-Regular.ttf', kind: 'bundled' }]),
      ),
    ).toContain('Noto Emoji');
  });

  it('lists a Bold file as "<Family> Bold" only, and its family only while it has another file', () => {
    const file = (family: string, sourceName: string, weight: UploadedFont['weight']): UploadedFont => ({
      family,
      sourceName,
      weight,
      style: 'normal',
      kind: 'uploaded',
    });
    // The font list has a Bold file twice: as Foo's bold face and as "Foo Bold".
    const bold = [file('Foo', 'Foo-Bold.ttf', '700'), file('Foo Bold', 'Foo-Bold.ttf', '400')];
    const regular = file('Foo', 'Foo-Regular.ttf', '400');
    const fooFamilies = (options: ReturnType<typeof buildFontOptions>) =>
      options.map((font) => font.family).filter((family) => family.startsWith('Foo'));

    // Bold only: no plain "Foo", which would draw bold with Bold off.
    expect(fooFamilies(buildFontOptions(bold, []))).toEqual(['Foo Bold']);
    // A regular file joins: Foo is back, listed by that file.
    const withRegular = buildFontOptions([...bold, regular], []);
    expect(fooFamilies(withRegular)).toEqual(['Foo', 'Foo Bold']);
    expect(withRegular.find((font) => font.family === 'Foo')?.sourceName).toBe('Foo-Regular.ttf');
    // And gone again with it.
    expect(fooFamilies(buildFontOptions(bold, []))).toEqual(['Foo Bold']);
    // A document whose text uses the plain family still lists it.
    expect(
      fooFamilies(buildFontOptions(bold, [{ family: 'Foo', sourceName: 'Foo-Bold.ttf', kind: 'uploaded' }])),
    ).toEqual(['Foo', 'Foo Bold']);
  });

  it('lists a family once however many of its files are available or referenced by the document', () => {
    const options = buildFontOptions(
      [
        {
          family: 'Persist Probe',
          sourceName: 'PersistProbe-Bold.otf',
          weight: '700',
          style: 'normal',
          kind: 'uploaded',
        },
        {
          family: 'Persist Probe',
          sourceName: 'PersistProbe-Regular.otf',
          weight: '400',
          style: 'normal',
          kind: 'uploaded',
        },
      ],
      [
        { family: 'Persist Probe', sourceName: 'PersistProbe-Bold.otf', kind: 'uploaded' },
        { family: 'Persist Probe', sourceName: 'PersistProbe-Regular.otf', kind: 'uploaded' },
        { family: 'Ghost Font', sourceName: 'GhostFont-Bold.ttf', kind: 'uploaded' },
        { family: 'Ghost Font', sourceName: 'GhostFont-Regular.ttf', kind: 'uploaded' },
      ],
    );

    // Listed by its regular file: the bold one is listed as "Persist Probe Bold".
    expect(options.filter((font) => font.family === 'Persist Probe')).toEqual([
      { family: 'Persist Probe', sourceName: 'PersistProbe-Regular.otf', kind: 'uploaded' },
    ]);
    // A family whose files are all missing stays selectable, also just once.
    expect(options.filter((font) => font.family === 'Ghost Font')).toEqual([
      { family: 'Ghost Font', sourceName: 'GhostFont-Bold.ttf', kind: 'uploaded' },
    ]);
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
    // Rich text tags are not part of what the text says.
    expect(
      getLayerSecondaryLabel({
        ...frontItem,
        text: '<b>Big</b> <color=red>sale</color> <noparse><b></noparse> 1 < 2',
      } as typeof frontItem),
    ).toBe('“Big sale <b> 1 < 2”');
    expect(getLayerPreviewStyle(backItem)).toEqual({
      background: '#ff0000ff',
      borderColor: '#ff0000ff',
      borderWidth: '',
      color: '#ff0000ff',
    });
    expect(getLayerPreviewStyle(imageItem)).toEqual({});
    // A text's outline shows on its chip, as a rectangle's stroke does.
    expect(
      getLayerPreviewStyle({ ...frontItem, stroke: '#00ff00ff', strokeWidth: 4 } as typeof frontItem),
    ).toMatchObject({ borderColor: '#00ff00ff', borderWidth: '2px' });
    expect(getLayerPreviewStyle(frontItem)).toMatchObject({ borderWidth: '' });
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

  it('returns null subtitle for shapes and text, filename for images, and "Generator" for generators', () => {
    expect(getInspectorHeadingSubtitle(createRectangleItem())).toBeNull();
    expect(getInspectorHeadingSubtitle(createTextItem())).toBeNull();
    expect(getInspectorHeadingSubtitle(createLineItem())).toBeNull();

    const defaultImage = createImageItem({
      src: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      originalWidth: 10,
      originalHeight: 10,
    });
    expect(getInspectorHeadingSubtitle(defaultImage)).toBeNull();

    const namedImage = createImageItem({
      src: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      originalWidth: 10,
      originalHeight: 10,
      name: 'photo.jpg',
    });
    expect(getInspectorHeadingSubtitle(namedImage)).toBe('photo.jpg');

    const generator = createGeneratorItem('noise', 1024, 768);
    expect(getInspectorHeadingSubtitle(generator)).toBe('Generator');
  });
});
