import { useEffect, useRef, useState } from 'react';

import { DEFAULT_CANVAS_NAME } from '../document/documentDefaults';

interface CanvasNameFieldProps {
  name: string;
  onChange: (name: string) => void;
}

export function CanvasNameField({ name, onChange }: CanvasNameFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      const node = inputRef.current;
      node?.focus();
      node?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    const next = trimmed.length > 0 ? trimmed : DEFAULT_CANVAS_NAME;
    if (next !== name) {
      onChange(next);
    }
  }

  function cancel() {
    setEditing(false);
    setDraft(name);
  }

  function beginEditing() {
    setDraft(name);
    setEditing(true);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        data-testid="canvas-name-input"
        className="top-toolbar-canvas-name top-toolbar-canvas-name-input"
        aria-label="Canvas name"
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      data-testid="canvas-name-display"
      className="top-toolbar-canvas-name"
      aria-label="Rename canvas"
      onClick={beginEditing}
    >
      {name}
    </button>
  );
}
