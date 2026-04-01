import { useEffect, useRef, useState } from 'react';

const STATUS_DURATION_MS = 1450;
const STATUS_FADE_DURATION_MS = 720;

export function useStatusToast() {
  const [message, setMessage] = useState<string | null>(null);
  const [fading, setFading] = useState(false);
  const fadeTimeoutRef = useRef<number | null>(null);
  const dismissTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (fadeTimeoutRef.current !== null) {
        window.clearTimeout(fadeTimeoutRef.current);
      }
      if (dismissTimeoutRef.current !== null) {
        window.clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, []);

  function show(text: string) {
    if (fadeTimeoutRef.current !== null) {
      window.clearTimeout(fadeTimeoutRef.current);
    }
    if (dismissTimeoutRef.current !== null) {
      window.clearTimeout(dismissTimeoutRef.current);
    }
    setFading(false);
    setMessage(text);
    fadeTimeoutRef.current = window.setTimeout(() => {
      setFading(true);
    }, STATUS_DURATION_MS - STATUS_FADE_DURATION_MS);
    dismissTimeoutRef.current = window.setTimeout(() => {
      setMessage(null);
      setFading(false);
      fadeTimeoutRef.current = null;
      dismissTimeoutRef.current = null;
    }, STATUS_DURATION_MS);
  }

  return { message, fading, show };
}
