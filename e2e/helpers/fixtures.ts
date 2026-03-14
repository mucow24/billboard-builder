import type { ProjectDocumentV1 } from '../../src/editor/model/types';

export function createPngBuffer() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn8s1QAAAAASUVORK5CYII=',
    'base64'
  );
}

export function createInvalidImageBuffer() {
  return Buffer.from('not-a-real-image');
}

export function createInvalidFontBuffer() {
  return Buffer.from('definitely-not-a-font');
}

export function createProjectBuffer(document: ProjectDocumentV1) {
  return Buffer.from(JSON.stringify(document, null, 2));
}
