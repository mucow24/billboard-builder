import type { ProjectFileV1 } from './documentFileDto';
import { normalizeProjectDocument } from './documentNormalizer';
import type { ProjectDocumentV1 } from './documentTypes';

export function documentToFileDto(document: ProjectDocumentV1): ProjectFileV1 {
  return {
    version: 1,
    canvas: document.canvas,
    background: document.background,
    items: document.items,
    fonts: document.fonts,
  };
}

export function fileDtoToDocument(fileDocument: ProjectFileV1): ProjectDocumentV1 {
  return normalizeProjectDocument(fileDocument);
}
