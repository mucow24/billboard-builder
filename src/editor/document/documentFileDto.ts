import type {
  CanvasItem,
  CanvasSize,
  DocumentFontReference,
  GroupNode,
} from './documentTypes';

type CanvasItemFileV2 = Omit<CanvasItem, 'zIndex'>;

export interface GroupNodeFileV2 extends Omit<GroupNode, 'children'> {
  children: CanvasNodeFileV2[];
}

export type CanvasNodeFileV2 = GroupNodeFileV2 | CanvasItemFileV2;

export interface ProjectFileV2 {
  version: 2;
  name: string;
  canvas: CanvasSize;
  background: string;
  nodes: CanvasNodeFileV2[];
  fonts: DocumentFontReference[];
}

export type ProjectFile = ProjectFileV2;
