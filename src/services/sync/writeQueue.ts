import { MAX_WRITE_ATTEMPTS, RETRY_BACKOFF_MS } from '@/constants/config';
import { STORAGE_KEYS } from '@/constants/storageKeys';
import { rtdbClient } from '@/firebase/rtdbClient';
import { isOnline, subscribeConnectivity } from '@/services/network/connectivity';
import { readJson, writeJson } from '@/services/storage/asyncStorage';
import type { QueuedWrite, RemoteKey, Result } from '@/types';
import { logger } from '@/utils/logger';

/**
 * Durable outbox for offline writes.
 *
 * The web app fired `fetch(...).catch(() => {})` and silently lost the write
 * whenever the shop's connection dropped. Here a failed write is persisted and
 * retried with backoff.
 *
 * Writes come in two shapes. A *record* write names one row inside a
 * collection; superseding only collapses writes for that same row, so an edit
 * to order #7 never discards an edit to order #8 — which is exactly the case
 * that used to lose data when the manager and the iPad both saved inside one
 * 30-second sync window. A *collection* write replaces the whole node and does
 * supersede everything pending for that key.
 */

type QueueListener = (pending: number) => void;

let queue: QueuedWrite[] = [];
let hydrated = false;
let flushing = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<QueueListener>();

const notify = (): void => listeners.forEach((listener) => listener(queue.length));

const persist = async (): Promise<void> => {
  await writeJson(STORAGE_KEYS.writeQueue, queue);
};

/** Tolerates entries written by the pre-record-level build. */
const normalise = (raw: QueuedWrite): QueuedWrite => ({
  ...raw,
  child: raw.child ?? null,
  op: raw.op ?? 'put',
});

export async function hydrateQueue(): Promise<void> {
  if (hydrated) return;
  const stored = await readJson<QueuedWrite[]>(STORAGE_KEYS.writeQueue, []);
  queue = stored.map(normalise);
  hydrated = true;
  notify();
  if (queue.length > 0) scheduleFlush(0);
}

async function enqueue(item: Omit<QueuedWrite, 'id' | 'queuedAt' | 'attempts'>): Promise<void> {
  queue = queue.filter((pending) => {
    if (pending.key !== item.key) return true;
    // A whole-collection PUT makes every pending write for that key redundant.
    if (item.child === null) return false;
    // Otherwise only the same record is superseded.
    return pending.child !== item.child;
  });

  queue.push({
    ...item,
    id: `${item.key}:${item.child ?? '*'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    queuedAt: Date.now(),
    attempts: 0,
  });

  await persist();
  notify();
  scheduleFlush(0);
}

/** Replaces a whole collection. Used for settings and the array→map migration. */
export async function enqueueWrite(key: RemoteKey, payload: unknown): Promise<void> {
  await enqueue({ key, child: null, op: 'put', payload });
}

/** Creates or updates one record. */
export async function enqueueRecordWrite(
  key: RemoteKey,
  child: string,
  payload: unknown,
): Promise<void> {
  await enqueue({ key, child, op: 'put', payload });
}

/** Deletes one record for every device. */
export async function enqueueRecordDelete(key: RemoteKey, child: string): Promise<void> {
  await enqueue({ key, child, op: 'delete', payload: null });
}

function scheduleFlush(delayMs: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void flushQueue();
  }, delayMs);
}

const send = (item: QueuedWrite): Promise<Result<unknown>> => {
  if (item.child === null) return rtdbClient.write(item.key, item.payload);
  if (item.op === 'delete') return rtdbClient.removeChild(item.key, item.child);
  return rtdbClient.writeChild(item.key, item.child, item.payload);
};

export async function flushQueue(): Promise<void> {
  if (flushing || queue.length === 0) return;
  if (!isOnline()) return;

  flushing = true;
  try {
    const pending = [...queue];
    for (const item of pending) {
      const result = await send(item);

      if (result.ok) {
        queue = queue.filter((q) => q.id !== item.id);
        continue;
      }

      const path = item.child === null ? item.key : `${item.key}/${item.child}`;

      // A rejection by the database rules is not a flaky connection: retrying
      // cannot fix it, and counting it towards the give-up limit would quietly
      // throw away the shop's work. Hold the whole queue instead and wait for
      // the credentials to be corrected.
      if (result.error.kind === 'permission') {
        logger.error(
          `Firebase rejected the write to "${path}" (${result.error.message}). ` +
            'Check the database rules and expo.extra.rtdbAuth — nothing will be discarded.',
        );
        scheduleFlush(RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1] ?? 60_000);
        break;
      }

      item.attempts += 1;
      if (item.attempts >= MAX_WRITE_ATTEMPTS) {
        logger.error(`Dropping write for "${path}" after ${item.attempts} attempts`);
        queue = queue.filter((q) => q.id !== item.id);
        continue;
      }

      // Stop on the first failure; the connection is probably down for all of them.
      const backoffIndex = Math.min(item.attempts - 1, RETRY_BACKOFF_MS.length - 1);
      scheduleFlush(RETRY_BACKOFF_MS[backoffIndex] ?? 60_000);
      break;
    }
    await persist();
    notify();
  } finally {
    flushing = false;
  }
}

export const pendingWriteCount = (): number => queue.length;

/** True when a collection still has unsent writes — the pull must not clobber it. */
export const hasPendingWrites = (key: RemoteKey): boolean =>
  queue.some((item) => item.key === key);

export function subscribeQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  listener(queue.length);
  return () => {
    listeners.delete(listener);
  };
}

// Whenever the device comes back online, drain immediately.
subscribeConnectivity((online) => {
  if (online) scheduleFlush(0);
});
