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
        'color:fill:color',
        'color:stroke:color',
        'main:strokeWidth:number',
        'main:cornerRadius:number',
        'geometry:x:number',
        'geometry:height:number',
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
        'text:text:text',
        'text:fontFamily:select',
        'text:fontWeight:boolean',
        'advancedText:paddingTop:number',
        'main:rotation:number',
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
        'image:preserveAspectRatio:boolean',
        'color:tintColor:color',
        'color:brightness:number',
        'geometry:width:number',
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
        'color:stroke:color',
        'main:opacity:number',
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
        'color:fill',
        'main:opacity',
        'main:rotation',
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
    ).toContain('main:opacity');
  });

  it('marks mixed state and keeps per-item nested patch builders explicit', () => {
    const first = createRectangleItem({
      fill: '#ff0000',
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
      .find((section) => section.key === 'color')
      ?.fields.find((field) => field.descriptor.propertyKey === 'fill');
    const shadowBlurField = sections
      .find((section) => section.key === 'shadow')
      ?.fields.find((field) => field.descriptor.propertyKey === 'blur');

    expect(fillField?.state.isMixed).toBe(true);
    expect(fillField?.state.value).toBeNull();
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
