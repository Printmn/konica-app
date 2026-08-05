import { describe, expect, it } from 'vitest';

import type { InventoryItem } from '@/types';

import {
  filterByStock,
  inventoryValue,
  isLowStock,
  isOutOfStock,
  lowStockItems,
  stockCount,
  stockCounts,
} from './inventoryLogic';

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: 1,
  name: 'Цаас',
  price: '500₮',
  stock: '10',
  category: 'Цаас',
  image: null,
  ...over,
});

/**
 * `stock` is free text in the database, so this is the funnel every reorder
 * warning and stock total passes through. Reading it wrong tells the shop to
 * buy paper it already has, or hides that it has run out.
 */
describe('stockCount', () => {
  it('reads a plain number', () => {
    expect(stockCount({ stock: '12' })).toBe(12);
  });

  it('ignores a unit suffix', () => {
    expect(stockCount({ stock: '12ш' })).toBe(12);
    expect(stockCount({ stock: '1,200' })).toBe(1200);
  });

  it('takes the first number of a range rather than giving up', () => {
    // Previously `"5-10"` collapsed to 0 — ten in stock, flagged as empty.
    expect(stockCount({ stock: '5-10' })).toBe(5);
  });

  it('keeps a negative count, which means oversold', () => {
    expect(stockCount({ stock: '-3' })).toBe(-3);
  });

  it('is zero for anything unreadable', () => {
    expect(stockCount({ stock: '' })).toBe(0);
    expect(stockCount({ stock: 'олон' })).toBe(0);
    expect(stockCount({ stock: undefined as unknown as string })).toBe(0);
  });
});

describe('stock warnings', () => {
  it('flags an empty shelf', () => {
    expect(isOutOfStock(item({ stock: '0' }))).toBe(true);
    expect(isOutOfStock(item({ stock: '-2' }))).toBe(true);
    expect(isOutOfStock(item({ stock: '1' }))).toBe(false);
  });

  it('flags a shelf running low but not an empty one', () => {
    expect(isLowStock(item({ stock: '3' }))).toBe(true);
    expect(isLowStock(item({ stock: '0' }))).toBe(false);
    expect(isLowStock(item({ stock: '50' }))).toBe(false);
  });

  it('lists what to reorder, scarcest first', () => {
    const list = lowStockItems([
      item({ id: 1, stock: '4' }),
      item({ id: 2, stock: '100' }),
      item({ id: 3, stock: '0' }),
    ]);
    expect(list.map((row) => row.id)).toEqual([3, 1]);
  });

  it('no longer warns about a range that reads as healthy', () => {
    expect(lowStockItems([item({ stock: '20-30' })])).toEqual([]);
  });
});

/**
 * "Running low" is a reorder list — things still selling that will stop soon.
 * "Out" is what the shop cannot sell today. Keeping them apart is the whole
 * point: merged, the urgent rows are buried among the ones there is still time
 * for.
 */
describe('splitting the shelf by stock', () => {
  const shelf = [
    item({ id: 1, name: 'Дууссан', stock: '0' }),
    item({ id: 2, name: 'Хэтэрсэн', stock: '-2' }),
    item({ id: 3, name: 'Багассан', stock: '3' }),
    item({ id: 4, name: 'Хүрэлцээтэй', stock: '80' }),
  ];

  it('counts each group without double-counting', () => {
    const counts = stockCounts(shelf);
    expect(counts).toEqual({ all: 4, low: 1, out: 2 });
    expect(counts.low + counts.out).toBeLessThanOrEqual(counts.all);
  });

  it('shows everything under «Бүгд»', () => {
    expect(filterByStock(shelf, 'all')).toHaveLength(4);
  });

  it('lists only what has run out under «Дууссан»', () => {
    expect(filterByStock(shelf, 'out').map((row) => row.id)).toEqual([1, 2]);
  });

  it('leaves what has run out off the reorder list', () => {
    // An empty shelf is not "running low" — it is a different problem.
    expect(filterByStock(shelf, 'low').map((row) => row.id)).toEqual([3]);
  });

  it('is all zeroes for an empty shelf', () => {
    expect(stockCounts([])).toEqual({ all: 0, low: 0, out: 0 });
  });

  it('treats an unreadable count as run out rather than hiding it', () => {
    const unreadable = [item({ id: 5, stock: 'олон' })];
    expect(filterByStock(unreadable, 'out')).toHaveLength(1);
  });
});

describe('inventoryValue', () => {
  it('multiplies price by count across the shelf', () => {
    expect(
      inventoryValue([
        item({ price: '500₮', stock: '10' }),
        item({ price: '1,200₮', stock: '2' }),
      ]),
    ).toBe(7400);
  });

  it('contributes nothing for an unreadable stock figure', () => {
    expect(inventoryValue([item({ price: '500₮', stock: 'олон' })])).toBe(0);
  });
});
