import { Group, Line } from 'react-konva';

import type { GuideLine, ProjectDocument } from '../../document/documentTypes';

import { SELECTION_STROKE } from './renderConstants';

interface CanvasGuidesLayerProps {
  document: ProjectDocument;
  guides: GuideLine[];
}

export function CanvasGuidesLayer({
  document,
  guides,
}: CanvasGuidesLayerProps) {
  return (
    <Group name="guides export-exclude">
      {guides.map((guide) =>
        guide.orientation === 'vertical' ? (
          <Line
            key={`guide-v-${guide.position}`}
            points={[guide.position, 0, guide.position, document.canvas.height]}
            stroke={SELECTION_STROKE}
            dash={[8, 4]}
            listening={false}
          />
        ) : (
          <Line
            key={`guide-h-${guide.position}`}
            points={[0, guide.position, document.canvas.width, guide.position]}
            stroke={SELECTION_STROKE}
            dash={[8, 4]}
            listening={false}
          />
        ),
      )}
    </Group>
  );
}
