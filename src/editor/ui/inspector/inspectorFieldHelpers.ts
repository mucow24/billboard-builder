import type {
  CanvasItem,
} from '../../document/documentTypes';
import { scaleImageSourceTransform } from '../../rendering/imagePresentation';
import {
  renderDimensionsField,
  renderSwapFillColorsField,
} from './selectionInspectorRenderers';
import type {
  BooleanFieldDescriptor,
  ColorFieldDescriptor,
  CustomFieldDescriptor,
  InspectorFieldDescriptor,
  NumberFieldDescriptor,
  SelectFieldDescriptor,
  SelectionFieldChangeContext,
  SelectOption,
  TextFieldDescriptor,
} from './selectionInspectorModel';

export const SECTION_ORDER = {
  generator: 3,
  image: 5,
  fill: 10,
  stroke: 15,
  text: 20,
  geometry: 50,
  advancedText: 60,
  blur: 65,
  shadow: 70,
} as const;

export const ALIGN_OPTIONS: SelectOption[] = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
];

export const VERTICAL_ALIGN_OPTIONS: SelectOption[] = [
  { label: 'Top', value: 'top' },
  { label: 'Middle', value: 'middle' },
  { label: 'Bottom', value: 'bottom' },
];

export function createNumberField(
  descriptor: Omit<NumberFieldDescriptor, 'controlKind'>
): NumberFieldDescriptor {
  return {
    controlKind: 'number',
    ...descriptor,
  };
}

export function createTextField(
  descriptor: Omit<TextFieldDescriptor, 'controlKind'>
): TextFieldDescriptor {
  return {
    controlKind: 'text',
    ...descriptor,
  };
}

export function createBooleanField(
  descriptor: Omit<BooleanFieldDescriptor, 'controlKind'>
): BooleanFieldDescriptor {
  return {
    controlKind: 'boolean',
    ...descriptor,
  };
}

export function createColorField(
  descriptor: Omit<ColorFieldDescriptor, 'controlKind'>
): ColorFieldDescriptor {
  return {
    controlKind: 'color',
    ...descriptor,
  };
}

export function createSelectField(
  descriptor: Omit<SelectFieldDescriptor, 'controlKind'>
): SelectFieldDescriptor {
  return {
    controlKind: 'select',
    ...descriptor,
  };
}

export function createCustomField(
  descriptor: Omit<CustomFieldDescriptor, 'controlKind'>
): CustomFieldDescriptor {
  return {
    controlKind: 'custom',
    ...descriptor,
  };
}

export function createGeometryField(
  propertyKey: string,
  label: string,
  fieldOrder: number,
  getValue: (item: CanvasItem) => number,
  buildChange: (
    context: SelectionFieldChangeContext,
    nextValue: number,
  ) => Partial<CanvasItem>,
  extra?: Partial<NumberFieldDescriptor>,
): NumberFieldDescriptor {
  return createNumberField({
    buildChange,
    fieldOrder,
    getValue,
    label,
    propertyKey,
    sectionKey: 'geometry',
    sectionLabel: 'Geometry',
    sectionOrder: SECTION_ORDER.geometry,
    supportsMultiEdit: true,
    valueType: 'number',
    ...extra,
  });
}

export type DimensionAction =
  | { kind: 'absWidth'; value: number; locked: boolean }
  | { kind: 'absHeight'; value: number; locked: boolean }
  | { kind: 'pctWidth'; value: number; locked: boolean }
  | { kind: 'pctHeight'; value: number; locked: boolean }
  | { kind: 'setLock'; value: boolean }
  | { kind: 'resetOriginal' };

export function createDimensionsField(): CustomFieldDescriptor {
  return createCustomField({
    buildChange: ({ item }, nextValue) => {
      const action = nextValue as DimensionAction;
      switch (action.kind) {
        case 'absWidth': {
          if (item.kind === 'image') {
            const oldW = item.width * item.scaleX;
            const ratioX = action.value / Math.max(oldW, 1);
            if (action.locked) {
              const oldH = item.height * item.scaleY;
              return {
                width: action.value,
                height: oldH * ratioX,
                scaleX: 1,
                scaleY: 1,
                sourceTransform: scaleImageSourceTransform(item.sourceTransform, ratioX, ratioX),
              };
            }
            return {
              width: action.value,
              scaleX: 1,
              sourceTransform: scaleImageSourceTransform(item.sourceTransform, ratioX, 1),
            };
          }
          if (!action.locked) return { width: action.value };
          const ratio = item.width / item.height;
          return { width: action.value, height: action.value / ratio };
        }
        case 'absHeight': {
          if (item.kind === 'image') {
            const oldH = item.height * item.scaleY;
            const ratioY = action.value / Math.max(oldH, 1);
            if (action.locked) {
              const oldW = item.width * item.scaleX;
              return {
                width: oldW * ratioY,
                height: action.value,
                scaleX: 1,
                scaleY: 1,
                sourceTransform: scaleImageSourceTransform(item.sourceTransform, ratioY, ratioY),
              };
            }
            return {
              height: action.value,
              scaleY: 1,
              sourceTransform: scaleImageSourceTransform(item.sourceTransform, 1, ratioY),
            };
          }
          if (!action.locked) return { height: action.value };
          const ratio = item.width / item.height;
          return { width: action.value * ratio, height: action.value };
        }
        case 'pctWidth': {
          const newScale = action.value / 100;
          if (item.kind === 'image') {
            const ratioX = newScale / (item.scaleX || 1);
            if (action.locked) {
              const ratioY = newScale / (item.scaleY || 1);
              return {
                scaleX: newScale,
                scaleY: newScale,
                sourceTransform: scaleImageSourceTransform(item.sourceTransform, ratioX, ratioY),
              };
            }
            return {
              scaleX: newScale,
              sourceTransform: scaleImageSourceTransform(item.sourceTransform, ratioX, 1),
            };
          }
          return action.locked
            ? { scaleX: newScale, scaleY: newScale }
            : { scaleX: newScale };
        }
        case 'pctHeight': {
          const newScale = action.value / 100;
          if (item.kind === 'image') {
            const ratioY = newScale / (item.scaleY || 1);
            if (action.locked) {
              const ratioX = newScale / (item.scaleX || 1);
              return {
                scaleX: newScale,
                scaleY: newScale,
                sourceTransform: scaleImageSourceTransform(item.sourceTransform, ratioX, ratioY),
              };
            }
            return {
              scaleY: newScale,
              sourceTransform: scaleImageSourceTransform(item.sourceTransform, 1, ratioY),
            };
          }
          return action.locked
            ? { scaleX: newScale, scaleY: newScale }
            : { scaleY: newScale };
        }
        case 'setLock':
          return { lockAspectRatio: action.value };
        case 'resetOriginal':
          if (item.kind !== 'image') return {};
          return {
            width: item.originalWidth,
            height: item.originalHeight,
            scaleX: 1,
            scaleY: 1,
            sourceTransform: {
              x: 0,
              y: 0,
              width: item.originalWidth,
              height: item.originalHeight,
              rotation: 0,
            },
          };
      }
    },
    fieldOrder: 30,
    getValue: (item) => item.width,
    label: 'Dimensions',
    propertyKey: 'dimensions',
    render: renderDimensionsField,
    sectionKey: 'geometry',
    sectionLabel: 'Geometry',
    sectionOrder: SECTION_ORDER.geometry,
    selectors: {
      height: (item) => item.height,
      scaleX: (item) => item.scaleX,
      scaleY: (item) => item.scaleY,
      lockAspectRatio: (item) => item.lockAspectRatio,
      originalWidth: (item) => (item.kind === 'image' ? item.originalWidth : null),
      originalHeight: (item) => (item.kind === 'image' ? item.originalHeight : null),
    },
    supportsMultiEdit: true,
    valueType: 'number',
  });
}

export function createShadowNumberField(
  propertyKey: string,
  label: string,
  fieldOrder: number,
  getValue: (item: CanvasItem) => number,
  buildValue: (nextValue: number) => Partial<CanvasItem['shadow']>,
  extra?: Partial<NumberFieldDescriptor>,
): NumberFieldDescriptor {
  return createNumberField({
    buildChange: ({ item }, nextValue) => ({
      shadow: {
        ...item.shadow,
        ...buildValue(nextValue),
      },
    }),
    fieldOrder,
    getValue,
    label,
    propertyKey,
    sectionKey: 'shadow',
    sectionLabel: 'Shadow',
    sectionOrder: SECTION_ORDER.shadow,
    supportsMultiEdit: true,
    valueType: 'number',
    ...extra,
  });
}

export function createSwapFillColorsDescriptor(): InspectorFieldDescriptor {
  return {
    buildChange: ({ item }: SelectionFieldChangeContext) => {
      const fill = 'fill' in item ? item.fill : '';
      const secondaryFill = 'secondaryFill' in item ? item.secondaryFill : '';
      return { fill: secondaryFill, secondaryFill: fill };
    },
    controlKind: 'custom' as const,
    fieldOrder: 40,
    getDisabled: ({ selectedItems }) =>
      selectedItems.every(
        (item) => !('gradientEnabled' in item) || !item.gradientEnabled,
      ),
    getValue: () => null,
    label: 'Swap fill colors',
    propertyKey: 'swapFillColors',
    render: renderSwapFillColorsField,
    sectionKey: 'fill',
    sectionLabel: 'Fill',
    sectionOrder: SECTION_ORDER.fill,
    supportsMultiEdit: true,
    valueType: 'custom',
  };
}

export const COMMON_BLUR_DESCRIPTORS: InspectorFieldDescriptor[] = [
  createNumberField({
    buildChange: (_context, nextValue) => ({ blurRadius: nextValue }),
    digits: 0,
    fieldOrder: 10,
    getValue: (item) => item.blurRadius,
    label: 'Blur radius',
    max: 100,
    min: 0,
    propertyKey: 'blurRadius',
    sectionKey: 'blur',
    sectionLabel: 'Blur',
    sectionOrder: SECTION_ORDER.blur,
    step: 1,
    supportsMultiEdit: true,
    valueType: 'number',
  }),
];

export const COMMON_SHADOW_DESCRIPTORS: InspectorFieldDescriptor[] = [
  createColorField({
    buildChange: ({ item }, nextValue) => ({
      shadow: {
        ...item.shadow,
        color: nextValue,
      },
    }),
    fieldOrder: 10,
    getValue: (item) => item.shadow.color,
    label: 'Shadow color',
    propertyKey: 'color',
    sectionKey: 'shadow',
    sectionLabel: 'Shadow',
    sectionOrder: SECTION_ORDER.shadow,
    supportsMultiEdit: true,
    valueType: 'color',
  }),
  createShadowNumberField('blur', 'Blur', 20, (item) => item.shadow.blur, (nextValue) => ({
    blur: nextValue,
  }), {
    digits: 1,
    min: 0,
  }),
  createShadowNumberField(
    'opacity',
    'Opacity',
    30,
    (item) => item.shadow.opacity,
    (nextValue) => ({ opacity: nextValue }),
    {
      digits: 1,
      max: 1,
      min: 0,
      step: 0.1,
    }
  ),
  createShadowNumberField(
    'offsetX',
    'Offset X',
    40,
    (item) => item.shadow.offsetX,
    (nextValue) => ({ offsetX: nextValue }),
    {
      digits: 1,
    }
  ),
  createShadowNumberField(
    'offsetY',
    'Offset Y',
    50,
    (item) => item.shadow.offsetY,
    (nextValue) => ({ offsetY: nextValue }),
    {
      digits: 1,
    }
  ),
];
