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
  createCustomField,
  createDimensionsField,
  createPositionXField,
  createPositionYField,
  createGradientAngleDescriptor,
  createGradientFillDescriptor,
  createNumberField,
  createRotationField,
  createTextField,
  SECTION_ORDER,
  VERTICAL_ALIGN_OPTIONS,
} from './inspectorFieldHelpers';
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
    tooltip: 'Typeface used for the text.',
    propertyKey: 'fontFamily',
    render: renderFontFamilyField,
    sectionKey: 'text',
    sectionLabel: 'Text',
    sectionOrder: SECTION_ORDER.text,
    valueType: 'select',
  });
}

export function createTextDescriptors(): InspectorFieldDescriptor[] {
  return [
    createGradientFillDescriptor(),
    createGradientAngleDescriptor(),
    createTextField({
      buildChange: (_context, nextValue) => ({ text: nextValue }),
      fieldOrder: 10,
      getValue: (item) => (item.kind === 'text' ? item.text : ''),
      label: 'Text content',
      tooltip: 'The words shown in this text box. Press Enter to start a new line.',
      multiline: true,
      propertyKey: 'text',
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,

      valueType: 'text',
    }),
    createFontFamilyField(),
    createNumberField({
      buildChange: (_context, nextValue) => ({ fontSize: nextValue }),
      digits: 0,
      fieldOrder: 30,
      getValue: (item) => (item.kind === 'text' ? item.fontSize : 0),
      label: 'Size',
      tooltip: 'Font size in pixels.',
      max: 500,
      min: 1,
      propertyKey: 'fontSize',
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,
      slider: true,
      step: 1,
      textMax: Infinity,

      valueType: 'number',
    }),
    createCustomField({
      buildChange: (_context, nextValue) => ({
        fontWeight: nextValue ? 'bold' : 'normal',
      }),
      fieldOrder: 40,
      getValue: (item) => item.kind === 'text' && item.fontWeight === 'bold',
      label: 'Bold',
      tooltip: 'Make the text bold.',
      propertyKey: 'fontWeight',
      render: renderBoldField,
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,

      valueType: 'boolean',
    }),
    createCustomField({
      buildChange: (_context, nextValue) => ({
        fontStyle: nextValue ? 'italic' : 'normal',
      }),
      fieldOrder: 50,
      getValue: (item) => item.kind === 'text' && item.fontStyle === 'italic',
      label: 'Italic',
      tooltip: 'Make the text italic.',
      propertyKey: 'fontStyle',
      render: renderItalicField,
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,

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
      tooltip: 'Line the text up with the left, center or right of its box.',
      propertyKey: 'align',
      render: renderAlignField,
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,

      valueType: 'select',
    }),
    createCustomField({
      buildChange: (_context, nextValue) => ({
        verticalAlign: String(nextValue) as TextVerticalAlign,
      }),
      fieldOrder: 70,
      getOptions: () => VERTICAL_ALIGN_OPTIONS,
      getValue: (item) => (item.kind === 'text' ? item.verticalAlign : 'top'),
      label: 'V. Align',
      tooltip: 'Place the text at the top, middle or bottom of its box.',
      propertyKey: 'verticalAlign',
      render: renderVerticalAlignField,
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,

      valueType: 'select',
    }),
    createPositionXField(),
    createPositionYField(),
    createDimensionsField(),
    createRotationField(),
    createNumberField({
      buildChange: (_context, nextValue) => ({ lineHeight: nextValue }),
      digits: 1,
      fieldOrder: 10,
      getValue: (item) => (item.kind === 'text' ? item.lineHeight : 0),
      label: 'Line height',
      tooltip: 'Spacing between lines, as a multiple of the font size. 1 means each line is exactly as tall as the font size.',
      max: 2,
      min: 0,
      propertyKey: 'lineHeight',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,
      slider: true,
      step: 0.1,
      textMax: Infinity,
      textMin: -Infinity,

      valueType: 'number',
    }),
    createNumberField({
      buildChange: (_context, nextValue) => ({ letterSpacing: nextValue }),
      digits: 1,
      fieldOrder: 20,
      getValue: (item) => (item.kind === 'text' ? item.letterSpacing : 0),
      label: 'Character spacing',
      tooltip: 'Extra space between letters, in pixels. Negative values pull letters closer together.',
      max: 50,
      min: -50,
      propertyKey: 'letterSpacing',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,
      slider: true,
      sliderDetentThreshold: 1.5,
      sliderDetentValue: 0,
      step: 0.1,
      textMax: Infinity,
      textMin: -Infinity,

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
      tooltip: 'Space between the top of the box and the text, in pixels.',
      propertyKey: 'paddingTop',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,

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
      tooltip: 'Space between the right edge of the box and the text, in pixels.',
      propertyKey: 'paddingRight',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,

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
      tooltip: 'Space between the bottom of the box and the text, in pixels.',
      propertyKey: 'paddingBottom',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,

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
      tooltip: 'Space between the left edge of the box and the text, in pixels.',
      propertyKey: 'paddingLeft',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,

      valueType: 'number',
    }),
  ];
}
