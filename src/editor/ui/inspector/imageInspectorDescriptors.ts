import {
  renderMirrorField,
} from './selectionInspectorRenderers';
import {
  createBooleanField,
  createColorField,
  createCustomField,
  createDimensionsField,
  createGeometryField,
  createNumberField,
  SECTION_ORDER,
} from './inspectorFieldHelpers';
import { buildImageAdjustmentsChange } from './inspectorModel';
import type { InspectorFieldDescriptor } from './selectionInspectorModel';

export function createImageDescriptors(): InspectorFieldDescriptor[] {
  return [
    createCustomField({
      buildChange: (_context, nextValue) => ({
        mirrorHorizontal: Boolean(nextValue),
      }),
      fieldOrder: 5,
      getValue: (item) => item.kind === 'image' && item.mirrorHorizontal,
      label: 'Mirror',
      propertyKey: 'mirrorHorizontal',
      render: renderMirrorField,
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      supportsMultiEdit: true,
      valueType: 'boolean',
    }),
    createBooleanField({
      buildChange: (_context, nextValue) => ({ preserveAspectRatio: nextValue }),
      fieldOrder: 10,
      getValue: (item) => item.kind === 'image' && item.preserveAspectRatio,
      label: 'Preserve aspect ratio',
      propertyKey: 'preserveAspectRatio',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      supportsMultiEdit: true,
      valueType: 'boolean',
    }),
    createColorField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'image'
          ? buildImageAdjustmentsChange(item.adjustments, { tintColor: nextValue })
          : {},
      fieldOrder: 20,
      getValue: (item) => (item.kind === 'image' ? item.adjustments.tintColor : ''),
      label: 'Tint color',
      propertyKey: 'tintColor',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      supportsMultiEdit: true,
      valueType: 'color',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'image'
          ? buildImageAdjustmentsChange(item.adjustments, { brightness: nextValue })
          : {},
      digits: 0,
      fieldOrder: 30,
      getValue: (item) => (item.kind === 'image' ? item.adjustments.brightness : 0),
      label: 'Brightness',
      max: 200,
      min: 0,
      propertyKey: 'brightness',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      slider: true,
      sliderDetentThreshold: 3,
      sliderDetentValue: 100,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'image'
          ? buildImageAdjustmentsChange(item.adjustments, { contrast: nextValue })
          : {},
      digits: 0,
      fieldOrder: 40,
      getValue: (item) => (item.kind === 'image' ? item.adjustments.contrast : 0),
      label: 'Contrast',
      max: 100,
      min: 0,
      propertyKey: 'contrast',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      slider: true,
      sliderDetentThreshold: 2,
      sliderDetentValue: 50,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'image'
          ? buildImageAdjustmentsChange(item.adjustments, { tintStrength: nextValue })
          : {},
      digits: 0,
      fieldOrder: 50,
      getValue: (item) => (item.kind === 'image' ? item.adjustments.tintStrength : 0),
      label: 'Tint strength',
      max: 100,
      min: 0,
      propertyKey: 'tintStrength',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      slider: true,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createNumberField({
      buildChange: (_context, nextValue) => ({ opacity: nextValue }),
      digits: 1,
      fieldOrder: 60,
      getValue: (item) => item.opacity,
      label: 'Opacity',
      max: 1,
      min: 0,
      propertyKey: 'opacity',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      step: 0.1,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
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
      { digits: 0, step: 1 }
    ),
  ];
}
