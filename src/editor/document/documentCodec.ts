import type {
  CanvasItem,
  CanvasNode,
  ProjectDocument,
  LegacyProjectDocumentV1,
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

function migrateV1Document(fileDocument: LegacyProjectDocumentV1): ProjectDocument {
  return normalizeProjectDocument({
    version: 2,
    canvas: fileDocument.canvas,
    background: fileDocument.background,
    nodes: fileDocument.items,
    fonts: fileDocument.fonts,
  });
}

export function documentToFileDto(document: ProjectDocument): ProjectFileV2 {
  const sourceNodes = document.nodes.length > 0
    ? document.nodes
    : document.items;

  return {
    version: 2,
    canvas: document.canvas,
    background: document.background,
    nodes: sourceNodes.map(toFileNode),
    fonts: document.fonts,
  };
}

export function fileDtoToDocument(fileDocument: ProjectFile): ProjectDocument {
  if (fileDocument.version === 1) {
    return migrateV1Document(fileDocument);
  }

  const sourceNodes = fileDocument.nodes.length > 0
    ? fileDocument.nodes.map(toRuntimeNode)
    : (fileDocument.items ?? []);

  return normalizeProjectDocument({
    ...fileDocument,
    nodes: sourceNodes,
  });
}
