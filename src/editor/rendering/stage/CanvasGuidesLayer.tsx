import { Group, Line } from 'react-konva';

import type { GuideLine, ProjectDocument } from '../../document/documentTypes';

import { getCanvasOverlayMetrics } from './overlayGeometry';
import { SELECTION_STROKE } from './renderConstants';

const GUIDE_EXTENT = 100000;

interface CanvasGuidesLayerProps {
  document: ProjectDocument;
  guides: GuideLine[];
  zoom: number;
}

export function CanvasGuidesLayer({
  document,
  guides,
  zoom,
}: CanvasGuidesLayerProps) {
  const { guideDash, guideStrokeWidth } = getCanvasOverlayMetrics(zoom);

  return (
    <Group name="guides export-exclude">
      {guides.map((guide) =>
        guide.orientation === 'vertical' ? (
          <Line
            key={`guide-v-${guide.position}`}
            points={[guide.position, -GUIDE_EXTENT, guide.position, document.canvas.height + GUIDE_EXTENT]}
            stroke={SELECTION_STROKE}
            strokeWidth={guideStrokeWidth}
            dash={guideDash}
            listening={false}
          />
        ) : (
          <Line
            key={`guide-h-${guide.position}`}
            points={[-GUIDE_EXTENT, guide.position, document.canvas.width + GUIDE_EXTENT, guide.position]}
            stroke={SELECTION_STROKE}
            strokeWidth={guideStrokeWidth}
            dash={guideDash}
            listening={false}
          />
        ),
      )}
    </Group>
  );
}
