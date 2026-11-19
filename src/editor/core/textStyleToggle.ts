import type { CanvasItem, EditorCommand, TextCanvasItem } from '../document/documentTypes';

export type TextStyleToggle = 'bold' | 'italic';

type UpdateNodeCommand = Extract<EditorCommand, { type: 'update_node' }>;

function hasStyle(item: TextCanvasItem, style: TextStyleToggle): boolean {
  return style === 'bold' ? item.fontWeight === 'bold' : item.fontStyle === 'italic';
}

function styleChange(style: TextStyleToggle, on: boolean): Partial<TextCanvasItem> {
  return style === 'bold'
    ? { fontWeight: on ? 'bold' : 'normal' }
    : { fontStyle: on ? 'italic' : 'normal' };
}

/**
 * Commands that toggle bold or italic on the text items among `items`; other
 * kinds are left alone. As with the inspector's B and I buttons, a selection
 * that is only partly bold (or italic) is turned on, and it is turned off only
 * when every text item already has the style. Items already in the target
 * state get no command, and no text items means no commands.
 */
export function buildTextStyleToggleCommands(
  items: CanvasItem[],
  style: TextStyleToggle,
): UpdateNodeCommand[] {
  const textItems = items.filter((item): item is TextCanvasItem => item.kind === 'text');
  if (textItems.length === 0) {
    return [];
  }
  const on = !textItems.every((item) => hasStyle(item, style));
  const changes = styleChange(style, on);
  return textItems
    .filter((item) => hasStyle(item, style) !== on)
    .map((item) => ({ type: 'update_node', itemId: item.id, changes }));
}
