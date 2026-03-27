import { type RefObject, useCallback, useRef, useState } from 'react';

const DRAG_THRESHOLD_PX = 5;

export interface DragHandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  tabIndex: number;
  role: string;
  'aria-roledescription': string;
}

export function useFavoriteReorder(
  listRef: RefObject<HTMLElement | null>,
  itemCount: number,
  onReorder: (fromIndex: number, toIndex: number) => void,
): {
  dragIndex: number | null;
  dropTargetIndex: number | null;
  getDragHandleProps: (index: number) => DragHandleProps;
} {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const dropTargetRef = useRef<number | null>(null);

  // Refs for pointer-capture drag session
  const dragSessionRef = useRef<{
    pointerId: number;
    fromIndex: number;
    startY: number;
    activated: boolean;
  } | null>(null);

  const computeDropTarget = useCallback(
    (clientY: number): number | null => {
      const list = listRef.current;
      if (!list) return null;

      const children = Array.from(list.children) as HTMLElement[];
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
  }, []);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;

      if (!session.activated) {
        const dy = Math.abs(e.clientY - session.startY);
        if (dy < DRAG_THRESHOLD_PX) return;
        session.activated = true;
        setDragIndex(session.fromIndex);
      }

      const target = computeDropTarget(e.clientY);
      dropTargetRef.current = target;
      setDropTargetIndex(target);
    },
    [computeDropTarget],
  );

  const handlePointerUp = useCallback(() => {
    const session = dragSessionRef.current;
    dragSessionRef.current = null;

    if (session?.activated) {
      setDragIndex(null);
      const drop = dropTargetRef.current;
      dropTargetRef.current = null;
      setDropTargetIndex(null);

      if (drop !== null && drop !== session.fromIndex) {
        // When dropping after the dragged item, the visual position is off by one
        // because the item hasn't been removed yet. Adjust for that.
        const adjustedTarget = drop > session.fromIndex ? drop - 1 : drop;
        if (adjustedTarget !== session.fromIndex) {
          onReorder(session.fromIndex, adjustedTarget);
        }
      }
    }
  }, [onReorder]);

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
          onReorder(index, index - 1);
        } else if (e.key === 'ArrowDown' && index < itemCount - 1) {
          e.preventDefault();
          onReorder(index, index + 1);
        }
      },

      tabIndex: 0,
      role: 'button',
      'aria-roledescription': 'sortable',
    }),
    [itemCount, onReorder, handlePointerMove, handlePointerUp, handleKeyDownGlobal, handleLostPointerCapture],
  );

  return { dragIndex, dropTargetIndex, getDragHandleProps };
}
