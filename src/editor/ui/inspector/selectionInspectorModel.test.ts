import { describe, expect, it } from 'vitest';

import {
  createImageItem,
  createLineItem,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';

import {
  buildInspectorEnvironment,
  buildSelectionInspectorSections,
  getSelectionDescriptorCoverage,
  type DimensionAction,
} from './selectionInspectorModel';

describe('selectionInspectorModel', () => {
  it('covers the expected descriptor identities for each supported item kind', () => {
    expect(
      getSelectionDescriptorCoverage(createRectangleItem()).map(
        ({ propertyKey, sectionKey, valueType }) =>
          `${sectionKey}:${propertyKey}:${valueType}`
      )
    ).toEqual(
      expect.arrayContaining([
        'fill:fill:color',
        'fill:secondaryFill:color',
        'fill:gradientEnabled:boolean',
        'stroke:stroke:color',
        'stroke:strokeWidth:number',
        'geometry:cornerRadius:number',
        'geometry:x:number',
        'geometry:dimensions:number',
        'shadow:color:color',
      ])
    );

    expect(
      getSelectionDescriptorCoverage(createTextItem()).map(
        ({ propertyKey, sectionKey, valueType }) =>
          `${sectionKey}:${propertyKey}:${valueType}`
      )
    ).toEqual(
      expect.arrayContaining([
        'fill:fill:color',
        'fill:secondaryFill:color',
        'fill:gradientEnabled:boolean',
        'text:text:text',
        'text:fontFamily:select',
        'text:fontWeight:boolean',
        'advancedText:paddingTop:number',
        'geometry:rotation:number',
        'shadow:opacity:number',
      ])
    );

    expect(
      getSelectionDescriptorCoverage(
        createImageItem({
          src: 'data:image/png;base64,abc',
          mimeType: 'image/png',
          originalWidth: 20,
          originalHeight: 10,
        })
      ).map(({ propertyKey, sectionKey, valueType }) =>
        `${sectionKey}:${propertyKey}:${valueType}`
      )
    ).toEqual(
      expect.arrayContaining([
        'image:mirrorHorizontal:boolean',
        'image:preserveAspectRatio:boolean',
        'image:tintColor:color',
        'image:brightness:number',
        'geometry:dimensions:number',
        'shadow:offsetY:number',
      ])
    );

    expect(
      getSelectionDescriptorCoverage(createLineItem()).map(
        ({ propertyKey, sectionKey, valueType }) =>
          `${sectionKey}:${propertyKey}:${valueType}`
      )
    ).toEqual(
      expect.arrayContaining([
        'stroke:stroke:color',
        'stroke:strokeWidth:number',
        'geometry:startX:number',
        'geometry:endY:number',
        'shadow:blur:number',
      ])
    );
  });

  it('intersects fields by exact section, property, and type across selections', () => {
    const rectangle = createRectangleItem({ fill: '#ff0000' });
    const text = createTextItem({ fill: '#00ff00' });
    const line = createLineItem();

    const environment = buildInspectorEnvironment([], []);
    const rectangleAndTextSections = buildSelectionInspectorSections(
      [rectangle, text],
      environment
    );
    const rectangleAndLineSections = buildSelectionInspectorSections(
      [rectangle, line],
      environment
    );

    expect(
      rectangleAndTextSections.flatMap((section) =>
        section.fields.map((field) => `${section.key}:${field.descriptor.propertyKey}`)
      )
    ).toEqual(
      expect.arrayContaining([
        'fill:fill',
        'geometry:rotation',
        'geometry:x',
        'shadow:color',
        'fill:secondaryFill',
        'fill:gradientEnabled',
      ])
    );
    expect(
      rectangleAndLineSections.flatMap((section) =>
        section.fields.map((field) => `${section.key}:${field.descriptor.propertyKey}`)
      )
    ).not.toContain('geometry:x');
    expect(
      rectangleAndLineSections.flatMap((section) =>
        section.fields.map((field) => `${section.key}:${field.descriptor.propertyKey}`)
      )
    ).toContain('stroke:stroke');
  });

  it('marks mixed state and keeps per-item nested patch builders explicit', () => {
    const first = createRectangleItem({
      fill: '#ff0000',
      secondaryFill: '#abcdef',
      shadow: {
        color: '#111111',
        blur: 4,
        offsetX: 2,
        offsetY: 3,
        opacity: 0.2,
      },
    });
    const second = createRectangleItem({
      fill: '#00ff00',
      secondaryFill: '#abcdef',
      shadow: {
        color: '#222222',
        blur: 7,
        offsetX: 8,
        offsetY: 9,
        opacity: 0.6,
      },
    });
    const environment = buildInspectorEnvironment([], []);
    const sections = buildSelectionInspectorSections([first, second], environment);
    const fillField = sections
      .find((section) => section.key === 'fill')
      ?.fields.find((field) => field.descriptor.propertyKey === 'fill');
    const secondaryFillField = sections
      .find((section) => section.key === 'fill')
      ?.fields.find((field) => field.descriptor.propertyKey === 'secondaryFill');
    const gradientEnabledField = sections
      .find((section) => section.key === 'fill')
      ?.fields.find((field) => field.descriptor.propertyKey === 'gradientEnabled');
    const shadowBlurField = sections
      .find((section) => section.key === 'shadow')
      ?.fields.find((field) => field.descriptor.propertyKey === 'blur');

    expect(fillField?.state.isMixed).toBe(true);
    expect(fillField?.state.value).toBeNull();
    expect(secondaryFillField?.state.isMixed).toBe(false);
    expect(secondaryFillField?.state.value).toBe(first.secondaryFill);
    expect(gradientEnabledField?.state.isMixed).toBe(false);
    expect(gradientEnabledField?.state.value).toBe(false);
    expect(shadowBlurField?.state.isMixed).toBe(true);
    expect(
      shadowBlurField?.descriptor.buildChange(
        { item: second },
        12 as never
      )
    ).toEqual({
      shadow: {
        ...second.shadow,
        blur: 12,
      },
    });
  });

  it('dimensions buildChange computes correct patches for all DimensionAction kinds', () => {
    const environment = buildInspectorEnvironment([], []);
    const rect400x200 = createRectangleItem({ x: 0, y: 0, width: 400, height: 200 });
    const sections = buildSelectionInspectorSections([rect400x200], environment);
    const dimensionsField = sections
      .find((s) => s.key === 'geometry')
      ?.fields.find((f) => f.descriptor.propertyKey === 'dimensions');

    if (!dimensionsField) throw new Error('dimensions field not found');
    const bc = (action: DimensionAction) =>
      dimensionsField.descriptor.buildChange({ item: rect400x200 }, action as never);

    // Unlocked absolute
    expect(bc({ kind: 'absWidth', value: 300, locked: false })).toEqual({ width: 300 });
    expect(bc({ kind: 'absHeight', value: 100, locked: false })).toEqual({ height: 100 });

    // Locked absolute (400×200 → ratio 2)
    expect(bc({ kind: 'absWidth', value: 200, locked: true })).toEqual({ width: 200, height: 100 });
    expect(bc({ kind: 'absHeight', value: 100, locked: true })).toEqual({ width: 200, height: 100 });

    // Unlocked percentage
    expect(bc({ kind: 'pctWidth', value: 50, locked: false })).toEqual({ scaleX: 0.5 });
    expect(bc({ kind: 'pctHeight', value: 50, locked: false })).toEqual({ scaleY: 0.5 });

    // Locked percentage
    expect(bc({ kind: 'pctWidth', value: 50, locked: true })).toEqual({ scaleX: 0.5, scaleY: 0.5 });
    expect(bc({ kind: 'pctHeight', value: 50, locked: true })).toEqual({ scaleX: 0.5, scaleY: 0.5 });

    // Lock toggle
    const unlockedRect = createRectangleItem({ lockAspectRatio: false });
    const sectionsUnlocked = buildSelectionInspectorSections([unlockedRect], environment);
    const dimUnlocked = sectionsUnlocked
      .find((s) => s.key === 'geometry')
      ?.fields.find((f) => f.descriptor.propertyKey === 'dimensions');
    expect(
      dimUnlocked?.descriptor.buildChange({ item: unlockedRect }, { kind: 'setLock', value: true } as never)
    ).toEqual({ lockAspectRatio: true });

    const lockedRect = createRectangleItem({ lockAspectRatio: true });
    const sectionsLocked = buildSelectionInspectorSections([lockedRect], environment);
    const dimLocked = sectionsLocked
      .find((s) => s.key === 'geometry')
      ?.fields.find((f) => f.descriptor.propertyKey === 'dimensions');
    expect(
      dimLocked?.descriptor.buildChange({ item: lockedRect }, { kind: 'setLock', value: false } as never)
    ).toEqual({ lockAspectRatio: false });

    // Reset original — image
    const image = createImageItem({
      src: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      width: 400,
      height: 300,
      originalWidth: 800,
      originalHeight: 600,
    });
    const imageSections = buildSelectionInspectorSections([image], environment);
    const dimImage = imageSections
      .find((s) => s.key === 'geometry')
      ?.fields.find((f) => f.descriptor.propertyKey === 'dimensions');
    expect(
      dimImage?.descriptor.buildChange({ item: image }, { kind: 'resetOriginal' } as never)
    ).toEqual({
      width: 800,
      height: 600,
      scaleX: 1,
      scaleY: 1,
      sourceTransform: { x: 0, y: 0, width: 800, height: 600, rotation: 0 },
    });

    // Reset original — rectangle (no-op)
    expect(bc({ kind: 'resetOriginal' })).toEqual({});

    // Image dimension actions scale sourceTransform
    const bcImg = (action: DimensionAction) =>
      dimImage?.descriptor.buildChange({ item: image }, action as never);

    // absWidth unlocked — scales sourceTransform.width proportionally, normalizes scaleX to 1
    expect(bcImg({ kind: 'absWidth', value: 200, locked: false })).toEqual({
      width: 200,
      scaleX: 1,
      sourceTransform: { x: 0, y: 0, width: 200, height: 300, rotation: 0 },
    });

    // absWidth locked — uniform scale on both axes
    expect(bcImg({ kind: 'absWidth', value: 200, locked: true })).toEqual({
      width: 200,
      height: 150,
      scaleX: 1,
      scaleY: 1,
      sourceTransform: { x: 0, y: 0, width: 200, height: 150, rotation: 0 },
    });

    // absHeight unlocked
    expect(bcImg({ kind: 'absHeight', value: 150, locked: false })).toEqual({
      height: 150,
      scaleY: 1,
      sourceTransform: { x: 0, y: 0, width: 400, height: 150, rotation: 0 },
    });

    // absHeight locked — uniform scale
    expect(bcImg({ kind: 'absHeight', value: 150, locked: true })).toEqual({
      width: 200,
      height: 150,
      scaleX: 1,
      scaleY: 1,
      sourceTransform: { x: 0, y: 0, width: 200, height: 150, rotation: 0 },
    });

    // pctWidth unlocked — scales sourceTransform proportionally
    expect(bcImg({ kind: 'pctWidth', value: 50, locked: false })).toEqual({
      scaleX: 0.5,
      sourceTransform: { x: 0, y: 0, width: 200, height: 300, rotation: 0 },
    });

    // pctWidth locked — both axes
    expect(bcImg({ kind: 'pctWidth', value: 50, locked: true })).toEqual({
      scaleX: 0.5,
      scaleY: 0.5,
      sourceTransform: { x: 0, y: 0, width: 200, height: 150, rotation: 0 },
    });

    // pctHeight unlocked
    expect(bcImg({ kind: 'pctHeight', value: 50, locked: false })).toEqual({
      scaleY: 0.5,
      sourceTransform: { x: 0, y: 0, width: 400, height: 150, rotation: 0 },
    });

    // pctHeight locked
    expect(bcImg({ kind: 'pctHeight', value: 50, locked: true })).toEqual({
      scaleX: 0.5,
      scaleY: 0.5,
      sourceTransform: { x: 0, y: 0, width: 200, height: 150, rotation: 0 },
    });
  });

  it('filters unsupported mismatched descriptors and resolves select options', () => {
    const text = createTextItem({ fontFamily: 'Verdana' });
    const environment = buildInspectorEnvironment(
      [
        {
          family: 'Alpha Sans',
          sourceName: 'AlphaSans.ttf',
          weight: '400',
          style: 'normal',
          kind: 'uploaded',
        },
      ],
      []
    );
    const sections = buildSelectionInspectorSections([text], environment);
    const fontField = sections
      .find((section) => section.key === 'text')
      ?.fields.find((field) => field.descriptor.propertyKey === 'fontFamily');

    expect(fontField?.options.map((option) => option.label)).toEqual(
      expect.arrayContaining(['Alpha Sans', 'Arial', 'Verdana'])
    );
  });
});
