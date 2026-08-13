import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { Employee, Role, Session } from '@/types';

import {
  arePinsConfigured,
  clearSession,
  configureInitialPins,
  persistSession,
  restoreSession,
  verifyPin,
} from './authService';
import { registerForPush, unregisterFromPush } from '@/services/notifications/pushRegistry';

import { can, roleLabel, type Capability } from './permissions';

interface AuthContextValue {
  session: Session | null;
  role: Role | null;
  workerName: string;
  displayName: string;
  isRestoring: boolean;
  /** True on a fresh install: no PIN exists yet, so nobody can log in. */
  needsPinSetup: boolean;
  login: (role: Role, pin: string, employees: readonly Employee[]) => Promise<boolean>;
  logout: () => Promise<void>;
  /** First-run setup — the manager chooses the three shared PINs. */
  setupPins: (pins: { manager: string; ipad: string; worker: string }) => Promise<boolean>;
  can: (capability: Capability) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [needsPinSetup, setNeedsPinSetup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // No PINs are seeded any more; an unconfigured install goes to setup.
      const configured = await arePinsConfigured();
      const restored = configured ? await restoreSession() : null;
      if (!cancelled) {
        setNeedsPinSetup(!configured);
        setSession(restored);
        setIsRestoring(false);
        // Republished on every launch: tokens rotate on reinstall and restore,
        // and a stale one means an alert that silently goes nowhere.
        if (restored !== null) void registerForPush(restored.role);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (attemptedRole: Role, pin: string, employees: readonly Employee[]) => {
      const result = await verifyPin(attemptedRole, pin, employees);
      if (!result.valid || result.role === null) return false;
      const next: Session = { role: result.role, workerName: result.workerName };
      await persistSession(next);
      setSession(next);
      void registerForPush(next.role);
      return true;
    },
    [],
  );

  const logout = useCallback(async () => {
    // Taken off the list first: a shared iPad handed to the next shift should
    // not keep buzzing with the last person's alerts.
    await unregisterFromPush();
    await clearSession();
    setSession(null);
  }, []);

  const setupPins = useCallback(
    async (pins: { manager: string; ipad: string; worker: string }) => {
      const saved = await configureInitialPins(pins);
      if (saved) setNeedsPinSetup(false);
      return saved;
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      role: session?.role ?? null,
      workerName: session?.workerName ?? '',
      displayName: roleLabel(session?.role ?? null, session?.workerName ?? ''),
      isRestoring,
      needsPinSetup,
      login,
      logout,
      setupPins,
      can: (capability: Capability) => can(session?.role ?? null, capability),
    }),
    [session, isRestoring, needsPinSetup, login, logout, setupPins],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
