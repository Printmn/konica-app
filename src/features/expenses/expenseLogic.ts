import type { Expense, ExpenseCategory } from '@/types';
import { shiftDate, toDateString, todayString } from '@/utils/date';
import { nextId } from '@/utils/id';

/**
 * The day's petty spending — lunch, water, a taxi for a delivery.
 *
 * Kept deliberately apart from the takings. The shop's report answers "what
 * came in today", and mixing an 8,000₮ lunch into it would quietly change a
 * number the counter reconciles against the till. So this is its own record and
 * its own total; nothing here touches `reportCalculator`.
 *
 * All arithmetic lives in this file so the screen only renders.
 */

export const EXPENSE_CATEGORIES: readonly { key: ExpenseCategory; label: string }[] = [
  { key: 'food', label: '🍜 Хоол' },
  { key: 'water', label: '💧 Ус' },
  { key: 'transport', label: '🚕 Унаа' },
  { key: 'other', label: '📦 Бусад' },
];

export const categoryLabel = (key: string): string =>
  EXPENSE_CATEGORIES.find((category) => category.key === key)?.label ?? '📦 Бусад';

export interface NewExpense {
  category: ExpenseCategory;
  amount: string;
  note: string;
  by: string;
  date?: string;
}

/** `'8,000₮'`, `'8000'` and `'8 000'` all mean the same thing at a counter. */
export const parseAmount = (raw: string): number =>
  Number(String(raw).replace(/[^0-9]/g, '')) || 0;

export const validateExpense = (draft: NewExpense): string | null => {
  if (parseAmount(draft.amount) <= 0) return 'Дүнг оруулна уу.';
  return null;
};

export function createExpense(draft: NewExpense, now: Date = new Date()): Expense {
  return {
    id: nextId(),
    date: draft.date || toDateString(now),
    category: draft.category,
    amount: parseAmount(draft.amount),
    note: draft.note.trim(),
    by: draft.by,
    at: now.getTime(),
  };
}

/** Newest first, so today sits at the top of the list. */
export const newestFirst = (expenses: readonly Expense[]): Expense[] =>
  [...expenses].sort((a, b) => (a.date === b.date ? b.at - a.at : a.date < b.date ? 1 : -1));

export const onDay = (expenses: readonly Expense[], date: string): Expense[] =>
  newestFirst(expenses.filter((expense) => expense.date === date));

export const sumOf = (expenses: readonly Expense[]): number =>
  expenses.reduce((total, expense) => total + (Number(expense.amount) || 0), 0);

/** Totals per category on one day, biggest first — what the legend shows. */
export function byCategory(
  expenses: readonly Expense[],
): { key: ExpenseCategory; label: string; total: number }[] {
  const totals = new Map<ExpenseCategory, number>();
  for (const expense of expenses) {
    const key = expense.category;
    totals.set(key, (totals.get(key) ?? 0) + (Number(expense.amount) || 0));
  }
  return [...totals.entries()]
    .map(([key, total]) => ({ key, label: categoryLabel(key), total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Who spent what, biggest first.
 *
 * The manager's question is not only "what did the day cost" but "who spent
 * it" — a 40,000₮ lunch line reads very differently once a name is attached.
 * An entry saved before anyone typed a name falls under «Тодорхойгүй» rather
 * than being silently dropped.
 */
export function byPerson(
  expenses: readonly Expense[],
): { name: string; total: number; count: number }[] {
  const totals = new Map<string, { total: number; count: number }>();
  for (const expense of expenses) {
    const name = expense.by?.trim() || 'Тодорхойгүй';
    const entry = totals.get(name) ?? { total: 0, count: 0 };
    entry.total += Number(expense.amount) || 0;
    entry.count += 1;
    totals.set(name, entry);
  }
  return [...totals.entries()]
    .map(([name, entry]) => ({ name, ...entry }))
    .sort((a, b) => b.total - a.total);
}

/** Everything inside the window the chart draws, newest first. */
export const inWindow = (
  expenses: readonly Expense[],
  bars: readonly { date: string }[],
): Expense[] => {
  const days = new Set(bars.map((bar) => bar.date));
  return newestFirst(expenses.filter((expense) => days.has(expense.date)));
};

/** `14:30` from the moment it was recorded. */
export const timeOf = (expense: Pick<Expense, 'at'>): string => {
  if (!Number.isFinite(expense.at) || expense.at <= 0) return '';
  const at = new Date(expense.at);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
};

export interface DayBar {
  date: string;
  /** `Да`, `Мя` … — the weekday, which is what a bar is read by. */
  label: string;
  total: number;
  /** 0–1 against the tallest bar in the window; 0 when every day is empty. */
  height: number;
  isToday: boolean;
}

const WEEKDAYS = ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'] as const;

/**
 * The last `days` days as bars, oldest on the left.
 *
 * Heights are relative to the tallest bar rather than to a fixed scale: the
 * question the chart answers is "which day was heavy", not "how many tögrög is
 * one pixel". A week with nothing in it draws flat rather than dividing by
 * zero.
 */
export function dailyBars(
  expenses: readonly Expense[],
  options: { days?: number; today?: string } = {},
): DayBar[] {
  const { days = 7, today = todayString() } = options;

  const totals = new Map<string, number>();
  for (const expense of expenses) {
    totals.set(expense.date, (totals.get(expense.date) ?? 0) + (Number(expense.amount) || 0));
  }

  const window: { date: string; total: number }[] = [];
  for (let step = days - 1; step >= 0; step -= 1) {
    const date = shiftDate(today, -step);
    window.push({ date, total: totals.get(date) ?? 0 });
  }

  const tallest = Math.max(...window.map((day) => day.total), 0);

  return window.map(({ date, total }) => {
    const [year, month, day] = date.split('-').map(Number);
    const weekday = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1).getDay();
    return {
      date,
      label: WEEKDAYS[weekday] ?? '',
      total,
      height: tallest > 0 ? total / tallest : 0,
      isToday: date === today,
    };
  });
}

/** Spending across the whole window the chart covers. */
export const windowTotal = (bars: readonly DayBar[]): number =>
  bars.reduce((total, bar) => total + bar.total, 0);

/**
 * What the day left behind.
 *
 * The note at the top of this file still holds: nothing here reaches into
 * `reportCalculator`, and the day's takings are not altered. This subtracts at
 * the point of display instead, which is the difference between "the report
 * says we took 240,000₮" and "the report says we took 240,000₮ but actually it
 * was 212,000₮" — the first is a fact the counter can check against the till.
 *
 * `revenue` is the settled figure, so an invoice booked «Тооцоотой» is not
 * money the lunch came out of. `net` may be negative: a quiet morning with a
 * paper delivery in it genuinely is, and clamping to zero would hide the one
 * day worth asking about.
 */
export interface DayNet {
  revenue: number;
  spent: number;
  net: number;
  /** Spending as a share of takings, 0–1. `null` when nothing came in. */
  share: number | null;
}

export const dayNet = (revenue: number, expenses: readonly Expense[]): DayNet => {
  const spent = sumOf(expenses);
  return {
    revenue,
    spent,
    net: revenue - spent,
    share: revenue > 0 ? spent / revenue : null,
  };
};
