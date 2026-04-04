import {
  createColorField,
  createDimensionsField,
  createGeometryField,
  createGradientAngleDescriptor,
  createGradientFillDescriptor,
  createNumberField,
  ROTATION_FIELD_EXTRA,
  SECTION_ORDER,
} from './inspectorFieldHelpers';
import type { InspectorFieldDescriptor } from './selectionInspectorModel';

export function createShapeDescriptors(
  itemKind: 'ellipse' | 'line' | 'ngon' | 'rectangle'
): InspectorFieldDescriptor[] {
  const descriptors: InspectorFieldDescriptor[] = [
    createColorField({
      buildChange: (_context, nextValue) => ({ stroke: nextValue }),
      fieldOrder: 10,
      getValue: (item) => ('stroke' in item ? item.stroke : ''),
      label: 'Stroke',
      propertyKey: 'stroke',
      sectionKey: 'stroke',
      sectionLabel: 'Stroke',
      sectionOrder: SECTION_ORDER.stroke,

      valueType: 'color',
    }),
    createNumberField({
      buildChange: (_context, nextValue) => ({ strokeWidth: nextValue }),
      digits: 1,
      fieldOrder: 20,
      getValue: (item) => ('strokeWidth' in item ? item.strokeWidth : 0),
      label: 'Stroke width',
      max: 50,
      min: itemKind === 'line' ? 1 : 0,
      propertyKey: 'strokeWidth',
      sectionKey: 'stroke',
      sectionLabel: 'Stroke',
      sectionOrder: SECTION_ORDER.stroke,
      slider: true,
      step: 1,
      textMax: Infinity,

      valueType: 'number',
    }),
  ];

  if (itemKind !== 'line') {
    descriptors.unshift(createGradientFillDescriptor(), createGradientAngleDescriptor());
  }

  if (itemKind === 'line') {
    descriptors.push(
      createGeometryField(
        'startX',
        'Start X',
        10,
        (item) => (item.kind === 'line' ? item.startX : 0),
        (_context, nextValue) => ({ startX: nextValue }),
        { digits: 1, step: 0.1 }
      ),
      createGeometryField(
        'startY',
        'Start Y',
        20,
        (item) => (item.kind === 'line' ? item.startY : 0),
        (_context, nextValue) => ({ startY: nextValue }),
        { digits: 1, step: 0.1 }
      ),
      createGeometryField(
        'endX',
        'End X',
        30,
        (item) => (item.kind === 'line' ? item.endX : 0),
        (_context, nextValue) => ({ endX: nextValue }),
        { digits: 1, step: 0.1 }
      ),
      createGeometryField(
        'endY',
        'End Y',
        40,
        (item) => (item.kind === 'line' ? item.endY : 0),
        (_context, nextValue) => ({ endY: nextValue }),
        { digits: 1, step: 0.1 }
      )
    );
  } else {
    descriptors.push(
      createGeometryField('x', 'X', 10, (item) => item.x, (_context, nextValue) => ({ x: nextValue }), {
        digits: 1,
        step: 0.1,
      }),
      createGeometryField('y', 'Y', 20, (item) => item.y, (_context, nextValue) => ({ y: nextValue }), {
        digits: 1,
        step: 0.1,
      }),
      createDimensionsField(),
      createGeometryField(
        'rotation',
        'Rotation',
        50,
        (item) => item.rotation,
        (_context, nextValue) => ({ rotation: nextValue }),
        ROTATION_FIELD_EXTRA,
      )
    );
  }

  if (itemKind === 'rectangle') {
    descriptors.push(
      createGeometryField(
        'cornerRadius',
        'Corner radius',
        60,
        (item) => (item.kind === 'rectangle' ? item.cornerRadius : 0),
        (_context, nextValue) => ({ cornerRadius: nextValue }),
        { digits: 1, max: 250, min: 0, slider: true, step: 1, textMax: Infinity }
      )
    );
  }

  if (itemKind === 'ngon') {
    descriptors.push(
      createGeometryField(
        'sides',
        'Sides',
        55,
        (item) => (item.kind === 'ngon' ? item.sides : 6),
        (_context, nextValue) => ({ sides: Math.max(3, Math.trunc(nextValue)) }),
        { digits: 0, max: 12, min: 3, slider: true, step: 1, textMax: Infinity }
      )
    );
  }

  return descriptors;
}
