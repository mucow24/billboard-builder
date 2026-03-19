import { Group, Rect } from 'react-konva';

import type { ProjectDocument } from '../../document/documentTypes';

import { BACKDROP_SIZE, CANVAS_SURFACE_FILL } from './renderConstants';

function buildCheckerboardTiles(width: number, height: number, cellSize = 20) {
  const tiles: Array<{ x: number; y: number }> = [];
  const columns = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if ((row + column) % 2 !== 0) {
        continue;
      }
      tiles.push({
        x: column * cellSize,
        y: row * cellSize,
      });
    }
  }

  return { cellSize, tiles };
}

interface CanvasSurfaceProps {
  document: ProjectDocument;
}

export function CanvasSurface({ document }: CanvasSurfaceProps) {
  const checkerboard = buildCheckerboardTiles(
    document.canvas.width,
    document.canvas.height,
  );

  return (
    <>
      <Rect
        name="canvas-backdrop canvas-surface export-exclude"
        x={-BACKDROP_SIZE / 2}
        y={-BACKDROP_SIZE / 2}
        width={BACKDROP_SIZE}
        height={BACKDROP_SIZE}
        fill="rgba(0,0,0,0)"
      />
      <Rect
        name="export-exclude"
        x={0}
        y={0}
        width={document.canvas.width}
        height={document.canvas.height}
        cornerRadius={0}
        fill="rgba(0,0,0,0)"
        stroke="rgba(128, 176, 255, 0.18)"
        strokeWidth={1}
        shadowColor="rgba(110, 160, 255, 0.14)"
        shadowBlur={18}
        shadowOpacity={1}
        listening={false}
      />
      <Rect
        name="canvas-background canvas-surface export-exclude"
        x={0}
        y={0}
        width={document.canvas.width}
        height={document.canvas.height}
        cornerRadius={0}
        fill={CANVAS_SURFACE_FILL}
        stroke="rgba(0, 0, 0, 0.14)"
        strokeWidth={1}
        listening={false}
      />
      <Group
        name="checkerboard export-exclude"
        clipX={0}
        clipY={0}
        clipWidth={document.canvas.width}
        clipHeight={document.canvas.height}
      >
        {checkerboard.tiles.map((tile) => (
          <Rect
            key={`checker-${tile.x}-${tile.y}`}
            x={tile.x}
            y={tile.y}
            width={checkerboard.cellSize}
            height={checkerboard.cellSize}
            fill="rgba(255,255,255,0.025)"
            name="canvas-surface"
            listening={false}
          />
        ))}
      </Group>
      <Rect
        x={0}
        y={0}
        width={document.canvas.width}
        height={document.canvas.height}
        fill={document.background}
        name="canvas-surface"
        listening={false}
      />
    </>
  );
}
