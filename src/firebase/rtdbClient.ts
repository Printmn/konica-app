import { RTDB_AUTH, RTDB_URL } from '@/constants/config';
import { request } from '@/services/network/httpClient';
import type { RemoteKey, Result } from '@/types';
import { logger } from '@/utils/logger';

/**
 * Firebase Realtime Database REST client.
 *
 * The original app talked to `/pmn/<key>.json` directly with bare `fetch`.
 * That contract is preserved byte for byte — same URLs, same PUT payloads —
 * only the transport is now typed, timed out, and Result-returning.
 */

/** `?auth=…` when a token is configured, so closed database rules can pass. */
const query = RTDB_AUTH.length > 0 ? `?auth=${encodeURIComponent(RTDB_AUTH)}` : '';

if (query === '') {
  // Every request will come back 401 if the rules require `auth != null`, and
  // the symptom — writes that queue forever — looks nothing like the cause.
  logger.warn(
    'No Firebase token configured (expo.extra.rtdbAuth is empty). ' +
      'This only works if the database rules are open to the public.',
  );
}

const url = (key: RemoteKey): string => `${RTDB_URL}/${key}.json${query}`;

const childUrl = (key: RemoteKey, child: string): string =>
  `${RTDB_URL}/${key}/${encodeURIComponent(child)}.json${query}`;

export const rtdbClient = {
  /** Reads one collection. `null` means "the node does not exist yet". */
  read<T>(key: RemoteKey, signal?: AbortSignal): Promise<Result<T | null>> {
    return request<T | null>(url(key), signal ? { signal } : {});
  },

  /** Replaces one collection wholesale, exactly like the web app's `fbWrite`. */
  write<T>(key: RemoteKey, value: T): Promise<Result<T>> {
    return request<T>(url(key), { method: 'PUT', body: value });
  },

  /**
   * Writes a single child node.
   *
   * Chat needs this: replacing the whole collection on every message would let
   * two phones sending at once silently drop one of the two.
   */
  writeChild<T>(key: RemoteKey, child: string, value: T): Promise<Result<T>> {
    return request<T>(childUrl(key, child), { method: 'PUT', body: value });
  },

  /** Deletes a single child node. */
  removeChild(key: RemoteKey, child: string): Promise<Result<null>> {
    return request<null>(childUrl(key, child), { method: 'DELETE' });
  },

  /** Reads several collections concurrently. Individual failures stay isolated. */
  async readMany(
    keys: readonly RemoteKey[],
    signal?: AbortSignal,
  ): Promise<Record<string, Result<unknown>>> {
    const settled = await Promise.all(
      keys.map(async (key) => [key, await rtdbClient.read<unknown>(key, signal)] as const),
    );
    return Object.fromEntries(settled);
  },
};
