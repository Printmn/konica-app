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

  const sumBy = (predicate: (log: WorkLog) => boolean): number =>
    logs.filter(predicate).reduce((sum, log) => sum + effectivePrice(log), 0);

  return {
    logs,
    totalRevenue: logs.reduce((sum, log) => sum + effectivePrice(log), 0),
    totalTransfer: sumBy((log) => log.payType === 'Данс'),
    totalCash: sumBy((log) => log.payType === 'Бэлэн'),
    totalCard: sumBy((log) => log.payType === 'Карт'),
    totalVat: logs.reduce((sum, log) => sum + vatPortion(log), 0),
  };
}

/** Totals grouped by payment type, used for the export summary rows. */
export const totalsByPayType = (logs: readonly WorkLog[]): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const log of logs) {
    if (!log.price) continue;
    const type = log.payType || 'Бусад';
    result[type] = (result[type] ?? 0) + (Number(log.price) || 0);
  }
  return result;
};

export const rawTotal = (logs: readonly WorkLog[]): number =>
  logs.reduce((sum, log) => sum + (Number(log.price) || 0), 0);
