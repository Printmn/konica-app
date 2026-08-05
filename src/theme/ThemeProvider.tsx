import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { STORAGE_KEYS } from '@/constants/storageKeys';
import { readJson, writeJson } from '@/services/storage/asyncStorage';

import { darkTheme, lightTheme, type AppTheme } from './theme';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: AppTheme;
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Resolves the active theme from the user's stored preference, falling back to
 * the OS setting. The choice survives restarts via AsyncStorage.
 */
export function AppThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await readJson<ThemeMode>(STORAGE_KEYS.themeMode, 'system');
      if (!cancelled && (stored === 'light' || stored === 'dark' || stored === 'system')) {
        setModeState(stored);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void writeJson(STORAGE_KEYS.themeMode, next);
  }, []);

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mode, isDark, setMode }),
    [theme, mode, isDark, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>
      <PaperProvider theme={theme}>{children}</PaperProvider>
    </ThemeContext.Provider>
  );
}

export function useAppTheme(): AppTheme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used inside <AppThemeProvider>');
  return ctx.theme;
}

export function useThemeMode(): Pick<ThemeContextValue, 'mode' | 'isDark' | 'setMode'> {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeMode must be used inside <AppThemeProvider>');
  return { mode: ctx.mode, isDark: ctx.isDark, setMode: ctx.setMode };
}
