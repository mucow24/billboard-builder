import { DEFAULT_FONT_FAMILY, WEB_SAFE_FONTS } from '../../document/documentDefaults';
import type {
  CanvasItem,
  DocumentFontReference,
  ImageAdjustments,
  TextCanvasItem,
  UploadedFont,
} from '../../document/documentTypes';
import { familySupportsVariant } from '../../fonts';
import type { FontOption } from '../FontFamilyPicker';

export interface SelectionSummary {
  allSelectedOpacityEqual: boolean;
  isMultiSelection: boolean;
  opacityValue: number;
}

export interface TextStyleCapabilities {
  canToggleBold: boolean;
  canToggleItalic: boolean;
}

export function formatDisplayedNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return Number(value.toFixed(digits)).toString();
}

export function buildFontOptions(
  availableFonts: UploadedFont[],
  fonts: DocumentFontReference[],
): FontOption[] {
  return [
    ...WEB_SAFE_FONTS.map((family) => ({
      family,
      sourceName: family,
      kind: 'system' as const,
    })),
    ...availableFonts.map((font) => ({
      family: font.family,
      sourceName: font.sourceName,
      kind: font.kind,
    })),
    ...fonts,
  ].filter(
    (font, index, list) =>
      list.findIndex(
        (entry) => entry.family === font.family && entry.kind === font.kind,
      ) === index,
  ).sort((left, right) =>
    left.family.localeCompare(right.family, undefined, {
      sensitivity: 'base',
    }),
  );
}

export function getDefaultFontFamily(textItem?: TextCanvasItem): string {
  return textItem?.fontFamily || DEFAULT_FONT_FAMILY;
}

export function getTextStyleCapabilities(
  selectedTextItem: TextCanvasItem | undefined,
  availableFonts: UploadedFont[],
): TextStyleCapabilities {
  if (!selectedTextItem) {
    return {
      canToggleBold: false,
      canToggleItalic: false,
    };
  }

  const selectedFontIsSystem = WEB_SAFE_FONTS.includes(
    selectedTextItem.fontFamily as (typeof WEB_SAFE_FONTS)[number],
  );
  const familyHasBold = familySupportsVariant(
    availableFonts,
    selectedTextItem.fontFamily,
    '700',
    'normal',
  );
  const familyHasItalic = familySupportsVariant(
    availableFonts,
    selectedTextItem.fontFamily,
    '400',
    'italic',
  );
  const familyHasBoldItalic = familySupportsVariant(
    availableFonts,
    selectedTextItem.fontFamily,
    '700',
    'italic',
  );
  const canTurnBoldOn =
    selectedTextItem.fontStyle === 'italic' ? familyHasBoldItalic : familyHasBold;
  const canTurnItalicOn =
    selectedTextItem.fontWeight === 'bold' ? familyHasBoldItalic : familyHasItalic;

  return {
    canToggleBold:
      selectedTextItem.fontWeight === 'bold' ||
      selectedFontIsSystem ||
      canTurnBoldOn,
    canToggleItalic:
      selectedTextItem.fontStyle === 'italic' ||
      selectedFontIsSystem ||
      canTurnItalicOn,
  };
}

export function getSelectionSummary(selectedItems: CanvasItem[]): SelectionSummary {
  return {
    allSelectedOpacityEqual: selectedItems.every(
      (item) => item.opacity === selectedItems[0]?.opacity,
    ),
    isMultiSelection: selectedItems.length > 1,
    opacityValue: selectedItems[0]?.opacity ?? 1,
  };
}

export function getItemGlyph(kind: CanvasItem['kind']): string {
  switch (kind) {
    case 'rectangle':
      return '▭';
    case 'ellipse':
      return '◯';
    case 'line':
      return '／';
    case 'text':
      return 'T';
    case 'image':
      return '▣';
    default:
      return '•';
  }
}

function getItemLabel(item: CanvasItem): string {
  return item.name || item.kind;
}

export function getLayerPrimaryLabel(item: CanvasItem): string {
  switch (item.kind) {
    case 'rectangle':
      return 'Rectangle';
    case 'ellipse':
      return 'Ellipse';
    case 'line':
      return 'Line';
    case 'text':
      return 'Text';
    case 'image':
      return 'Image';
    default:
      return getItemLabel(item);
  }
}

export function getLayerSecondaryLabel(item: CanvasItem): string | null {
  if (item.kind === 'text') {
    const compactText = item.text.trim().replace(/\s+/g, ' ');
    const snippet = compactText.slice(0, 28);
    return snippet ? `“${snippet}${compactText.length > 28 ? '…' : ''}”` : 'Empty text';
  }
  return null;
}

export function getLayerPreviewStyle(item: CanvasItem): Record<string, string> {
  if (item.kind === 'line') {
    return {
      background: 'rgba(12, 19, 32, 0.92)',
      borderColor: 'rgba(147, 168, 201, 0.26)',
      color: item.stroke,
    };
  }
  if ('fill' in item) {
    const previewStroke = 'stroke' in item ? item.stroke : item.fill;
    return {
      background: item.fill,
      borderColor: previewStroke,
      color: previewStroke,
    };
  }
  return {};
}

export function buildImageAdjustmentsChange(
  current: ImageAdjustments,
  changes: Partial<ImageAdjustments>,
): Partial<CanvasItem> {
  return {
    adjustments: {
      ...current,
      ...changes,
    },
  } as Partial<CanvasItem>;
}

export function getGeometrySummary(item: CanvasItem): string {
  if (item.kind === 'line') {
    return `X1 ${formatDisplayedNumber(item.startX)} · Y1 ${formatDisplayedNumber(item.startY)} · X2 ${formatDisplayedNumber(item.endX)} · Y2 ${formatDisplayedNumber(item.endY)}`;
  }
  return `X ${formatDisplayedNumber(item.x)} · Y ${formatDisplayedNumber(item.y)} · W ${formatDisplayedNumber(item.width)} · H ${formatDisplayedNumber(item.height)}`;
}

export function getSortedLayerItems(items: CanvasItem[]): CanvasItem[] {
  return items.slice().sort((left, right) => right.zIndex - left.zIndex);
}
