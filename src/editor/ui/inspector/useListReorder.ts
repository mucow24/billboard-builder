import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

const DRAG_THRESHOLD_PX = 5;
const AUTOSCROLL_EDGE_PX = 40;
const AUTOSCROLL_MAX_SPEED = 8;

export interface DragHandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  tabIndex: number;
  role: string;
  'aria-roledescription': string;
}

export function useListReorder(
  listRef: RefObject<HTMLElement | null>,
  itemCount: number,
  onReorder: (fromIndex: number, toIndex: number, pointerX: number | null) => void,
  options?: {
    scrollContainerRef?: RefObject<HTMLElement | null>;
  },
): {
  dragIndex: number | null;
  dropTargetIndex: number | null;
  pointerX: number | null;
  getDragHandleProps: (index: number) => DragHandleProps;
} {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [pointerX, setPointerX] = useState<number | null>(null);
  const dropTargetRef = useRef<number | null>(null);

  // Refs for pointer-capture drag session
  const dragSessionRef = useRef<{
    pointerId: number;
    fromIndex: number;
    startY: number;
    activated: boolean;
  } | null>(null);

  // Refs for autoscroll and pointer position
  const clientYRef = useRef<number>(0);
  const pointerXRef = useRef<number | null>(null);
  const autoscrollRafRef = useRef<number | null>(null);

  const getScrollContainer = useCallback(() => {
    return options?.scrollContainerRef?.current ?? listRef.current;
  }, [listRef, options?.scrollContainerRef]);

  const startAutoscroll = useCallback(() => {
    const tick = () => {
      const container = getScrollContainer();
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const y = clientYRef.current;
      const distFromTop = y - rect.top;
      const distFromBottom = rect.bottom - y;

      if (distFromTop < AUTOSCROLL_EDGE_PX && distFromTop >= 0) {
        const speed = Math.ceil(AUTOSCROLL_MAX_SPEED * (1 - distFromTop / AUTOSCROLL_EDGE_PX));
        container.scrollTop -= speed;
      } else if (distFromBottom < AUTOSCROLL_EDGE_PX && distFromBottom >= 0) {
        const speed = Math.ceil(AUTOSCROLL_MAX_SPEED * (1 - distFromBottom / AUTOSCROLL_EDGE_PX));
        container.scrollTop += speed;
      }

      autoscrollRafRef.current = requestAnimationFrame(tick);
    };
    autoscrollRafRef.current = requestAnimationFrame(tick);
  }, [getScrollContainer]);

  const stopAutoscroll = useCallback(() => {
    if (autoscrollRafRef.current !== null) {
      cancelAnimationFrame(autoscrollRafRef.current);
      autoscrollRafRef.current = null;
    }
  }, []);

  // Clean up autoscroll on unmount
  useEffect(() => stopAutoscroll, [stopAutoscroll]);

  const computeDropTarget = useCallback(
    (clientY: number): number | null => {
      const list = listRef.current;
      if (!list) return null;

      const children = Array.from(list.children).filter(
        (el) => !(el as HTMLElement).dataset.dropIndicator,
      ) as HTMLElement[];
      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (clientY < midY) {
          return i;
        }
      }
      return children.length;
    },
    [listRef],
  );

  const cancelDrag = useCallback(() => {
    const session = dragSessionRef.current;
    if (session) {
      dragSessionRef.current = null;
    }
    setDragIndex(null);
    dropTargetRef.current = null;
    setDropTargetIndex(null);
    setPointerX(null);
    stopAutoscroll();
  }, [stopAutoscroll]);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;

      clientYRef.current = e.clientY;

      if (!session.activated) {
        const dy = Math.abs(e.clientY - session.startY);
        if (dy < DRAG_THRESHOLD_PX) return;
        session.activated = true;
        setDragIndex(session.fromIndex);
        startAutoscroll();
      }

      const target = computeDropTarget(e.clientY);
      dropTargetRef.current = target;
      setDropTargetIndex(target);
      pointerXRef.current = e.clientX;
      setPointerX(e.clientX);
    },
    [computeDropTarget, startAutoscroll],
  );

  const handlePointerUp = useCallback(() => {
    const session = dragSessionRef.current;
    dragSessionRef.current = null;
    stopAutoscroll();

    if (session?.activated) {
      setDragIndex(null);
      const drop = dropTargetRef.current;
      const lastPointerX = pointerXRef.current;
      dropTargetRef.current = null;
      pointerXRef.current = null;
      setDropTargetIndex(null);
      setPointerX(null);

      if (drop !== null) {
        onReorder(session.fromIndex, drop, lastPointerX);
      }
    }
  }, [onReorder, stopAutoscroll]);

  const handleKeyDownGlobal = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelDrag();
      }
    },
    [cancelDrag],
  );

  const handleLostPointerCapture = useCallback(() => {
    cancelDrag();
  }, [cancelDrag]);

  const getDragHandleProps = useCallback(
    (index: number): DragHandleProps => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;

        const target = e.currentTarget as HTMLElement;
        if (target.setPointerCapture) {
          target.setPointerCapture(e.pointerId);
        }

        dragSessionRef.current = {
          pointerId: e.pointerId,
          fromIndex: index,
          startY: e.clientY,
          activated: false,
        };

        // Attach listeners to the capturing element
        const onMove = (ev: PointerEvent) => handlePointerMove(ev);
        const onUp = () => {
          handlePointerUp();
          cleanup();
        };
        const onLostCapture = () => {
          handleLostPointerCapture();
          cleanup();
        };
        const cleanup = () => {
          target.removeEventListener('pointermove', onMove);
          target.removeEventListener('pointerup', onUp);
          target.removeEventListener('lostpointercapture', onLostCapture);
          document.removeEventListener('keydown', handleKeyDownGlobal);
        };

        target.addEventListener('pointermove', onMove);
        target.addEventListener('pointerup', onUp);
        target.addEventListener('lostpointercapture', onLostCapture);
        document.addEventListener('keydown', handleKeyDownGlobal);
      },

      onKeyDown: (e: React.KeyboardEvent) => {
        if (!e.altKey) return;

        if (e.key === 'ArrowUp' && index > 0) {
          e.preventDefault();
          onReorder(index, index - 1, null);
        } else if (e.key === 'ArrowDown' && index < itemCount - 1) {
          e.preventDefault();
          onReorder(index, index + 2, null);
        }
      },

      tabIndex: 0,
      role: 'button',
      'aria-roledescription': 'sortable',
    }),
    [itemCount, onReorder, handlePointerMove, handlePointerUp, handleKeyDownGlobal, handleLostPointerCapture],
  );

  return { dragIndex, dropTargetIndex, pointerX, getDragHandleProps };
}
