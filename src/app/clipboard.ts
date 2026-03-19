import type { CanvasNode } from '../editor/document/documentTypes';
import { parseCanvasNodes } from '../editor/document/documentSchema';

export const APP_CLIPBOARD_MIME_TYPE = 'application/x-billboard-builder-selection+json';

interface ClipboardSelectionPayload {
  version: 2;
  nodes: CanvasNode[];
}

export function writeSelectionToClipboardData(
  dataTransfer: DataTransfer | null,
  nodes: CanvasNode[]
): boolean {
  if (!dataTransfer || nodes.length === 0) {
    return false;
  }

  const payload: ClipboardSelectionPayload = {
    version: 2,
    nodes,
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
): CanvasNode[] | null {
  if (!dataTransfer) {
    return null;
  }

  const payload = dataTransfer.getData(APP_CLIPBOARD_MIME_TYPE);
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as Partial<ClipboardSelectionPayload>;
    if (parsed.version !== 2 || !Array.isArray(parsed.nodes)) {
      return null;
    }

    return parseCanvasNodes(parsed.nodes);
  } catch {
    return null;
  }
}
