import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import type { InventoryItem, WorkLog } from '@/types';
import { formatNumber } from '@/utils/price';
import { logger } from '@/utils/logger';

/**
 * Notifications.
 *
 * Two sources now feed this. The app raises its own for things it just did,
 * and the Cloud Functions in `functions/` push for things another device did —
 * which is the only kind that can arrive with the app closed.
 *
 * They overlap in exactly one situation: the app is open, a colleague sends a
 * chat message, the app shows it locally *and* the push arrives a second
 * later. So a push is silenced while the app is in the foreground — anything
 * worth seeing then is already on the screen. Push notifications are the ones
 * carrying a `kind` in their data; local ones never do.
 */

const isRemote = (notification: Notifications.Notification): boolean => {
  const data = notification.request.content.data as Record<string, unknown> | null;
  return typeof data?.kind === 'string';
};

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const muted = isRemote(notification) && AppState.currentState === 'active';
    return {
      shouldPlaySound: !muted,
      shouldSetBadge: true,
      shouldShowBanner: !muted,
      shouldShowList: true,
    };
  },
});

const CHANNELS = {
  orders: 'orders',
  stock: 'stock',
  chat: 'chat',
  /** Jobs coming due — pushed by the scheduled sweep, never raised locally. */
  deadline: 'deadline',
  /** Somebody clocked in — pushed to managers, never raised locally. */
  attendance: 'attendance',
} as const;

let permissionGranted: boolean | null = null;

/** Requests permission once and creates the Android channels. */
export async function initNotifications(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Promise.all([
        Notifications.setNotificationChannelAsync(CHANNELS.orders, {
          name: 'Захиалга',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#1a56db',
        }),
        Notifications.setNotificationChannelAsync(CHANNELS.stock, {
          name: 'Бараа материал',
          importance: Notifications.AndroidImportance.DEFAULT,
        }),
        Notifications.setNotificationChannelAsync(CHANNELS.chat, {
          name: 'Дотоод чат',
          importance: Notifications.AndroidImportance.HIGH,
        }),
        Notifications.setNotificationChannelAsync(CHANNELS.deadline, {
          name: 'Хугацаа дөхсөн ажил',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
        }),
        Notifications.setNotificationChannelAsync(CHANNELS.attendance, {
          name: 'Ирц',
          importance: Notifications.AndroidImportance.DEFAULT,
        }),
      ]);
    }

    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) {
      permissionGranted = true;
      return true;
    }

    const requested = await Notifications.requestPermissionsAsync();
    permissionGranted = requested.granted;
    return requested.granted;
  } catch (error) {
    logger.warn('initNotifications failed', error);
    permissionGranted = false;
    return false;
  }
}

async function present(
  title: string,
  body: string,
  channelId: string,
): Promise<void> {
  if (permissionGranted === false) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger:
        Platform.OS === 'android'
          ? { channelId, type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1 }
          : null,
    });
  } catch (error) {
    logger.warn('Failed to present notification', error);
  }
}

/**
 * The clock-in nudges, scheduled as one batch.
 *
 * Any previously scheduled batch is cancelled first, so a shift time changed
 * in Settings does not leave yesterday's 09:30 still armed. Identified by a
 * tag in the payload rather than by keeping ids around: the app is killed
 * nightly and a list held in memory would not survive to do the cancelling.
 */
const CLOCK_IN_TAG = 'clock-in-reminder';

export async function cancelClockInReminders(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((item) => item.content.data?.['tag'] === CLOCK_IN_TAG)
        .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
    );
  } catch (error) {
    logger.warn('Failed to clear clock-in reminders', error);
  }
}

export async function scheduleClockInReminders(
  reminders: readonly { lead: number; body: string; seconds: number }[],
): Promise<void> {
  await cancelClockInReminders();
  if (permissionGranted === false) return;
  try {
    for (const reminder of reminders) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ Ирцийн бүртгэл',
          body: reminder.body,
          sound: true,
          data: { tag: CLOCK_IN_TAG, lead: reminder.lead },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: reminder.seconds,
          ...(Platform.OS === 'android' ? { channelId: CHANNELS.attendance } : {}),
        },
      });
    }
  } catch (error) {
    logger.warn('Failed to schedule clock-in reminders', error);
  }
}

/** The manager has posted something the shop should read. */
export function notifyAnnouncement(title: string, body: string): Promise<void> {
  return present(`📢 ${title}`, body || 'Шинэ мэдээлэл', CHANNELS.attendance);
}

/** Fired when a new work log is registered. */
export function notifyNewOrder(log: WorkLog): Promise<void> {
  const price = log.price ? ` · ${formatNumber(Number(log.price))}₮` : '';
  return present('🆕 Шинэ захиалга', `${log.job}${price}`, CHANNELS.orders);
}

/** Fired when an item's stock drops to or below the warning threshold. */
export function notifyLowStock(items: readonly InventoryItem[]): Promise<void> {
  if (items.length === 0) return Promise.resolve();
  const names = items
    .slice(0, 3)
    .map((item) => item.name)
    .join(', ');
  const suffix = items.length > 3 ? ` +${items.length - 3}` : '';
  return present('⚠️ Үлдэгдэл дуусч байна', `${names}${suffix}`, CHANNELS.stock);
}

export function notifyChatMessage(sender: string, text: string): Promise<void> {
  return present(`💬 ${sender}`, text || 'Зураг илгээлээ', CHANNELS.chat);
}

export async function clearBadge(): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // Badge support is optional; failure is not worth surfacing.
  }
}
