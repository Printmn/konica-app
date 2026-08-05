import { describe, expect, it } from 'vitest';

import type { InventoryItem } from '@/types';

import { SEED_COUNT, addMissingSeedItems, missingSeedCount } from './stockSeed';

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: 1,
  name: 'Жааз А5',
  price: '9,000₮',
  stock: '12',
  category: 'Жааз',
  image: null,
  ...over,
});

/**
 * The seed exists to save an hour of typing, not to become the source of truth.
 * Stock counts move every day, so a row that is already in the database has to
 * come through this untouched — otherwise adding the list would quietly undo a
 * day's counting.
 */
describe('adding the standing stock list', () => {
  it('adds every row to an empty list', () => {
    const added = addMissingSeedItems([]);
    expect(added).toHaveLength(SEED_COUNT);
    expect(missingSeedCount(added)).toBe(0);
  });

  it('leaves a row that already exists completely alone', () => {
    const existing = [item({})];
    const added = addMissingSeedItems(existing);
    const kept = added.find((row) => row.name === 'Жааз А5');
    expect(kept?.stock).toBe('12');
    expect(kept?.price).toBe('9,000₮');
    expect(added).toHaveLength(SEED_COUNT);
  });

  it('matches names regardless of case and stray spaces', () => {
    const existing = [item({ name: '  жааз а5 ' })];
    expect(missingSeedCount(existing)).toBe(SEED_COUNT - 1);
  });

  it('is safe to run twice', () => {
    const once = addMissingSeedItems([]);
    expect(addMissingSeedItems(once)).toHaveLength(SEED_COUNT);
  });

  it('keeps rows the shop added that are not on the list', () => {
    const custom = [item({ id: 99, name: 'Тусгай захиалгат хүрээ' })];
    const added = addMissingSeedItems(custom);
    expect(added).toHaveLength(SEED_COUNT + 1);
    expect(added.some((row) => row.name === 'Тусгай захиалгат хүрээ')).toBe(true);
  });

  it('gives every added row a distinct id', () => {
    const ids = addMissingSeedItems([]).map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries a price and a category on every row', () => {
    for (const row of addMissingSeedItems([])) {
      expect(row.name.trim()).not.toBe('');
      expect(row.price).toMatch(/₮$/);
      expect(row.category.trim()).not.toBe('');
    }
  });

  it('has no duplicate names of its own', () => {
    const names = addMissingSeedItems([]).map((row) => row.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});
