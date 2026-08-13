import { getDatabase } from 'firebase-admin/database';

import { recipients, sendPush, type PushDevice, type PushMessage } from './push';

/**
 * The database half of sending a notification.
 *
 * Split from `push.ts` so that file stays testable without `firebase-admin`,
 * which cannot be imported outside a Firebase runtime.
 */

/** Reads the device list, sends, and prunes anything Expo says is gone. */
export async function notify(
  message: PushMessage,
  options: { exclude?: string; roles?: readonly string[] } = {},
): Promise<void> {
  const db = getDatabase();
  const snapshot = await db.ref('/pmn/devices').get();
  const devices = (snapshot.val() ?? null) as Record<string, PushDevice> | null;

  const targets = recipients(devices, options);
  if (targets.length === 0) return;

  const dead = await sendPush(targets, message);
  await Promise.all(dead.map((deviceId) => db.ref(`/pmn/devices/${deviceId}`).remove()));
}
