import { rtdbClient } from '@/firebase/rtdbClient';
import { readJson, writeJson } from '@/services/storage/asyncStorage';
import { enqueueWrite } from '@/services/sync/writeQueue';
import type { RemoteKey, Result } from '@/types';
import { ok } from '@/utils/result';

/**
 * Offline-first repository over one Realtime Database collection.
 *
 * Read  → local cache first (instant), remote refresh second.
 * Write → local cache immediately, remote through the retry queue.
 *
 * Because writes go through the queue rather than a bare `fetch`, an order
 * created with no signal is not lost; it lands as soon as the phone reconnects.
 * A `validate` hook lets each collection reject a malformed remote payload
 * instead of overwriting good local data with garbage.
 */
export class BaseRepository<T> {
  constructor(
    protected readonly remoteKey: RemoteKey,
    protected readonly storageKey: string,
    protected readonly fallback: T,
    protected readonly validate: (raw: unknown) => raw is T,
    /** Optional shape fix-ups applied to data restored from an older version. */
    protected readonly migrate: (value: T) => T = (value) => value,
  ) {}

  /** Cached value, or the seed default on a cold install. */
  async readLocal(): Promise<T> {
    const cached = await readJson<T | null>(this.storageKey, null);
    if (cached !== null && this.validate(cached)) return this.migrate(cached);
    return this.migrate(this.fallback);
  }

  /**
   * Pulls from Firebase. Returns `null` when the node is missing or the payload
   * fails validation — callers treat that as "keep what you have".
   */
  async fetchRemote(signal?: AbortSignal): Promise<Result<T | null>> {
    const result = await rtdbClient.read<unknown>(this.remoteKey, signal);
    if (!result.ok) return result;
    if (result.value === null || !this.validate(result.value)) return ok(null);
    return ok(this.migrate(result.value));
  }

  /** Writes through: cache now, network when possible. */
  async save(value: T): Promise<void> {
    await writeJson(this.storageKey, value);
    await enqueueWrite(this.remoteKey, value);
  }

  /** Cache-only write, used when applying a payload that came *from* the server. */
  async cacheOnly(value: T): Promise<void> {
    await writeJson(this.storageKey, value);
  }
}

// ── Shared validators ────────────────────────────────────────────────

export const isArrayOf =
  <T>(itemGuard: (item: unknown) => boolean) =>
  (raw: unknown): raw is T[] =>
    Array.isArray(raw) && raw.every(itemGuard);

export const isObjectRecord = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw);

export const hasNumericId = (item: unknown): boolean =>
  isObjectRecord(item) && typeof item.id === 'number';
