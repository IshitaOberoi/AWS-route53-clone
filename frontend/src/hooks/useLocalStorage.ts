'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * useState backed by localStorage. Starts from `initial` on the server and on the first client
 * render (no hydration mismatch), then loads the stored value.
 */
export function useLocalStorage<T>(key: string, initial: T): [T, (value: T) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) setValue(JSON.parse(stored) as T);
    } catch {
      // Corrupt or unavailable storage: keep the default.
    }
    setLoaded(true);
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Ignore quota / privacy-mode errors.
      }
    },
    [key],
  );

  return [value, update, loaded];
}
