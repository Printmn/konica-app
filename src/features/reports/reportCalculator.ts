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
 */

export function calculateDailyReport(
  workLogs: readonly WorkLog[],
  date: string = todayString(),
): DailyReport {
  const logs = workLogs.filter((log) => log.date === date && log.price);

  // Each method asks every log what it contributed, rather than filtering on
  // an exact `payType` — that way a «Холимог» job lands partly in cash and
  // partly on card instead of falling out of all three columns.
  const sumMethod = (method: 'cash' | 'card' | 'transfer'): number =>
    logs.reduce((sum, log) => sum + paidByMethod(log, method), 0);

  return {
    logs,
    totalRevenue: logs.reduce((sum, log) => sum + effectivePrice(log), 0),
    totalTransfer: sumMethod('transfer'),
    totalCash: sumMethod('cash'),
    totalCard: sumMethod('card'),
    totalVat: logs.reduce((sum, log) => sum + vatPortion(log), 0),
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
