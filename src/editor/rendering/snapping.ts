import type { CanvasItem, GuideLine, SnapRect } from '../document/documentTypes';

export const SNAP_THRESHOLD = 8;

type ResizeEdgeKey = 'start' | 'end';

interface SnapLineCandidate {
  orientation: 'vertical' | 'horizontal';
  position: number;
}

function getRectGuides(rect: SnapRect) {
  return {
    vertical: [
      { key: 'left', value: rect.x },
      { key: 'center', value: rect.x + rect.width / 2 },
      { key: 'right', value: rect.x + rect.width },
    ] as const,
    horizontal: [
      { key: 'top', value: rect.y },
      { key: 'middle', value: rect.y + rect.height / 2 },
      { key: 'bottom', value: rect.y + rect.height },
    ] as const,
  };
}

function getBestSnapDelta(
  guideValue: number,
  orientation: 'vertical' | 'horizontal',
  candidateLines: SnapLineCandidate[],
  threshold: number
) {
  return candidateLines
    .filter((line) => line.orientation === orientation)
    .map((line) => ({
      delta: line.position - guideValue,
      position: line.position,
    }))
    .filter((candidate) => Math.abs(candidate.delta) <= threshold)
    .sort((left, right) => Math.abs(left.delta) - Math.abs(right.delta))[0];
}

function getResizeSnapKeys(activeAnchor: string | null | undefined): {
  vertical?: ResizeEdgeKey;
  horizontal?: ResizeEdgeKey;
} {
  switch (activeAnchor) {
    case 'top-left':
      return { vertical: 'start', horizontal: 'start' };
    case 'top-center':
      return { horizontal: 'start' };
    case 'top-right':
      return { vertical: 'end', horizontal: 'start' };
    case 'middle-left':
      return { vertical: 'start' };
    case 'middle-right':
      return { vertical: 'end' };
    case 'bottom-left':
      return { vertical: 'start', horizontal: 'end' };
    case 'bottom-center':
      return { horizontal: 'end' };
    case 'bottom-right':
      return { vertical: 'end', horizontal: 'end' };
    default:
      return {};
  }
}

export function getItemRect(item: CanvasItem): SnapRect {
  if (item.kind === 'line') {
    return {
      x: Math.min(item.startX, item.endX),
      y: Math.min(item.startY, item.endY),
      width: Math.abs(item.endX - item.startX),
      height: Math.abs(item.endY - item.startY),
    };
  }
  return {
    x: item.x,
    y: item.y,
    width: item.width * item.scaleX,
    height: item.height * item.scaleY,
  };
}

function getStageCandidates(stageRect: SnapRect): SnapLineCandidate[] {
  return [
    { orientation: 'vertical', position: 0 },
    { orientation: 'vertical', position: stageRect.width / 2 },
    { orientation: 'vertical', position: stageRect.width },
    { orientation: 'horizontal', position: 0 },
    { orientation: 'horizontal', position: stageRect.height / 2 },
    { orientation: 'horizontal', position: stageRect.height },
  ];
}

function getItemCandidates(items: CanvasItem[]): SnapLineCandidate[] {
  return items.flatMap((item) => {
    const rect = getItemRect(item);
    const guides = getRectGuides(rect);
    return [
      ...guides.vertical.map(({ value }) => ({
        orientation: 'vertical' as const,
        position: value,
      })),
      ...guides.horizontal.map(({ value }) => ({
        orientation: 'horizontal' as const,
        position: value,
      })),
    ];
  });
}

export interface SnapResult {
  rect: SnapRect;
  guides: GuideLine[];
}

export function getSnappedRect(
  rect: SnapRect,
  siblingItems: CanvasItem[],
  stageRect: SnapRect,
  threshold = SNAP_THRESHOLD
): SnapResult {
  const candidateLines = [
    ...getStageCandidates(stageRect),
    ...getItemCandidates(siblingItems),
  ];
  const guides = getRectGuides(rect);
  let nextRect = { ...rect };
  const nextGuides: GuideLine[] = [];

  const bestVertical = guides.vertical
    .flatMap((guide) =>
      candidateLines
        .filter((line) => line.orientation === 'vertical')
        .map((line) => ({
          delta: line.position - guide.value,
          position: line.position,
        }))
    )
    .filter((candidate) => Math.abs(candidate.delta) <= threshold)
    .sort((left, right) => Math.abs(left.delta) - Math.abs(right.delta))[0];

  if (bestVertical) {
    nextRect = {
      ...nextRect,
      x: nextRect.x + bestVertical.delta,
    };
    nextGuides.push({
      orientation: 'vertical',
      position: bestVertical.position,
    });
  }

  const updatedHorizontalGuides = getRectGuides(nextRect);
  const bestHorizontal = updatedHorizontalGuides.horizontal
    .flatMap((guide) =>
      candidateLines
        .filter((line) => line.orientation === 'horizontal')
        .map((line) => ({
          delta: line.position - guide.value,
          position: line.position,
        }))
    )
    .filter((candidate) => Math.abs(candidate.delta) <= threshold)
    .sort((left, right) => Math.abs(left.delta) - Math.abs(right.delta))[0];

  if (bestHorizontal) {
    nextRect = {
      ...nextRect,
      y: nextRect.y + bestHorizontal.delta,
    };
    nextGuides.push({
      orientation: 'horizontal',
      position: bestHorizontal.position,
    });
  }

  return {
    rect: nextRect,
    guides: nextGuides,
  };
}

export function getResizeSnappedRect(
  rect: SnapRect,
  siblingItems: CanvasItem[],
  stageRect: SnapRect,
  activeAnchor: string | null | undefined,
  threshold = SNAP_THRESHOLD
): SnapResult {
  const candidateLines = [
    ...getStageCandidates(stageRect),
    ...getItemCandidates(siblingItems),
  ];
  const guideKeys = getResizeSnapKeys(activeAnchor);
  const nextGuides: GuideLine[] = [];
  const originalEdges = {
    startX: rect.x,
    endX: rect.x + rect.width,
    startY: rect.y,
    endY: rect.y + rect.height,
  };
  const nextEdges = { ...originalEdges };

  if (guideKeys.vertical) {
    const guideValue =
      guideKeys.vertical === 'start' ? originalEdges.startX : originalEdges.endX;
    const bestVertical = getBestSnapDelta(
      guideValue,
      'vertical',
      candidateLines,
      threshold
    );
    if (bestVertical) {
      if (guideKeys.vertical === 'start') {
        nextEdges.startX = originalEdges.startX + bestVertical.delta;
      } else {
        nextEdges.endX = originalEdges.endX + bestVertical.delta;
      }
      nextGuides.push({
        orientation: 'vertical',
        position: bestVertical.position,
      });
    }
  }

  if (guideKeys.horizontal) {
    const guideValue =
      guideKeys.horizontal === 'start' ? originalEdges.startY : originalEdges.endY;
    const bestHorizontal = getBestSnapDelta(
      guideValue,
      'horizontal',
      candidateLines,
      threshold
    );
    if (bestHorizontal) {
      if (guideKeys.horizontal === 'start') {
        nextEdges.startY = originalEdges.startY + bestHorizontal.delta;
      } else {
        nextEdges.endY = originalEdges.endY + bestHorizontal.delta;
      }
      nextGuides.push({
        orientation: 'horizontal',
        position: bestHorizontal.position,
      });
    }
  }

  return {
    rect: {
      x: nextEdges.startX,
      y: nextEdges.startY,
      width: nextEdges.endX - nextEdges.startX,
      height: nextEdges.endY - nextEdges.startY,
    },
    guides: nextGuides,
  };
}
