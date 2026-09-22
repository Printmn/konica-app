/**
 * Sending an Expo push, and deciding who gets one.
 *
 * Deliberately free of every Firebase import — including `firebase-admin` —
 * so the interesting parts, which are the rules about who is left out, can be
 * unit tested with plain `node --test` and no emulator. The database side
 * lives in `notify.ts`.
 */

export interface PushDevice {
  deviceId: string;
  token: string;
  role?: string;
  platform?: string;
  updatedAt?: number;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Android notification channel; must match the ones the app creates. */
  channelId: 'orders' | 'stock' | 'chat' | 'deadline' | 'attendance';
  data?: Record<string, string>;
}

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo refuses batches larger than this. */
const BATCH_SIZE = 100;

/** A device that has not checked in for this long is assumed gone. */
const STALE_AFTER_MS = 60 * 24 * 60 * 60 * 1000;

const isExpoToken = (token: unknown): token is string =>
  typeof token === 'string' &&
  (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['));

/**
 * Who should hear about this.
 *
 * Two rules, and both matter:
 *
 *  1. **Never the device that caused it.** The counter iPad booking a job does
 *     not need to be told a job was booked; being buzzed by your own typing is
 *     how people learn to switch notifications off.
 *  2. **Only real tokens.** A row with a malformed or missing token is skipped
 *     rather than sent, because Expo rejects the whole batch on a bad address.
 */
export function recipients(
  devices: Record<string, PushDevice> | null,
  options: { exclude?: string; roles?: readonly string[]; now?: number } = {},
): PushDevice[] {
  if (devices === null) return [];
  const { exclude, roles, now = Date.now() } = options;

  return Object.values(devices).filter((device) => {
    if (!isExpoToken(device?.token)) return false;
    if (exclude !== undefined && exclude !== '' && device.deviceId === exclude) return false;
    if (roles !== undefined && !roles.includes(device.role ?? '')) return false;
    if (device.updatedAt !== undefined && now - device.updatedAt > STALE_AFTER_MS) return false;
    return true;
  });
}

/** Splits a list into chunks Expo will accept. */
export function batches<T>(items: readonly T[], size: number = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Sends one message to every device given.
 *
 * Returns the device ids Expo said are dead, so the caller can drop them.
 * A failed batch is logged and skipped rather than thrown: an alert that does
 * not arrive must never take a database trigger down with it.
 */
export async function sendPush(
  devices: readonly PushDevice[],
  message: PushMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const dead: string[] = [];

  for (const chunk of batches(devices)) {
    const payload = chunk.map((device) => ({
      to: device.token,
      title: message.title,
      body: message.body,
      sound: 'default',
      channelId: message.channelId,
      priority: 'high',
      ...(message.data ? { data: message.data } : {}),
    }));

    try {
      const response = await fetchImpl(EXPO_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        console.warn('Expo push rejected the batch', response.status);
        continue;
      }

      const json = (await response.json()) as { data?: ExpoTicket[] };
      (json.data ?? []).forEach((ticket, index) => {
        if (ticket.status !== 'error') return;
        console.warn('Expo push ticket failed', ticket.message);
        // The one error worth acting on: this token will never work again.
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const device = chunk[index];
          if (device) dead.push(device.deviceId);
        }
      });
    } catch (error) {
      console.warn('Expo push request failed', error);
    }
  }

  return dead;
}
