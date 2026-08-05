import { useEffect, useState } from 'react';

/**
 * Debounces a value.
 *
 * Search boxes over the catalog run `.filter()` across ~120 rows on every
 * keystroke; debouncing keeps typing smooth on older devices.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
