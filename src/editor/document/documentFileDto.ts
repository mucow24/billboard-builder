import type { ProjectDocumentV1 } from './documentTypes';

export interface ProjectFileV1 {
  version: 1;
  canvas: ProjectDocumentV1['canvas'];
  background: string;
  items: ProjectDocumentV1['items'];
  fonts: ProjectDocumentV1['fonts'];
}
