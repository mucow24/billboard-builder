import { useEffect, useState } from 'react';

import { isEditableTarget } from './domUtils';

export function useSpacebarHeld(): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== ' ' || event.repeat) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      setHeld(true);
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === ' ') {
        setHeld(false);
      }
    }

    function handleBlur() {
      setHeld(false);
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return held;
}
