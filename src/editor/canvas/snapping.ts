import type { CanvasItem, GuideLine, SnapRect } from '../model/types';

const SNAP_THRESHOLD = 8;

type VerticalGuideKey = 'left' | 'center' | 'right';
type HorizontalGuideKey = 'top' | 'middle' | 'bottom';

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
  vertical?: VerticalGuideKey;
  horizontal?: HorizontalGuideKey;
} {
  switch (activeAnchor) {
    case 'top-left':
      return { vertical: 'left', horizontal: 'top' };
    case 'top-center':
      return { horizontal: 'top' };
    case 'top-right':
      return { vertical: 'right', horizontal: 'top' };
    case 'middle-left':
      return { vertical: 'left' };
    case 'middle-right':
      return { vertical: 'right' };
    case 'bottom-left':
      return { vertical: 'left', horizontal: 'bottom' };
    case 'bottom-center':
      return { horizontal: 'bottom' };
    case 'bottom-right':
      return { vertical: 'right', horizontal: 'bottom' };
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
  const guides = getRectGuides(rect);
  const nextGuides: GuideLine[] = [];
  const originalEdges = {
    left: rect.x,
    right: rect.x + rect.width,
    top: rect.y,
    bottom: rect.y + rect.height,
  };
  const nextEdges = { ...originalEdges };

  if (guideKeys.vertical) {
    const guide = guides.vertical.find((entry) => entry.key === guideKeys.vertical);
    if (guide) {
      const bestVertical = getBestSnapDelta(
        guide.value,
        'vertical',
        candidateLines,
        threshold
      );
      if (bestVertical) {
        if (guideKeys.vertical === 'left') {
          nextEdges.left = originalEdges.left + bestVertical.delta;
        } else if (guideKeys.vertical === 'right') {
          nextEdges.right = originalEdges.right + bestVertical.delta;
        }
        nextGuides.push({
          orientation: 'vertical',
          position: bestVertical.position,
        });
      }
    }
  }

  if (guideKeys.horizontal) {
    const guide = guides.horizontal.find((entry) => entry.key === guideKeys.horizontal);
    if (guide) {
      const bestHorizontal = getBestSnapDelta(
        guide.value,
        'horizontal',
        candidateLines,
        threshold
      );
      if (bestHorizontal) {
        if (guideKeys.horizontal === 'top') {
          nextEdges.top = originalEdges.top + bestHorizontal.delta;
        } else if (guideKeys.horizontal === 'bottom') {
          nextEdges.bottom = originalEdges.bottom + bestHorizontal.delta;
        }
        nextGuides.push({
          orientation: 'horizontal',
          position: bestHorizontal.position,
        });
      }
    }
  }

  return {
    rect: {
      x: nextEdges.left,
      y: nextEdges.top,
      width: nextEdges.right - nextEdges.left,
      height: nextEdges.bottom - nextEdges.top,
    },
    guides: nextGuides,
  };
}
