import type {
  CanvasItem,
  CanvasNode,
  ProjectDocument,
} from './documentTypes';
import type { CanvasNodeFileV2, ProjectFile, ProjectFileV2 } from './documentFileDto';
import { normalizeProjectDocument } from './documentNormalizer';
import { isGroupNode } from './sceneGraph';

function toRuntimeNode(node: CanvasNodeFileV2): CanvasNode {
  if (node.kind === 'group') {
    return {
      ...node,
      children: node.children.map(toRuntimeNode),
    };
  }
  return {
    ...node,
    zIndex: 0,
  } as CanvasItem;
}

function toFileNode(node: CanvasNode): CanvasNodeFileV2 {
  if (isGroupNode(node)) {
    return {
      ...node,
      children: node.children.map(toFileNode),
    };
  }
  const { zIndex: ignoredZIndex, ...fileNode } = node;
  void ignoredZIndex;
  return fileNode;
}

export function documentToFileDto(document: ProjectDocument): ProjectFileV2 {
  return {
    version: 2,
    canvas: document.canvas,
    background: document.background,
    nodes: document.nodes.map(toFileNode),
    fonts: document.fonts,
  };
}

export function fileDtoToDocument(fileDocument: ProjectFile): ProjectDocument {
  return normalizeProjectDocument({
    ...fileDocument,
    nodes: fileDocument.nodes.map(toRuntimeNode),
  });
}
