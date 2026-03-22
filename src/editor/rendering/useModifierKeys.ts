import { useCallback, useEffect, useRef, useState } from 'react';

export interface ModifierKeyState {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

const DEFAULT_MODIFIER_KEYS: ModifierKeyState = {
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};

interface UseModifierKeysOptions {
  capture?: boolean;
  onBlur?: () => void;
}

function updateModifierKey(
  current: ModifierKeyState,
  event: KeyboardEvent,
  pressed: boolean,
): ModifierKeyState {
  switch (event.key) {
    case 'Alt':
      return current.altKey === pressed ? current : { ...current, altKey: pressed };
    case 'Control':
      return current.ctrlKey === pressed ? current : { ...current, ctrlKey: pressed };
    case 'Meta':
      return current.metaKey === pressed ? current : { ...current, metaKey: pressed };
    case 'Shift':
      return current.shiftKey === pressed ? current : { ...current, shiftKey: pressed };
    default:
      return current;
  }
}

export function useModifierKeys(options: UseModifierKeysOptions = {}) {
  const { capture = false, onBlur } = options;
  const [modifierKeys, setModifierKeys] = useState(DEFAULT_MODIFIER_KEYS);
  const modifierKeysRef = useRef(modifierKeys);

  useEffect(() => {
    modifierKeysRef.current = modifierKeys;
  }, [modifierKeys]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      setModifierKeys((current) => updateModifierKey(current, event, true));
    }

    function handleKeyUp(event: KeyboardEvent) {
      setModifierKeys((current) => updateModifierKey(current, event, false));
    }

    function handleWindowBlur() {
      modifierKeysRef.current = DEFAULT_MODIFIER_KEYS;
      setModifierKeys(DEFAULT_MODIFIER_KEYS);
      onBlur?.();
    }

    window.addEventListener('keydown', handleKeyDown, capture);
    window.addEventListener('keyup', handleKeyUp, capture);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, capture);
      window.removeEventListener('keyup', handleKeyUp, capture);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [capture, onBlur]);

  const resolveModifierKeys = useCallback(
    (overrides: Partial<ModifierKeyState>) => ({
      altKey: overrides.altKey ?? modifierKeysRef.current.altKey,
      ctrlKey: overrides.ctrlKey ?? modifierKeysRef.current.ctrlKey,
      metaKey: overrides.metaKey ?? modifierKeysRef.current.metaKey,
      shiftKey: overrides.shiftKey ?? modifierKeysRef.current.shiftKey,
    }),
    [],
  );

  return {
    modifierKeys,
    resolveModifierKeys,
  };
}
