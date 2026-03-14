import type { CanvasItem, GuideLine, SnapRect } from '../model/types';

const SNAP_THRESHOLD = 8;

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
