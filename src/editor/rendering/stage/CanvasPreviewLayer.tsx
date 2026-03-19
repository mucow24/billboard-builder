import { Group, Rect } from 'react-konva';

import { SELECTION_STROKE } from './renderConstants';

interface CanvasPreviewLayerProps {
  session: {
    kind: string;
    tool?: string;
    pointerStart?: { x: number; y: number };
    currentPointer?: { x: number; y: number };
    previewItem?: {
      kind: string;
      x: number;
      y: number;
      width: number;
      height: number;
    };
  } | null;
}

export function CanvasPreviewLayer({ session }: CanvasPreviewLayerProps) {
  return (
    <>
      {session?.kind === 'marquee' && session.pointerStart && session.currentPointer ? (
        <Group name="marquee-preview export-exclude">
          <Rect
            x={Math.min(session.pointerStart.x, session.currentPointer.x)}
            y={Math.min(session.pointerStart.y, session.currentPointer.y)}
            width={Math.max(1, Math.abs(session.currentPointer.x - session.pointerStart.x))}
            height={Math.max(1, Math.abs(session.currentPointer.y - session.pointerStart.y))}
            stroke={SELECTION_STROKE}
            strokeWidth={1.5}
            dash={[6, 4]}
            fill="rgba(56, 189, 248, 0.08)"
            listening={false}
          />
        </Group>
      ) : null}
      {session?.kind === 'create' &&
      session.tool === 'text' &&
      session.previewItem &&
      session.previewItem.kind === 'text' ? (
        <Group name="text-create-preview export-exclude">
          <Rect
            x={session.previewItem.x}
            y={session.previewItem.y}
            width={session.previewItem.width}
            height={session.previewItem.height}
            stroke={SELECTION_STROKE}
            strokeWidth={1.5}
            dash={[6, 4]}
            fill="rgba(56, 189, 248, 0.06)"
            listening={false}
          />
        </Group>
      ) : null}
    </>
  );
}
