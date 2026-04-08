import { useCallback, useEffect, useRef } from 'react';

import { useEditorStore } from './store';

/**
 * Bracket a pointer-driven interaction (slider drag, color wheel drag) so that
 * all intermediate document updates coalesce into a single undo entry.
 *
 * Returned `start` and `end` are idempotent — repeated calls within the same
 * interaction are no-ops — and the effect guarantees a `commitInteraction`
 * runs if the component unmounts mid-drag (e.g. the inspector reselects).
 */
export function useHistoryInteraction() {
  const beginInteraction = useEditorStore((s) => s.beginInteraction);
  const commitInteraction = useEditorStore((s) => s.commitInteraction);
  const activeRef = useRef(false);

  const start = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    beginInteraction();
  }, [beginInteraction]);

  const end = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    commitInteraction();
  }, [commitInteraction]);

  useEffect(
    () => () => {
      if (activeRef.current) {
        activeRef.current = false;
        commitInteraction();
      }
    },
    [commitInteraction],
  );

  return { start, end };
}
