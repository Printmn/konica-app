import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { onValueCreated, onValueWritten } from 'firebase-functions/v2/database';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';

import {
  arrivalMessage,
  chatMessage,
  dueSoon,
  dueSoonMessage,
  lowStockMessage,
  newOrderMessage,
  type AttendanceLog,
  type ChatMessage,
  type InventoryItem,
  type WorkLog,
} from './messages';
import { notify } from './notify';

/**
 * Push notifications for the shop.
 *
 * The app only ever raised *local* notifications, which by definition cannot
 * fire while it is closed — which is the only time anyone needed one. These
 * four triggers watch the database instead and push through Expo, so an alert
 * arrives on a locked phone.
 *
 * Every handler is written to fail quietly. A notification is a courtesy; a
 * throw here would retry the trigger and, worse, could mask the write that
 * caused it.
 */

initializeApp();

// Ulaanbaatar. Both the schedule and the "today" the deadline sweep compares
// against have to be local, or the sweep looks at the wrong day for half of it.
const TIME_ZONE = 'Asia/Ulaanbaatar';

/**
 * The region the database lives in, not the one nearest the shop.
 *
 * A Realtime Database trigger has to be deployed alongside its database
 * instance, and this one is at `printmn-c0d28-default-rtdb.firebaseio.com` —
 * the bare `.firebaseio.com` host means us-central1. Deploying to
 * asia-southeast1 fails with a bare "Failed to create function", which says
 * nothing about the cause. The extra round trip costs a couple of hundred
 * milliseconds on a notification; nobody will notice.
 */
setGlobalOptions({ region: 'us-central1', maxInstances: 5 });

/** `YYYY-MM-DD` and minutes-since-midnight, in the shop's own timezone. */
function shopClock(now: Date = new Date()): { today: string; nowMinutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00';
  return {
    today: `${get('year')}-${get('month')}-${get('day')}`,
    nowMinutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** A new job on the board. */
export const onNewWorkLog = onValueCreated('/pmn/worklogs/{logId}', async (event) => {
  try {
    const log = event.data.val() as WorkLog | null;
    if (log === null || !log.job) return;

    await notify(newOrderMessage(log), { exclude: log.deviceId });
  } catch (error) {
    console.error('onNewWorkLog failed', error);
  }
});

/** A message in the shop's own chat. */
export const onNewChatMessage = onValueCreated('/pmn/chat/{messageId}', async (event) => {
  try {
    const message = event.data.val() as ChatMessage | null;
    if (message === null) return;

    await notify(chatMessage(message), { exclude: message.deviceId });
  } catch (error) {
    console.error('onNewChatMessage failed', error);
  }
});

/**
 * Somebody clocked in.
 *
 * Managers only. The person who just tapped «Бүртгэх» watched it happen, and
 * the counter iPad has no stake in who arrived when.
 */
export const onNewArrival = onValueCreated('/pmn/logs/{logId}', async (event) => {
  try {
    const log = event.data.val() as AttendanceLog | null;
    if (log === null) return;

    const message = arrivalMessage(log);
    if (message === null) return;

    await notify(message, { roles: ['manager', 'admin'] });
  } catch (error) {
    console.error('onNewArrival failed', error);
  }
});

/**
 * Stock running out.
 *
 * Watches writes rather than creations, because the number that matters
 * changes on an existing row — and only the write that crosses the threshold
 * produces an alert.
 */
export const onStockChanged = onValueWritten('/pmn/inventory/{itemId}', async (event) => {
  try {
    const before = (event.data.before.val() ?? null) as InventoryItem | null;
    const after = (event.data.after.val() ?? null) as InventoryItem | null;

    const message = lowStockMessage(before, after);
    if (message === null) return;

    // Stock is the manager's problem, not the counter's.
    await notify(message, { roles: ['manager', 'admin'] });
  } catch (error) {
    console.error('onStockChanged failed', error);
  }
});

/**
 * Jobs coming due.
 *
 * Every fifteen minutes through the working day. The window is thirty minutes
 * and the sweep runs every fifteen, so a job is announced at most twice — close
 * enough to act on, rare enough to still be worth reading.
 */
export const deadlineSweep = onSchedule(
  { schedule: '*/15 6-21 * * *', timeZone: TIME_ZONE },
  async () => {
    try {
      const snapshot = await getDatabase().ref('/pmn/worklogs').get();
      const logs = (snapshot.val() ?? null) as Record<string, WorkLog> | null;

      const { today, nowMinutes } = shopClock();
      const message = dueSoonMessage(dueSoon(logs, { today, nowMinutes }));
      if (message === null) return;

      await notify(message);
    } catch (error) {
      console.error('deadlineSweep failed', error);
    }
  },
);
