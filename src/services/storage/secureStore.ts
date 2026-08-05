import * as SecureStore from 'expo-secure-store';

import { logger } from '@/utils/logger';

/**
 * Keychain / Keystore access for anything sensitive.
 *
 * The session role, the worker's name and the three PIN codes live here rather
 * than in AsyncStorage, which is plain text on a rooted device.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function readSecure(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, OPTIONS);
  } catch (error) {
    logger.warn(`readSecure failed for "${key}"`, error);
    return null;
  }
}

export async function writeSecure(key: string, value: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(key, value, OPTIONS);
    return true;
  } catch (error) {
    logger.warn(`writeSecure failed for "${key}"`, error);
    return false;
  }
}

export async function deleteSecure(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key, OPTIONS);
  } catch (error) {
    logger.warn(`deleteSecure failed for "${key}"`, error);
  }
}

export async function isSecureStoreAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}
