/**
 * Array-to-record-operations diff.
 *
 * Kept free of any React Native or Firebase import so it can be unit tested
 * directly — this is the piece that decides whether an edit reaches the server,
 * so it is the piece most worth testing.
 */

export interface Identified {
  id: number;
}

export interface RecordOp<T> {
  op: 'put' | 'delete';
  /** Record id as a Firebase child key. */
  child: string;
  /** The row to write; `null` for a delete. */
  value: T | null;
}

/**
 * Rows added or changed become `put`s, rows that disappeared become `delete`s,
 * and untouched rows produce nothing at all — which is what keeps two devices
 * editing different rows from ever colliding.
 */
export function diffRecords<T extends Identified>(previous: T[], next: T[]): RecordOp<T>[] {
  const before = new Map<number, T>(previous.map((row) => [row.id, row]));
  const after = new Map<number, T>(next.map((row) => [row.id, row]));
  const ops: RecordOp<T>[] = [];

  for (const [id, row] of after) {
    const old = before.get(id);
    if (old === undefined || JSON.stringify(old) !== JSON.stringify(row)) {
      ops.push({ op: 'put', child: String(id), value: row });
    }
  }

  for (const id of before.keys()) {
    if (!after.has(id)) ops.push({ op: 'delete', child: String(id), value: null });
  }

  return ops;
}

/**
 * Gives every row a unique id, renumbering duplicates rather than dropping them.
 *
 * Real data in `/pmn/inventory` contains rows that share an id — almost
 * certainly two items created in the same millisecond by the web build, which
 * used a bare `Date.now()`. That breaks three things at once: React warns about
 * duplicate list keys, the list may render one row and omit the other, and —
 * worst — record-level sync would write both rows to the same child path, so
 * one would silently overwrite the other on the server.
 *
 * Renumbering is deterministic for a given input order, so repeated fetches do
 * not keep reshuffling ids and churning the list.
 */
export function dedupeById<T extends Identified>(
  rows: T[],
): { rows: T[]; repaired: number } {
  const seen = new Set<number>();
  let nextFree = rows.reduce((max, row) => Math.max(max, row.id), 0);
  let repaired = 0;

  const result = rows.map((row) => {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      return row;
    }
    nextFree += 1;
    repaired += 1;
    seen.add(nextFree);
    return { ...row, id: nextFree };
  });

  return { rows: result, repaired };
}

/** Rows keyed by id, the shape a collection node takes on the server. */
export function toRecordMap<T extends Identified>(rows: T[]): Record<string, T> {
  const map: Record<string, T> = {};
  for (const row of rows) map[String(row.id)] = row;
  return map;
}

/** A row together with the Firebase key it is stored under. */
export interface RemoteEntry {
  key: string;
  value: unknown;
}

/**
 * Normalises whatever Firebase returned for a collection, keeping the keys.
 *
 * Legacy nodes are arrays (possibly sparse, so holes Firebase renders as
 * `null`), where the key is the *position* — `"0"`, `"1"` — and has nothing to
 * do with the row's `id`. Current nodes are id-keyed maps. Anything else is
 * rejected.
 */
export function entriesFromRemote(raw: unknown): RemoteEntry[] | null {
  if (Array.isArray(raw)) {
    return raw
      .map((value, index) => ({ key: String(index), value }))
      .filter((entry) => entry.value !== null);
  }
  if (typeof raw === 'object' && raw !== null) {
    return Object.entries(raw as Record<string, unknown>)
      .map(([key, value]) => ({ key, value }))
      .filter((entry) => entry.value !== null);
  }
  return null;
}

export function rowsFromRemote(raw: unknown): unknown[] | null {
  return entriesFromRemote(raw)?.map((entry) => entry.value) ?? null;
}

/**
 * Entries stored under a key that is not their own id.
 *
 * This is the legacy-array case, and it is a live hazard rather than untidiness:
 * a row sitting at position `"2"` with `id: 5` gets edited, the edit is written
 * to `/…/5`, and now the collection holds the row *twice* — once stale at `"2"`,
 * once current at `"5"`. Re-keying them removes the possibility.
 */
export function misplacedEntries(
  entries: readonly RemoteEntry[],
  isMine: (row: unknown) => boolean,
): { key: string; id: number; value: unknown }[] {
  const out: { key: string; id: number; value: unknown }[] = [];
  for (const entry of entries) {
    if (!isMine(entry.value)) continue;
    const id = (entry.value as Identified).id;
    if (entry.key !== String(id)) out.push({ key: entry.key, id, value: entry.value });
  }
  return out;
}
