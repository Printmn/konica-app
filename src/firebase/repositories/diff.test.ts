import { describe, expect, it } from 'vitest';

import {
  dedupeById,
  diffRecords,
  entriesFromRemote,
  misplacedEntries,
  rowsFromRemote,
  toRecordMap,
} from './diff';

interface Row {
  id: number;
  job?: string;
  price?: string;
}

describe('diffRecords', () => {
  it('emits nothing when nothing changed', () => {
    const rows: Row[] = [{ id: 1, job: 'A' }];
    expect(diffRecords(rows, [{ id: 1, job: 'A' }])).toEqual([]);
  });

  it('writes only the row that was added', () => {
    const ops = diffRecords<Row>([{ id: 1 }], [{ id: 1 }, { id: 2 }]);
    expect(ops).toEqual([{ op: 'put', child: '2', value: { id: 2 } }]);
  });

  it('writes only the row that was edited', () => {
    const ops = diffRecords<Row>(
      [
        { id: 1, price: '100' },
        { id: 2, price: '200' },
      ],
      [
        { id: 1, price: '100' },
        { id: 2, price: '250' },
      ],
    );
    expect(ops).toEqual([{ op: 'put', child: '2', value: { id: 2, price: '250' } }]);
  });

  it('deletes a row that disappeared', () => {
    const ops = diffRecords<Row>([{ id: 1 }, { id: 2 }], [{ id: 1 }]);
    expect(ops).toEqual([{ op: 'delete', child: '2', value: null }]);
  });

  it('handles an add and a delete in the same save', () => {
    const ops = diffRecords<Row>([{ id: 1 }, { id: 2 }], [{ id: 1 }, { id: 3 }]);
    expect(ops).toEqual([
      { op: 'put', child: '3', value: { id: 3 } },
      { op: 'delete', child: '2', value: null },
    ]);
  });

  it('is the whole point: two devices editing different rows never collide', () => {
    const server: Row[] = [
      { id: 1, job: 'A' },
      { id: 2, job: 'B' },
    ];

    // The manager edits row 1 while the iPad edits row 2, each starting from
    // the same snapshot. Under the old whole-array PUT one of the two was lost.
    const managerOps = diffRecords<Row>(server, [
      { id: 1, job: 'A edited' },
      { id: 2, job: 'B' },
    ]);
    const ipadOps = diffRecords<Row>(server, [
      { id: 1, job: 'A' },
      { id: 2, job: 'B edited' },
    ]);

    expect(managerOps.map((op) => op.child)).toEqual(['1']);
    expect(ipadOps.map((op) => op.child)).toEqual(['2']);
    // Different child paths, so applying both keeps both edits.
    expect(managerOps[0]?.child).not.toBe(ipadOps[0]?.child);
  });

  it('turns an empty collection into deletes, not a wipe of the node', () => {
    const ops = diffRecords<Row>([{ id: 1 }, { id: 2 }], []);
    expect(ops).toEqual([
      { op: 'delete', child: '1', value: null },
      { op: 'delete', child: '2', value: null },
    ]);
  });
});

describe('toRecordMap', () => {
  it('keys rows by id for the one-time array→map migration', () => {
    expect(toRecordMap<Row>([{ id: 7, job: 'A' }])).toEqual({ '7': { id: 7, job: 'A' } });
  });
});

describe('legacy array nodes', () => {
  const isMine = (row: unknown): boolean =>
    typeof row === 'object' && row !== null && typeof (row as Row).id === 'number';

  it('exposes the positional key an array node stores rows under', () => {
    const entries = entriesFromRemote([{ id: 40 }, { id: 41 }]);
    expect(entries).toEqual([
      { key: '0', value: { id: 40 } },
      { key: '1', value: { id: 41 } },
    ]);
  });

  it('flags every row whose key is not its id', () => {
    // The hazard: editing the row at "1" would write to "/41" and leave the
    // stale copy behind at "1", so the item would appear twice.
    const entries = entriesFromRemote([{ id: 40 }, { id: 41 }]) ?? [];
    expect(misplacedEntries(entries, isMine)).toEqual([
      { key: '0', id: 40, value: { id: 40 } },
      { key: '1', id: 41, value: { id: 41 } },
    ]);
  });

  it('flags nothing once the node is keyed by id', () => {
    const entries = entriesFromRemote({ '40': { id: 40 }, '41': { id: 41 } }) ?? [];
    expect(misplacedEntries(entries, isMine)).toEqual([]);
  });

  it('never touches a row the app does not own', () => {
    const entries =
      entriesFromRemote({
        '-OtOsH8LaGYkxIZdm9JA': { source: 'web', status: 'new' },
        '0': { id: 40 },
      }) ?? [];
    const misplaced = misplacedEntries(entries, isMine);
    expect(misplaced).toHaveLength(1);
    expect(misplaced[0]?.key).toBe('0');
  });

  it('handles the holes Firebase leaves in a sparse array', () => {
    const entries = entriesFromRemote([{ id: 1 }, null, { id: 3 }]) ?? [];
    expect(entries.map((entry) => entry.key)).toEqual(['0', '2']);
  });
});

describe('dedupeById', () => {
  it('leaves already-unique rows exactly as they are', () => {
    const rows: Row[] = [{ id: 1 }, { id: 2 }];
    const result = dedupeById(rows);
    expect(result.repaired).toBe(0);
    expect(result.rows).toEqual(rows);
  });

  it('renumbers a duplicate instead of dropping it', () => {
    // The real case: /pmn/inventory holds two rows with id 1, which made React
    // warn about duplicate keys and could hide one of the two items.
    const result = dedupeById<Row>([
      { id: 1, job: 'Цаас' },
      { id: 2, job: 'Хальс' },
      { id: 1, job: 'Бэх' },
    ]);

    expect(result.repaired).toBe(1);
    expect(result.rows).toHaveLength(3);
    // Nothing is lost.
    expect(result.rows.map((row) => row.job)).toEqual(['Цаас', 'Хальс', 'Бэх']);
    // And every key is now unique.
    expect(new Set(result.rows.map((row) => row.id)).size).toBe(3);
  });

  it('never reuses an id that already exists', () => {
    const result = dedupeById<Row>([{ id: 5 }, { id: 5 }, { id: 6 }, { id: 5 }]);
    expect(new Set(result.rows.map((row) => row.id)).size).toBe(4);
    expect(result.rows.map((row) => row.id)).not.toContain(undefined);
  });

  it('is stable, so repeated fetches do not reshuffle the list', () => {
    const input: Row[] = [{ id: 1, job: 'a' }, { id: 1, job: 'b' }, { id: 1, job: 'c' }];
    expect(dedupeById(input).rows).toEqual(dedupeById(input).rows);
  });

  it('keeps the first occurrence on its original id', () => {
    const result = dedupeById<Row>([{ id: 3, job: 'анхны' }, { id: 3, job: 'хоёр дахь' }]);
    expect(result.rows[0]).toEqual({ id: 3, job: 'анхны' });
    expect(result.rows[1]?.id).not.toBe(3);
  });
});

describe('foreign rows written by the website', () => {
  // Real payload from /pmn/orders: pushed by the public order form, so it has
  // a Firebase push key and none of the fields the app's Order type declares.
  const webOrder = {
    createdAt: '2026-05-24T12:06:26.233Z',
    name: 'Болд',
    note: 'яаралтай',
    phone: '99001122',
    qty: '4',
    service: 'Нэрийн хуудас',
    size: 'A5 (15×21)',
    source: 'web',
    status: 'new',
  };

  const hasNumericId = (item: unknown): boolean =>
    typeof item === 'object' && item !== null && typeof (item as Row).id === 'number';

  it('is read from the node alongside the app’s own rows', () => {
    const rows = rowsFromRemote({
      '-OtOsH8LaGYkxIZdm9JA': webOrder,
      '1754400100000': { id: 1754400100000, job: 'Хэвлэл' },
    });
    expect(rows).toHaveLength(2);
  });

  it('is filtered out rather than failing the whole collection', () => {
    const rows =
      rowsFromRemote({
        '-OtOsH8LaGYkxIZdm9JA': webOrder,
        '1754400100000': { id: 1754400100000, job: 'Хэвлэл' },
      }) ?? [];
    const mine = rows.filter(hasNumericId);

    // The app still sees its own order — the old all-or-nothing guard dropped
    // both and left the screen empty.
    expect(mine).toHaveLength(1);
    expect((mine[0] as Row).id).toBe(1754400100000);
  });

  it('is never targeted by a write, because the app cannot know its id', () => {
    const mine: Row[] = [{ id: 1754400100000, job: 'Хэвлэл' }];
    const ops = diffRecords(mine, [...mine, { id: 1754400200000, job: 'Шинэ' }]);

    // Only the new row is written, under its own key. Nothing addresses the
    // push key, so the customer's order cannot be overwritten or deleted.
    expect(ops).toEqual([
      { op: 'put', child: '1754400200000', value: { id: 1754400200000, job: 'Шинэ' } },
    ]);
    expect(ops.some((op) => op.child.startsWith('-'))).toBe(false);
  });
});

describe('rowsFromRemote', () => {
  it('accepts the legacy array shape', () => {
    expect(rowsFromRemote([{ id: 1 }, { id: 2 }])).toHaveLength(2);
  });

  it('drops the nulls Firebase leaves in a sparse array', () => {
    expect(rowsFromRemote([{ id: 1 }, null, { id: 3 }])).toHaveLength(2);
  });

  it('accepts the keyed map shape', () => {
    expect(rowsFromRemote({ '1': { id: 1 }, '2': { id: 2 } })).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('rejects a scalar rather than treating it as data', () => {
    expect(rowsFromRemote('nonsense')).toBeNull();
    expect(rowsFromRemote(42)).toBeNull();
  });
});
