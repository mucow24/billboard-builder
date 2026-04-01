import type {
  TextAlign,
  TextVerticalAlign,
} from '../../document/documentTypes';
import {
  renderAlignField,
  renderBoldField,
  renderFontFamilyField,
  renderItalicField,
  renderVerticalAlignField,
} from './selectionInspectorRenderers';
import {
  ALIGN_OPTIONS,
  createBooleanField,
  createColorField,
  createCustomField,
  createDimensionsField,
  createGeometryField,
  createNumberField,
  createSwapFillColorsDescriptor,
  createTextField,
  SECTION_ORDER,
  VERTICAL_ALIGN_OPTIONS,
} from './inspectorFieldHelpers';
import { getTextStyleCapabilities } from './inspectorModel';
import type { CustomFieldDescriptor, InspectorFieldDescriptor } from './selectionInspectorModel';

function createFontFamilyField(): CustomFieldDescriptor {
  return createCustomField({
    buildChange: (_context, nextValue) => ({
      fontFamily: String(nextValue),
    }),
    fieldOrder: 20,
    getOptions: ({ fontOptions }) =>
      fontOptions.map((font) => ({
        kind: font.kind,
        label: font.family,
        sourceName: font.sourceName,
        value: font.family,
      })),
    getValue: (item) => (item.kind === 'text' ? item.fontFamily : ''),
    label: 'Font',
    propertyKey: 'fontFamily',
    render: renderFontFamilyField,
    sectionKey: 'text',
    sectionLabel: 'Text',
    sectionOrder: SECTION_ORDER.text,
    supportsMultiEdit: true,
    valueType: 'select',
  });
}

export function createTextDescriptors(): InspectorFieldDescriptor[] {
  return [
    createColorField({
      buildChange: (_context, nextValue) => ({ fill: nextValue }),
      fieldOrder: 10,
      getValue: (item) => (item.kind === 'text' ? item.fill : ''),
      label: 'Fill',
      propertyKey: 'fill',
      sectionKey: 'fill',
      sectionLabel: 'Fill',
      sectionOrder: SECTION_ORDER.fill,
      supportsMultiEdit: true,
      valueType: 'color',
    }),
    createBooleanField({
      buildChange: (_context, nextValue) => ({ gradientEnabled: nextValue }),
      fieldOrder: 20,
      getValue: (item) => item.kind === 'text' && item.gradientEnabled,
      label: 'Gradient',
      propertyKey: 'gradientEnabled',
      sectionKey: 'fill',
      sectionLabel: 'Fill',
      sectionOrder: SECTION_ORDER.fill,
      supportsMultiEdit: true,
      valueType: 'boolean',
    }),
    createColorField({
      buildChange: (_context, nextValue) => ({ secondaryFill: nextValue }),
      fieldOrder: 30,
      getDisabled: ({ selectedItems }) =>
        selectedItems.every(
          (item) => !('gradientEnabled' in item) || !item.gradientEnabled,
        ),
      getValue: (item) => (item.kind === 'text' ? item.secondaryFill : ''),
      label: 'Secondary fill',
      propertyKey: 'secondaryFill',
      sectionKey: 'fill',
      sectionLabel: 'Fill',
      sectionOrder: SECTION_ORDER.fill,
      supportsMultiEdit: true,
      valueType: 'color',
    }),
    createSwapFillColorsDescriptor(),
    createTextField({
      buildChange: (_context, nextValue) => ({ text: nextValue }),
      fieldOrder: 10,
      getValue: (item) => (item.kind === 'text' ? item.text : ''),
      label: 'Text content',
      multiline: true,
      propertyKey: 'text',
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,
      supportsMultiEdit: true,
      valueType: 'text',
    }),
    createFontFamilyField(),
    createNumberField({
      buildChange: (_context, nextValue) => ({ fontSize: nextValue }),
      digits: 0,
      fieldOrder: 30,
      getValue: (item) => (item.kind === 'text' ? item.fontSize : 0),
      label: 'Size',
      min: 1,
      propertyKey: 'fontSize',
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,
      step: 1,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createCustomField({
      buildChange: (_context, nextValue) => ({
        fontWeight: nextValue ? 'bold' : 'normal',
      }),
      fieldOrder: 40,
      getDisabled: ({ availableFonts, selectedItems }) => {
        if (selectedItems.length !== 1 || selectedItems[0]?.kind !== 'text') {
          return false;
        }
        return !getTextStyleCapabilities(selectedItems[0], availableFonts).canToggleBold;
      },
      getValue: (item) => item.kind === 'text' && item.fontWeight === 'bold',
      label: 'Bold',
      propertyKey: 'fontWeight',
      render: renderBoldField,
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,
      supportsMultiEdit: true,
      valueType: 'boolean',
    }),
    createCustomField({
      buildChange: (_context, nextValue) => ({
        fontStyle: nextValue ? 'italic' : 'normal',
      }),
      fieldOrder: 50,
      getDisabled: ({ availableFonts, selectedItems }) => {
        if (selectedItems.length !== 1 || selectedItems[0]?.kind !== 'text') {
          return false;
        }
        return !getTextStyleCapabilities(selectedItems[0], availableFonts).canToggleItalic;
      },
      getValue: (item) => item.kind === 'text' && item.fontStyle === 'italic',
      label: 'Italic',
      propertyKey: 'fontStyle',
      render: renderItalicField,
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,
      supportsMultiEdit: true,
      valueType: 'boolean',
    }),
    createCustomField({
      buildChange: (_context, nextValue) => ({
        align: String(nextValue) as TextAlign,
      }),
      fieldOrder: 60,
      getOptions: () => ALIGN_OPTIONS,
      getValue: (item) => (item.kind === 'text' ? item.align : 'left'),
      label: 'Align',
      propertyKey: 'align',
      render: renderAlignField,
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,
      supportsMultiEdit: true,
      valueType: 'select',
    }),
    createCustomField({
      buildChange: (_context, nextValue) => ({
        verticalAlign: String(nextValue) as TextVerticalAlign,
      }),
      fieldOrder: 70,
      getOptions: () => VERTICAL_ALIGN_OPTIONS,
      getValue: (item) => (item.kind === 'text' ? item.verticalAlign : 'top'),
      label: 'Vertical align',
      propertyKey: 'verticalAlign',
      render: renderVerticalAlignField,
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,
      supportsMultiEdit: true,
      valueType: 'select',
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
    createNumberField({
      buildChange: (_context, nextValue) => ({ lineHeight: nextValue }),
      digits: 1,
      fieldOrder: 10,
      getValue: (item) => (item.kind === 'text' ? item.lineHeight : 0),
      label: 'Line height',
      min: 0.5,
      propertyKey: 'lineHeight',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,
      step: 0.1,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createNumberField({
      buildChange: (_context, nextValue) => ({ letterSpacing: nextValue }),
      digits: 1,
      fieldOrder: 20,
      getValue: (item) => (item.kind === 'text' ? item.letterSpacing : 0),
      label: 'Character spacing',
      propertyKey: 'letterSpacing',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,
      step: 0.5,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'text'
          ? {
              padding: { ...item.padding, top: nextValue },
            }
          : {},
      digits: 1,
      fieldOrder: 30,
      getValue: (item) => (item.kind === 'text' ? item.padding.top : 0),
      label: 'Padding top',
      propertyKey: 'paddingTop',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'text'
          ? {
              padding: { ...item.padding, right: nextValue },
            }
          : {},
      digits: 1,
      fieldOrder: 40,
      getValue: (item) => (item.kind === 'text' ? item.padding.right : 0),
      label: 'Padding right',
      propertyKey: 'paddingRight',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'text'
          ? {
              padding: { ...item.padding, bottom: nextValue },
            }
          : {},
      digits: 1,
      fieldOrder: 50,
      getValue: (item) => (item.kind === 'text' ? item.padding.bottom : 0),
      label: 'Padding bottom',
      propertyKey: 'paddingBottom',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'text'
          ? {
              padding: { ...item.padding, left: nextValue },
            }
          : {},
      digits: 1,
      fieldOrder: 60,
      getValue: (item) => (item.kind === 'text' ? item.padding.left : 0),
      label: 'Padding left',
      propertyKey: 'paddingLeft',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
  ];
}
