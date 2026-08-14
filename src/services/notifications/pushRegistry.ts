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
 * Why a device is or is not on the list.
 *
 * Returned rather than logged, because the one machine that needs this
 * answer is the one in the shop — a second iPad that quietly never registered
 * looks exactly like a notification system that does not work.
 */
export type PushStatus =
  | { state: 'registered'; token: string }
  /** The person said no, or never saw the prompt. Settings can fix this. */
  | { state: 'denied' }
  /** A simulator, or a build with no push credentials. Nothing to be done. */
  | { state: 'unsupported'; reason: string }
  /** Token in hand, but Firebase would not take it — usually offline. */
  | { state: 'unpublished'; token: string; reason: string };

let lastStatus: PushStatus = { state: 'unsupported', reason: 'Хараахан шалгаагүй' };

/** The most recent outcome, for the settings screen to display. */
export const peekPushStatus = (): PushStatus => lastStatus;

/**
 * Publishes this install's push token, if it has one.
 *
 * Safe to call on every launch and every time the app comes forward: it only
 * writes when the token changed or a week has passed. `force` skips that
 * shortcut, for the "try again" button.
 */
export async function registerForPush(role: string, force = false): Promise<PushStatus> {
  const finish = (status: PushStatus): PushStatus => {
    lastStatus = status;
    return status;
  };

  try {
    // Asking again is free once the answer is already "no" — iOS returns the
    // stored decision without showing anything — and it means a first launch
    // that raced past the prompt still gets one.
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) return finish({ state: 'denied' });

    const id = projectId();
    if (id === undefined) {
      logger.warn('No EAS projectId — push tokens cannot be issued.');
      return finish({ state: 'unsupported', reason: 'projectId алга' });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!token) return finish({ state: 'unsupported', reason: 'Токен гарсангүй' });

    const deviceId = await getDeviceId();
    const cached = await readJson<CachedRegistration | null>(STORAGE_KEYS.pushToken, null);
    const fresh = cached !== null && cached.token === token;
    if (!force && fresh && Date.now() - cached.at < REFRESH_AFTER_MS) {
      return finish({ state: 'registered', token });
    }

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
      return finish({ state: 'unpublished', token, reason: result.error.message });
    }

    await writeJson(STORAGE_KEYS.pushToken, { token, at: Date.now() });
    return finish({ state: 'registered', token });
  } catch (error) {
    // A simulator has no push credentials at all; that is a normal state.
    logger.debug('Push registration skipped', error);
    return finish({
      state: 'unsupported',
      reason: error instanceof Error ? error.message : 'Тодорхойгүй алдаа',
    });
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
