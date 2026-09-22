import { PAY_METHODS, paidByMethod } from '@/features/worklogs/paySplit';
import type { DailyReport, WorkLog } from '@/types';
import { todayString } from '@/utils/date';
import { effectivePrice, vatPortion } from '@/utils/price';

/**
 * Daily report totals.
 *
 * Ported from `ReportView`. Two details matter:
 *
 *  1. Only work logs count. The web build originally summed `orders` too and
 *     the comment there records why that was removed — quick orders are
 *     mirrored into `workLogs`, so counting both double-billed the day.
 *  2. Revenue uses the VAT-inclusive figure, while the VAT line reports only
 *     the 10% portion of VAT-flagged rows.
 *  3. Work booked «Тооцоотой» is held out of the day's takings entirely. It was
 *     being added to the total, which made the day read as though money had
 *     come in that had not — and made the three payment-method lines fail to
 *     add up to the figure printed above them, with nothing on screen to say
 *     why. It is reported on its own line instead, because it is still owed.
 */

/**
 * Handed over against an invoice rather than paid for.
 *
 * The status is what the shop sets today; `paymentStatus` carried the same
 * meaning in records written before the form dropped that option, and those
 * rows are still in the database.
 */
export const isUnsettled = (log: Pick<WorkLog, 'status' | 'paymentStatus'>): boolean =>
  log.status === 'Тооцоотой' || log.paymentStatus === 'Тооцоотой';

export function calculateDailyReport(
  workLogs: readonly WorkLog[],
  date: string = todayString(),
): DailyReport {
  const logs = workLogs.filter((log) => log.date === date && log.price);

  // Split before anything is summed. A «Тооцоотой» job often still names the
  // method it is *expected* to be settled by, so leaving it in would put it in
  // a payment column as well as the total — counted twice over as money the
  // shop does not have.
  const paid = logs.filter((log) => !isUnsettled(log));
  const owed = logs.filter(isUnsettled);

  // Each method asks every log what it contributed, rather than filtering on
  // an exact `payType` — that way a «Холимог» job lands partly in cash and
  // partly on card instead of falling out of all three columns.
  const sumMethod = (method: 'cash' | 'card' | 'transfer'): number =>
    paid.reduce((sum, log) => sum + paidByMethod(log, method), 0);

  return {
    logs,
    totalRevenue: paid.reduce((sum, log) => sum + effectivePrice(log), 0),
    totalUnsettled: owed.reduce((sum, log) => sum + effectivePrice(log), 0),
    unsettledCount: owed.length,
    totalTransfer: sumMethod('transfer'),
    totalCash: sumMethod('cash'),
    totalCard: sumMethod('card'),
    // Over the paid rows only, so «Үүнээс НӨАТ» is genuinely "of that".
    totalVat: paid.reduce((sum, log) => sum + vatPortion(log), 0),
  };
}

/** Totals grouped by payment type, used for the export summary rows. */
export const totalsByPayType = (logs: readonly WorkLog[]): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const log of logs) {
    if (!log.price) continue;
    // A split job is booked under the methods it was actually paid with, so
    // the summary rows still add up to the day's takings.
    if (log.payType === 'Холимог' && log.paySplit) {
      for (const { key, label } of PAY_METHODS) {
        const amount = log.paySplit[key] || 0;
        if (amount <= 0) continue;
        const name = label.slice(2).trim();
        result[name] = (result[name] ?? 0) + amount;
      }
      continue;
    }
    const type = log.payType || 'Бусад';
    result[type] = (result[type] ?? 0) + (Number(log.price) || 0);
  }
  return result;
};

export const rawTotal = (logs: readonly WorkLog[]): number =>
  logs.reduce((sum, log) => sum + (Number(log.price) || 0), 0);

/**
 * Every day the report has something to show, newest first.
 *
 * Drawn from the takings *and* the spending, because the report now covers
 * both: a Sunday with no orders and a paper delivery on it is a day worth
 * opening, and a list built from work logs alone would not offer it. Today is
 * always included even when nothing has happened yet — a report that cannot be
 * opened until the first sale is a report that looks broken every morning.
 */
export const reportDates = (
  workLogs: readonly { date: string }[],
  expenses: readonly { date: string }[],
  today: string = todayString(),
): string[] => {
  const days = new Set<string>([today]);
  for (const row of workLogs) if (row.date) days.add(row.date);
  for (const row of expenses) if (row.date) days.add(row.date);
  return [...days].sort().reverse();
};

/**
 * Every month the report has something to show, newest first.
 *
 * Derived from `reportDates` rather than scanned separately, so a month can
 * never be offered that has no day behind it — picking it would open an empty
 * report and look broken.
 */
export const reportMonths = (days: readonly string[]): string[] => [
  ...new Set(days.map((day) => day.slice(0, 7)).filter((month) => month !== '')),
];

/** The most recent day in that month, which is where picking it should land. */
export const latestDayOf = (days: readonly string[], month: string): string | null =>
  days.find((day) => day.startsWith(month)) ?? null;

/** The next or previous day that has anything on it; `null` at either end. */
export const stepDay = (
  days: readonly string[],
  current: string,
  direction: 1 | -1,
): string | null => {
  const at = days.indexOf(current);
  if (at === -1) return null;
  // `days` runs newest first, so «older» means a higher index.
  return days[at + direction] ?? null;
};

// ───────────────────────────── The month ─────────────────────────────

/**
 * The month the day belongs to, totalled the same way the day is.
 *
 * Reuses `isUnsettled` and `effectivePrice` rather than summing `price`
 * directly, so the month is the sum of its days: invoices on account stay out
 * of the takings, VAT is included, and a month that disagreed with the days
 * inside it would be a month nobody could check.
 *
 * Deliberately not `calculateMonthlyRevenue` in `bonusCalculator`, which sums
 * the raw price with no VAT and no notion of settlement. That asymmetry is
 * intentional there — bonuses are paid on what was booked — and wrong here.
 */
export interface MonthTotals {
  /** `2026-09`. */
  month: string;
  revenue: number;
  unsettled: number;
  spent: number;
  net: number;
  orders: number;
  /** Days in the month that had takings or spending on them. */
  activeDays: number;
}

/** `2026-09-14` → `2026-09`. */
export const monthOf = (date: string): string => (date || '').slice(0, 7);

export function monthTotals(
  workLogs: readonly WorkLog[],
  expenses: readonly { date: string; amount: number }[],
  month: string,
): MonthTotals {
  const days = new Set<string>();
  let revenue = 0;
  let unsettled = 0;
  let orders = 0;

  for (const log of workLogs) {
    if (monthOf(log.date) !== month || !log.price) continue;
    days.add(log.date);
    orders += 1;
    const amount = effectivePrice(log);
    if (isUnsettled(log)) unsettled += amount;
    else revenue += amount;
  }

  let spent = 0;
  for (const expense of expenses) {
    if (monthOf(expense.date) !== month) continue;
    days.add(expense.date);
    spent += Number(expense.amount) || 0;
  }

  return { month, revenue, unsettled, spent, net: revenue - spent, orders, activeDays: days.size };
}

// ─────────────────────── What the day was made of ───────────────────────

/**
 * A day's work gathered by what was actually printed.
 *
 * The log answers "which jobs came in" one row at a time; this answers "what
 * did we do today" — «Цээж зураг 40ш · 80,000₮». Six separate bookings of two
 * passport photos each is one fact about the shop, not six, and it is the fact
 * worth reading at closing time.
 *
 * The grouping key is the job name with its own count stripped off.
 * `buildQuickOrder` writes «Цээж зураг (2ш)» into the name, so grouping on the
 * raw string would file every different quantity as a different product and
 * produce a list longer than the one it was meant to summarise.
 */
export interface JobGroup {
  /** «Цээж зураг» — the name without its `(2ш)` tail. */
  name: string;
  /** Sheets, prints, medals: whatever the job counts in. */
  quantity: number;
  /** How many separate bookings made up that quantity. */
  orders: number;
  /** VAT-inclusive, matching every other money figure on the report. */
  total: number;
  /** How much of `total` is still owed. */
  unsettled: number;
}

/** Trailing `(9ш)`, as quick orders write it. */
const COUNT_TAIL = /\(\s*(\d+)\s*ш\s*\)\s*$/u;

/** «Бичиг баримт канон (9ш)» → «Бичиг баримт канон». */
export const baseJobName = (job: string): string =>
  (job || '').replace(COUNT_TAIL, '').replace(/\s+/gu, ' ').trim();

/**
 * How many this job was for.
 *
 * `quantity` when the form recorded one, otherwise the count in the name, and
 * one when neither says — a job with no quantity is a single thing, and
 * counting it as zero would make «Цээж зураг 0ш · 80,000₮» out of a real sale.
 */
const quantityOf = (log: WorkLog): number => {
  const stated = Number(log.quantity);
  if (Number.isFinite(stated) && stated > 0) return stated;
  const named = COUNT_TAIL.exec(log.job || '');
  return named?.[1] === undefined ? 1 : Number(named[1]);
};

export function groupByJob(logs: readonly WorkLog[]): JobGroup[] {
  const groups = new Map<string, JobGroup>();

  for (const log of logs) {
    const name = baseJobName(log.job) || 'Нэргүй ажил';
    // Case-folded key, displayed spelling from whichever row came first: the
    // same product typed «цээж зураг» and «Цээж зураг» is one product.
    const key = name.toLowerCase();
    const entry = groups.get(key) ?? { name, quantity: 0, orders: 0, total: 0, unsettled: 0 };
    const amount = effectivePrice(log);

    entry.quantity += quantityOf(log);
    entry.orders += 1;
    entry.total += amount;
    if (isUnsettled(log)) entry.unsettled += amount;
    groups.set(key, entry);
  }

  return [...groups.values()].sort((a, b) => b.total - a.total);
}
