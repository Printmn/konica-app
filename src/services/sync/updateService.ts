import * as Updates from 'expo-updates';

import { logger } from '@/utils/logger';

/**
 * Over-the-air updates.
 *
 * Without this, fixing a typo in a price label means a full store release and a
 * shop that stays broken for days. With it, `eas update --branch production`
 * ships a JS-only fix that lands the next time each device opens the app.
 *
 * The update is downloaded quietly and applied on the *next* launch rather than
 * reloading immediately: restarting the app under someone who is mid-way
 * through entering an order would lose the form.
 */
export async function checkForUpdate(): Promise<boolean> {
  // Disabled in Expo Go and in development builds, where there is no channel.
  if (!Updates.isEnabled || __DEV__) return false;

  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return false;

    await Updates.fetchUpdateAsync();
    logger.debug('OTA update downloaded; it will apply on next launch');
    return true;
  } catch (error) {
    // A failed check must never block startup — the shop opens either way.
    logger.warn('OTA update check failed', error);
    return false;
  }
}

/** Applies a downloaded update straight away. Only for an explicit user tap. */
export async function applyUpdateNow(): Promise<void> {
  try {
    await Updates.reloadAsync();
  } catch (error) {
    logger.warn('OTA reload failed', error);
  }
}
