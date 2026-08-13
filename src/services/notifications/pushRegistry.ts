import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { rtdbClient } from '@/firebase/rtdbClient';
import { getDeviceId } from '@/services/device/deviceId';
import { readJson, writeJson } from '@/services/storage/asyncStorage';
import { STORAGE_KEYS } from '@/constants/storageKeys';
import type { PushDevice } from '@/types';
import { logger } from '@/utils/logger';

/**
 * Push-token registry.
 *
 * Local notifications only fire while the app is running, which is exactly the
 * case nobody needs a notification for. A real push comes from Google's and
 * Apple's servers and arrives with the app closed, or the phone locked — but
 * only if someone knows where to send it. That is what this file is: each
 * install writes its Expo push token to `/pmn/devices/<deviceId>`, and the
 * Cloud Functions in `functions/` read that list when something happens.
 *
 * Three details are load-bearing:
 *
 *  1. **Keyed by device id, not by token.** Tokens rotate — a restore from
 *     backup, an app reinstall, an OS upgrade all mint a new one. Keying by the
 *     device means the new token replaces the old rather than doubling it, so
 *     nobody gets the same alert twice.
 *  2. **The sender is recorded on the event.** A device does not need to be
 *     told about a job it just booked itself, so the functions skip the
 *     originating `deviceId`.
 *  3. **A simulator has no token.** `getExpoPushTokenAsync` throws there and on
 *     any build without push credentials; that is expected, not an error worth
 *     surfacing to the counter.
 */

/** How often the token is re-published even when it has not changed, in ms. */
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedRegistration {
  token: string;
  at: number;
}

const projectId = (): string | undefined => {
  const eas = Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined;
  return eas?.projectId;
};

/**
 * Publishes this install's push token, if it has one.
 *
 * Returns the token, or `null` when the device cannot receive push at all —
 * a simulator, a denied permission, or a build without credentials. Safe to
 * call on every launch: it only writes when the token changed or a week has
 * passed.
 */
export async function registerForPush(role: string): Promise<string | null> {
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return null;

    const id = projectId();
    if (id === undefined) {
      logger.warn('No EAS projectId — push tokens cannot be issued.');
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!token) return null;

    const deviceId = await getDeviceId();
    const cached = await readJson<CachedRegistration | null>(STORAGE_KEYS.pushToken, null);
    const fresh = cached !== null && cached.token === token;
    if (fresh && Date.now() - cached.at < REFRESH_AFTER_MS) return token;

    const device: PushDevice = {
      deviceId,
      token,
      role,
      platform: Platform.OS,
      updatedAt: Date.now(),
    };

    const result = await rtdbClient.writeChild('devices', deviceId, device);
    if (!result.ok) {
      logger.warn('Could not publish push token', result.error.message);
      return token;
    }

    await writeJson(STORAGE_KEYS.pushToken, { token, at: Date.now() });
    return token;
  } catch (error) {
    // A device with no push credentials is a normal state, not a fault.
    logger.debug('Push registration skipped', error);
    return null;
  }
}

/**
 * Stops this device receiving push — used when someone signs out of a shared
 * iPad, so the next person does not get the last one's alerts.
 */
export async function unregisterFromPush(): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    await rtdbClient.removeChild('devices', deviceId);
    await writeJson(STORAGE_KEYS.pushToken, null);
  } catch (error) {
    logger.debug('Push unregistration failed', error);
  }
}
