import { useState, useEffect } from "react";

/**
 * Debounces a value by the given delay in milliseconds.
 * Returns the latest value after the delay has elapsed without a new value.
 * The initial value is returned immediately on the first render.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
