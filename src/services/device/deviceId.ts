import { STORAGE_KEYS } from '@/constants/storageKeys';
import { readJson, writeJson } from '@/services/storage/asyncStorage';

/**
 * Stable per-install identifier.
 *
 * The shop signs in with three shared PINs, not personal accounts, so there is
 * no user id to attribute a chat message to. A random id minted on first launch
 * is enough for the one thing the chat needs: telling "my bubble" apart from
 * everyone else's. It is not an identity and is never shown to the user.
 */

let cached: string | null = null;

const mint = (): string =>
  `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export async function getDeviceId(): Promise<string> {
  if (cached !== null) return cached;

  const stored = await readJson<string | null>(STORAGE_KEYS.deviceId, null);
  if (typeof stored === 'string' && stored.length > 0) {
    cached = stored;
    return stored;
  }

  const fresh = mint();
  cached = fresh;
  await writeJson(STORAGE_KEYS.deviceId, fresh);
  return fresh;
}

/** Synchronous peek — empty until `getDeviceId` has resolved once. */
export const peekDeviceId = (): string => cached ?? '';
