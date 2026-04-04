import { describe, expect, it } from 'vitest';

import {
  createGeneratorItem,
  createImageItem,
  createLineItem,
  createNgonItem,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';

import {
  buildInspectorEnvironment,
  buildSelectionInspectorSections,
  type DimensionAction,
  type NumberFieldDescriptor,
} from './selectionInspectorModel';

describe('selectionInspectorModel', () => {
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
        'fill:gradientFill',
        'geometry:rotation',
        'geometry:x',
        'shadow:color',
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
    const gradientFillField = sections
      .find((section) => section.key === 'fill')
      ?.fields.find((field) => field.descriptor.propertyKey === 'gradientFill');
    const shadowBlurField = sections
      .find((section) => section.key === 'shadow')
      ?.fields.find((field) => field.descriptor.propertyKey === 'blur');

    expect(gradientFillField?.state.isMixed).toBe(true);
    expect(gradientFillField?.state.value).toBeNull();
    expect(gradientFillField?.selectorStates.secondaryFill?.isMixed).toBe(false);
    expect(gradientFillField?.selectorStates.secondaryFill?.value).toBe(first.secondaryFill);
    expect(gradientFillField?.selectorStates.gradientEnabled?.isMixed).toBe(false);
    expect(gradientFillField?.selectorStates.gradientEnabled?.value).toBe(false);
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

  it('includes Sides field for ngon items and omits it for mixed ngon+rectangle selection', () => {
    const ngon = createNgonItem({ sides: 8 });
    const rectangle = createRectangleItem();
    const environment = buildInspectorEnvironment([], []);

    const ngonSections = buildSelectionInspectorSections([ngon], environment);
    const ngonFieldKeys = ngonSections.flatMap((section) =>
      section.fields.map((field) => `${section.key}:${field.descriptor.propertyKey}`)
    );
    expect(ngonFieldKeys).toContain('geometry:sides');
    expect(ngonFieldKeys).toContain('fill:gradientFill');
    expect(ngonFieldKeys).toContain('stroke:stroke');
    expect(ngonFieldKeys).not.toContain('geometry:cornerRadius');

    const mixedSections = buildSelectionInspectorSections([ngon, rectangle], environment);
    const mixedFieldKeys = mixedSections.flatMap((section) =>
      section.fields.map((field) => `${section.key}:${field.descriptor.propertyKey}`)
    );
    expect(mixedFieldKeys).not.toContain('geometry:sides');
    expect(mixedFieldKeys).not.toContain('geometry:cornerRadius');
    expect(mixedFieldKeys).toContain('stroke:stroke');
  });

  it('produces generator section descriptors with correct textMin/textMax bounds', () => {
    const generator = createGeneratorItem('bands', 1024, 1024);

    const environment = buildInspectorEnvironment([], []);
    const sections = buildSelectionInspectorSections([generator], environment);
    const generatorSection = sections.find((s) => s.key === 'generator');
    expect(generatorSection).toBeDefined();

    function findField(propertyKey: string) {
      return generatorSection?.fields.find(
        (f) => f.descriptor.propertyKey === propertyKey,
      )?.descriptor as NumberFieldDescriptor | undefined;
    }

    // stripeCount: slider 2-64, text allows 1 to +Inf
    const countField = findField('gen_stripeCount');
    expect(countField?.min).toBe(2);
    expect(countField?.max).toBe(64);
    expect(countField?.textMin).toBe(1);
    expect(countField?.textMax).toBe(Infinity);

    // stripeGlow: slider 0-1, text allows 0-1
    const glowField = findField('gen_stripeGlow');
    expect(glowField?.min).toBe(0);
    expect(glowField?.max).toBe(1);
    expect(glowField?.textMin).toBe(0);
    expect(glowField?.textMax).toBe(1);

    // stripeAngle: slider -90 to 90, text allows -Inf to +Inf
    const angleField = findField('gen_stripeAngle');
    expect(angleField?.min).toBe(-90);
    expect(angleField?.max).toBe(90);
    expect(angleField?.textMin).toBe(-Infinity);
    expect(angleField?.textMax).toBe(Infinity);
  });

  it('generator buildChange produces correct generatorParams patch', () => {
    const generator = createGeneratorItem('bands', 1024, 1024);
    const environment = buildInspectorEnvironment([], []);
    const sections = buildSelectionInspectorSections([generator], environment);
    const generatorSection = sections.find((s) => s.key === 'generator');
    const countField = generatorSection?.fields.find(
      (f) => f.descriptor.propertyKey === 'gen_stripeCount',
    );

    expect(countField).toBeDefined();
    const patch = countField!.descriptor.buildChange({ item: generator }, 100 as never);
    expect(patch).toEqual({
      generatorParams: { ...generator.generatorParams, stripeCount: 100 },
    });
  });

  it('produces scanlines descriptors with color, height, and gap-size spacing bounds', () => {
    const generator = createGeneratorItem('scanlines', 1024, 1024);
    const environment = buildInspectorEnvironment([], []);
    const sections = buildSelectionInspectorSections([generator], environment);
    const generatorSection = sections.find((section) => section.key === 'generator');

    expect(generatorSection?.fields.map((field) => field.descriptor.propertyKey)).toEqual(
      expect.arrayContaining([
        'gen_scanlineColor',
        'gen_scanlineHeight',
        'gen_scanlineSpacing',
      ]),
    );

    const heightField = generatorSection?.fields.find(
      (field) => field.descriptor.propertyKey === 'gen_scanlineHeight',
    )?.descriptor as NumberFieldDescriptor | undefined;
    expect(heightField?.label).toBe('Height');
    expect(heightField?.min).toBe(1);
    expect(heightField?.max).toBe(20);
    expect(heightField?.textMin).toBe(1);
    expect(heightField?.textMax).toBe(Infinity);

    const spacingField = generatorSection?.fields.find(
      (field) => field.descriptor.propertyKey === 'gen_scanlineSpacing',
    )?.descriptor as NumberFieldDescriptor | undefined;
    expect(spacingField?.label).toBe('Spacing');
    expect(spacingField?.min).toBe(1);
    expect(spacingField?.max).toBe(20);
    expect(spacingField?.textMin).toBe(0);
    expect(spacingField?.textMax).toBe(Infinity);
  });
});
