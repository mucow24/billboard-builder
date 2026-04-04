import { useEffect, useState } from 'react';

import { isEditableTarget } from './domUtils';

export function useKeyHeld(key: string): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const lowerKey = key.toLowerCase();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== lowerKey || event.repeat) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      setHeld(true);
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key.toLowerCase() === lowerKey) {
        setHeld(false);
      }
    }

    function handleBlur() {
      setHeld(false);
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [key]);

  return held;
}
