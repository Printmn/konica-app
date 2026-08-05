import { describe, expect, it } from 'vitest';

import type { InventoryItem } from '@/types';

import {
  inventoryValue,
  isLowStock,
  isOutOfStock,
  lowStockItems,
  stockCount,
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
