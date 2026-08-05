import { rtdbClient } from '@/firebase/rtdbClient';
import { readJson, writeJson } from '@/services/storage/asyncStorage';
import { enqueueRecordDelete, enqueueRecordWrite } from '@/services/sync/writeQueue';
import type { RemoteKey, Result } from '@/types';
import { logger } from '@/utils/logger';
import { ok } from '@/utils/result';

import {
  dedupeById,
  diffRecords,
  entriesFromRemote,
  misplacedEntries,
  type Identified,
  type RemoteEntry,
} from './diff';
import { hasValidId } from './guards';

export type { Identified } from './diff';

/**
 * A collection stored one record per node.
 *
 * The original design wrote every collection as a single JSON array. That is
 * last-writer-wins: if the manager saved a work log while the iPad saved a
 * different one inside the same sync window, one of the two silently vanished.
 * Here each row lives at `/pmn/<key>/<id>`, so the two writes touch different
 * nodes and both survive.
 *
 * Screens still hand over whole arrays. This class diffs the previous array
 * against the next one and turns the difference into per-record writes, so the
 * change is invisible above `DataContext`.
 *
 * Two properties are deliberate and load-bearing:
 *
 *  1. **Nothing ever replaces a whole collection.** `/pmn/orders` also receives
 *     customer orders pushed by the website — different shape, Firebase push
 *     keys, no numeric `id`. A whole-node write from the app would delete them.
 *     Only records the app itself knows about are ever written or removed.
 *  2. **A foreign row is skipped, not fatal.** A single unrecognised entry used
 *     to fail validation for the entire collection, so the app fell back to its
 *     cache and showed nothing. Rows are now filtered individually.
 */

export class RecordRepository<T extends Identified> {
  /** Skipped rows are explained once per collection, not once per sync. */
  private warnedAboutForeignRows = false;
  private warnedAboutDuplicateIds = false;
  /** The legacy re-key sweep only needs to run once per app run. */
  private rekeyed = false;

  /**
   * Renumbers rows that share an id, so list keys stay unique and two rows can
   * never collapse onto one child path in Firebase.
   */
  private unique(rows: T[]): T[] {
    const { rows: deduped, repaired } = dedupeById(rows);
    if (repaired > 0 && !this.warnedAboutDuplicateIds) {
      this.warnedAboutDuplicateIds = true;
      logger.warn(
        `"${this.remoteKey}" contained ${repaired} row(s) with a duplicate id; ` +
          'they have been renumbered so nothing is hidden or overwritten.',
      );
    }
    return deduped;
  }

  /**
   * Explains skipped rows, separating two very different situations.
   *
   * A row with no numeric `id` was never this app's to begin with — the
   * website pushes customer orders into `/pmn/orders` under a Firebase push
   * key, and skipping those is the intended, permanent behaviour. Logging that
   * as an error every launch would fill the crash log with noise and train
   * everyone to ignore it.
   *
   * A row that *does* carry a numeric id but still fails the guard is the
   * opposite: it looks like ours and is being hidden from the screen. That is
   * the case worth an entry in the on-device error log.
   */
  private reportSkipped(rows: readonly unknown[], keptCount: number): void {
    const skipped = rows.length - keptCount;
    if (skipped === 0 || this.warnedAboutForeignRows) return;
    this.warnedAboutForeignRows = true;

    const ours = rows.filter(
      (row) => !this.validateItem(row) && hasValidId(row),
    ).length;

    if (ours > 0) {
      logger.error(
        `"${this.remoteKey}": ${ours} row(s) have an id but failed validation and are ` +
          'hidden from the app. Check the field types on those records.',
      );
    }

    const foreign = skipped - ours;
    if (foreign > 0) {
      logger.debug(
        `"${this.remoteKey}": ${foreign} row(s) belong to another writer ` +
          '(no numeric id — most likely the website). Left untouched, as intended.',
      );
    }
  }

  /**
   * Moves rows that the web build left under a positional key onto their own id.
   *
   * Without this, a legacy array node and record-level writes disagree about
   * where a row lives: editing the row at position `"2"` writes to `/…/5`, and
   * the collection then contains the row twice — stale at `"2"`, current at
   * `"5"`. Only rows this app recognises are touched, and the copy is written
   * before the old key is removed, so a failure mid-way loses nothing.
   */
  private async rekeyMisplaced(entries: readonly RemoteEntry[]): Promise<void> {
    if (this.rekeyed) return;
    const misplaced = misplacedEntries(entries, (row) => this.validateItem(row));
    if (misplaced.length === 0) {
      this.rekeyed = true;
      return;
    }
    this.rekeyed = true;

    logger.warn(
      `"${this.remoteKey}" has ${misplaced.length} row(s) stored under a legacy ` +
        'positional key; moving them onto their id so edits cannot duplicate them.',
    );

    for (const entry of misplaced) {
      await enqueueRecordWrite(this.remoteKey, String(entry.id), entry.value);
      await enqueueRecordDelete(this.remoteKey, entry.key);
    }
  }

  constructor(
    protected readonly remoteKey: RemoteKey,
    protected readonly storageKey: string,
    protected readonly fallback: T[],
    /** Per-row guard. Rows that fail it belong to somebody else and are left alone. */
    protected readonly validateItem: (raw: unknown) => boolean,
    protected readonly migrate: (value: T[]) => T[] = (value) => value,
  ) {}

  /** Cached value, or the seed default on a cold install. */
  async readLocal(): Promise<T[]> {
    const cached = await readJson<unknown>(this.storageKey, null);
    if (Array.isArray(cached)) {
      return this.unique(this.migrate(cached.filter((row) => this.validateItem(row)) as T[]));
    }
    return this.migrate([...this.fallback]);
  }

  /**
   * Accepts an array (legacy) or a keyed map (current) and always returns an
   * array. `null` means "the node is missing or unusable — keep what you have".
   */
  async fetchRemote(signal?: AbortSignal): Promise<Result<T[] | null>> {
    const result = await rtdbClient.read<unknown>(this.remoteKey, signal);
    if (!result.ok) return result;
    if (result.value === null) return ok(null);

    const entries = entriesFromRemote(result.value);
    if (entries === null) return ok(null);

    void this.rekeyMisplaced(entries);

    const rows = entries.map((entry) => entry.value);
    const mine = rows.filter((row) => this.validateItem(row)) as T[];

    this.reportSkipped(rows, mine.length);

    return ok(this.unique(this.migrate(mine)));
  }

  /**
   * Writes through: cache the new array now, queue the difference for Firebase.
   *
   * Only the rows that actually changed are sent, and only under their own id,
   * so concurrent edits from another device — and rows this app knows nothing
   * about — are never disturbed.
   */
  async save(previous: T[], next: T[]): Promise<void> {
    await writeJson(this.storageKey, next);

    for (const op of diffRecords(previous, next)) {
      if (op.op === 'delete') await enqueueRecordDelete(this.remoteKey, op.child);
      else await enqueueRecordWrite(this.remoteKey, op.child, op.value);
    }
  }

  /** Cache-only write, used when applying a payload that came *from* the server. */
  async cacheOnly(value: T[]): Promise<void> {
    await writeJson(this.storageKey, value);
  }
}
