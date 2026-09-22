import { describe, expect, it } from 'vitest';

import type { Expense } from '@/types';

import {
  byCategory,
  byPerson,
  inWindow,
  timeOf,
  createExpense,
  dailyBars,
  dayNet,
  onDay,
  parseAmount,
  sumOf,
  validateExpense,
  windowTotal,
} from './expenseLogic';

const expense = (over: Partial<Expense>): Expense => ({
  id: Math.random(),
  date: '2026-08-04',
  category: 'food',
  amount: 8000,
  note: '',
  by: 'Сараа',
  at: Date.now(),
  ...over,
});

describe('parseAmount', () => {
  it('reads what a counter actually types', () => {
    expect(parseAmount('8000')).toBe(8000);
    expect(parseAmount('8,000₮')).toBe(8000);
    expect(parseAmount('8 000')).toBe(8000);
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('хоол')).toBe(0);
  });
});

describe('validateExpense', () => {
  const draft = { category: 'food' as const, amount: '5000', note: '', by: 'Сараа' };

  it('accepts a real amount', () => {
    expect(validateExpense(draft)).toBeNull();
  });

  it('refuses nothing and zero', () => {
    expect(validateExpense({ ...draft, amount: '' })).toBe('Дүнг оруулна уу.');
    expect(validateExpense({ ...draft, amount: '0' })).toBe('Дүнг оруулна уу.');
  });
});

describe('createExpense', () => {
  it('files it under the day it was spent', () => {
    const created = createExpense(
      { category: 'water', amount: '3,000₮', note: '  5л  ', by: 'Болд' },
      new Date(2026, 7, 4, 14, 30),
    );
    expect(created.date).toBe('2026-08-04');
    expect(created.amount).toBe(3000);
    expect(created.note).toBe('5л');
    expect(created.category).toBe('water');
  });
});

describe('onDay and sumOf', () => {
  const all = [
    expense({ id: 1, date: '2026-08-04', amount: 8000, at: 100 }),
    expense({ id: 2, date: '2026-08-04', amount: 2000, at: 200 }),
    expense({ id: 3, date: '2026-08-03', amount: 5000 }),
  ];

  it('takes one day, newest first', () => {
    expect(onDay(all, '2026-08-04').map((row) => row.id)).toEqual([2, 1]);
  });

  it('adds up what it was handed', () => {
    expect(sumOf(onDay(all, '2026-08-04'))).toBe(10000);
    expect(sumOf([])).toBe(0);
  });
});

describe('byCategory', () => {
  it('groups the day, heaviest first', () => {
    const rows = byCategory([
      expense({ category: 'food', amount: 8000 }),
      expense({ category: 'water', amount: 3000 }),
      expense({ category: 'food', amount: 4000 }),
    ]);
    expect(rows.map((row) => [row.key, row.total])).toEqual([
      ['food', 12000],
      ['water', 3000],
    ]);
  });
});

describe('byPerson', () => {
  it('names who spent what, biggest first', () => {
    const rows = byPerson([
      expense({ by: 'Сараа', amount: 8000 }),
      expense({ by: 'Болд', amount: 12000 }),
      expense({ by: 'Сараа', amount: 3000 }),
    ]);
    expect(rows).toEqual([
      { name: 'Болд', total: 12000, count: 1 },
      { name: 'Сараа', total: 11000, count: 2 },
    ]);
  });

  it('keeps an unnamed entry rather than losing the money', () => {
    const rows = byPerson([expense({ by: '', amount: 5000 })]);
    expect(rows[0]?.name).toBe('Тодорхойгүй');
  });
});

describe('inWindow', () => {
  it('takes only the days the chart drew', () => {
    const rows = inWindow(
      [
        expense({ id: 1, date: '2026-08-04' }),
        expense({ id: 2, date: '2026-07-01' }),
      ],
      [{ date: '2026-08-04' }, { date: '2026-08-03' }],
    );
    expect(rows.map((row) => row.id)).toEqual([1]);
  });
});

describe('timeOf', () => {
  it('reads the clock off the moment it was saved', () => {
    expect(timeOf({ at: new Date(2026, 7, 4, 9, 5).getTime() })).toBe('09:05');
  });

  it('says nothing when there is no timestamp', () => {
    expect(timeOf({ at: 0 })).toBe('');
  });
});

describe('dailyBars', () => {
  const week = [
    expense({ date: '2026-08-04', amount: 10000 }),
    expense({ date: '2026-08-02', amount: 5000 }),
    // Outside the window — it must not stretch the scale.
    expense({ date: '2026-07-01', amount: 900000 }),
  ];

  it('covers seven days ending today, oldest first', () => {
    const bars = dailyBars(week, { today: '2026-08-04' });
    expect(bars).toHaveLength(7);
    expect(bars[0]?.date).toBe('2026-07-29');
    expect(bars[6]?.date).toBe('2026-08-04');
    expect(bars[6]?.isToday).toBe(true);
  });

  it('scales against the tallest day inside the window', () => {
    const bars = dailyBars(week, { today: '2026-08-04' });
    expect(bars[6]?.height).toBe(1);
    // 5,000 against 10,000 — the July figure is out of range and irrelevant.
    expect(bars[4]?.height).toBe(0.5);
  });

  it('draws flat rather than dividing by zero on an empty week', () => {
    const bars = dailyBars([], { today: '2026-08-04' });
    expect(bars.every((bar) => bar.height === 0 && bar.total === 0)).toBe(true);
  });

  it('names each bar by its weekday', () => {
    // 2026-08-04 is a Tuesday.
    expect(dailyBars([], { today: '2026-08-04' })[6]?.label).toBe('Мя');
  });

  it('totals only the window it drew', () => {
    expect(windowTotal(dailyBars(week, { today: '2026-08-04' }))).toBe(15000);
  });
});

/**
 * The subtraction the orders screen shows at the bottom of Зарлага.
 *
 * It is display arithmetic on purpose: `reportCalculator` never sees it, so the
 * takings the counter reconciles against the till stay exactly what they were.
 */
describe('dayNet', () => {
  const spend = (amount: number): Expense => ({
    id: amount,
    date: '2026-08-04',
    category: 'food',
    amount,
    note: '',
    by: '',
    at: 1,
  });

  it('takes the day’s spending off the day’s takings', () => {
    expect(dayNet(240_000, [spend(12_000), spend(16_000)])).toEqual({
      revenue: 240_000,
      spent: 28_000,
      net: 212_000,
      share: 28_000 / 240_000,
    });
  });

  it('goes negative rather than clamping — that day is the one worth seeing', () => {
    expect(dayNet(10_000, [spend(45_000)]).net).toBe(-35_000);
  });

  it('has no share to report when nothing came in', () => {
    expect(dayNet(0, [spend(5_000)]).share).toBeNull();
    expect(dayNet(0, [spend(5_000)]).net).toBe(-5_000);
  });

  it('is the takings themselves on a day with no spending', () => {
    expect(dayNet(80_000, [])).toEqual({ revenue: 80_000, spent: 0, net: 80_000, share: 0 });
  });
});
