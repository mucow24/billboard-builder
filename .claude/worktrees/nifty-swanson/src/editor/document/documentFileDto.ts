import type {
  CanvasItem,
  CanvasSize,
  DocumentFontReference,
  GroupNode,
  LegacyProjectDocumentV1,
} from './documentTypes';

type CanvasItemFileV2 = Omit<CanvasItem, 'zIndex'>;

export interface GroupNodeFileV2 extends Omit<GroupNode, 'children'> {
  children: CanvasNodeFileV2[];
}

export type CanvasNodeFileV2 = GroupNodeFileV2 | CanvasItemFileV2;

export interface ProjectFileV1 {
  version: 1;
  canvas: LegacyProjectDocumentV1['canvas'];
  background: string;
  items: LegacyProjectDocumentV1['items'];
  fonts: LegacyProjectDocumentV1['fonts'];
}

export interface ProjectFileV2 {
  version: 2;
  canvas: CanvasSize;
  background: string;
  nodes: CanvasNodeFileV2[];
  items?: CanvasItem[];
  fonts: DocumentFontReference[];
}

export type ProjectFile = ProjectFileV1 | ProjectFileV2;
