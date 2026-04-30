import { parseProjectDocument, serializeProjectDocument } from '../document/documentSchema';
import type { ProjectDocument } from '../document/documentTypes';

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadProject(document: ProjectDocument, fileName = 'billboard-project.json') {
  const blob = new Blob([serializeProjectDocument(document)], {
    type: 'application/json',
  });
  downloadBlob(blob, fileName);
}

export async function readProjectFile(file: File): Promise<ProjectDocument> {
  const text = await file.text();
  const json = JSON.parse(text) as unknown;
  return parseProjectDocument(json);
}
