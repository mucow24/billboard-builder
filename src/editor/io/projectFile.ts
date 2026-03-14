import { parseProjectDocument, serializeProjectDocument } from '../model/schema';
import type { ProjectDocumentV1 } from '../model/types';

export const AUTOSAVE_KEY = 'billboard-builder.autosave';

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadProject(document: ProjectDocumentV1) {
  const blob = new Blob([serializeProjectDocument(document)], {
    type: 'application/json',
  });
  downloadBlob(blob, 'billboard-project.json');
}

export async function readProjectFile(file: File): Promise<ProjectDocumentV1> {
  const text = await file.text();
  const json = JSON.parse(text) as unknown;
  return parseProjectDocument(json);
}

export function saveAutosave(document: ProjectDocumentV1) {
  localStorage.setItem(AUTOSAVE_KEY, serializeProjectDocument(document));
}

export function readAutosave(): ProjectDocumentV1 | null {
  const rawDocument = localStorage.getItem(AUTOSAVE_KEY);
  if (!rawDocument) {
    return null;
  }

  try {
    return parseProjectDocument(JSON.parse(rawDocument));
  } catch {
    localStorage.removeItem(AUTOSAVE_KEY);
    return null;
  }
}
