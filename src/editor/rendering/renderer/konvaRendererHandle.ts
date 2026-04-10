import type Konva from 'konva';

import type { CanvasRendererHandle } from './canvasRendererTypes';

const EXPORT_EXCLUDE_SELECTOR = '.export-exclude';
const EXPORT_ROOT_SELECTOR = '.export-root';

export function createKonvaRendererHandle(
  stage: Konva.Stage,
): CanvasRendererHandle {
  return {
    getContainerElement() {
      return stage.container() ?? null;
    },

    getPointerPosition(event?: MouseEvent) {
      if (event) {
        stage.setPointersPositions(event);
      }
      return stage.getPointerPosition() ?? null;
    },

    async exportToDataURL({ contentWidth, contentHeight, pixelRatio, mimeType = 'image/png' }) {
      const exportRoot = stage.findOne(EXPORT_ROOT_SELECTOR);
      if (!exportRoot) {
        return stage.toDataURL({ pixelRatio, mimeType });
      }

      const excludedNodes = stage.find(EXPORT_EXCLUDE_SELECTOR);
      const visibilitySnapshot = excludedNodes.map((node) => ({
        node,
        visible: node.visible(),
        listening: node.listening(),
      }));
      const transformSnapshot = {
        x: typeof exportRoot.x === 'function' ? exportRoot.x() : 0,
        y: typeof exportRoot.y === 'function' ? exportRoot.y() : 0,
        scaleX: typeof exportRoot.scaleX === 'function' ? exportRoot.scaleX() : 1,
        scaleY: typeof exportRoot.scaleY === 'function' ? exportRoot.scaleY() : 1,
      };

      try {
        excludedNodes.forEach((node) => {
          node.visible(false);
          node.listening(false);
        });
        exportRoot.position({ x: 0, y: 0 });
        exportRoot.scale({ x: 1, y: 1 });
        stage.batchDraw();

        return stage.toDataURL({
          x: 0,
          y: 0,
          width: contentWidth,
          height: contentHeight,
          pixelRatio,
          mimeType,
        });
      } finally {
        visibilitySnapshot.forEach(({ node, visible, listening }) => {
          node.visible(visible);
          node.listening(listening);
        });
        exportRoot.position({ x: transformSnapshot.x, y: transformSnapshot.y });
        exportRoot.scale({ x: transformSnapshot.scaleX, y: transformSnapshot.scaleY });
        stage.batchDraw();
      }
    },
  };
}
