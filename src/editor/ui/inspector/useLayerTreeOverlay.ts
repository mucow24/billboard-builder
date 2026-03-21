import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import type { LayerRow } from '../../document/sceneGraph';

import {
  buildLayerTreeOverlaySegments,
  type LayerTreeOverlayMetricMap,
  type LayerTreeOverlaySegment,
} from './layerTreeOverlayGeometry';

interface LayerTreeOverlayState {
  height: number;
  segments: LayerTreeOverlaySegment[];
}

export function useLayerTreeOverlay(rows: LayerRow[]) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const junctionRefs = useRef(new Map<string, HTMLElement>());
  const [overlayState, setOverlayState] = useState<LayerTreeOverlayState>({
    height: 0,
    segments: [],
  });

  const measureOverlay = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const metricsByNodeId: LayerTreeOverlayMetricMap = {};

    for (const row of rows) {
      const junctionElement = junctionRefs.current.get(row.node.id);
      if (!junctionElement) {
        continue;
      }
      const junctionRect = junctionElement.getBoundingClientRect();
      const junctionLeft = junctionRect.left - containerRect.left + container.scrollLeft;
      const junctionTop = junctionRect.top - containerRect.top + container.scrollTop;
      const nextMetric = {
        junctionX: roundToNearestHalfPixel(junctionLeft + 0.5),
        junctionY: roundToNearestHalfPixel(junctionTop + junctionRect.height / 2),
      };

      if (row.node.kind === 'group') {
        metricsByNodeId[row.node.id] = {
          ...nextMetric,
          groupOutflowX: roundToNearestHalfPixel(junctionLeft + junctionRect.width / 2),
          groupOutflowY: roundToNearestHalfPixel(junctionTop + junctionRect.height - 0.5),
        };
        continue;
      }

      metricsByNodeId[row.node.id] = nextMetric;
    }

    const nextState = {
      height: container.scrollHeight,
      segments: buildLayerTreeOverlaySegments(rows, metricsByNodeId),
    };

    setOverlayState((currentState) => {
      if (
        currentState.height === nextState.height &&
        haveEqualSegments(currentState.segments, nextState.segments)
      ) {
        return currentState;
      }
      return nextState;
    });
  }, [rows]);

  useLayoutEffect(() => {
    measureOverlay();
    const frameId = window.requestAnimationFrame(measureOverlay);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [measureOverlay]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver(() => {
      measureOverlay();
    });
    observer.observe(container);
    for (const junctionElement of junctionRefs.current.values()) {
      observer.observe(junctionElement);
    }

    return () => {
      observer.disconnect();
    };
  }, [measureOverlay, rows]);

  const registerJunction = useCallback(
    (nodeId: string) => (element: HTMLElement | null) => {
      if (element) {
        junctionRefs.current.set(nodeId, element);
      } else {
        junctionRefs.current.delete(nodeId);
      }
    },
    [],
  );

  return {
    containerRef,
    overlayHeight: overlayState.height,
    overlaySegments: overlayState.segments,
    registerJunction,
  };
}

function roundToNearestHalfPixel(value: number) {
  return Math.round(value * 2) / 2;
}

function haveEqualSegments(
  currentSegments: LayerTreeOverlaySegment[],
  nextSegments: LayerTreeOverlaySegment[],
) {
  if (currentSegments.length !== nextSegments.length) {
    return false;
  }

  return currentSegments.every((segment, index) => {
    const nextSegment = nextSegments[index];
    return (
      segment.x1 === nextSegment.x1 &&
      segment.y1 === nextSegment.y1 &&
      segment.x2 === nextSegment.x2 &&
      segment.y2 === nextSegment.y2
    );
  });
}
