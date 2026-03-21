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
  const toggleRefs = useRef(new Map<string, HTMLElement>());
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
      const toggleElement = toggleRefs.current.get(row.node.id);
      if (!toggleElement) {
        continue;
      }
      const toggleRect = toggleElement.getBoundingClientRect();
      const left = toggleRect.left - containerRect.left + container.scrollLeft;
      const top = toggleRect.top - containerRect.top + container.scrollTop;
      metricsByNodeId[row.node.id] = {
        anchorX: Math.round(left + toggleRect.width / 2),
        bottomY: Math.round(top + toggleRect.height),
        centerY: Math.round(top + toggleRect.height / 2),
        entryX: Math.round(left),
      };
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
    for (const toggleElement of toggleRefs.current.values()) {
      observer.observe(toggleElement);
    }

    return () => {
      observer.disconnect();
    };
  }, [measureOverlay, rows]);

  const registerToggle = useCallback(
    (nodeId: string) => (element: HTMLElement | null) => {
      if (element) {
        toggleRefs.current.set(nodeId, element);
      } else {
        toggleRefs.current.delete(nodeId);
      }
    },
    [],
  );

  return {
    containerRef,
    overlayHeight: overlayState.height,
    overlaySegments: overlayState.segments,
    registerToggle,
  };
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
