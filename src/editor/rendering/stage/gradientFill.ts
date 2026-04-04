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

  const startY = item.kind === 'text' ? -item.padding.top : 0;
  const endY = item.kind === 'text' ? renderBox.height - item.padding.top : renderBox.height;

  return {
    fillLinearGradientColorStops: [0, item.fill, 1, item.secondaryFill],
    fillLinearGradientEndPoint: { x: 0, y: endY },
    fillLinearGradientStartPoint: { x: 0, y: startY },
    fillPriority: 'linear-gradient',
  };
}
