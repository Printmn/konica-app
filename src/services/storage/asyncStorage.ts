import AsyncStorage from '@react-native-async-storage/async-storage';

import { logger } from '@/utils/logger';

/**
 * JSON-shaped AsyncStorage wrapper.
 *
 * Replaces the web build's `fromLS` / `toLS` helpers. Same contract: a read
 * never throws and falls back to the caller's default, a write never throws and
 * reports success as a boolean.
 */

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.warn(`readJson failed for "${key}"`, error);
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.warn(`writeJson failed for "${key}"`, error);
    return false;
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    logger.warn(`removeKey failed for "${key}"`, error);
  }
}

/** Reads many keys in one round trip — used by the boot-time hydration. */
export async function readManyJson(
  keys: readonly string[],
): Promise<Record<string, unknown>> {
  try {
    const pairs = await AsyncStorage.multiGet([...keys]);
    const out: Record<string, unknown> = {};
    for (const [key, raw] of pairs) {
      if (raw === null) continue;
      try {
        out[key] = JSON.parse(raw);
      } catch {
        // A single corrupt entry must not take the whole hydration down.
        logger.warn(`readManyJson: corrupt payload at "${key}"`);
      }
    }
    return out;
  } catch (error) {
    logger.warn('readManyJson failed', error);
    return {};
  }
}

export async function clearAll(keys: readonly string[]): Promise<void> {
  try {
    await AsyncStorage.multiRemove([...keys]);
  } catch (error) {
    logger.warn('clearAll failed', error);
  }
}
