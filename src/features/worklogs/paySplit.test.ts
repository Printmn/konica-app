import { describe, expect, it } from 'vitest';

import {
  emptyPaySplit,
  paidByMethod,
  readPaySplit,
  splitRemainder,
  splitSummary,
  splitTotal,
} from './paySplit';
import type { WorkLog } from '@/types';

const log = (over: Partial<WorkLog>): Pick<WorkLog, 'price' | 'hasVat' | 'payType' | 'paySplit'> => ({
  price: '5000',
  hasVat: false,
  payType: '',
  ...over,
});

describe('splitTotal', () => {
  it('adds the three slices', () => {
    expect(splitTotal({ cash: 2000, card: 3000, transfer: 0 })).toBe(5000);
  });

  it('treats a missing split as nothing paid', () => {
    expect(splitTotal(undefined)).toBe(0);
    expect(splitTotal(emptyPaySplit())).toBe(0);
  });
});

describe('paidByMethod', () => {
  it('credits a single-method job in full to its own column', () => {
    const cash = log({ payType: 'Бэлэн' });
    expect(paidByMethod(cash, 'cash')).toBe(5000);
    expect(paidByMethod(cash, 'card')).toBe(0);
    expect(paidByMethod(cash, 'transfer')).toBe(0);
  });

  it('bills VAT on top for a single-method job, as the report always did', () => {
    expect(paidByMethod(log({ payType: 'Данс', hasVat: true }), 'transfer')).toBe(5500);
  });

  it('splits 2,000 cash and 3,000 card across two columns', () => {
    const mixed = log({ payType: 'Холимог', paySplit: { cash: 2000, card: 3000, transfer: 0 } });
    expect(paidByMethod(mixed, 'cash')).toBe(2000);
    expect(paidByMethod(mixed, 'card')).toBe(3000);
    expect(paidByMethod(mixed, 'transfer')).toBe(0);
  });

  it('gives nothing for a split job with no amounts entered yet', () => {
    expect(paidByMethod(log({ payType: 'Холимог' }), 'cash')).toBe(0);
  });
});

describe('splitRemainder', () => {
  it('is zero once the slices match the price', () => {
    expect(
      splitRemainder(log({ payType: 'Холимог', paySplit: { cash: 2000, card: 3000, transfer: 0 } })),
    ).toBe(0);
  });

  it('reports what is still owed, and what overshoots', () => {
    expect(splitRemainder(log({ paySplit: { cash: 2000, card: 0, transfer: 0 } }))).toBe(3000);
    expect(splitRemainder(log({ paySplit: { cash: 9000, card: 0, transfer: 0 } }))).toBe(-4000);
  });

  it('counts VAT as part of what has to be settled', () => {
    expect(splitRemainder(log({ hasVat: true, paySplit: { cash: 5000, card: 0, transfer: 0 } }))).toBe(
      500,
    );
  });
});

describe('splitSummary', () => {
  it('names only the methods actually used', () => {
    expect(splitSummary({ cash: 2000, card: 3000, transfer: 0 })).toBe('2,000₮ Бэлэн · 3,000₮ Карт');
  });
});

describe('readPaySplit', () => {
  it('accepts numeric strings from Firebase', () => {
    expect(readPaySplit({ cash: '2000', card: 3000, transfer: null })).toEqual({
      cash: 2000,
      card: 3000,
      transfer: 0,
    });
  });

  it('rejects anything that is not a split', () => {
    expect(readPaySplit('Бэлэн')).toBeUndefined();
    expect(readPaySplit(null)).toBeUndefined();
    expect(readPaySplit({ cash: 0, card: 0, transfer: 0 })).toBeUndefined();
  });
});
