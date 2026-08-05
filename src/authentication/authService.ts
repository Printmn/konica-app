import { SECURE_KEYS } from '@/constants/storageKeys';
import { deleteSecure, readSecure, writeSecure } from '@/services/storage/secureStore';
import type { Employee, Role, Session } from '@/types';

/**
 * PIN authentication.
 *
 * Three shared PINs — manager, iPad kiosk, staff — plus per-employee PINs for
 * workers, matching the web build's behaviour.
 *
 * What changed is *where the secrets live*. The web version hard-coded them in
 * the bundle, so anyone who opened DevTools could read them; an earlier version
 * of this app kept them as compiled-in fallbacks, which a decompiled APK gives
 * away just as easily. There are now no PIN literals anywhere in the source: a
 * fresh install has no PINs at all and asks the manager to choose them, and
 * every read comes from the Keychain / Keystore.
 */

export const PIN_LENGTH = 4;

const KEY_FOR: Record<Role, string> = {
  manager: SECURE_KEYS.managerPin,
  ipad: SECURE_KEYS.ipadPin,
  worker: SECURE_KEYS.workerPin,
};

export const isValidPin = (pin: string): boolean =>
  pin.length === PIN_LENGTH && /^\d+$/.test(pin);

/**
 * `null` means no PIN has been set — the caller must treat that as "cannot log
 * in", never as "use the default". Failing closed is the whole point.
 */
export async function getPin(role: Role): Promise<string | null> {
  return readSecure(KEY_FOR[role]);
}

/** False on a fresh install, which is what triggers the first-run PIN setup. */
export async function arePinsConfigured(): Promise<boolean> {
  const manager = await readSecure(SECURE_KEYS.managerPin);
  return manager !== null && manager.length > 0;
}

/** First-run setup: the manager chooses all three shared PINs. */
export async function configureInitialPins(pins: {
  manager: string;
  ipad: string;
  worker: string;
}): Promise<boolean> {
  if (!isValidPin(pins.manager) || !isValidPin(pins.ipad) || !isValidPin(pins.worker)) {
    return false;
  }
  const results = await Promise.all([
    writeSecure(SECURE_KEYS.managerPin, pins.manager),
    writeSecure(SECURE_KEYS.ipadPin, pins.ipad),
    writeSecure(SECURE_KEYS.workerPin, pins.worker),
  ]);
  return results.every(Boolean);
}

export async function setPin(role: Role, pin: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  return writeSecure(KEY_FOR[role], pin);
}

export interface PinVerification {
  valid: boolean;
  role: Role | null;
  workerName: string;
}

/**
 * Checks a PIN against the role being attempted.
 *
 * Worker login resolves the employee by PIN, which is what fills in the name on
 * the attendance screen — same rule as the original `employees.find`.
 */
export async function verifyPin(
  attemptedRole: Role,
  pin: string,
  employees: readonly Employee[],
): Promise<PinVerification> {
  if (attemptedRole === 'worker') {
    const match = employees.find((employee) => employee.pin === pin);
    if (match) return { valid: true, role: 'worker', workerName: match.name };

    // Fallback shared worker PIN, kept so a shift can start before the roster
    // has been entered — exactly as the web build allowed.
    const sharedPin = await getPin('worker');
    if (sharedPin !== null && pin === sharedPin) {
      return { valid: true, role: 'worker', workerName: '' };
    }
    return { valid: false, role: null, workerName: '' };
  }

  const expected = await getPin(attemptedRole);
  if (expected !== null && pin === expected) {
    return { valid: true, role: attemptedRole, workerName: '' };
  }
  return { valid: false, role: null, workerName: '' };
}

// ── Session persistence ──────────────────────────────────────────────

export async function persistSession(session: Session): Promise<void> {
  await Promise.all([
    writeSecure(SECURE_KEYS.role, session.role),
    writeSecure(SECURE_KEYS.workerName, session.workerName),
  ]);
}

export async function clearSession(): Promise<void> {
  await Promise.all([deleteSecure(SECURE_KEYS.role), deleteSecure(SECURE_KEYS.workerName)]);
}

/**
 * Restores a stored session.
 *
 * The web app deliberately forced a fresh login on every page load. On mobile
 * that would be hostile — the app is reopened dozens of times a day — so the
 * session is restored, and logging out still clears it.
 */
export async function restoreSession(): Promise<Session | null> {
  const role = await readSecure(SECURE_KEYS.role);
  if (role !== 'manager' && role !== 'ipad' && role !== 'worker') return null;
  const workerName = (await readSecure(SECURE_KEYS.workerName)) ?? '';
  return { role, workerName };
}
