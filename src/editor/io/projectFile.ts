import { parseProjectDocument, serializeProjectDocument } from '../document/documentSchema';
import type { ProjectDocumentV1 } from '../document/documentTypes';

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

