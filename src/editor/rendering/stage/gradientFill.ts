import type {
  EllipseCanvasItem,
  NgonCanvasItem,
  RectangleCanvasItem,
  TextCanvasItem,
} from '../../document/documentTypes';

type GradientCapableItem = RectangleCanvasItem | EllipseCanvasItem | NgonCanvasItem | TextCanvasItem;

export interface GradientRenderBox {
  width: number;
  height: number;
}

export interface GradientFillProps {
  fillLinearGradientColorStops: [number, string, number, string];
  fillLinearGradientEndPoint: { x: number; y: number };
  fillLinearGradientStartPoint: { x: number; y: number };
  fillPriority: 'linear-gradient';
}

export function buildGradientFillProps(
  item: GradientCapableItem,
  renderBox: GradientRenderBox,
): GradientFillProps | null {
  if (!item.gradientEnabled) {
    return null;
  }

  const angleRad = (item.gradientAngle * Math.PI) / 180;
  const sinA = Math.sin(angleRad);
  const cosA = Math.cos(angleRad);

  const offsetY = item.kind === 'text' ? -item.padding.top : 0;
  const width = renderBox.width;
  const height = renderBox.height;

  const cx = width / 2;
  const cy = offsetY + height / 2;
  const halfLen = (width / 2) * Math.abs(sinA) + (height / 2) * Math.abs(cosA);

  return {
    fillLinearGradientColorStops: [0, item.fill, 1, item.secondaryFill],
    fillLinearGradientStartPoint: { x: cx - halfLen * sinA, y: cy - halfLen * cosA },
    fillLinearGradientEndPoint: { x: cx + halfLen * sinA, y: cy + halfLen * cosA },
    fillPriority: 'linear-gradient',
  };
}
