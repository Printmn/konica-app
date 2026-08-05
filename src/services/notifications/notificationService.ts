import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { InventoryItem, WorkLog } from '@/types';
import { formatNumber } from '@/utils/price';
import { logger } from '@/utils/logger';

/**
 * Local notifications.
 *
 * Replaces the Web Audio "ding dong" the browser build synthesised with an
 * oscillator. A real notification survives the app being backgrounded, which
 * the oscillator never could.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const CHANNELS = {
  orders: 'orders',
  stock: 'stock',
  chat: 'chat',
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
