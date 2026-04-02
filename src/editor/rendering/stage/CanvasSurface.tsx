import { useMemo } from 'react';
import { Rect, Shape } from 'react-konva';
import type Konva from 'konva';

import type { ProjectDocument } from '../../document/documentTypes';

import { BACKDROP_SIZE, CANVAS_SURFACE_FILL } from './renderConstants';

function drawCheckerboard(
  ctx: Konva.Context,
  width: number,
  height: number,
  cellSize = 20,
) {
  ctx.beginPath();
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if ((r + c) % 2 !== 0) {
        continue;
      }
      ctx.rect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  ctx.fill();
}

interface CanvasSurfaceProps {
  document: ProjectDocument;
}

export function CanvasWorkspaceBackdrop() {
  return (
    <Rect
      name="canvas-backdrop canvas-surface export-exclude"
      x={-BACKDROP_SIZE / 2}
      y={-BACKDROP_SIZE / 2}
      width={BACKDROP_SIZE}
      height={BACKDROP_SIZE}
      fill="rgba(0,0,0,0)"
    />
  );
}

export function CanvasSurface({ document }: CanvasSurfaceProps) {
  const checkerboardSceneFunc = useMemo(
    () => (ctx: Konva.Context) =>
      drawCheckerboard(ctx, document.canvas.width, document.canvas.height),
    [document.canvas.width, document.canvas.height],
  );

  return (
    <>
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
      <Shape
        name="checkerboard export-exclude"
        x={0}
        y={0}
        width={document.canvas.width}
        height={document.canvas.height}
        sceneFunc={checkerboardSceneFunc}
        listening={false}
      />
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
