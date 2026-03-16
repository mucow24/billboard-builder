import type { CanvasItem } from '../editor/document/documentTypes';
import { parseCanvasItems } from '../editor/document/documentSchema';

export const APP_CLIPBOARD_MIME_TYPE = 'application/x-billboard-builder-selection+json';

interface ClipboardSelectionPayload {
  version: 1;
  items: CanvasItem[];
}

export function writeSelectionToClipboardData(
  dataTransfer: DataTransfer | null,
  items: CanvasItem[]
): boolean {
  if (!dataTransfer || items.length === 0) {
    return false;
  }

  const payload: ClipboardSelectionPayload = {
    version: 1,
    items,
  };

  try {
    dataTransfer.setData(APP_CLIPBOARD_MIME_TYPE, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function readSelectionFromClipboardData(
  dataTransfer: DataTransfer | null
): CanvasItem[] | null {
  if (!dataTransfer) {
    return null;
  }

  const payload = dataTransfer.getData(APP_CLIPBOARD_MIME_TYPE);
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as Partial<ClipboardSelectionPayload>;
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) {
      return null;
    }

    return parseCanvasItems(parsed.items);
  } catch {
    return null;
  }
}
