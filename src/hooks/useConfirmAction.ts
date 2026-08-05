import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Two-tap confirmation.
 *
 * Reproduces the "tap once to arm, tap again within 2s to delete" pattern the
 * web build used for destructive actions, instead of a blocking `confirm()`.
 */
/**
 * `Id` is generic because rows are keyed by a numeric `Date.now()` everywhere
 * except the chat, whose message ids are strings.
 */
export function useConfirmAction<Id extends string | number = number>(
  timeoutMs = 2000,
): {
  armedId: Id | null;
  confirm: (id: Id, action: (id: Id) => void) => void;
  reset: () => void;
} {
  const [armedId, setArmedId] = useState<Id | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setArmedId(null);
  }, []);

  const confirm = useCallback(
    (id: Id, action: (id: Id) => void) => {
      if (armedId === id) {
        reset();
        action(id);
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      setArmedId(id);
      timer.current = setTimeout(() => setArmedId(null), timeoutMs);
    },
    [armedId, reset, timeoutMs],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { armedId, confirm, reset };
}
