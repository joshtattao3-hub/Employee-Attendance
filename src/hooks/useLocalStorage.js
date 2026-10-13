import { useState, useEffect } from "react";

// Like useState, but the value is saved in the browser and restored on reload.
// `isValid` rejects stored data that has the wrong shape.
export function useLocalStorage(key, initialValue, isValid = () => true) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (isValid(parsed)) return parsed;
      }
    } catch {
      // Corrupted data or blocked storage: fall through to the default
    }
    return typeof initialValue === "function" ? initialValue() : initialValue;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: the app keeps working in memory
    }
  }, [key, value]);

  return [value, setValue];
}