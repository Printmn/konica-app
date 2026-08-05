import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Snackbar } from 'react-native-paper';

import type { AppError } from '@/types';
import { errorMessage } from '@/utils/result';

/**
 * App-wide snackbar.
 *
 * Replaces every `alert(...)` in the web build. Non-blocking, themed, and it
 * knows how to render an `AppError` without each screen restating the copy.
 */

type ToastTone = 'info' | 'success' | 'error';

interface ToastContextValue {
  show: (message: string, tone?: ToastTone) => void;
  showError: (error: AppError) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<ToastTone>('info');
  const [visible, setVisible] = useState(false);

  const show = useCallback((next: string, nextTone: ToastTone = 'info') => {
    setMessage(next);
    setTone(nextTone);
    setVisible(true);
  }, []);

  const showError = useCallback(
    (error: AppError) => show(errorMessage(error), 'error'),
    [show],
  );

  const value = useMemo<ToastContextValue>(() => ({ show, showError }), [show, showError]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        visible={visible}
        onDismiss={() => setVisible(false)}
        duration={tone === 'error' ? 4000 : 2500}
        style={
          tone === 'error'
            ? { backgroundColor: '#b91c1c' }
            : tone === 'success'
              ? { backgroundColor: '#15803d' }
              : undefined
        }
        action={{ label: 'Хаах', onPress: () => setVisible(false) }}
      >
        {message}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
