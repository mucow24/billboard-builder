import {
  renderMirrorField,
} from './selectionInspectorRenderers';
import {
  createBooleanField,
  createColorField,
  createCustomField,
  createDimensionsField,
  createPositionXField,
  createPositionYField,
  createNumberField,
  createRotationField,
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
      tooltip: 'Flip the image left to right.',
      propertyKey: 'mirrorHorizontal',
      render: renderMirrorField,
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,

      valueType: 'boolean',
    }),
    createBooleanField({
      buildChange: (_context, nextValue) => ({ preserveAspectRatio: nextValue }),
      fieldOrder: 10,
      getValue: (item) => item.kind === 'image' && item.preserveAspectRatio,
      label: 'Preserve aspect ratio',
      tooltip: "Keep the image's proportions when resizing it by dragging its handles on the canvas.",
      propertyKey: 'preserveAspectRatio',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,

      valueType: 'boolean',
    }),
    createColorField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'image'
          ? buildImageAdjustmentsChange(item.adjustments, { tintColor: nextValue })
          : {},
      fieldOrder: 50,
      getValue: (item) => (item.kind === 'image' ? item.adjustments.tintColor : ''),
      label: 'Tint color',
      tooltip: 'Color blended over the image. Has no effect while Tint strength is 0.',
      propertyKey: 'tintColor',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,

      valueType: 'color',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'image'
          ? buildImageAdjustmentsChange(item.adjustments, { brightness: nextValue })
          : {},
      digits: 0,
      fieldOrder: 20,
      getValue: (item) => (item.kind === 'image' ? item.adjustments.brightness : 0),
      label: 'Brightness',
      tooltip: 'Lighten or darken the image. 100 leaves it unchanged.',
      max: 200,
      min: 0,
      propertyKey: 'brightness',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      slider: true,
      sliderDetentThreshold: 3,
      sliderDetentValue: 100,

      valueType: 'number',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'image'
          ? buildImageAdjustmentsChange(item.adjustments, { contrast: nextValue })
          : {},
      digits: 0,
      fieldOrder: 30,
      getValue: (item) => (item.kind === 'image' ? item.adjustments.contrast : 0),
      label: 'Contrast',
      tooltip: 'Difference between light and dark areas. 50 leaves the image unchanged.',
      max: 100,
      min: 0,
      propertyKey: 'contrast',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      slider: true,
      sliderDetentThreshold: 2,
      sliderDetentValue: 50,

      valueType: 'number',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'image'
          ? buildImageAdjustmentsChange(item.adjustments, { tintStrength: nextValue })
          : {},
      digits: 0,
      fieldOrder: 60,
      getValue: (item) => (item.kind === 'image' ? item.adjustments.tintStrength : 0),
      label: 'Tint strength',
      tooltip: 'How strongly the tint color covers the image, from 0 (none) to 100 (solid color).',
      max: 100,
      min: 0,
      propertyKey: 'tintStrength',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      slider: true,

      valueType: 'number',
    }),
    createNumberField({
      buildChange: (_context, nextValue) => ({ opacity: nextValue }),
      digits: 1,
      fieldOrder: 40,
      getValue: (item) => item.opacity,
      label: 'Opacity',
      tooltip: 'Transparency of the image, from 0 (invisible) to 1 (solid).',
      max: 1,
      min: 0,
      propertyKey: 'opacity',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      slider: true,
      step: 0.1,

      valueType: 'number',
    }),
    createPositionXField(),
    createPositionYField(),
    createDimensionsField(),
    createRotationField(),
  ];
}
